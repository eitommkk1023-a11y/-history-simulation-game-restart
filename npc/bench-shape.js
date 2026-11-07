'use strict';
// 配置の形の比較：node npc/bench-shape.js <settle-layout.js のパス>   （同じ入力で、版ごとの形を比べる）
const path = require('path'), A = require('./arch-gen.js'), { metrics, terr } = require('./shape-metrics.js');
const S = require(path.resolve(process.argv[2] || './settle-layout.js'));
const env = { tempC: 14, precip: 1100, wood: 0.7, stone: 0.2, clay: 0.4, fertile: 0.5, forest: 0.6, grass: 0.3, desert: 0, tundra: 0, wetland: 0.1, rugged: 0.1, elev: 100 };
const kinds = ['river', 'coast', 'lake', 'inland', 'hilly'], rows = {};
for (const kind of kinds) for (const [lv, nH] of [[1, 20], [2, 60]]) for (let seed = 1; seed <= 6; seed++) {
  const gen = A.genome(seed, 5, 5), hist = S.settleHistory(seed, 7, lv, nH * 4, 0.7, { neighbors: false }), trad = A.tradition(seed, gen, env, hist.tech, [180, 120, 90]);
  const households = Array.from({ length: nH }, (_, i) => ({ house: 1000 + i * 7, members: 2 + (i * 5 + seed) % 6, kin: 1 + Math.floor(i / 4) }));
  const spec = { seed, gid: 7, trad, hist, level: lv, households, economy: { fish: kind === 'inland' ? 0 : 0.3, gather: 0.4, hunt: 0.2, tool: 0.1 }, terr: terr(kind, seed) };
  const L = S.layoutSettlement(spec), m = metrics(L); if (!m) continue; const key = kind + ' L' + lv; (rows[key] = rows[key] || []).push(m);
}
const avg = (a, k) => (a.reduce((s, m) => s + m[k], 0) / a.length).toFixed(2);
console.log('型/段階        radial elong spokes facing nn   広場あり');
for (const [k, a] of Object.entries(rows)) console.log(k.padEnd(14), avg(a, 'radial').padStart(6), avg(a, 'elong').padStart(5), avg(a, 'spokes').padStart(6), avg(a, 'facing').padStart(6), avg(a, 'nn').padStart(5), (a.filter(m => m.plaza === 'open' || m.plaza === 'round').length + '/' + a.length).padStart(6));
