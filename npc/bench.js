'use strict';
const { Population, NSTAT, STAT_NAMES } = require('./npc-core.js');
const mb = (x) => (x / 1048576).toFixed(1);
const mem = () => { if (global.gc) global.gc(); const m = process.memoryUsage(); return { heap: m.heapUsed, ab: m.arrayBuffers, rss: m.rss }; };
const N = +process.argv[2] || 100000, YEARS = +process.argv[3] || 30, GROUPS = Math.max(1, Math.round(N / 1000));
function make(n, seed) { const P = new Population(seed, GROUPS, n * 2); for (let i = 0; i < n; i++) P.addFounder(i % GROUPS, Math.min(70, -Math.log(1 - P.random()) * 22)); return P; }
const m0 = mem(); let t = Date.now(); const P = make(N, 42); const tMake = Date.now() - t;
const m1 = mem(); console.log(`人数 ${N} 民族 ${GROUPS} ／生成 ${tMake}ms ／配列 ${mb(m1.ab - m0.ab)}MB ヒープ ${mb(m1.heap - m0.heap)}MB`);
// 能力値の分布と計算速度（全員×全項目をID から計算）
t = Date.now(); const sum = new Float64Array(NSTAT), sq = new Float64Array(NSTAT);
for (let i = 0; i < N; i++) for (let k = 0; k < NSTAT; k++) { const v = P.stat(i, k); sum[k] += v; sq[k] += v * v; }
const tStat = Date.now() - t; console.log(`全員×${NSTAT}項目の計算 ${tStat}ms（${(tStat * 1000 / (N * NSTAT)).toFixed(2)}μs/値）／例：${STAT_NAMES[0]} 平均${(sum[0] / N).toFixed(1)} 標準偏差${Math.sqrt(sq[0] / N - (sum[0] / N) ** 2).toFixed(1)}`);
// 変化分：10%の人に3項目
t = Date.now(); for (let i = 0; i < N; i += 10) for (let k = 18; k < 21; k++) P.addDelta(i, k, 5);
const d = P.saveDelta(); console.log(`変化分 ${P.delta.size} 件 ／保存 ${mb(d.byteLength)}MB ／Map ${(Date.now() - t)}ms`);
// 時間を進める
const yrs = [];
for (let y = 1; y <= YEARS; y++) { t = Date.now(); const b0 = P.stats.births, d0 = P.stats.deaths; P.stepYear(); const ms = Date.now() - t; yrs.push(ms);
  if (y === 1 || y % 5 === 0) console.log(`${y}年目 ${ms}ms 生存${P.livingCount()} 出生${P.stats.births - b0} 死亡${P.stats.deaths - d0} 累計ID${P.n}`); }
const m2 = mem(); console.log(`進行後 配列${mb(m2.ab - m0.ab)}MB ヒープ${mb(m2.heap - m0.heap)}MB RSS${mb(m2.rss)}MB ／1年あたり平均${(yrs.reduce((a, b) => a + b, 0) / yrs.length).toFixed(0)}ms 最大${Math.max(...yrs)}ms`);
// 世代を超えた遺伝の確認：親子の相関
let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, c = 0; for (let i = 0; i < P.n && c < 20000; i++) { const m = P.mother[i]; if (m === 0xffffffff) continue; const a = P.genetic(i, 20), b = P.genetic(m, 20); sx += a; sy += b; sxx += a * a; syy += b * b; sxy += a * b; c++; }
if (c) console.log(`親子の相関（筋力、${c}組）${((sxy / c - sx / c * sy / c) / Math.sqrt((sxx / c - (sx / c) ** 2) * (syy / c - (sy / c) ** 2))).toFixed(2)}`);
// 再現性
const A = make(10000, 7), B = make(10000, 7); for (let y = 0; y < 5; y++) { A.stepYear(); B.stepYear(); } console.log('再現性（同じSeedで同じ結果）', A.checksum() === B.checksum());
