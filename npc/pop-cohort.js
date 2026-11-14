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
    // 率は年齢（歳）の区切りで変わるので、歳ごとに1回だけ計算し、月の区分に使い回す（1集計あたりの関数の呼び出し 972→81 回）
    for (let y = 0; y < 81; y++) { const q0 = r.qm(y, 0), q1 = r.qm(y, 1), b = y >= 15 && y < 50 ? (r.marr ? r.marr(y) : 1) * r.pf(y) / 12 : 0; for (let k = y * 12; k < y * 12 + 12 && k < AM; k++) { qF[k] = q0; qM[k] = q1; bF[k] = b; } }
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
  // 割合 share（0〜1）の人数を切り分けて、新しい集計にする（集団の分裂・移住）。この集計からは、その分が減る
  split(share) { const c = new Cohort(), s = Math.max(0, Math.min(1, share)); for (let k = 0; k < AM; k++) { const a = this.f[k] * s, b = this.m[k] * s; c.f[k] = a; c.m[k] = b; this.f[k] -= a; this.m[k] -= b; } return c; }
  // 人数 n の人（年齢 age 歳・性別）を足す／引く（引くのは、その区分にいる分だけ。戻り値は実際に引けた人数）
  add(age, sex, n) { const k = Math.min(AM - 1, Math.max(0, Math.floor(age * 12))); (sex === 0 ? this.f : this.m)[k] += n; }
  take(age, sex, n) { const k = Math.min(AM - 1, Math.max(0, Math.floor(age * 12))), A = sex === 0 ? this.f : this.m, x = Math.min(A[k], n); A[k] -= x; return x; }
  // 全ての区分を k 倍にする（分布は変わらない。昇格で一定数を取り除くときに使う）
  scale(k) { for (let i = 0; i < AM; i++) { this.f[i] *= k; this.m[i] *= k; } }
  // 保存：0でない区分だけ（区分の番号、人数を小数2桁に丸める）
  pack() { const f = [], m = []; for (let k = 0; k < AM; k++) { if (this.f[k] > 0.005) f.push(k, +this.f[k].toFixed(2)); if (this.m[k] > 0.005) m.push(k, +this.m[k].toFixed(2)); } return { f, m }; }
  static unpack(o) { const c = new Cohort(); if (o) { for (let i = 0; i + 1 < o.f.length; i += 2) c.f[o.f[i]] = o.f[i + 1]; for (let i = 0; i + 1 < o.m.length; i += 2) c.m[o.m[i]] = o.m[i + 1]; } return c; }
  // 個人へ展開するための年齢の見本（人数 n、乱数 rnd。性別・年齢（歳）の一覧）。集計の分布に従う
  sampleAges(n, rnd) { const out = [], tot = this.total(); if (tot <= 0) return out; const cum = new Float64Array(2 * AM); let s = 0; for (let k = 0; k < AM; k++) { s += this.f[k]; cum[k] = s; } for (let k = 0; k < AM; k++) { s += this.m[k]; cum[AM + k] = s; }
    for (let i = 0; i < n; i++) { const u = rnd() * tot; let lo = 0, hi = 2 * AM - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; } const sex = lo >= AM ? 1 : 0, k = lo % AM; out.push({ sex, age: (k + rnd()) / 12 }); } return out; }
}
const api = { Cohort, AM };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohCohort = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
