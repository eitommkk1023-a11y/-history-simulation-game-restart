'use strict';
// 人口の長期推移：node npc/bench-growth.js <generator.js> <world.bin> [seed] [years]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), SEED = +(process.argv[4] || 42), YEARS = +(process.argv[5] || 100);
const P = require('./people-core.js'); const env = world.fauna.env, cc = world.climate.cell, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(SEED, { world, plantFood, fauna, FA });
const tot = () => { let pop = 0, n = 0, v = 0, fed = 0, farm = 0, births = 0, deaths = 0; for (const g of people.groups) if (g.alive) { pop += g.pop; n++; fed += g.fed; if (g.settle === 2) v++; if (g.farm || (g.cropStage !== undefined)) farm++; } return { pop: Math.round(pop), groups: n, villages: v, fed: +(fed / n).toFixed(2), farm }; };
console.log('年, 総人口, 集団, 村, 平均充足, 農耕の集団'); const row = (y) => { const t = tot(); console.log([y, t.pop, t.groups, t.villages, t.fed, t.farm].join(', ')); };
row(0);
for (let i = 0; i < YEARS * 12; i++) { const month = i % 12; G.faunaMonthly(fauna, { month, env, cc }); P.peopleMonthly(people, { month, day: i * 30, world, fauna, FA, plantFood, env, cc, res: world.resources }); if ((i + 1) % 120 === 0) row((i + 1) / 12); }
const live = people.groups.filter(g => g.alive).sort((a, b) => b.pop - a.pop); console.log('上位5集団の人口', live.slice(0, 5).map(g => Math.round(g.pop)).join(','), '／下位5', live.slice(-5).map(g => Math.round(g.pop)).join(','));
console.log('人口の分布(四分位)', [0.1, 0.25, 0.5, 0.75, 0.9].map(q => Math.round(live[Math.floor(live.length * (1 - q))].pop)).join(','));
