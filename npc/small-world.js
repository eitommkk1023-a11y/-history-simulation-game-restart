'use strict';
// 小規模統合ワールド（試験用の設定）：既存の世界の生成をそのまま使い、陸地の20km四方の窓を選んで、その中に4村・約200人を置く。
// 窓の外には人を置かず、窓の外の動物の個体群は計算から外す（計算量が窓の広さに比例して減る）。大規模世界の既存の設定は変えない（この設定を使ったときだけ働く）。
// 単位：セル（世界の格子。世界全体で widthM / width メートル、既定の世界では約33.3m）。乱数は整数ハッシュだけ（同じSeedなら同じ窓）。
(function (root) {
const SMALL = { sizeM: 20000, villages: 4, popTotal: 1200, popMin: 100, popMax: 500, minDm: 3000, maxDm: 10000 };   // popMin〜popMax：初期の村ひとつの人数の範囲（村ごとに幅広くばらつく）。popTotal は目安（平均300人×村の数）   // 世界の広さ・初期の村の数・初期人口・村どうしの距離（m）
const hash = (a, b, c) => { let h = (a ^ Math.imul(b, 374761393) ^ Math.imul(c, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };
// 段階：S1（20km・4村）→ S2（40km・10村）→ S3（80km・24村）。広げるほど村の間隔と人数も増やす
const STAGES = { 1: SMALL, 2: { sizeM: 40000, villages: 10, popTotal: 3000, popMin: 100, popMax: 500, minDm: 3500, maxDm: 14000 }, 3: { sizeM: 80000, villages: 24, popTotal: 7200, popMin: 100, popMax: 500, minDm: 4000, maxDm: 20000, minLand: 0.55 } };
const stageOf = (n) => STAGES[n] || SMALL;
// 窓：{ x0, y0, x1, y1 }（セル）。cellM＝1セルのメートル。陸地が多く、川・起伏・森がある所を選ぶ
function pickWindow(world, seed, cellM, opt) {
  const o = Object.assign({}, SMALL, opt || {}), W = world.stats.width, H = world.stats.height, N = Math.round(o.sizeM / cellM), step = 60, fe = world.fauna && world.fauna.env;
  const rv = world.riverPts, riverCells = []; if (rv) for (let i = 0; i < rv.length; i += 2) riverCells.push(rv[i], rv[i + 1]);
  let best = null, bs = -1e9;
  for (let y0 = 0; y0 + N <= H; y0 += step) for (let x0 = 0; x0 + N <= W; x0 += step) {
    let land = 0, n = 0, forest = 0, hMin = 1e9, hMax = -1e9, sea = 0; const bh = new Uint16Array(18);
    for (let j = 0; j < N; j += 30) for (let i = 0; i < N; i += 30) { const k = (y0 + j) * W + x0 + i; n++; bh[world.type[k] ? (world.biome ? Math.min(16, world.biome[k]) : 1) : 17]++; if (world.type[k]) { land++; const e = world.elev[k]; if (e < hMin) hMin = e; if (e > hMax) hMax = e; if (fe && fe.forest) forest += fe.forest[Math.min(fe.forest.length - 1, ((y0 + j) >> 3) * Math.ceil(W / 8) + ((x0 + i) >> 3))] / 255; } else sea++; }
    const lf = land / n; if (lf < (o.minLand || 0.82)) continue;
    let rivers = 0; for (let q = 0; q < riverCells.length; q += 2) { const rx = riverCells[q], ry = riverCells[q + 1]; if (rx >= x0 && rx < x0 + N && ry >= y0 && ry < y0 + N) rivers++; }
    const relief = Math.max(0, Math.min(1, (hMax - hMin) / 1500)), fm = forest / Math.max(1, land); let ent = 0, kinds = 0; for (let b = 0; b < 18; b++) if (bh[b]) { const q = bh[b] / n; ent -= q * Math.log(q); if (q >= 0.04) kinds++; }   // 地形の多様さ：生態区分（バイオーム）の偏りの少なさ（エントロピー）と、まとまった広さをもつ種類の数
    let dl = 0; if (world.features) for (const f of world.features) if (f.kind === 'delta' && f.x >= x0 + 40 && f.x < x0 + N - 40 && f.y >= y0 + 40 && f.y < y0 + N - 40) dl++;   // 三角州を含む窓を好む（珍しい地形）
    const s = (dl ? 4 : 0) + lf * 1.5 + Math.min(1, rivers / 400) * 2 + Math.min(1, relief) * 1 + Math.min(1, fm * 2.2) * 1.5 - (fm < 0.15 ? 2 : 0) + ent * 2.5 + kinds * 0.5 + (hash(seed >>> 0, x0, y0) / 4294967296) * 0.4;   // 森（樹木）の多い所を強く好み、森が薄い窓は大きく減点
    if (s > bs) { bs = s; best = { x0, y0, x1: x0 + N, y1: y0 + N, score: +s.toFixed(3), land: +lf.toFixed(2), rivers, kinds, diversity: +ent.toFixed(2) }; }
  }
  if (best) { let f = 0, n = 0; if (fe && fe.forest) for (let j = 0; j < N; j += 30) for (let i = 0; i < N; i += 30) { f += fe.forest[Math.min(fe.forest.length - 1, ((best.y0 + j) >> 3) * Math.ceil(W / 8) + ((best.x0 + i) >> 3))] / 255; n++; } best.forest = +(f / Math.max(1, n)).toFixed(2); }
  return best;
}
const inWindow = (win, x, y) => !win || (x >= win.x0 && x < win.x1 && y >= win.y0 && y < win.y1);
// 窓の外（余白 marginM を足した外）の動物の個体群を、計算から外す（生きていない扱い）。窓の中・近くの動物は、そのまま
function pruneFauna(F, world, win, cellM, marginM) {
  const cc = world.climate.cell, W = world.stats.width, step = cc.gridStep || 8, cw = cc.w || cc.gridW, m = Math.round((marginM || 8000) / cellM);
  const x0 = win.x0 - m, y0 = win.y0 - m, x1 = win.x1 + m, y1 = win.y1 + m; let kept = 0, dropped = 0;
  for (const sid in F.species) for (const p of F.species[sid].pops) { if (!p.alive) continue; let inside = false; for (let i = 0; i < p.cells.length && !inside; i += 3) { const c = p.cells[i], x = (c % cw) * step, y = Math.floor(c / cw) * step; if (x >= x0 && x < x1 && y >= y0 && y < y1) inside = true; } if (inside) kept++; else { p.alive = false; dropped++; } }
  return { kept, dropped };
}
const api = { SMALL, STAGES, stageOf, pickWindow, inWindow, pruneFauna };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohSmall = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
