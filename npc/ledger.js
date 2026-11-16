'use strict';
// 台帳（F5）：集落の食料を「整数」で記録する。1刻み＝100kcal（1,000kcal＝1単位、0.1単位＝1刻み）。1kg ≒ 1,800kcal ＝ 18刻み。大人の1日（約2,200kcal）＝ 22刻み。
// 今は「影の台帳」：食料の本体は従来の kg（小数）のモデルのまま。台帳は、毎月の流れ（収穫・消費・傷み・干し・あふれ）を整数で写し、残高を実際の値に合わせる（snap）。
// 流れの合計と残高のずれ（resid）は、端数の持ち越し（carry）で小さく保つ。M1（食料・経済）で、台帳を本体に切り替える。設計：docs/ledger.md
(function (root) {
const KCAL_PER_TICK = 100, TICKS_PER_KG = 18;
const ACCTS = ['dur', 'fresh', 'dried'];   // 長持ち（穀物・根・木の実）／生鮮／干物
const FLOWS = ['prod', 'eat', 'spoil', 'lost', 'dryLoss', 'move'];   // 収穫／消費／傷み／あふれ（貯蔵の上限を超えた分）／干すときの目減り／集団の分裂で他へ移った分
class Ledger {
  constructor() { this.bal = { dur: 0, fresh: 0, dried: 0 }; this.carry = {}; this.flow = {}; this.tot = {}; for (const k of FLOWS) { this.flow[k] = 0; this.tot[k] = 0; } this.resid = 0; this.maxResid = 0; this.residNet = 0; this.open0 = 0; this.months = 0; this.opened = false; }
  static kgToTicks(kg) { return Math.round(kg * TICKS_PER_KG); }
  // kg の量を、端数を持ち越しながら整数の刻みにする（同じ入力なら同じ結果）
  take(key, kg) { const v = kg * TICKS_PER_KG + (this.carry[key] || 0), t = Math.floor(v + 1e-9); this.carry[key] = v - t; return t; }
  open(kg) { if (this.opened) return; for (const a of ACCTS) this.bal[a] = Ledger.kgToTicks(kg[a] || 0); this.open0 = this.total(); this.opened = true; }   // 開始時の蓄え（最初の1回だけ。以後は流れで動く）
  startMonth() { for (const k of FLOWS) this.flow[k] = 0; }
  credit(acct, n) { this._int(n); if (n < 0) throw new RangeError('credit は0以上'); this.bal[acct] += n; }
  debit(acct, n) { this._int(n); if (n < 0) throw new RangeError('debit は0以上'); this.bal[acct] -= n; }   // 残高が負になっても、その月の終わりの snap で、実際の値に合わせる
  transfer(from, to, n) { this._int(n); this.bal[from] -= n; this.bal[to] += n; }
  _int(n) { if (!Number.isInteger(n)) throw new TypeError('台帳は整数の刻みだけ：' + n); }
  record(kind, n) { this._int(n); this.flow[kind] += n; this.tot[kind] += n; }
  // 月の終わり：実際の残高（kg）に合わせる。流れから出した残高と、実際の残高のずれ＝resid（刻み）
  snap(kg) { let r = 0; for (const a of ACCTS) { const actual = Ledger.kgToTicks(kg[a] || 0); r += Math.abs(actual - this.bal[a]); this.residNet += actual - this.bal[a]; this.bal[a] = actual; } this.resid = r; if (r > this.maxResid) this.maxResid = r; this.months++; return r; }
  total() { return this.bal.dur + this.bal.fresh + this.bal.dried; }
  pack() { return { b: [this.bal.dur, this.bal.fresh, this.bal.dried], c: Object.assign({}, this.carry), t: FLOWS.map(k => this.tot[k]), m: this.months, x: this.maxResid, o: this.opened ? 1 : 0, n: this.residNet, z: this.open0 }; }
  static unpack(o) { const l = new Ledger(); if (!o) return l; l.bal = { dur: o.b[0], fresh: o.b[1], dried: o.b[2] }; l.carry = Object.assign({}, o.c); FLOWS.forEach((k, i) => { l.tot[k] = o.t[i] || 0; }); l.months = o.m || 0; l.maxResid = o.x || 0; l.opened = !!o.o; l.residNet = o.n || 0; l.open0 = o.z || 0; return l; }
}
const api = { Ledger, KCAL_PER_TICK, TICKS_PER_KG, ACCTS, FLOWS };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
