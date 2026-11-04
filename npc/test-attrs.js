'use strict';
// 属性（民族・世帯・死因・成人年齢）の検証：node npc/test-attrs.js <generator.js> <world.bin> [年数]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +process.argv[4] || 30;
const P = require('./people-core.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources;
const plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const fauna = G.faunaClone(world.fauna);
const people = P.peopleGenerate(42, { world, plantFood, fauna, FA }), N = people.npc, ALIVE = 0x7fffffff, NONE = 0xffffffff;
const check = (label) => {
  let noEth = 0, mism = 0, adults = 0, withHouse = 0, a12 = 0;
  for (let i = 0; i < N.n; i++) { if (N.death[i] !== ALIVE) continue; const a = N.age(i); if (a >= 12) { a12++; if (!N.eth[i]) noEth++; } if (N.house[i] !== NONE) withHouse++; }
  const hs = new Map(); for (let i = 0; i < N.n; i++) if (N.death[i] === ALIVE) hs.set(N.house[i], (hs.get(N.house[i]) || 0) + 1);
  const sizes = [...hs.values()], avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  console.log(`${label}: 12歳以上で民族未確定 ${noEth}/${a12}、世帯 ${hs.size}（平均 ${avg.toFixed(1)}人、最大 ${Math.max(...sizes)}人）、副次的な民族を持つ人 ${N.ethSecondary.size}`);
};
check('開始時');
for (let i = 0; i < YEARS * 12; i++) { G.faunaMonthly(fauna, { month: i % 12, env, cc }); P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); }
check(YEARS + '年後');
// 死因
const names = ['', '老衰', '非感染性疾患', '感染症', '戦死', '殺害', '事故', '飢餓', '出産関連', '災害', '環境'], cnt = new Array(11).fill(0); let dead = 0;
for (let i = 0; i < N.n; i++) if (N.death[i] !== ALIVE) { cnt[N.cause[i]]++; dead++; }
console.log('死因：' + cnt.map((c, k) => c ? names[k] + ' ' + (100 * c / dead).toFixed(0) + '%' : '').filter(Boolean).join(' ') + `（${dead}人）`);
// 結婚の年齢と、民族ごとの成人年齢
let early = 0, wed = 0; for (let i = 0; i < N.n; i++) { if (N.sex[i] !== 0 || N.spouse[i] === NONE && N.house[i] === NONE) continue; const j = N.spouse[i]; if (j === NONE) continue; wed++; }
const adult = people.ethnicities.map(e => e.adultAge); const dist = {}; adult.forEach(a => dist[a] = (dist[a] || 0) + 1); console.log('民族の成人年齢の分布', JSON.stringify(dist));
// 民族ごとに、実際の最初の結婚年齢（現在結婚している女性の最年少）が成人年齢以上か
let viol = 0, tot = 0; for (let i = 0; i < N.n; i++) { if (N.death[i] !== ALIVE || N.spouse[i] === NONE) continue; const ad = N.adultAge(i); tot++; /* 結婚時の年齢は残していないので、現在の年齢が成人年齢未満の既婚者を数える */ if (N.age(i) < ad) viol++; } console.log(`成人年齢未満で既婚の人 ${viol}/${tot}`);
const ec = P.peopleEthCounts(people); const vals = Object.values(ec); console.log('民族ごとの人口：最小', Math.min(...vals), '最大', Math.max(...vals), '合計', vals.reduce((a, b) => a + b, 0), '民族数', vals.length);
// 再現性
const again = P.peopleGenerate(42, { world, plantFood, fauna: G.faunaClone(world.fauna), FA }); const people2 = again; let same = people2.npc.n === people2.npc.n; console.log('初期の再現性', again.npc.checksum() === P.peopleGenerate(42, { world, plantFood, fauna: G.faunaClone(world.fauna), FA }).npc.checksum());
