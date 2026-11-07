'use strict';
// 集落の「形」の指標（配置の自然さを比べるための道具）：node npc/shape-metrics.js <settle-layout.js> 
// radial：中心からの距離のばらつきが小さいほど「輪っか」＝1に近い。elong：細長さ（1＝円、大きいほど帯状）。
// plazaPaths：中心の近く（広場の半径+3m）から出る道の本数。facing：入口が中心を向く割合（全部中心向きなら1）
function metrics(layout) {
  const it = layout.items.filter(b => b.state !== 'removed' && b.role === 'dwelling'); if (it.length < 5) return null;
  const c = layout.center, ds = it.map(b => Math.hypot(b.x - c.x, b.z - c.z)), mean = ds.reduce((a, b) => a + b, 0) / ds.length;
  const sd = Math.sqrt(ds.reduce((a, d) => a + (d - mean) ** 2, 0) / ds.length), radial = Math.max(0, 1 - sd / mean);
  const mx = it.reduce((a, b) => a + b.x, 0) / it.length, mz = it.reduce((a, b) => a + b.z, 0) / it.length;
  let sxx = 0, szz = 0, sxz = 0; for (const b of it) { const dx = b.x - mx, dz = b.z - mz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const tr = sxx + szz, det = sxx * szz - sxz * sxz, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det)), l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc), elong = Math.sqrt(l1 / l2);
  const R = (layout.plaza.r || 0) + 3; let spokes = 0; for (const p of layout.paths) { const d1 = Math.hypot(p.x1 - c.x, p.z1 - c.z), d2 = Math.hypot(p.x2 - c.x, p.z2 - c.z); if ((d1 < R) !== (d2 < R)) spokes++; }
  let faceC = 0; for (const b of it) { const tx = c.x - b.x, tz = c.z - b.z, l = Math.hypot(tx, tz) || 1; if ((b.entrance.dx * tx + b.entrance.dz * tz) / l > 0.8) faceC++; }
  let nn = 0; for (const b of it) { let m = 1e9; for (const o of it) if (o !== b) m = Math.min(m, Math.hypot(b.x - o.x, b.z - o.z)); nn += m; }
  return { radial: +radial.toFixed(2), elong: +elong.toFixed(2), spokes, facing: +(faceC / it.length).toFixed(2), nn: +(nn / it.length).toFixed(1), n: it.length, plaza: layout.plaza.kind || 'round' };
}
// 地形の型：川（蛇行）／海岸（南が海）／湖（円形）／内陸（水なし）／丘（起伏が強い川）
function terr(kind, seed) {
  const ph = seed * 1.7;
  const dist = { river: (x, z) => Math.abs(z - (70 + 18 * Math.sin(x / 35 + ph))) - 5, coast: (x, z) => 60 + 8 * Math.sin(x / 30 + ph) - z, lake: (x, z) => 55 - Math.hypot(x - 40 * Math.cos(ph), z - 40 * Math.sin(ph)) - 0, inland: () => 1e9, hilly: (x, z) => Math.abs(z - (80 + 25 * Math.sin(x / 28 + ph))) - 4 }[kind];
  const amp = kind === 'hilly' ? 2.2 : 1;
  const height = (x, z) => amp * (4 * Math.sin(x / 45 + ph) + 3 * Math.cos(z / 60) + 2 * Math.sin((x + z) / 25)) + (dist(x, z) < 0 ? -1.2 : 0);
  const slope = (x, z) => Math.atan(Math.hypot(height(x + 1, z) - height(x - 1, z), height(x, z + 1) - height(x, z - 1)) / 2) * 180 / Math.PI;
  const water = (x, z) => dist(x, z) < 0 ? 0.6 : 0;
  const nearestWater = (x, z) => { if (kind === 'inland') return null; const e = 1.5, gx = (dist(x + e, z) - dist(x - e, z)) / (2 * e), gz = (dist(x, z + e) - dist(x, z - e)) / (2 * e), l = Math.hypot(gx, gz) || 1, d = dist(x, z); return { dist: Math.max(0, d), dx: -gx / l, dz: -gz / l }; };
  const wet = (x, z) => kind !== 'inland' && dist(x, z) < 14;
  return { height, slope, water, nearestWater, wet };
}
module.exports = { metrics, terr };
