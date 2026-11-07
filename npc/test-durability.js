'use strict';
// 建築部位ごとの耐久・劣化・修理の検証：node npc/test-durability.js
const A = require('./arch-gen.js'), S = require('./settle-layout.js'), M = require('./materials.js'), { terr } = require('./shape-metrics.js');
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const ENV = { tempC: 12, precip: 1000, wood: 0.6, stone: 0.4, clay: 0.4, fertile: 0.5, forest: 0.5, grass: 0.4, desert: 0, tundra: 0, wetland: 0.1, rugged: 0.1, elev: 100 };
function make(kind, seed, nH, env = ENV, level = 2) {
  const gen = A.genome(seed, 5, 5), hist = S.settleHistory(seed, 7, level, nH * 4, 0.7, {}), trad = A.tradition(seed, gen, env, hist.tech, [180, 120, 90]);
  const households = Array.from({ length: nH }, (_, i) => ({ house: 1000 + i * 7, members: 3 + (i % 3), kin: 1 + (i >> 2) }));
  const spec = { seed, gid: 7, trad, hist, level, households, day: 0, siteKind: kind, economy: { fish: 0.3, gather: 0.4, hunt: 0.2, tool: 0.1 }, terr: terr(kind, seed) };
  return { spec, layout: S.layoutSettlement(spec), households };
}
const clone = (x) => JSON.parse(JSON.stringify(x)), live = (L) => L.items.filter(b => b.state !== 'removed');
const run = (m, L, hh, years, start = 0) => { let d = start; for (let k = 0; k < years * 12; k++) { d += 30; S.syncLayout(L, m.spec, hh, d); } return d; };
{ const m = make('river', 3, 40), L = m.layout, it = live(L);
  ok(it.every(b => b.pm && b.pm.length === 6 && b.cond && b.cond.length === 6 && b.cond.every(h => h >= 0 && h <= 1) && (b.q === 0 || b.q === 1 || b.q === 2)), `全ての建物（${it.length}棟）に、部位ごとの素材・品質・状態がある`);
  ok(it.every(b => b.pm.every(id => M.MATERIALS[id])), '部位の素材は新素材辞書の素材');
  const okB = it.filter(b => b.state === 'ok' && b.role === 'dwelling'); const mean = okB.reduce((a, b) => a + S.total(b.cond), 0) / okB.length; console.log(`   使用中の住居の状態 平均 ${mean.toFixed(2)}、状態別 ${JSON.stringify(okB.reduce((o, b) => { const g = S.GRADE_JP[S.grade(S.total(b.cond))]; o[g] = (o[g] || 0) + 1; return o; }, {}))}`); ok(mean > 0.6, '住んでいる家は、手入れされて概ね使える状態'); }
// 屋根の傷みだけで建物は消えない・雨漏りの連鎖
{ const m = make('river', 5, 30), a = clone(m.layout), b = clone(m.layout); const pick = (L) => L.items.find(x => x.role === 'dwelling' && x.state === 'ok'); const ia = pick(a), ib = pick(b); ia.cond = [0.9, 0.9, 0.9, 0.2, 0.9, 0.9]; ib.cond = [0.9, 0.9, 0.9, 0.95, 0.9, 0.9];
  for (const L of [a, b]) { const x = pick(L); x.hh = []; for (const h of Object.keys(L.byHouse)) if (L.byHouse[h] === x.id) delete L.byHouse[h]; x.state = 'vacant'; }
  const hh = m.households.filter(h => !a.items.find(x => x.id === ia.id).hh.includes(h.house)); run(m, a, m.households.filter(h => h.house !== ia.house), 10); run(m, b, m.households.filter(h => h.house !== ib.house), 10);
  const ca = a.items.find(x => x.id === ia.id), cb = b.items.find(x => x.id === ib.id);
  ok(ca.state !== 'removed' && ca.cond[3] < 0.2, `屋根が傷んでも、建物全体は消えない（屋根 ${ca.cond[3]}、状態 ${ca.state}）`);
  const lossA = (0.9 * 3 - ca.cond[2] - ca.cond[4] - ca.cond[1]) , lossB = (0.9 * 3 - cb.cond[2] - cb.cond[4] - cb.cond[1]); ok(lossA > lossB, `雨漏り（屋根が傷んだ家）では、壁・床・骨組みの傷みが速い（損失 ${lossA.toFixed(3)} > ${lossB.toFixed(3)}）`); }
// 手入れ：修理で屋根が戻り、築年は変わらない
{ const m = make('river', 7, 30), L = m.layout, b = L.items.find(x => x.role === 'dwelling' && x.state === 'ok'); const by0 = b.builtYear, bd0 = b.rec.builtDay; b.cond = [0.9, 0.9, 0.9, 0.12, 0.9, 0.9]; L.stock = { wood: 100, stone: 100, earth: 100, plant: 100, animal: 100, metal: 0 };
  run(m, L, m.households, 2); const bb = L.items.find(x => x.id === b.id); ok(bb.cond[3] > 0.6, `住んでいる家は、傷んだ屋根を葺き替える（屋根 ${bb.cond[3]}）`); ok(bb.builtYear === by0 && bb.rec.builtDay === bd0, `屋根を替えても築年は変わらない（築年 ${bb.builtYear}）`); ok(bb.rec.edits.some(e => e.type === 'replace' && e.part === 'roof'), '修理の履歴が残る'); }
// 材料が足りなければ、修理できない
{ const m = make('river', 7, 30), L = m.layout, b = L.items.find(x => x.role === 'dwelling' && x.state === 'ok'); b.cond = [0.9, 0.9, 0.9, 0.12, 0.9, 0.9]; const env0 = clone(m.spec.trad.src.env); m.spec.trad.src.env = Object.assign({}, env0, { wood: 0, stone: 0, clay: 0, grass: 0, forest: 0, wetland: 0 }); L.stock = { wood: 0, stone: 0, earth: 0, plant: 0, animal: 0, metal: 0 };
  run(m, L, m.households, 1); const bb = L.items.find(x => x.id === b.id); ok(bb.cond[3] < 0.2, `材料（資源）がなければ、修理できず傷んだまま（屋根 ${bb.cond[3]}）`); }
// 素材と環境の違い
{ const mk = (id, env) => ({ pm: [id, id, id, id, id, id], q: 1 }); const wet = { precip: 2200, tempC: 22 }, dry = { precip: 300, tempC: 8 };
  const r = (id, env, i = 3) => S.yearRate(mk(id), i, env);
  ok(r('thatch', ENV) > r('fieldstone', ENV) * 5 && r('reed', ENV) > r('splitstone', ENV), `素材で傷み方が違う（茅 ${r('thatch', ENV).toFixed(3)}／年 ＞ 石 ${r('fieldstone', ENV).toFixed(3)}）`);
  ok(r('log', wet, 1) > r('log', dry, 1) * 1.4, `同じ丸太でも、高温多湿のほうが速く腐る（${r('log', wet, 1).toFixed(4)} ＞ ${r('log', dry, 1).toFixed(4)}）`);
  ok(r('mudbrick', wet, 2) > r('firedbrick', wet, 2) * 2, `日干しレンガは雨に弱く、焼成レンガは強い（${r('mudbrick', wet, 2).toFixed(4)} ＞ ${r('firedbrick', wet, 2).toFixed(4)}）`);
  const q = (qq) => S.yearRate({ pm: ['log', 'log', 'log', 'log', 'log', 'log'], q: qq }, 2, ENV); ok(q(0) > q(1) && q(1) > q(2), '加工の品質が高いほど長持ちする（粗い＞標準＞精密）'); }
// 固定の寿命がない：手入れされ続ける家は、何百年たっても建っている。空き家は状態しだいで廃屋・崩壊する
{ const m = make('river', 9, 30), L = m.layout, ids = live(L).filter(b => b.role === 'dwelling' && b.state === 'ok').map(b => b.id); run(m, L, m.households, 300);
  const left = ids.filter(id => { const b = L.items.find(x => x.id === id); return b && b.state !== 'removed'; }).length; console.log(`   300年後：住居 ${ids.length}棟のうち残っている ${left}棟（${S.GRADE_JP.map((g, i) => g + ' ' + live(L).filter(b => b.state === 'ok' && S.grade(S.total(b.cond)) === i).length).join('・')}）`);
  ok(left >= ids.length * 0.6, '手入れされる家は、300年たっても多くが残る（築年数では消えない）'); ok(live(L).some(b => b.rec.edits.some(e => e.type === 'replace' || e.type === 'repair')) && L.items.some(b => b.builtYear < 0 && b.state === 'ok'), '開始前に建った家が、部位を直されながら使われ続ける（築年は古いまま）'); }
{ const m = make('river', 9, 30), L = m.layout, hh = m.households.slice(0, 5), E = S.envOf(m.spec), rate = new Map(L.items.map(b => [b.id, S.yearRate(b, 1, E)])); const dw = L.items.filter(b => b.role === 'dwelling').map(b => b.id); const d = run(m, L, hh, 25);
  const gone = dw.filter(id => L.items.find(x => x.id === id).state === 'removed'), stay = dw.filter(id => L.items.find(x => x.id === id).state !== 'removed'); const mean = (a) => a.reduce((x, id) => x + rate.get(id), 0) / Math.max(1, a.length);
  console.log(`   25年放置：崩れた ${gone.length}・残った ${stay.length}。骨組みの傷み率（崩れた ${mean(gone).toFixed(4)}／残った ${mean(stay).toFixed(4)}）`);
  ok(stay.length >= dw.length * 0.25 && gone.length > 0, '人が減って空き家が増えても、一斉には消えない（耐久の差で、崩れる家と残る家に分かれる）'); ok(mean(gone) > mean(stay), '崩れやすいのは、傷みやすい素材の骨組みの家（築年数ではなく素材・環境・状態で決まる）');
  run(m, L, hh, 200, d); ok(L.log.some(e => e.type === 'ruin') && L.log.some(e => e.type === 'collapse'), `放置が続くと、傷んで廃屋になり、さらに崩れる（廃屋 ${L.log.filter(e => e.type === 'ruin').length}・崩壊 ${L.log.filter(e => e.type === 'collapse').length}）`); }
// 保存容量
{ const m = make('river', 3, 60), L = m.layout, n = live(L).length; const withLife = JSON.stringify(L).length; const stripped = clone(L); for (const b of stripped.items) { delete b.pm; delete b.cond; delete b.q; delete b.hh; } delete stripped.stock; delete stripped.proj; const base = JSON.stringify(stripped).length; console.log(`   保存容量：60世帯・${n}棟で ${(withLife / 1024).toFixed(0)}KB（素材・状態の追加分 ${((withLife - base) / n).toFixed(0)}バイト／棟）`); ok((withLife - base) / n < 200, '素材・状態の追加分が、1棟あたり200バイト未満'); }
ok(JSON.stringify(make('lake', 4, 30).layout) === JSON.stringify(make('lake', 4, 30).layout), '同じ入力なら、素材・状態も同じ（再現性）');
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
