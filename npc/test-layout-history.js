'use strict';
// 2C 履歴の検証：node npc/test-layout-history.js
const A = require('./arch-gen.js'), S = require('./settle-layout.js'), { terr } = require('./shape-metrics.js');
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const env = { tempC: 14, precip: 1100, wood: 0.7, stone: 0.2, clay: 0.4, fertile: 0.5, forest: 0.6, grass: 0.3, desert: 0, tundra: 0, wetland: 0.1, rugged: 0.1, elev: 100 };
function make(kind, seed, nH, level = 2) {
  const gen = A.genome(seed, 5, 5), hist = S.settleHistory(seed, 7, level, nH * 4, 0.7, {}), trad = A.tradition(seed, gen, env, hist.tech, [180, 120, 90]);
  const households = Array.from({ length: nH }, (_, i) => ({ house: 1000 + i * 7, members: 3, kin: 1 + Math.floor(i / 4) }));
  const spec = { seed, gid: 7, trad, hist, level, households, day: 0, siteKind: kind, economy: { fish: 0.3, gather: 0.4, hunt: 0.2, tool: 0.1 }, terr: terr(kind, seed) };
  return { spec, layout: S.layoutSettlement(spec) };
}
const m = make('river', 3, 40), L = m.layout;
ok(L.version === 2 && L.log[0].type === 'found' && L.log[0].synthetic === true, '成立の記録がある（開始前は推定と明記）');
ok(L.items.every(b => b.rec && b.rec.synthetic && b.rec.purpose), `開始前の建物（${L.items.length}棟）は全て 目的つきの推定記録`);
ok(L.items.filter(b => b.role === 'dwelling' && b.state === 'ok').every(b => b.rec.by === b.house), '住居の記録は、世帯（夫の人物ID）が建てた者になっている');
ok(L.items.every(b => b.rec.builtDay === Math.round(b.builtYear * 360)), '建築日と築年が一致');
// 途中の日に作った集落：築年は「作った日」から数える（開始前に建ったことにならない）
{ const gen = A.genome(5, 5, 5), hist = S.settleHistory(5, 7, 2, 100, 0.7, {}), trad = A.tradition(5, gen, env, hist.tech, [180, 120, 90]), hh = Array.from({ length: 30 }, (_, i) => ({ house: 1000 + i * 7, members: 3, kin: 1 + (i >> 2) })), day0 = 360 * 50 + 120;
  const L2 = S.layoutSettlement({ seed: 5, gid: 7, trad, hist, level: 2, households: hh, day: day0, economy: { fish: 0.3, gather: 0.4, hunt: 0.2, tool: 0.1 }, terr: terr('river', 5) });
  ok(L2.items.every(b => b.rec.builtDay <= day0 && day0 - b.rec.builtDay < 360 * 130), '途中の日（50年目）に作った集落でも、建物の建設日は作った日から遡った日になる'); ok(L2.log[0].day === day0, '成立の記録の日が、作った日になる'); }
// 世帯が増える・減る：需要の仕組みで住まいを得る（日・世帯ID・理由つきで記録）
const hs = m.spec.households.slice(0, 36).concat([{ house: 9001, members: 4, kin: 2 }, { house: 9002, members: 3 }, { house: 9003, members: 5 }, { house: 9004, members: 2 }, { house: 9005, members: 2 }, { house: 9006, members: 2 }]);
let day = 360 * 3 + 45; const r = S.syncLayout(L, m.spec, hs, day); for (let k = 0; k < 36; k++) { day += 30; S.syncLayout(L, m.spec, hs, day); }
const types = (t) => L.log.filter(e => e.type === t);
ok(types('vacate').length === 4, `空き家になった家（4）が記録される`);
ok(types('project').length + types('reoccupy').length + types('cohabit').length > 0, `新しい世帯の住まい（空き家・同居・増築・新築）の決定が記録される：project ${types('project').length}・reoccupy ${types('reoccupy').length}・cohabit ${types('cohabit').length}`);
ok(['project', 'reoccupy', 'cohabit', 'build'].flatMap(types).every(e => e.by === undefined || e.by === null || e.by >= 1000), '記録の「誰が」は世帯（人物ID）');
const builtE = types('build'); for (const e of builtE) { const b = L.items.find(i => i.id === e.id); ok(b.rec.by === e.by && !b.rec.synthetic && b.rec.purpose && b.rec.builtDay >= 0 && b.rec.builtDay <= e.day && e.day - b.rec.builtDay <= 360, `  建物${e.id}：建設日（着工）・建てた世帯・目的が建物にも記録`); }
ok(L.items.filter(b => b.rec.edits.length).every(b => b.rec.edits.every(e => e.type && e.day !== undefined)), '再入居・同居・増築・修理は、建物の改修欄に日つきで残る');
// 要求（NPCの建設・改築・解体）
S.requestBuild(L, 'build', 9100, day + 30, 9100); S.requestBuild(L, 'renovate', hs[0].house, day + 30, hs[0].house); S.requestBuild(L, 'demolish', hs[1].house, day + 30, hs[1].house);
const ar = S.applyRequests(L, m.spec, hs.concat([{ house: 9100, members: 3 }]), day + 30);
ok(L.log.some(e => e.type === 'renovate' && e.by === hs[0].house) && L.log.some(e => e.type === 'demolish' && e.by === hs[1].house), `改築・解体が記録される：${JSON.stringify(ar)}`);
ok(L.items.find(i => i.house === hs[0].house).rec.edits.some(e => e.type === 'renovate'), '改築は建物の改修欄に残る');
// 長く空き家のまま放置すると、傷んで廃屋になり、さらに崩れる（固定年数ではなく、状態で決まる）
{ const hsm = m.spec.households.slice(0, 10); let d = day + 60; for (let k = 0; k < 12 * 150; k++) { d += 30; S.syncLayout(L, m.spec, hsm, d); } ok(['ruin', 'collapse'].every(t => L.log.some(e => e.type === t)), '放置された家は、傷んで廃屋になり、さらに崩れる（150年）'); }
// 保存形式（JSON）で往復しても同じ・上限
const j = JSON.parse(JSON.stringify(L)); ok(JSON.stringify(j) === JSON.stringify(L), 'JSONの往復で一致（保存できる形）');
for (let i = 0; i < 800; i++) S.syncLayout(L, m.spec, i % 2 ? hs : hs.slice(0, 20), 360 * 400 + i * 30); ok(L.log.length <= 600 && L.log[0].type === 'found', `履歴は上限（600件）で古い所から捨て、成立の記録は残る（${L.log.length}件）`);
// 旧形式
const old = JSON.parse(JSON.stringify(make('lake', 5, 30).layout)); delete old.log; old.version = 1; delete old.plaza.kind; delete old.axis; for (const b of old.items) delete b.rec; const pos = JSON.stringify(old.items.map(b => [b.id, b.x, b.z, b.rot]));
S.upgradeLayout(old); ok(old.version === 2 && old.log.length === 0 && old.items.every(b => b.rec.synthetic) && JSON.stringify(old.items.map(b => [b.id, b.x, b.z, b.rot])) === pos, '旧形式を補完（位置・向きは変えない）');
{ const mo = make('lake', 5, 30); S.syncLayout(old, mo.spec, mo.spec.households.concat([{ house: 8888, members: 3 }]), 360 * 2); for (let k = 0; k < 24; k++) S.syncLayout(old, mo.spec, mo.spec.households.concat([{ house: 8888, members: 3 }]), 360 * 2 + 30 * (k + 1)); ok(old.life === 1 && old.items.every(b => b.state === 'removed' || b.cond) && old.log.length > 0, '補完した旧形式でも、素材・状態がつき、更新・記録ができる'); }
// 世界共通ID：建物IDは 集団ID×100003＋連番
ok(L.items.every(b => Math.floor(b.id / 100003) === 7), '建物IDは 集団ID から辿れる');
// 再現性
ok(JSON.stringify(make('coast', 4, 30).layout) === JSON.stringify(make('coast', 4, 30).layout), '同じ入力・日なら履歴も同じ');
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
