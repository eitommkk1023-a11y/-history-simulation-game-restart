'use strict';
// 人口の「集計」の層（試作）：年齢（月単位）×性別の人数を、小数で持ち、毎月、死亡・出生・加齢を式で進める。個人（npc-core の Population）の代わりに、遠くの集落・街区・地方・国の住民を、少ない計算で扱うための層。
// 同じ表（年齢別の死亡・出生）と、集団ごとの状況（飢え・寒さ・病気・出生の補正）を使えるよう、率は呼び出し側が関数で渡す（rates）。個人の層とつなぐ：個人 → 集計（fromAges）・集計 → 個人の年齢分布（sampleAges）。
// 設計は docs/population-layers-v1.md
(function (root) {
const AM = 81 * 12;   // 年齢（月）0〜80歳。最後の区分は「80歳以上」
// rates: { qm(ageYears, sex)：月あたりの死亡確率, pf(ageYears)：既婚の女性の年あたりの出生数, marr(ageYears)：女性が既婚の割合, sexRatio：男の子の割合 }
class Cohort {
  constructor() { this.f = new Float64Array(AM); this.m = new Float64Array(AM); this.births = 0; this.deaths = 0; }
  // 個人の年齢の一覧（歳。小数）から作る（性別ごと）
  static fromAges(ageF, ageM) { const c = new Cohort(); for (const a of ageF) c.f[Math.min(AM - 1, Math.floor(a * 12))]++; for (const a of ageM) c.m[Math.min(AM - 1, Math.floor(a * 12))]++; return c; }
  total() { let s = 0; for (let k = 0; k < AM; k++) s += this.f[k] + this.m[k]; return s; }
  count(a0, a1, sex) { let s = 0; const k0 = Math.floor(a0 * 12), k1 = Math.min(AM, Math.floor(a1 * 12)); for (let k = k0; k < k1; k++) s += (sex === 0 ? this.f[k] : sex === 1 ? this.m[k] : this.f[k] + this.m[k]); return s; }
  // 率の表を作る（月ごと・区分ごとの死亡確率と、女性の1か月あたりの出生数）。同じ率で多くの集計を進めるときは、1回作って使い回す（毎回の指数・べき乗の計算を避ける）
  static tables(r) {
    const qF = new Float64Array(AM), qM = new Float64Array(AM), bF = new Float64Array(AM);
    for (let k = 0; k < AM; k++) { const a = k / 12; qF[k] = r.qm(a, 0); qM[k] = r.qm(a, 1); bF[k] = a >= 15 && a < 50 ? (r.marr ? r.marr(a) : 1) * r.pf(a) / 12 : 0; }
    return { qF, qM, bF, sexRatio: r.sexRatio == null ? 0.5 : r.sexRatio };
  }
  // 1か月進める。r は率（rates）か、tables() の結果。戻り値：{ births, deaths }（人数。小数）
  step(r) {
    const T = r.qF ? r : Cohort.tables(r), f = this.f, m = this.m, qF = T.qF, qM = T.qM, bF = T.bF; let deaths = 0, births = 0;
    for (let k = 0; k < AM; k++) { const fk = f[k], mk = m[k], df = fk * qF[k], dm = mk * qM[k]; f[k] = fk - df; m[k] = mk - dm; deaths += df + dm; births += fk * bF[k]; }
    // 加齢：1か月ぶん、1区分ずつ進める（最後の区分は80歳以上としてたまる）
    f[AM - 1] += f[AM - 2]; m[AM - 1] += m[AM - 2]; f.copyWithin(1, 0, AM - 2); m.copyWithin(1, 0, AM - 2);
    const sr = T.sexRatio; m[0] = births * sr; f[0] = births * (1 - sr);
    this.births += births; this.deaths += deaths; return { births, deaths };
  }
  // 個人へ展開するための年齢の見本（人数 n、乱数 rnd。性別・年齢（歳）の一覧）。集計の分布に従う
  sampleAges(n, rnd) { const out = [], tot = this.total(); if (tot <= 0) return out; const cum = new Float64Array(2 * AM); let s = 0; for (let k = 0; k < AM; k++) { s += this.f[k]; cum[k] = s; } for (let k = 0; k < AM; k++) { s += this.m[k]; cum[AM + k] = s; }
    for (let i = 0; i < n; i++) { const u = rnd() * tot; let lo = 0, hi = 2 * AM - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; } const sex = lo >= AM ? 1 : 0, k = lo % AM; out.push({ sex, age: (k + rnd()) / 12 }); } return out; }
}
const api = { Cohort, AM };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohCohort = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
