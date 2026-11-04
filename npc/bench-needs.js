'use strict';
const { Population, NEEDS, JOBS, SI, NJOB, NSKILL } = require('./npc-core.js');
const N = 100000, G = 100, P = new Population(42, G, N * 2);
for (let g = 0; g < G; g++) { const r = P.random(); P.setGroup(g, r < .25 ? { fish: .5, gather: .2, hunt: .2 } : r < .5 ? { farm: 1, gather: .15, hunt: .1, fish: .05, herd: r < .35 ? 1 : 0, trade: r < .4 ? 1 : 0 } : r < .75 ? { hunt: .5, gather: .3, fish: .05 } : {}); }
for (let i = 0; i < N; i++) P.addFounder(i % G, Math.min(70, -Math.log(1 - P.random()) * 22));
let t = Date.now(); P.initFounders(); console.log('開始時の一括決定', Date.now() - t, 'ms');
// 欲求：一番強い欲求の分布と、重みの平均
const top = new Float64Array(7), avg = new Float64Array(7); let c = 0; const w = new Float32Array(7);
t = Date.now(); for (let i = 0; i < N; i++) { if (P.age(i) < 14) continue; P.needWeights(i, w); for (let n = 0; n < 7; n++) avg[n] += w[n]; top[P.topNeed(i)]++; c++; }
console.log(`欲求の計算 ${Date.now() - t}ms（${c}人）`); console.log('一番強い欲求の割合：' + NEEDS.map((n, k) => n + ' ' + (100 * top[k] / c).toFixed(0) + '%').join(' / ')); console.log('重みの平均：' + NEEDS.map((n, k) => n + ' ' + (avg[k] / c).toFixed(2)).join(' / '));
// 性格と職業：野心の高い人は権力・地位や財産の仕事、好奇心の高い人は知識の仕事を選ぶか
const rows = [['野心', [11, 8]], ['好奇心', [7, 11, 4]], ['共感性', [7]]]; for (const [st, jobs] of rows) { let hi = [0, 0], lo = [0, 0]; for (let i = 0; i < N; i++) { if (!P.job[i]) continue; const v = P.genetic(i, SI[st]); const k = v >= 170 ? hi : v <= 85 ? lo : null; if (!k) continue; k[1]++; if (jobs.includes(P.job[i])) k[0]++; } console.log(`${st}が高い人 ${(100 * hi[0] / hi[1]).toFixed(1)}% / 低い人 ${(100 * lo[0] / lo[1]).toFixed(1)}% が ${jobs.map((j) => JOBS[j].name).join('・')} に就いている`); }
// 重要人物
for (let i = 0; i < 100; i++) P.promote(i * 7, '試験'); console.log('重要人物', P.focus.size, '人／最初の人の目標', NEEDS[P.focus.get(0).goal]);
// 転職の頻度（予定は年約2.4%）
const yrs = []; for (let y = 0; y < 5; y++) { const j0 = P.stats.jobChanges; t = Date.now(); P.stepYear(); yrs.push(Date.now() - t); } let w2 = 0; for (let i = 0; i < P.n; i++) if (P.job[i]) w2++;
console.log(`5年の転職 ${P.stats.jobChanges}件（働く人${w2}人あたり年${(100 * P.stats.jobChanges / 5 / w2).toFixed(1)}%）／1年あたり${(yrs.reduce((a, b) => a + b) / 5).toFixed(0)}ms`);
