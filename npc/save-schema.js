'use strict';
// 保存データの版管理・移行・検査（F6）。
//  - schema：保存の「中身の版」（format は大きな形式の版で、今は1のまま）。古い保存（schema なし）は 1 とみなし、migrate で現在の版へ順に移す。
//  - digest：保存の内容の検査値（FNV-1a）。保存するときに付け、読み込むときに再計算して合わなければ「壊れている」と知らせる（圧縮は検査値を持たないため）。
//  - validate：読み込む前に形を調べる（人口・集団・配列の長さなど）。おかしければ、世界を作り直す前に、安全に断る。
(function (root) {
const CURRENT_SCHEMA = 2;
// 移行：MIGRATIONS[v] は、schema v の保存を v+1 へ。上から順に当てる。各移行は、元のデータを壊さずに、足りない項目を足す
const MIGRATIONS = {
  // 1→2：集計・台帳・検査値を導入した版。古い保存には、これらがない（なくても動く）。検査値がないので、legacy とし、検査をしない
  1: (st) => { st.legacy = true; return st; },
};
const U32 = new Uint32Array(2), F64 = new Float64Array(U32.buffer);
function digest(st) {
  let h = 0x811c9dc5 >>> 0; const mix = (x) => { h = Math.imul(h ^ (x >>> 0), 0x01000193) >>> 0; };
  const str = (s) => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); mix(0xff); };
  const walk = (v, depth) => {
    if (v === null || v === undefined) { mix(0); return; }
    switch (typeof v) {
      case 'number': F64[0] = v; mix(1); mix(U32[0]); mix(U32[1]); return;
      case 'boolean': mix(v ? 2 : 3); return;
      case 'string': mix(4); str(v); return;
      case 'object': break; default: return;
    }
    if (ArrayBuffer.isView(v)) { mix(5); mix(v.length); const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); if ((u.byteLength & 3) === 0 && (u.byteOffset & 3) === 0) { const w = new Uint32Array(u.buffer, u.byteOffset, u.byteLength >> 2); for (let i = 0; i < w.length; i++) mix(w[i]); } else for (let i = 0; i < u.length; i++) mix(u[i]); return; }
    if (Array.isArray(v)) { mix(6); mix(v.length); for (const x of v) walk(x, depth + 1); return; }
    if (depth > 40) return; mix(7); const keys = Object.keys(v).filter(k => !(depth === 0 && (k === 'digest' || k === 'legacy')) && v[k] !== undefined && typeof v[k] !== 'function').sort(); mix(keys.length); for (const k of keys) { str(k); walk(v[k], depth + 1); }
  };
  walk(st, 0); return h.toString(16).padStart(8, '0');
}
function migrate(st) {
  if (!st || typeof st !== 'object') return { ok: false, error: '記録が空です' };
  let v = Number.isInteger(st.schema) ? st.schema : 1; const from = v, steps = [];
  if (v > CURRENT_SCHEMA) return { ok: false, error: `この記録は新しい版のゲームで作られました（版 ${v}。このゲームは版 ${CURRENT_SCHEMA} まで）` };
  if (v < 1) return { ok: false, error: '記録の版が不正です（' + v + '）' };
  while (v < CURRENT_SCHEMA) { const f = MIGRATIONS[v]; if (!f) return { ok: false, error: `移行の手順がありません（${v}→${v + 1}）` }; try { st = f(st) || st; } catch (e) { return { ok: false, error: `版の移行に失敗（${v}→${v + 1}）：` + e.message }; } steps.push(v + '→' + (v + 1)); v++; }
  st.schema = CURRENT_SCHEMA; return { ok: true, st, from, to: CURRENT_SCHEMA, steps };
}
// 検査値の確認：付いていなければ、検査できない（legacy）。付いていて合わなければ、壊れている
function verify(st) { if (!st || typeof st.digest !== 'string') return { ok: true, checked: false }; const d = digest(st); return d === st.digest ? { ok: true, checked: true } : { ok: false, checked: true, error: '記録が壊れている可能性があります（検査値が合いません）' }; }
// 形の検査（世界を作り直す前に）：必須の項目と、配列の長さの整合
function validate(st) {
  const errs = [], isNum = (x) => typeof x === 'number' && isFinite(x);
  if (!st || typeof st !== 'object') return ['記録が空です'];
  if (st.format !== 1) errs.push('形式が違います');
  if (!(typeof st.seed === 'string' || isNum(st.seed))) errs.push('Seed がありません');
  if (!st.clock || !isNum(st.clock.day)) errs.push('時計（clock.day）がありません');
  const p = st.people;
  if (p) {
    const m = p.meta; if (!m || !Array.isArray(m.groups) || !m.npc || !Number.isInteger(m.npc.n) || m.npc.n < 0) errs.push('人々のデータの形が違います');
    else {
      const n = m.npc.n; for (const k of ['birth', 'death', 'sex', 'group', 'mother', 'father', 'spouse', 'job', 'flags']) { if (!p[k] || !(p[k].length >= n)) errs.push(`人々の配列 ${k} が短い（${p[k] ? p[k].length : '無'}／${n}）`); }
      const ng = m.groups.length; m.groups.forEach((g, i) => { if (!g || !Number.isInteger(g.id)) errs.push(`集団 ${i} に id がない`); else if (g.id !== i + 1) errs.push(`集団の番号が連続でない（${i} 番目が ${g.id}）`); if (g && g.ledger && !Array.isArray(g.ledger.b) && !g.ledger.bal) errs.push(`集団 ${i} の台帳の形が違う`); if (g && g.agg && !(g.agg.f || g.agg.m)) errs.push(`集団 ${i} の集計の形が違う`); });
      if (p.members && p.memberStart && p.memberStart.length < ng + 1) errs.push('住民の名簿の区切りが足りない');
    }
  }
  return errs.slice(0, 8);
}
const api = { CURRENT_SCHEMA, MIGRATIONS, digest, migrate, verify, validate };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohSave = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
