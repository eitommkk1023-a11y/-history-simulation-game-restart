const A = require('/home/user/-history-simulation-game-restart/npc/arch-gen.js'), { terr } = require('/home/user/-history-simulation-game-restart/npc/shape-metrics.js');
const Sold = require('/home/user/-history-simulation-game-restart/npc/settle-layout.old.tmp.js'), Snew = require('/home/user/-history-simulation-game-restart/npc/settle-layout.js');
const env = { tempC: 14, precip: 1100, wood: 0.7, stone: 0.2, clay: 0.4, fertile: 0.5, forest: 0.6, grass: 0.3, desert: 0, tundra: 0, wetland: 0.1, rugged: 0.1, elev: 100 };
let bad = 0, n = 0, told = 0, tnew = 0;
for (const kind of ['river', 'coast', 'inland', 'hilly', 'lake']) for (const nH of [5, 20, 60, 200, 500]) for (const seed of [1, 2, 3]) for (const lv of [1, 2]) {
  const mk = (S) => { const gen = A.genome(seed, 5, 5), hist = S.settleHistory(seed, 7, lv, nH * 4, 0.7, { neighbors: false }), trad = A.tradition(seed, gen, env, hist.tech, [180, 120, 90]); const households = Array.from({ length: nH }, (_, i) => ({ house: 1000 + i * 7, members: 2 + (i * 5 + seed) % 6, kin: 1 + Math.floor(i / 4) })); return S.layoutSettlement({ seed, gid: 7, trad, hist, level: lv, households, economy: { fish: kind === 'inland' ? 0 : 0.3, gather: 0.4, hunt: 0.2, tool: 0.1 }, terr: terr(kind, seed) }); };
  let t = Date.now(); const a = mk(Sold); told += Date.now() - t; t = Date.now(); const b = mk(Snew); tnew += Date.now() - t;
  const sig = (L) => JSON.stringify(L.items.map(i => [i.id, i.role, +i.x.toFixed(4), +i.z.toFixed(4), +i.rot.toFixed(4), i.state])); n++; if (sig(a) !== sig(b)) { bad++; if (bad < 4) console.log('不一致', kind, nH, seed, lv, a.items.length, b.items.length); } }
console.log('比較', n, '件、不一致', bad, '／旧', told, 'ms 新', tnew, 'ms');
