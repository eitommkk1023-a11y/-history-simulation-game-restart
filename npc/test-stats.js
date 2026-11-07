'use strict';
// 統計の記録の検証：node npc/test-stats.js <generator.js> <world.bin> [seed]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), SEED = +(process.argv[4] || 42);
const P = require('./people-core.js'); const env = world.fauna.env, cc = world.climate.cell, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0), FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(SEED, { world, plantFood, fauna, FA });
const step = (from, months) => { for (let i = from; i < from + months; i++) { const month = i % 12; G.faunaMonthly(fauna, { month, env, cc }); P.peopleMonthly(people, { month, day: i * 30, world, fauna, FA, plantFood, env, cc, res: world.resources }); } };
step(0, 12 * 30); const L = people.statLog;
ok(L && L.days.length >= 100 && L.days[0] === 0, `90日ごとに記録される（30年で ${L.days.length}件）`);
const live = people.groups.filter(g => g.alive).reduce((a, g) => a + g.pop, 0); ok(Math.abs(L.pop[L.pop.length - 1] - live) < live * 0.02, `最新の記録は、いまの総人口と一致（記録 ${L.pop[L.pop.length - 1]}／実 ${Math.round(live)}）`);
const w = P.peopleStatSeries(people, 'world'), g0 = people.groups.find(g => g.alive), gs = P.peopleStatSeries(people, 'group', g0.id);
ok(w.pop.length === L.days.length && gs.pop.length === L.days.length, '世界・集落の系列が取り出せる');
const reg = (g) => 1 + (g.id % 3); const rs = [1, 2, 3].map(r => P.peopleStatSeries(people, 'region', r, reg)); ok(rs[0].pop.map((x, i) => x + rs[1].pop[i] + rs[2].pop[i]).every((x, i) => Math.abs(x - w.pop[i]) <= 3), '地域の合計が、世界の人口と一致する');
const ch = P.peopleStatChange(people, 360 * 10); ok(ch.length > 50 && ch.some(c => c.diff > 0) && ch.some(c => c.diff < 0), `集落ごとの増減が出る（増 ${ch.filter(c => c.diff > 0).length}／減 ${ch.filter(c => c.diff < 0).length}）`);
// 保存・復元
const sv = P.peopleSave(people), back = P.peopleLoad(JSON.parse(JSON.stringify(sv, (k, v) => ArrayBuffer.isView(v) ? { __ta: v.constructor.name, d: Array.from(v) } : v), (k, v) => v && v.__ta ? new (global[v.__ta])(v.d) : v));
ok(JSON.stringify(P.peopleStatSeries(back, 'world')) === JSON.stringify(w) && JSON.stringify(P.peopleStatSeries(back, 'group', g0.id)) === JSON.stringify(gs), '保存→復元で、系列が一致する');
// 続き：復元後も記録が続く・同じ結果（乱数に影響しない）
const days0 = L.days.length; const a = P.peopleSave(people).meta.npc.rng, snapPop = people.groups.reduce((x, g) => x + g.pop, 0); step(12 * 30, 12 * 5); ok(people.statLog.days.length >= days0 + 15, '続けると記録が増える');
// 間引き：上限を超えても、最新は細かく・全期間を覆う
{ const q = people; for (let k = 0; k < 600; k++) { q.npc.day += 90; P.peStatRecord(q); } const D = q.statLog.days; ok(D.length <= 520 && D[0] === 0 && D[D.length - 1] === q.npc.day, `上限（520件）を超えたら古いほうを間引く（${D.length}件・最初 ${D[0]}日から最新 ${D[D.length - 1]}日まで）`); ok(D[D.length - 1] - D[D.length - 2] <= 90 && D[1] - D[0] > 90 - 1, '新しいほど細かい'); const sz = JSON.stringify(P.peopleStatSeries(q, 'world')).length; }
// 保存容量
{ const st = P.peopleSave(people).stat; const bytes = st.gp.byteLength + st.gl.byteLength + JSON.stringify(st.meta).length; console.log(`   保存容量 約 ${(bytes / 1024).toFixed(0)}KB（${st.meta.days.length}件）`); ok(bytes < 400 * 1024, '統計の保存容量が400KB未満'); }
// 乱数に影響しない：記録の有無で、シミュレーションの結果が同じ
{ const mk = () => { const f = G.faunaClone(world.fauna); return { f, p: P.peopleGenerate(SEED, { world, plantFood, fauna: f, FA }) }; }; const A = mk(), B = mk(); const run = (o, rec) => { const orig = P.peStatRecord; for (let i = 0; i < 12 * 8; i++) { const month = i % 12; G.faunaMonthly(o.f, { month, env, cc }); P.peopleMonthly(o.p, { month, day: i * 30, world, fauna: o.f, FA, plantFood, env, cc, res: world.resources }); } return o.p.groups.map(g => Math.round(g.pop)).join(','); };
  ok(run(A) === run(B), '同じ条件なら、統計を記録していても同じ結果（乱数・シミュレーションに影響しない）'); }
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
