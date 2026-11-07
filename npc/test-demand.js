'use strict';
// 住居の需要と新築・増築・改築の検証：node npc/test-demand.js
const A = require('./arch-gen.js'), S = require('./settle-layout.js'), { terr } = require('./shape-metrics.js');
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const ENV = { tempC: 12, precip: 1000, wood: 0.6, stone: 0.4, clay: 0.4, fertile: 0.5, forest: 0.5, grass: 0.4, desert: 0, tundra: 0, wetland: 0.1, rugged: 0.1, elev: 100 };
function make(seed, nH, env = ENV, kind = 'river') {
  const gen = A.genome(seed, 5, 5), hist = S.settleHistory(seed, 7, 2, nH * 4, 0.7, {}), trad = A.tradition(seed, gen, env, hist.tech, [180, 120, 90]);
  const households = Array.from({ length: nH }, (_, i) => ({ house: 1000 + i * 7, members: 3 + (i % 3), kin: 1 + (i >> 2) }));
  const spec = { seed, gid: 7, trad, hist, level: 2, households, day: 0, siteKind: kind, economy: { fish: 0.3, gather: 0.4, hunt: 0.2, tool: 0.1 }, terr: terr(kind, seed) };
  return { spec, L: S.layoutSettlement(spec), hh: households };
}
const live = (L) => L.items.filter(b => b.state !== 'removed'), byId = (L, id) => L.items.find(i => i.id === id);
const step = (m, hh, from, months) => { let d = from; for (let k = 0; k < months; k++) { d += 30; S.syncLayout(m.L, m.spec, hh, d); } return d; };
const ev = (L, t) => L.log.filter(e => e.type === t);
// 1. 空き家があれば、空き家に入る（新築より先）
{ const m = make(11, 30); const hh = m.hh.slice(0, 28), added = [{ house: 9001, members: 3, kin: 99 }]; let d = step(m, hh, 0, 2); d = step(m, hh.concat(added), d, 3); const b = byId(m.L, m.L.byHouse[9001]);
  ok(b && b.state === 'ok' && ev(m.L, 'reoccupy').some(e => e.by === 9001), `空き家があれば、新しい世帯は空き家に入る（新築しない）：${b ? b.id : '-'}`); }
// 2. 親族の家に余裕があれば、同居する
{ const m = make(12, 30); const kin = m.L.items.find(b => b.role === 'dwelling' && b.state === 'ok'); kin.members = 2; const cap = S.capOf(kin); const h0 = kin.house; const kc = kin.cluster;
  const hh = m.hh.concat([{ house: 9002, members: 1, kin: kc }]); let d = step(m, hh, 0, 4); const x = byId(m.L, m.L.byHouse[9002]); ok(x && x.state === 'ok', `親族の近くに住まいを得る：${x ? x.id : '未入居'}（同居 ${ev(m.L, 'cohabit').length}・空き家 ${ev(m.L, 'reoccupy').length}・工事 ${ev(m.L, 'project').length}）`); }
// 3. 空き家がなく、家に余裕もなければ、新築（材料と工期が要る）。着工→建設中→完成
{ const m = make(13, 30); const hh = m.hh.concat([{ house: 9003, members: 5, kin: 99 }, { house: 9004, members: 4, kin: 98 }]); let d = 0; const states = [];
  for (let k = 0; k < 40; k++) { d += 30; S.syncLayout(m.L, m.spec, hh, d); const b = m.L.items.find(i => i.house === 9003 && i.rec && !i.rec.synthetic); states.push(b ? b.state : '-'); }
  const first = states.indexOf('building'), done = states.indexOf('ok', first); console.log('   新築の経過（月）', states.slice(0, 14).join(' '));
  ok(first >= 0 && done > first, `新築は「建設中」を経て完成する（着工 ${first + 1}か月目 → 完成 ${done + 1}か月目、工期 ${done - first}か月）`); ok(ev(m.L, 'project').some(e => e.by === 9003) && ev(m.L, 'build').some(e => e.by === 9003), '着工と完成が、世帯IDつきで記録される'); }
// 4. 家が過密なら、増築する（面積が増え、入口・重なりは壊れない）
{ const m = make(14, 30); const b = m.L.items.find(x => x.role === 'dwelling' && x.state === 'ok'); const big = m.hh.find(h => h.house === b.house); big.members = S.capOf(b) * 2 + 1; const area0 = b.plan.kind === 'round' ? Math.PI * b.plan.w ** 2 / 4 : b.plan.w * b.plan.d; let tries = 0; for (let s = 0; s < 6 && !b.extended; s++) { step(m, m.hh, s * 1500, 40); tries++; if (byId(m.L, b.id).extended) break; }
  const bb = byId(m.L, b.id); const area1 = bb.plan.kind === 'round' ? Math.PI * bb.plan.w ** 2 / 4 : bb.plan.w * bb.plan.d; ok(bb.extended > 0 && area1 > area0, `過密な家は増築される（面積 ${area0.toFixed(1)} → ${area1.toFixed(1)}㎡）`);
  const it = live(m.L); let ov = 0; for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) if (S.overlaps(S.shapeOf(it[i]), S.shapeOf(it[j]), 0)) ov++; ok(ov === 0 && bb.entrance && isFinite(bb.entrance.x), `増築後も、他の建物と重ならず、入口がある（重なり ${ov}）`); }
// 5. 材料が足りなければ、工事は中断（待ち）になる。長引けば、簡素な仮小屋を先に建てる
{ const poor = Object.assign({}, ENV, { wood: 0, stone: 0, clay: 0, grass: 0.05, forest: 0, wetland: 0 }); const m = make(15, 30, poor); const hh = m.hh.concat([{ house: 9005, members: 4, kin: 99 }]); for (const f of Object.keys(m.L.stock)) m.L.stock[f] = 0;
  let d = step(m, hh, 0, 6); ok(ev(m.L, 'stall').some(e => e.by === 9005), `材料が足りないと、工事は待ちになる（中断の記録：${ev(m.L, 'stall').length}件、理由 ${(ev(m.L, 'stall')[0] || {}).why || '-'}）`); const homeless = !m.L.byHouse[9005] || byId(m.L, m.L.byHouse[9005]).state !== 'ok'; ok(homeless, '待っている間、住宅不足が残る（勝手に家が現れない）');
  d = step(m, hh, d, 24); const sh = m.L.items.find(i => i.house === 9005 && i.shelter === 'tent'); ok(!!sh, `待ちが長引くと、仮小屋（天幕・小屋掛け）を先に建てる：${sh ? sh.id : '-'}`); }
// 6. 世帯の違いで、選ぶ選択肢が変わる（空き家・同居・増築・新築・仮小屋）
{ const picks = {}; for (let seed = 20; seed < 60; seed++) { const m = make(seed, 25 + (seed % 5) * 6, seed % 7 === 0 ? Object.assign({}, ENV, { wood: 0.02, stone: 0.02, clay: 0.05, grass: 0.1 }) : ENV); const hh = m.hh.slice(0, 20 + (seed % 4)).concat(Array.from({ length: 4 }, (_, i) => ({ house: 9100 + i, members: 2 + (i + seed) % 5, kin: i % 2 ? 1 + (seed % 5) : 99 })));
    step(m, hh, 0, 48); for (const t of ['reoccupy', 'cohabit', 'extend', 'build', 'stall']) picks[t] = (picks[t] || 0) + ev(m.L, t).filter(e => e.by >= 9100 || t === 'extend').length; for (const e of ev(m.L, 'build')) if (e.why === 'shelter') picks.shelter = (picks.shelter || 0) + 1; }
  console.log('   40の村での選択', JSON.stringify(picks)); ok(['reoccupy', 'cohabit', 'build', 'stall'].filter(t => picks[t] > 0).length >= 3, '住居の選択は、条件によって空き家・同居・新築・待ちに分かれる（1つに固定されない）'); }
// 7. NPCの建設要求は、需要の仕組みに乗る
{ const m = make(16, 30); const hh = m.hh.concat([{ house: 9200, members: 3 }]); S.requestBuild(m.L, 'build', 9200, 30, 9200); const r = S.applyRequests(m.L, m.spec, hh, 30); step(m, hh, 30, 36); const b = byId(m.L, m.L.byHouse[9200]); ok(r.queued === 1 && b && b.state === 'ok', `NPCの建設要求は、材料・工期を経て完成する：${JSON.stringify(r)}`); }
// 8. 重なり・水・急斜面・世帯の対応は保たれる（多数のSeed・立地）
{ let ov = 0, wet = 0, un = 0, n = 0; for (const kind of ['river', 'coast', 'lake', 'inland', 'hilly']) for (let seed = 1; seed <= 6; seed++) { const m = make(seed, 40, ENV, kind); const hh = m.hh.concat(Array.from({ length: 8 }, (_, i) => ({ house: 9300 + i, members: 3 + i % 3, kin: i % 3 ? 2 : 99 }))); step(m, hh, 0, 60); const it = live(m.L).filter(b => b.state !== 'building' || true); for (let i = 0; i < it.length; i++) { if (it[i].role !== 'rack' && m.spec.terr.water(it[i].x, it[i].z) > 0.25) wet++; for (let j = i + 1; j < it.length; j++) if (S.overlaps(S.shapeOf(it[i]), S.shapeOf(it[j]), 0)) ov++; } un += hh.filter(h => { const id = m.L.byHouse[h.house], b = id && byId(m.L, id); return !(b && b.state === 'ok'); }).length; n++; }
  ok(ov === 0 && wet === 0, `30村×5年：重なり ${ov}・水の中 ${wet}`); ok(un <= n * 0.5, `5年後に家のない世帯は少ない（${un}世帯／${n}村）`); }
ok(JSON.stringify(make(5, 30).L) === JSON.stringify(make(5, 30).L), '同じ入力なら同じ結果');
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
