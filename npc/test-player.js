'use strict';
// プレイヤーの人物：長く進めて、代替わり・一族断絶を確かめる。node npc/test-player.js <generator.js> <world.bin> [年数] [gameover]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +process.argv[4] || 150;
const P = require('./people-core.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources;
const plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const fauna = G.faunaClone(world.fauna), people = P.peopleGenerate(42, { world, plantFood, fauna, FA });
if (process.argv[5] === 'gameover') people.player.onExtinct = 'gameover';
const y0 = P.peopleYou(people); console.log('開始：', JSON.stringify(y0), '民族の決まり', JSON.stringify(people.ethnicities.reduce((o, e) => (o[P.SUCCESSION[e.succession]] = (o[P.SUCCESSION[e.succession]] || 0) + 1, o), {})));
const cnt = { playerSucceed: 0, playerNewLine: 0, playerEnd: 0 }, rules = {}, minors = { n: 0 };
for (let i = 0; i < YEARS * 12; i++) {
  G.faunaMonthly(fauna, { month: i % 12, env, cc });
  const ev = P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res });
  for (const e of ev) if (e.type in cnt) { cnt[e.type]++; if (e.rule !== undefined) { rules[P.SUCCESSION[e.rule]] = (rules[P.SUCCESSION[e.rule]] || 0) + 1; if (e.minor) minors.n++; } if (e.type === 'playerEnd') console.log(`${Math.floor(i / 12)}年：ゲームオーバー`); }
  if (i % (12 * 25) === 12 * 25 - 1) console.log(`${Math.floor(i / 12) + 1}年：`, JSON.stringify(P.peopleYou(people)));
}
console.log('代替わり', JSON.stringify(cnt), '決まりの内訳', JSON.stringify(rules), '未成年の跡継ぎ', minors.n);
console.log('一族の系譜（人数）', people.player.dynasty.length, '代');
