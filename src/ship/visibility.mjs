/**
 * Visibility and sky for a ship's position: rain (from the game's own weather) and sea fog reduce how far you can see,
 * clouds and storms darken the light. Pure functions of (position, game day) like the wind field.
 * All numbers are game hypotheses (level D). Fog is a local weather the game does not have: it forms in light wind,
 * mostly in the morning, in cells that are present with a fixed probability.
 */
export const VIS_PARAMS = Object.freeze({
  clearM: 20000,
  rainHalfMm: 4,                  // V = clear / (1 + P / rainHalfMm)
  stormFactor: 0.6,
  fogChance: 0.10, fogCellKm: 25, fogRadiusKm: [6, 14], fogMinM: 250, fogMaxWindMs: 5, fogEventDays: 1,
  dimCloud: 0.35, dimStorm: 0.5,   // light reduction at full cloud / full storm
});
const hash = (...a) => { let h = 2166136261 >>> 0; for (const v of a) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16; } return (h >>> 0) / 4294967296; };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const CLEAR = [0xa8, 0xc8, 0xdc], RAIN = [0x98, 0xa4, 0xad], STORM = [0x5f, 0x69, 0x73], FOG = [0xc9, 0xd1, 0xd6];

/** @param {{ weatherAt:(X,Y)=>({P:number,cloud:number,storm:number}|null), windAt:(X,Y,t)=>({speed:number}), dayAt?:(t)=>number, toWorld?:Function, seed?:number, params?:object }} o */
export function createVisibility({ weatherAt, windAt, dayAt = () => 0, toWorld = (X, Y) => ({ x: X, y: Y }), seed = 1, params = {} }) {
  const P = { ...VIS_PARAMS, ...params }, sd = seed | 0;
  function fog(X, Y, day) {
    const w = toWorld(X, Y), cs = P.fogCellKm * 1000, k = Math.floor(day / P.fogEventDays), frac = day - Math.floor(day);
    const morning = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (frac - 0.15) / 0.4)))); // builds from 03:36, peaks ~07:00, gone by ~12:00
    if (morning < 1e-6) return 0;
    const ci = Math.floor(w.x / cs), cj = Math.floor(w.y / cs); let best = 0;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      if (hash(sd, k, i, j, 71) >= P.fogChance) continue;
      const px = (i + hash(sd, k, i, j, 72)) * cs, py = (j + hash(sd, k, i, j, 73)) * cs, rad = (P.fogRadiusKm[0] + hash(sd, k, i, j, 74) * (P.fogRadiusKm[1] - P.fogRadiusKm[0])) * 1000, d = Math.hypot(w.x - px, w.y - py);
      if (d < rad) best = Math.max(best, (1 - d / rad) ** 0.6);
    }
    return best * morning;
  }
  function info(X, Y, t = 0) {
    const day = dayAt(t), g = weatherAt(X, Y) ?? { P: 0, cloud: 0, storm: 0 }, wind = windAt(X, Y, t).speed;
    const fogW = wind <= P.fogMaxWindMs ? fog(X, Y, day) * (1 - wind / P.fogMaxWindMs * 0.6) : 0;
    let v = P.clearM; v = Math.min(v, P.clearM / (1 + (g.P ?? 0) / P.rainHalfMm)); v *= 1 - (1 - P.stormFactor) * Math.min(1, g.storm ?? 0);
    if (fogW > 0.02) v = Math.min(v, P.fogMinM + (P.clearM - P.fogMinM) * (1 - fogW) ** 3);
    const cloud = Math.min(1, g.cloud ?? 0), storm = Math.min(1, g.storm ?? 0), wetness = Math.min(1, (g.P ?? 0) / 20);
    let col = mix(CLEAR, RAIN, Math.max(wetness, cloud * 0.4)); col = mix(col, STORM, storm); col = mix(col, FOG, fogW);
    return { visM: Math.max(P.fogMinM * 0.5, v), fog: fogW, rainMm: g.P ?? 0, cloud, dim: Math.max(0, 1 - P.dimCloud * cloud - P.dimStorm * storm), color: col.map(Math.round) };
  }
  return { info, params: P };
}
