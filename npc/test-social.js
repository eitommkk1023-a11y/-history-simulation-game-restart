'use strict';
// 人間関係と首長の検証：node npc/test-social.js <generator.js> <world.bin> [年数]
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3])), YEARS = +process.argv[4] || 20;
const P = require('./people-core.js'), Npc = require('./npc-core.js'), { SI, SOC_K, NSKILL } = Npc;
const env = world.fauna.env, cc = world.climate.cell, res = world.resources, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES }, fauna = G.faunaClone(world.fauna);
const t0 = Date.now(), people = P.peopleGenerate(42, { world, plantFood, fauna, FA }), N = people.npc, ALIVE = 0x7fffffff, NONE = 0xffffffff;
console.log('生成', Date.now() - t0, 'ms');
const edgeStats = (label) => {
  let n = 0, e = 0, tr = 0, lk = 0, rp = 0, strong = 0; const bySoc = [[0, 0], [0, 0]];
  for (let i = 0; i < N.n; i++) { if (N.death[i] !== ALIVE || N.age(i) < 10) continue; n++; let cnt = 0; for (let s = 0; s < SOC_K; s++) { if (N.relId[i * SOC_K + s] === NONE) continue; cnt++; e++; const v = (i * SOC_K + s) * 3; tr += Math.abs(N.relV[v] - 128); lk += Math.abs(N.relV[v + 1] - 128); rp += Math.abs(N.relV[v + 2] - 128); if (N.relV[v + 1] > 150) strong++; } const soc = N.stat(i, SI['社交性']), b = bySoc[soc >= 150 ? 1 : soc <= 105 ? 0 : 0]; if (soc >= 150 || soc <= 105) { const k = soc >= 150 ? 1 : 0; bySoc[k][0] += strong; } }
  const hi = [0, 0], lo = [0, 0]; for (let i = 0; i < N.n; i++) { if (N.death[i] !== ALIVE || N.age(i) < 10) continue; const soc = N.stat(i, SI['社交性']); let like = 0, c = 0; for (let s = 0; s < SOC_K; s++) { if (N.relId[i * SOC_K + s] === NONE) continue; like += N.relV[(i * SOC_K + s) * 3 + 1]; c++; } if (!c) continue; if (soc >= 150) { hi[0] += like / c; hi[1]++; } else if (soc <= 105) { lo[0] += like / c; lo[1]++; } }
  console.log(`${label}：10歳以上 ${n}人、関係 平均${(e / n).toFixed(1)}個（上限${SOC_K}）、普通(128)からの平均のずれ 信頼${(tr / e).toFixed(0)} 好意${(lk / e).toFixed(0)} 尊敬${(rp / e).toFixed(0)}、好意が高い関係 ${(100 * strong / e).toFixed(0)}%、相手への好意の平均：社交性が高い人 ${(hi[0] / hi[1]).toFixed(0)} ／低い人 ${(lo[0] / lo[1]).toFixed(0)}`);
};
edgeStats('開始時');
const leaderInfo = (label) => { const byRule = {}; for (const g of people.groups) { if (!g.alive || g.leader < 0) continue; const e = people.ethnicities[g.ethId - 1], r = P.LEADERSHIP[e.leadership]; const l = g.leader; const ages = []; for (let i = 0; i < N.n; i++) if (N.death[i] === ALIVE && N.group[i] === g.id && N.age(i) >= N.adultAge(i)) ages.push(N.age(i)); ages.sort((a, b) => a - b); const med = ages[ages.length >> 1] || 0; (byRule[r] = byRule[r] || []).push({ age: N.age(l), med, sex: N.sex[l], job: N.job[l] }); }
  console.log(label + '：首長の決め方ごとの、首長の平均年齢（集団の成人の中央値）と男の割合：' + Object.entries(byRule).map(([r, a]) => `${r} ${(a.reduce((s, x) => s + x.age, 0) / a.length).toFixed(0)}歳（${(a.reduce((s, x) => s + x.med, 0) / a.length).toFixed(0)}）・男${(100 * a.filter(x => x.sex === 1).length / a.length).toFixed(0)}% [${a.length}集団]`).join('、')); };
leaderInfo('開始時');
const cnt = { leaderChange: 0 }, times = [];
for (let i = 0; i < YEARS * 12; i++) { G.faunaMonthly(fauna, { month: i % 12, env, cc }); const t = process.hrtime.bigint(); const ev = P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); times.push(Number(process.hrtime.bigint() - t) / 1e6); for (const e of ev) if (e.type === 'leaderChange') cnt.leaderChange++; }
edgeStats(YEARS + '年後'); leaderInfo(YEARS + '年後');
console.log(`首長の交代 ${cnt.leaderChange}回（${YEARS}年、集団あたり年 ${(cnt.leaderChange / YEARS / people.groups.filter(g => g.alive).length).toFixed(2)}回）`);
times.sort((a, b) => a - b); console.log(`1か月の計算：平均 ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}ms 95% ${times[Math.floor(times.length * .95)].toFixed(1)}ms 最大 ${times[times.length - 1].toFixed(1)}ms`);
const sv = P.peopleSave(people), p2 = P.peopleLoad(sv); console.log('保存→読み込み：関係が一致', Buffer.compare(Buffer.from(sv.relV.buffer, 0, 600), Buffer.from(p2.npc.relV.buffer, 0, 600)) === 0, '首長が一致', JSON.stringify(people.groups.map(g => g.leader)) === JSON.stringify(p2.groups.map(g => g.leader)));
