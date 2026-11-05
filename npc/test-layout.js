'use strict';
// 集落の配置の検証（合成地形）：node npc/test-layout.js
const A = require('./arch-gen.js'), S = require('./settle-layout.js');
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
// 合成地形：なだらかな丘、蛇行する川（幅10m）、南側の急な斜面
const riverZ = (x) => 70 + 18 * Math.sin(x / 35);
const terrain = (opts = {}) => {
  const river = opts.river !== false;
  const height = (x, z) => 4 * Math.sin(x / 45) + 3 * Math.cos(z / 60) + (z > 120 ? (z - 120) * 0.5 : 0) + (river && Math.abs(z - riverZ(x)) < 5 ? -1.2 : 0);
  const slope = (x, z) => Math.atan(Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2) * 180 / Math.PI;
  const water = (x, z) => river && Math.abs(z - riverZ(x)) < 5 ? 0.6 : 0;
  const nearestWater = (x, z) => { if (!river) return null; const dz = riverZ(x) - z, dist = Math.max(0, Math.abs(dz) - 5); return { dist, dx: 0, dz: Math.sign(dz) || 1 }; };
  const wet = (x, z) => river && Math.abs(z - riverZ(x)) < 14;
  return { height, slope, water, nearestWater, wet };
};
const env = { tempC: 14, precip: 1100, wood: 0.7, stone: 0.2, clay: 0.4, fertile: 0.5, forest: 0.6, grass: 0.3, desert: 0, tundra: 0, wetland: 0.1, rugged: 0.1, elev: 100 };
const households = (n, seed = 1) => Array.from({ length: n }, (_, i) => ({ house: 1000 + i * 7, members: 2 + (i * 5 + seed) % 6, kin: i < 4 ? 1 : 1 + Math.floor(i / 4) }));
function make(level, nH, seed = 42, gid = 7, tOpt, econ) {
  const gen = A.genome(seed, 5, 5), hist = S.settleHistory(seed, gid, level, nH * 4, 0.7, { neighbors: true }), trad = A.tradition(seed, gen, env, hist.tech, [180, 120, 90]);
  const spec = { seed, gid, trad, hist, level, households: households(nH), economy: econ || { fish: 0.3, gather: 0.4, hunt: 0.2, tool: 0.1 }, terr: terrain(tOpt) };
  return { spec, layout: S.layoutSettlement(spec) };
}
const live = (L) => L.items.filter(i => i.state !== 'removed');
function checks(label, { spec, layout }) {
  const it = live(layout); let ov = 0, inWater = 0, steep = 0; const T = spec.terr;
  for (let i = 0; i < it.length; i++) { const a = S.shapeOf(it[i]); if (it[i].role !== 'rack' && T.water(it[i].x, it[i].z) > 0.25) inWater++; if (T.slope(it[i].x, it[i].z) > 27) steep++; for (let j = i + 1; j < it.length; j++) if (S.overlaps(a, S.shapeOf(it[j]), 0)) ov++; }
  ok(ov === 0, `${label}：建物の重なり ${ov}件（建物 ${it.length}）`); ok(inWater === 0, `${label}：水の中の建物 ${inWater}件`); ok(steep === 0, `${label}：急斜面（27°超）の建物 ${steep}件`);
  const unmapped = spec.households.filter(h => !layout.byHouse[h.house]); ok(unmapped.length === 0, `${label}：全ての世帯に住居が対応（未配置 ${unmapped.length}）`);
  const noDoor = it.filter(b => !b.entrance || !isFinite(b.entrance.x)); ok(noDoor.length === 0, `${label}：全ての建物に入口の位置がある`);
  // 道：全ての入口が広場につながっているか（端点を結んだ連結）
  const P = layout.paths, key = (x, z) => Math.round(x * 20) + ',' + Math.round(z * 20), adj = new Map(); const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []); adj.get(a).push(b); adj.get(b).push(a); };
  for (const p of P) link(key(p.x1, p.z1), key(p.x2, p.z2)); const seen = new Set(), st = [key(layout.center.x, layout.center.z)]; while (st.length) { const k = st.pop(); if (seen.has(k)) continue; seen.add(k); for (const n of adj.get(k) || []) st.push(n); }
  const doors = it.filter(b => b.state !== 'ruin' && b.state !== 'vacant'); const unreach = doors.filter(b => !seen.has(key(b.entrance.x, b.entrance.z))).length; ok(unreach === 0, `${label}：入口が道で広場につながる（つながらない ${unreach}／${doors.length}、道 ${P.length}本）`);
  return it;
}
// 1. 規模ごと
for (const [lv, n] of [[0, 8], [1, 25], [2, 70]]) { const m = make(lv, n); const it = checks(`段階${lv}・${n}世帯`, m); const roles = {}; for (const b of it) roles[b.role] = (roles[b.role] || 0) + 1; console.log('   内訳', JSON.stringify(roles), '歴史', m.spec.hist.status, m.spec.hist.age + '年', '防衛', m.spec.hist.defense, '柵の杭', m.layout.fence.length); }
// 2. 水場との関係：川のある地形での住居と水の距離
{ const m = make(2, 60), T = m.spec.terr, ds = live(m.layout).filter(b => b.role === 'dwelling' && b.state === 'ok').map(b => T.nearestWater(b.x, b.z).dist); const mean = ds.reduce((a, b) => a + b, 0) / ds.length; ok(mean > 8 && mean < 120, `住居と水場の平均距離 ${mean.toFixed(0)}m（8〜120m）`); const racks = live(m.layout).filter(b => b.role === 'rack').map(b => T.nearestWater(b.x, b.z).dist); ok(!racks.length || racks.reduce((a, b) => a + b, 0) / racks.length < 25, `干し場は水辺に（平均 ${(racks.reduce((a, b) => a + b, 0) / Math.max(1, racks.length)).toFixed(0)}m、${racks.length}棟）`); }
{ const m = make(2, 40, 42, 7, { river: false }); checks('川のない地形', m); }
// 3. 再現性
ok(JSON.stringify(make(2, 50).layout) === JSON.stringify(make(2, 50).layout), '同じ入力なら同じ集落（再現性）'); ok(JSON.stringify(make(2, 50, 42, 7).layout.items.map(b => [b.x, b.z])) !== JSON.stringify(make(2, 50, 42, 8).layout.items.map(b => [b.x, b.z])), '集団が違えば違う配置');
// 4. 家族のまとまり：同じ親族の住居は近い
{ const m = make(2, 40), byK = new Map(); for (const b of live(m.layout)) if (b.role === 'dwelling' && b.cluster !== undefined) { if (!byK.has(b.cluster)) byK.set(b.cluster, []); byK.get(b.cluster).push(b); } let within = [], across = []; for (const arr of byK.values()) for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) within.push(Math.hypot(arr[i].x - arr[j].x, arr[i].z - arr[j].z)); const all = [...byK.values()].flat(); for (let k = 0; k < 400; k++) { const a = all[(k * 7) % all.length], b = all[(k * 13 + 5) % all.length]; if (a.cluster !== b.cluster) across.push(Math.hypot(a.x - b.x, a.z - b.z)); } const mw = within.reduce((a, b) => a + b, 0) / within.length, ma = across.reduce((a, b) => a + b, 0) / across.length; ok(mw < ma, `同じ親族の住居は近い（親族内 ${mw.toFixed(0)}m ＜ 親族外 ${ma.toFixed(0)}m）`); }
// 5. 世帯の増減・NPCの要求
{ const m = make(2, 40), before = new Map(live(m.layout).map(b => [b.id, [b.x, b.z]])); const hs = households(40).slice(0, 36).concat([{ house: 9001, members: 4, kin: 2 }, { house: 9002, members: 3 }, { house: 9003, members: 5, kin: 99 }]);
  const r = S.syncLayout(m.layout, m.spec, hs, 360 * 10); ok(r.added === 3 && r.vacated === 4, `新しい世帯の家を建て(3)、いなくなった世帯の家を空き家に(4)：${JSON.stringify(r)}`);
  let moved = 0; for (const [id, p] of before) { const b = m.layout.items.find(i => i.id === id); if (b && (b.x !== p[0] || b.z !== p[1])) moved++; } ok(moved === 0, `既存の建物は動かない（動いた ${moved}）`);
  checks('更新後', { spec: m.spec, layout: m.layout });
  const r2 = S.syncLayout(m.layout, m.spec, hs, 360 * 17); ok(r2.ruined === 4, `5年後に空き家は廃屋に：${JSON.stringify(r2)}`); const r3 = S.syncLayout(m.layout, m.spec, hs, 360 * 25); ok(r3.removed === 4, `12年を超えると撤去：${JSON.stringify(r3)}`);
  S.requestBuild(m.layout, 'renovate', hs[0].house, 360 * 26); S.requestBuild(m.layout, 'demolish', hs[1].house, 360 * 26); const ar = S.applyRequests(m.layout, m.spec, hs, 360 * 26); ok(ar.renovated === 1 && ar.demolished === 1, `NPCの改築・解体の要求を反映：${JSON.stringify(ar)}`); }
// 6. 農耕がある集団の畑（接続口）：重ならない
{ const m = make(2, 40, 42, 7, {}, { fish: 0.1, gather: 0.2, farm: true }), f = m.layout.fields; let ov = 0; for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) if (S.overlaps(f[i], f[j], 0)) ov++; for (const b of live(m.layout)) for (const x of f) if (S.overlaps(S.shapeOf(b), x, 0)) ov++; ok(f.length > 0 && ov === 0, `畑 ${f.length}区画、重なり ${ov}件`); const n0 = make(2, 40).layout.fields.length; ok(n0 === 0, `農耕のない集団には畑を作らない（${n0}）`); }
// 7. 柵：建物の中に杭がない、出入口が開いている
{ const m = make(2, 60); let g = 0; for (let s = 1; s < 40; s++) { const mm = make(2, 60, s, 3); if (mm.layout.fence.length) { g++; const inside = mm.layout.fence.filter(p => live(mm.layout).some(b => S.overlaps(S.shapeOf(b), { x: p.x, z: p.z, rot: 0, hw: 0.2, hd: 0.2, round: true }, 0))).length; if (inside) { ok(false, `柵の杭が建物の中 ${inside}`); } } } ok(g > 0, `柵のある集落が ${g}/39（防衛の歴史がある集落）`); }
// 8. 性能
{ const t0 = process.hrtime.bigint(); for (let i = 0; i < 5; i++) make(2, 90, 42, 20 + i); const ms = Number(process.hrtime.bigint() - t0) / 5e6; ok(ms < 150, `90世帯の集落の配置 ${ms.toFixed(0)}ms/回`); }
// 9. 歴史：成立年代・状態の共存
{ const cnt = {}; let minA = 1e9, maxA = 0; for (let g = 1; g <= 200; g++) { const h = S.settleHistory(42, g, g % 3, 50 + g % 90, 0.7, { neighbors: g % 2 === 0 }); cnt[h.status] = (cnt[h.status] || 0) + 1; minA = Math.min(minA, h.age); maxA = Math.max(maxA, h.age); } ok(cnt.young > 0 && cnt.established > 0 && cnt.declining > 0 && cnt.seasonal > 0, `成立したて・古い・衰退中・季節の野営が共存 ${JSON.stringify(cnt)}（成立の古さ ${minA}〜${maxA}年）`); }
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
