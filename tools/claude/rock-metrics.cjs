const fs = require('fs');
const mod = process.argv[2], seed = Number(process.argv[3]), tag = process.argv[4];
const G = require(mod);
const t0 = Date.now(); let rockStart = 0, rockEnd = 0, last = '';
const w = G.generateWorld(seed, (s) => { const t = Date.now() - t0; if (/^岩石/.test(s) && !rockStart) rockStart = t; if (/^岩石/.test(s)) rockEnd = t; last = s; });
const total = Date.now() - t0;
const R = w.rocks, ROCKS = G.ROCKS, W = R.width, H = R.height, n = W * H, geo = w.geology;
const land = new Uint8Array(n); const L = [];
for (let i = 0; i < n; i++) { const x = (i % W) * 8 + 4, y = Math.floor(i / W) * 8 + 4; if (w.type[Math.min(2999, y) * 3000 + Math.min(2999, x)]) { land[i] = 1; L.push(i); } }
const id = R.exposedRockId, N = L.length;
const share = {}; for (const i of L) share[id[i]] = (share[id[i]] || 0) + 1;
const pr = (ids) => (100 * ids.reduce((a, k) => a + (share[k] || 0), 0) / N).toFixed(1);
const fam = { igneous: 0, sedimentary: 0, metamorphic: 0 }; for (const i of L) fam[ROCKS[id[i]].family]++;
const out = { tag, seed, ms_total: total, ms_rock: rockEnd - rockStart, land: N };
out.family = Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, +(100 * v / N).toFixed(1)]));
out.carbonate = +pr([12, 13]); out.limestone = +pr([12]); out.chert = +pr([14]); out.granite = +pr([0]); out.gneiss_schist = +pr([17, 18]); out.slate_phyllite = +pr([19, 20]);
out.crystalline_basement = +pr([0, 1, 2, 17, 18, 19, 20, 21, 22]); out.volcanic = +pr([3, 4, 5, 6, 7]); out.sandstone_shale_mud = +pr([9, 10, 11]); out.conglomerate = +pr([8]); out.evaporite = +pr([15, 16]);
// 面積割合から求めたランダム分布の期待値と、実際の隣接率
let pRand = 0; for (const k in share) { const p = share[k] / N; pRand += p * p; }
let same = 0, tot = 0; for (const i of L) { const x = i % W; if (x + 1 < W && land[i + 1]) { tot++; if (id[i] === id[i + 1]) same++; } if (i + W < n && land[i + W]) { tot++; if (id[i] === id[i + W]) same++; } }
out.neighbor_same = +(100 * same / tot).toFixed(1); out.neighbor_random_expect = +(100 * pRand).toFixed(1);
// 同じ地層の組み合わせの領域の内側だけの隣接率
let sf = 0, ss = 0, tf = 0; for (const i of L) { const x = i % W; for (const j of [x + 1 < W ? i + 1 : -1, i + W < n ? i + W : -1]) { if (j < 0 || !land[j]) continue; if (R.formation[i] === R.formation[j]) { tf++; if (id[i] === id[j]) sf++; } } }
out.same_rock_inside_same_formation = +(100 * sf / Math.max(1, tf)).toFixed(1);
// 4近傍で連結した同じ岩石の塊
const lab = new Int32Array(n); const sizes = []; const stack = [];
for (const s of L) { if (lab[s]) continue; const c = sizes.length + 1; let size = 0; stack.push(s); lab[s] = c; while (stack.length) { const i = stack.pop(); size++; const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, i - W, i + W]) { if (j < 0 || j >= n || !land[j] || lab[j] || id[j] !== id[s]) continue; lab[j] = c; stack.push(j); } } sizes.push(size); }
const area = (f) => +(100 * sizes.filter(f).reduce((a, b) => a + b, 0) / N).toFixed(1);
out.patches = sizes.length; out.area_in_singletons = area(v => v === 1); out.area_in_patches_ge20 = area(v => v >= 20); out.area_in_patches_ge100 = area(v => v >= 100); out.largest_patch_cells = Math.max(...sizes);
// 地質との対応：成因ごとの露出岩石の系統
const CAUSE = ['深海', '海嶺', '海溝', '火山弧', '衝突', '沈み込み山脈', '高原', 'リフト', '断層', 'ホットスポット', '安定地塊', '古い造山帯', '前縁盆地', '陸棚'];
const tab = {}; for (const i of L) { const k = CAUSE[geo.cause[i]]; tab[k] = tab[k] || { n: 0, ig: 0, se: 0, me: 0 }; tab[k].n++; const f = ROCKS[id[i]].family; tab[k][f === 'igneous' ? 'ig' : f === 'sedimentary' ? 'se' : 'me']++; }
out.by_cause = Object.fromEntries(Object.entries(tab).filter(([k, v]) => v.n > 300).map(([k, v]) => [k, `${(100 * v.n / N).toFixed(0)}%の陸: 火成${(100 * v.ig / v.n).toFixed(0)} 堆積${(100 * v.se / v.n).toFixed(0)} 変成${(100 * v.me / v.n).toFixed(0)}`]));
const fm = new Array(14).fill(0); for (const i of L) fm[R.formation[i]]++; out.formation_pct = fm.map(v => +(100 * v / N).toFixed(1)).join(',');
// 侵食計算の健全性
out.metrics = { numericallyLimitedCells: R.metrics.numericallyLimitedCells, mechanicalActiveCells: R.metrics.mechanicalActiveCells, solidExportedMt: Math.round(R.metrics.solidExportedKg / 1e9) };
// 画像（岩石の表示色、2倍）
const sc = 2, ppm = Buffer.alloc(W * sc * H * sc * 3); for (let y = 0; y < H * sc; y++) for (let x = 0; x < W * sc; x++) { const i = (y >> 1) * W + (x >> 1); const c = land[i] ? ROCKS[id[i]].color : [20, 40, 80]; const o = (y * W * sc + x) * 3; ppm[o] = c[0]; ppm[o + 1] = c[1]; ppm[o + 2] = c[2]; }
fs.writeFileSync(`rockmap_${tag}_${seed}.ppm`, Buffer.concat([Buffer.from(`P6 ${W * sc} ${H * sc} 255\n`), ppm]));
fs.appendFileSync('rockmetrics.jsonl', JSON.stringify(out) + '\n');
console.log(tag, seed, 'done', total, 'ms');
