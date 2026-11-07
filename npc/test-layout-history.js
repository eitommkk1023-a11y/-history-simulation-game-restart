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
// 世帯が増える・減る
const hs = m.spec.households.slice(0, 36).concat([{ house: 9001, members: 4, kin: 2 }, { house: 9002, members: 3 }, { house: 9003, members: 5 }, { house: 9004, members: 2 }, { house: 9005, members: 2 }, { house: 9006, members: 2 }]);
const day = 360 * 3 + 45, r = S.syncLayout(L, m.spec, hs, day);
const built = L.log.filter(e => e.type === 'build'), vac = L.log.filter(e => e.type === 'vacate'), reo = L.log.filter(e => e.type === 'reoccupy');
ok(vac.length === r.vacated && reo.length >= 1, `空き家（${vac.length}）・再入居（${reo.length}）が記録される：${JSON.stringify(r)}`);
ok(built.length === r.added && built.every(e => e.day === day && e.by >= 9001 && e.why === 'newhouse'), `増築（${built.length}棟）は 日・世帯ID・理由 つきで記録`);
for (const e of built) { const b = L.items.find(i => i.id === e.id); ok(b.rec.builtDay === day && b.rec.by === e.by && !b.rec.synthetic && b.rec.purpose, `  建物${e.id}：建設日・建てた世帯・目的が建物にも記録`); }
const reb = L.items.filter(b => b.rec.edits.length); ok(reb.every(b => b.rec.edits[0].type === 'reoccupy'), '再入居は建物の改修欄にも記録');
// 要求（NPCの建設・改築・解体）
S.requestBuild(L, 'build', 9100, day + 30, 9100); S.requestBuild(L, 'renovate', hs[0].house, day + 30, hs[0].house); S.requestBuild(L, 'demolish', hs[1].house, day + 30, hs[1].house);
const ar = S.applyRequests(L, m.spec, hs.concat([{ house: 9100, members: 3 }]), day + 30);
ok(L.log.some(e => e.type === 'renovate' && e.by === hs[0].house) && L.log.some(e => e.type === 'demolish' && e.by === hs[1].house), `改築・解体が記録される：${JSON.stringify(ar)}`);
ok(L.items.find(i => i.house === hs[0].house).rec.edits.some(e => e.type === 'renovate'), '改築は建物の改修欄に残る');
// 空き家のまま放置 → 廃屋 → 撤去
S.syncLayout(L, m.spec, hs.slice(0, 20), 360 * 4); S.syncLayout(L, m.spec, hs.slice(0, 20), 360 * 4 + 6 * 360); S.syncLayout(L, m.spec, hs.slice(0, 20), 360 * 4 + 14 * 360);
ok(['ruin', 'remove'].every(t => L.log.some(e => e.type === t)), '廃屋化・撤去が記録される');
// 保存形式（JSON）で往復しても同じ・上限
const j = JSON.parse(JSON.stringify(L)); ok(JSON.stringify(j) === JSON.stringify(L), 'JSONの往復で一致（保存できる形）');
for (let i = 0; i < 800; i++) S.syncLayout(L, m.spec, i % 2 ? hs : hs.slice(0, 20), 360 * 30 + i * 10); ok(L.log.length <= 600 && L.log[0].type === 'found', `履歴は上限（600件）で古い所から捨て、成立の記録は残る（${L.log.length}件）`);
// 旧形式
const old = JSON.parse(JSON.stringify(make('lake', 5, 30).layout)); delete old.log; old.version = 1; delete old.plaza.kind; delete old.axis; for (const b of old.items) delete b.rec; const pos = JSON.stringify(old.items.map(b => [b.id, b.x, b.z, b.rot]));
S.upgradeLayout(old); ok(old.version === 2 && old.log.length === 0 && old.items.every(b => b.rec.synthetic) && JSON.stringify(old.items.map(b => [b.id, b.x, b.z, b.rot])) === pos, '旧形式を補完（位置・向きは変えない）');
S.syncLayout(old, make('lake', 5, 30).spec, make('lake', 5, 30).spec.households.concat([{ house: 8888, members: 3 }]), 360); ok(old.log.length > 0, '補完した旧形式でも更新・記録ができる');
// 世界共通ID：建物IDは 集団ID×100003＋連番
ok(L.items.every(b => Math.floor(b.id / 100003) === 7), '建物IDは 集団ID から辿れる');
// 再現性
ok(JSON.stringify(make('coast', 4, 30).layout) === JSON.stringify(make('coast', 4, 30).layout), '同じ入力・日なら履歴も同じ');
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
