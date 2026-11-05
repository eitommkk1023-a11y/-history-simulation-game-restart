'use strict';
// 民族の形成・分裂・融合：node npc/test-ethno.js <generator.js> <world.bin> [年数] [速さ]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +process.argv[4] || 100, SPEED = +process.argv[5] || 1;
const P = require('./people-core.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES }, fauna = G.faunaClone(world.fauna);
const people = P.peopleGenerate(42, { world, plantFood, fauna, FA }), N = people.npc, ALIVE = 0x7fffffff; people.ethSpeed = SPEED;
const cnt = { ethSplit: 0, ethMerge: 0, ethAbsorb: 0, ethExtinct: 0 }, log = [], times = [];
const ethAlive = () => people.ethnicities.filter(e => e.alive).length;
console.log(`速さ ${SPEED}、初期 民族 ${ethAlive()}、集団 ${people.groups.filter(g => g.alive).length}`);
for (let i = 0; i < YEARS * 12; i++) {
  G.faunaMonthly(fauna, { month: i % 12, env, cc }); const t = process.hrtime.bigint();
  const ev = P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); if (i % 12 === 6) times.push(Number(process.hrtime.bigint() - t) / 1e6);
  for (const e of ev) if (e.type in cnt) { cnt[e.type]++; if (e.type !== 'ethExtinct' && log.length < 12) log.push(`${Math.floor(i / 12)}年 ${e.type}${e.parent ? ' 親' + e.parent : ''}${e.small ? ' 小' + e.small : ''} → 民族${e.eth || ''}${e.iso !== undefined ? ' 離れて' + e.iso + '年 距離' + e.dist : ''}${e.ratio !== undefined ? ' 人口比' + e.ratio + ' 距離' + e.dist : ''}`); }
  if (i % (12 * Math.max(10, YEARS / 5)) === 12 * Math.max(10, YEARS / 5) - 1) { const s = P.peopleSummary(people); console.log(`${Math.floor(i / 12) + 1}年：民族 ${ethAlive()}（記録 ${people.ethnicities.length}）集団 ${s.groups} 人口 ${Math.round(s.total)}、集団をまたぐ結婚 ${N.stats.crossMarriages || 0}`); }
}
console.log('出来事', JSON.stringify(cnt)); console.log(log.join('\n'));
// 整合性
let bad = 0; for (const g of people.groups) if (g.alive && !people.ethnicities[g.ethId - 1].alive) bad++; console.log('生きている集団が、消えた民族に属している', bad, '件');
let mism = 0, tot = 0; for (let i = 0; i < N.n; i++) if (N.death[i] === ALIVE && N.age(i) >= 12) { tot++; if (N.eth[i] !== N.groupEth[N.group[i]]) mism++; } console.log(`12歳以上で、本人の民族と集団の民族が違う人 ${mism}/${tot}（${(100 * mism / tot).toFixed(1)}%）、副次的な民族を持つ人 ${N.ethSecondary.size}`);
const states = {}; for (const e of people.ethnicities) states[e.state || '?'] = (states[e.state || '?'] || 0) + 1; console.log('民族の状態', JSON.stringify(states));
const rules = {}; for (const e of people.ethnicities.filter(e => e.alive)) { const k = P.SUCCESSION[e.succession]; rules[k] = (rules[k] || 0) + 1; } console.log('生きている民族の継承の決まり', JSON.stringify(rules));
times.sort((a, b) => a - b); console.log(`民族の年次処理を含む月の計算：平均 ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}ms 最大 ${times[times.length - 1].toFixed(1)}ms`);
const sv = P.peopleSave(people), p2 = P.peopleLoad(sv); console.log('保存→読み込み：民族数が一致', p2.ethnicities.length === people.ethnicities.length, '集団の文化が一致', JSON.stringify(p2.groups.map(g => g.cult)) === JSON.stringify(people.groups.map(g => g.cult)));
