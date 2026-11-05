'use strict';
// 定住：node npc/test-settle.js <generator.js> <world.bin> [年数] [速さ]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +process.argv[4] || 100, SPEED = +process.argv[5] || 1;
const P = require('./people-core.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES }, fauna = G.faunaClone(world.fauna);
const people = P.peopleGenerate(42, { world, plantFood, fauna, FA }); people.ethSpeed = SPEED;
const lv = () => { const c = [0, 0, 0]; let pop = [0, 0, 0]; for (const g of people.groups) if (g.alive) { c[g.settle || 0]++; pop[g.settle || 0] += g.pop; } return `野営地 ${c[0]}（${Math.round(pop[0])}人）／半定住 ${c[1]}（${Math.round(pop[1])}人）／村 ${c[2]}（${Math.round(pop[2])}人）`; };
console.log('開始：' + lv());
const cnt = { settle: 0, abandon: 0, migrate: 0 };
for (let i = 0; i < YEARS * 12; i++) { G.faunaMonthly(fauna, { month: i % 12, env, cc }); const ev = P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); for (const e of ev) if (e.type in cnt) cnt[e.type]++; if (i % (12 * Math.max(5, YEARS / 5)) === 12 * Math.max(5, YEARS / 5) - 1) { const s = P.peopleSummary(people); console.log(`${Math.floor(i / 12) + 1}年：${lv()}（人口 ${Math.round(s.total)}）`); } }
console.log('出来事', JSON.stringify(cnt));
