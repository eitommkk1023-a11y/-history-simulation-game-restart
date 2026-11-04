'use strict';
// 使い方：node npc/test-people.js <generator.js> <world.bin> [年数]
const v8 = require('v8'), fs = require('fs');
const G = require(require('path').resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +process.argv[4] || 50;
const P = require('./people-core.js'), { JOBS, NJOB } = require('./npc-core.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources;
const plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const fauna = G.faunaClone(world.fauna);
let t0 = Date.now(); const people = P.peopleGenerate(42, { world, plantFood, fauna, FA }); const genMs = Date.now() - t0;
const N0 = people.npc;
console.log(`生成 ${genMs}ms 民族 ${people.ethnicities.length} 集団 ${people.groups.length} 住民 ${N0.livingCount()}人（配列 ${N0.n}）`);
const jobShare = () => { const c = new Float64Array(NJOB); let a = 0; for (let i = 0; i < N0.n; i++) if (N0.death[i] === 0x7fffffff && N0.age(i) >= 16) { c[N0.job[i]]++; a++; } return JOBS.map((j, k) => j.name + Math.round(100 * c[k] / a)).filter((_, k) => c[k] / a > .01).join(' '); };
console.log('初期の職業（16歳以上 %）', jobShare());
const times = [], cnt = {}; const share = { hunt: 0, gather: 0, fish: 0 };
console.log('年  総人口 集団 民族 食料充足 食料内訳(狩/採/漁%) 出生累計 死亡累計(自然/飢え/寒さ/病気) 1か月ms');
for (let i = 0; i < YEARS * 12; i++) {
  const month = i % 12; G.faunaMonthly(fauna, { month, env, cc });
  const t = process.hrtime.bigint(); const ev = P.peopleMonthly(people, { month, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); times.push(Number(process.hrtime.bigint() - t) / 1e6);
  for (const e of ev) cnt[e.type] = (cnt[e.type] || 0) + 1;
  for (const g of people.groups) if (g.alive) { share.hunt += g.lastFood.hunt; share.gather += g.lastFood.gather; share.fish += g.lastFood.fish; }
  if (month === 11 && (i < 12 || ((i + 1) / 12) % 5 === 0)) {
    const s = P.peopleSummary(people); let fed = 0, n = 0; for (const g of people.groups) if (g.alive) { fed += g.fed; n++; }
    const tot = share.hunt + share.gather + share.fish || 1;
    console.log(`${String((i + 1) / 12).padStart(2)} ${String(Math.round(s.total)).padStart(7)} ${String(s.groups).padStart(4)} ${String(s.ethnicities).padStart(4)}  ${(fed / n).toFixed(2)}  ${(100 * share.hunt / tot).toFixed(0)}/${(100 * share.gather / tot).toFixed(0)}/${(100 * share.fish / tot).toFixed(0)}  ${s.born}  ${Object.values(s.died).join('/')}  ${times[times.length - 1].toFixed(1)}`);
    share.hunt = share.gather = share.fish = 0;
  }
}
times.sort((a, b) => a - b);
console.log(`1か月の計算：平均 ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}ms 中央 ${times[times.length >> 1].toFixed(1)}ms 95% ${times[Math.floor(times.length * .95)].toFixed(1)}ms 最大 ${times[times.length - 1].toFixed(1)}ms`);
console.log('出来事', JSON.stringify(cnt), '／職業（16歳以上 %）', jobShare());
const sv = P.peopleSave(people); let bytes = 0; for (const k in sv) if (ArrayBuffer.isView(sv[k])) bytes += sv[k].byteLength; console.log(`保存（配列）${(bytes / 1048576).toFixed(2)}MB`);
{ // 診断：15〜49歳の女性のうち結婚している割合、年齢別
  let w = 0, m = 0; const byAge = {}; for (let i = 0; i < N0.n; i++) { if (N0.death[i] !== 0x7fffffff || N0.sex[i] !== 0) continue; const a = N0.age(i); if (a < 15 || a >= 50) continue; w++; const b = Math.floor(a / 5) * 5; byAge[b] = byAge[b] || [0, 0]; byAge[b][1]++; if (N0.spouse[i] !== 0xffffffff) { m++; byAge[b][0]++; } }
  console.log(`結婚している女性（15〜49歳）${(100 * m / w).toFixed(0)}%`, Object.entries(byAge).map(([b, [x, y]]) => b + ':' + (100 * x / y).toFixed(0)).join(' '));
  let men = 0, womenAdult = 0; for (let i = 0; i < N0.n; i++) { if (N0.death[i] !== 0x7fffffff) continue; const a = N0.age(i); if (a < 16 || a >= 60) continue; if (N0.sex[i] === 1) men++; else womenAdult++; } console.log(`16〜59歳の男 ${men} 女 ${womenAdult}`);
}
