'use strict';
const { Population, NSTAT, NP, NABIL, NJOB, NSKILL, JOBS, SI, growthExpected } = require('./npc-core.js');
const mb = (x) => (x / 1048576).toFixed(1);
const mem = () => { if (global.gc) global.gc(); const m = process.memoryUsage(); return { ab: m.arrayBuffers, heap: m.heapUsed, rss: m.rss }; };
const N = +process.argv[2] || 100000, YEARS = +process.argv[3] || 30, GROUPS = Math.max(4, Math.round(N / 1000));
function make(n, seed) {
  const P = new Population(seed, GROUPS, n * 2);
  for (let g = 0; g < GROUPS; g++) { const r = P.random(); P.setGroup(g, r < .25 ? { fish: .5, gather: .2, hunt: .2 } : r < .5 ? { farm: 1, gather: .15, hunt: .1, fish: .05, herd: r < .35 ? 1 : 0, trade: r < .4 ? 1 : 0 } : r < .75 ? { hunt: .5, gather: .3, fish: .05 } : {}); }
  for (let i = 0; i < n; i++) P.addFounder(i % GROUPS, Math.min(70, -Math.log(1 - P.random()) * 22));
  return P;
}
const m0 = mem(); const P = make(N, 42);
console.log(`人数 ${N} 民族 ${GROUPS}`);
const yrs = [];
for (let y = 1; y <= YEARS; y++) { const t = Date.now(); P.stepYear(); const ms = Date.now() - t; yrs.push(ms); if (y === 1 || y % 10 === 0) console.log(`${y}年目 ${ms}ms 生存${P.livingCount()} 累計ID${P.n}`); }
const m2 = mem(); console.log(`進行後 配列${mb(m2.ab - m0.ab)}MB RSS${mb(m2.rss)}MB ／1年あたり平均${(yrs.reduce((a, b) => a + b, 0) / yrs.length).toFixed(0)}ms 最大${Math.max(...yrs)}ms`);
// 職業の分布（全体）
const cnt = new Float64Array(NJOB); let adults = 0; for (let i = 0; i < P.n; i++) if (P.death[i] === 0x7fffffff && P.age(i) >= 16) { adults++; cnt[P.job[i]]++; }
console.log('職業の割合（16歳以上の生存者）：' + JOBS.map((j, k) => j.name + ' ' + (100 * cnt[k] / adults).toFixed(1) + '%').join(' / '));
// 環境の違いが職業に出ているか：民族を型で分けて集計
const gc = P.gcount; const byType = {};
for (let g = 0; g < GROUPS; g++) { const d = P.gdemand.subarray(g * NJOB, g * NJOB + NJOB); const type = d[3] >= .5 ? '漁' : d[9] > 0 ? '農' : d[2] >= .5 ? '狩' : '標準'; const o = byType[type] || (byType[type] = { n: 0, c: new Float64Array(NJOB) }); o.n++; for (let j = 0; j < NJOB; j++) o.c[j] += gc[g * NJOB + j]; }
for (const [t, o] of Object.entries(byType)) { const s = o.c.reduce((a, b) => a + b, 0); console.log(`  ${t}の民族(${o.n}) ` + [1, 2, 3, 9, 10, 11].map((j) => JOBS[j].name + (100 * o.c[j] / s).toFixed(0) + '%').join(' ')); }
// 技能の成長：年齢帯ごとの、本人の職業の技能の平均
const bands = [[16, 20], [20, 30], [30, 40], [40, 55], [55, 80]];
console.log('本業の技能の平均（年齢帯）：' + bands.map(([a, b]) => { let s = 0, c = 0; for (let i = 0; i < P.n; i++) { if (P.death[i] !== 0x7fffffff || !P.job[i]) continue; const a2 = P.age(i); if (a2 < a || a2 >= b) continue; s += P.skills[i * NSKILL + P.job[i] - 1]; c++; } return `${a}-${b}歳 ${(s / c).toFixed(0)}`; }).join(' / '));
// 同じ職業・同じ年齢帯（30〜40歳）で、学習力の高い人と低い人の技能
{ const hi = [], lo = []; for (let i = 0; i < P.n; i++) { if (P.death[i] !== 0x7fffffff || !P.job[i]) continue; const a = P.age(i); if (a < 30 || a >= 40 || (P.birth[i] > -1e9 && P.age(i) - Math.floor(P.age(i)) < 0)) continue; const l = P.base(i, SI['学習力']); const s = P.skills[i * NSKILL + P.job[i] - 1]; if (l >= 170) hi.push(s); else if (l <= 85) lo.push(s); } const av = (a) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0); console.log(`30〜40歳の本業技能：学習力が高い(${hi.length}人) ${av(hi)} ／低い(${lo.length}人) ${av(lo)}`); }
// 向き不向きが職業に出ているか：農民・狩人の持久力と筋力の平均を、全体と比べる
{ const rows = [[J(9), '農民', '筋力'], [J(2), '狩人', '敏捷性'], [J(7), '治療者', '共感性'], [J(11), '交易者', '社交性']]; function J(x) { return x; } const all = {}; const sums = {}; for (let i = 0; i < P.n; i++) { if (P.death[i] !== 0x7fffffff) continue; const a = P.age(i); if (a < 25 || a >= 45) continue; for (const [j, , st] of rows) { const k = SI[st]; all[st] = all[st] || [0, 0]; all[st][0] += P.base(i, k); all[st][1]++; if (P.job[i] === j) { sums[j + st] = sums[j + st] || [0, 0]; sums[j + st][0] += P.base(i, k); sums[j + st][1]++; } } } console.log('向きの反映（25〜45歳の生まれつきの値の平均、職業 / 全体）：' + rows.map(([j, n, st]) => { const s = sums[j + st]; return `${n}の${st} ${s ? (s[0] / s[1]).toFixed(0) : '-'} / ${(all[st][0] / all[st][1]).toFixed(0)}`; }).join('、')); }
// 成長の例（期待値、40か月...60か月）：筋力30の人が同じ訓練を5年受けたとき
for (const [lab, pot] of [['潜在能力 高(220)', 220], ['平均(128)', 128], ['低(40)', 40]]) { let c = 30; for (let m = 0; m < 60; m++) c += growthExpected(c, pot, 0.1); console.log(`  筋力30・${lab}：5年後 ${c.toFixed(1)}`); }
const sv = P.save(); console.log(`保存（変化分のみ）：性格${sv.personality.byteLength / 1024 | 0}KB 訓練${(sv.train.byteLength / 1048576).toFixed(2)}MB 技能${(sv.skills.byteLength / 1048576).toFixed(2)}MB`);
console.log(`統計 出生${P.stats.births} 死亡${P.stats.deaths} 結婚${P.stats.marriages} 転職${P.stats.jobChanges} 引退${P.stats.retired}`);
const A = make(10000, 7), B = make(10000, 7); for (let y = 0; y < 6; y++) { A.stepYear(); B.stepYear(); } console.log('再現性（同じSeedで同じ結果）', A.checksum() === B.checksum());
