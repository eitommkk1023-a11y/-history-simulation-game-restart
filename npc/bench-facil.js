'use strict';
// 施設の強さの測定：同じ世界・同じ乱数で、施設なし／あり を比べる。node npc/bench-facil.js <generator.js> <world.bin>
// 村を「穀物中心」「生鮮中心」に分け、36か月の助走のあとで施設を与え、24か月の食料の状態を比べる（村ごとの平均）
const v8 = require('v8'), fs = require('fs');
const G = require(require('path').resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3]));
const P = require('./people-core.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources;
const plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const CONFIGS = [['施設なし', {}], ['貯蔵穴1', { pit: 1 }], ['貯蔵穴2', { pit: 2 }], ['貯蔵穴4', { pit: 4 }], ['倉庫1', { granary: 1 }], ['倉庫2', { granary: 2 }], ['倉庫4', { granary: 4 }], ['干し棚1', { rack: 1 }], ['干し棚3', { rack: 3 }], ['共同の炉', { hearth: 1 }], ['穴1＋倉庫1', { pit: 1, granary: 1 }]];
const STRESS = process.argv[4] === 'stress';   // 不作：収入が8か月、8割減る
function run(cfg, seed) {
  const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(seed, { world, plantFood, fauna, FA });
  for (const e of people.ethnicities) { P.peopleGrantTech(people, e.id, 'cultivate'); P.peopleGrantTech(people, e.id, 'herd'); }
  const step = (i) => { const month = i % 12; G.faunaMonthly(fauna, { month, env, cc }); P.peopleMonthly(people, { month, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); };
  for (let i = 0; i < 36; i++) step(i);
  const sel = { grain: [], fresh: [] };
  for (const g of people.groups) { if (!g.alive || (g.settle || 0) < 1 || g.pop < 40 || !g.lastFood) continue; const lf = g.lastFood, fi = (lf.hunt || 0) + (lf.fish || 0) + (lf.herd || 0) + (lf.gather || 0) * 0.45, di = (lf.farm || 0) + (lf.gather || 0) * 0.55, sh = fi / Math.max(1, fi + di); if (sh >= 0.6) sel.fresh.push(g.id); else if (sh <= 0.4) sel.grain.push(g.id); }
  for (const k in sel) for (const id of sel[k]) { const g = people.groups[id - 1]; g.settle = Math.max(g.settle, 2); g.facil = Object.assign({ granary: 0, well: 0, pen: 0, field: 0, pit: 0, rack: 0, hearth: 0, kiln: 0 }, cfg); }
  const acc = {}; for (const k in sel) acc[k] = { n: sel[k].length, stock: 0, spoil: 0, hungry: 0, fed: 0, deaths: 0, m: 0, dried: 0, pop: 0 };
  const d0 = {}; for (const k in sel) d0[k] = sel[k].reduce((a, id) => a + people.groups[id - 1].died.starvation, 0);
  for (let i = 36; i < 60; i++) {
    if (STRESS) for (const k in sel) for (const id of sel[k]) people.groups[id - 1].hardship = i >= 38 && i < 46 ? 0.8 : 0;
    step(i);
    for (const k in sel) for (const id of sel[k]) { const g = people.groups[id - 1]; if (!g.alive || !g.lastFood || !g.lastFood.need) continue; const a = acc[k]; a.m++; a.stock += g.food / g.lastFood.need * 30; const sp = g.lastFood.spoil || {}; a.spoil += (sp.dur || 0) + (sp.fresh || 0) + (sp.dried || 0); a.hungry += g.hunger > 0 ? 1 : 0; a.fed += g.fed; a.dried += g.dried || 0; a.pop += g.pop; }
  }
  for (const k in sel) acc[k].deaths = sel[k].reduce((a, id) => a + people.groups[id - 1].died.starvation, 0) - d0[k];
  return acc;
}
const results = {}; const seeds = [42, 7];
for (const [name, cfg] of CONFIGS) { results[name] = {}; for (const seed of seeds) { const a = run(cfg, seed); for (const k in a) { const r = results[name][k] || (results[name][k] = { n: 0, stock: 0, spoil: 0, hungry: 0, fed: 0, m: 0, dried: 0, deaths: 0, pop: 0 }); for (const f in r) r[f] += a[k][f]; } } }
for (const k of ['grain', 'fresh']) {
  console.log(`\n## ${k === 'grain' ? '穀物・根が主な村' : '生鮮（肉・魚・乳）が主な村'}（${results['施設なし'][k].n}村・2つの乱数・24か月）`);
  console.log('施設 | 蓄え(日分) | 傷みで失う(1村・月kg) | 食料不足の月の割合 | 食料の充足 | 飢えで亡くなる人（人口1000人あたり・年）');
  const base = results['施設なし'][k];
  for (const [name] of CONFIGS) { const r = results[name][k], m = Math.max(1, r.m); console.log(`${name} | ${(r.stock / m).toFixed(1)} | ${(r.spoil / m).toFixed(0)} | ${(100 * r.hungry / m).toFixed(1)}% | ${(r.fed / m).toFixed(3)} | ${(12000 * r.deaths / Math.max(1, r.pop)).toFixed(1)}`); }
}
