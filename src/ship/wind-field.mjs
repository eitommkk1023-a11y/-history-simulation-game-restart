/**
 * Local wind on top of the world's monthly-mean wind: sea/land breeze, shelter in the lee of land, and rare weather
 * (storm and calm cells that drift in game days). Pure functions of (position, game day), so the same place and time
 * always give the same wind (save/load safe, no hidden state).
 *
 * Every number here is a game hypothesis (level D): there is no source model for this world. The structure follows
 * ordinary seamanship facts: onshore breeze by day / offshore at night near coasts, wind speed reduced behind high
 * land over a distance of a few times its height, strong gales and calms as localised, short-lived patches.
 *
 * Ship frame in/out: X east, Y north, metres, wind vectors point where the air moves TOWARD ({x east, y north}).
 */
export const WIND_PARAMS = Object.freeze({
  breezeMax: 2.5,                  // D: m/s of sea/land breeze right at a coast
  coastRadii: [500, 1500, 3000],   // D: m, where land is looked for
  shelterRatio: 10,                // D: lee zone length = ratio * obstacle height (m)
  shelterMin: 0.35,                // D: wind keeps at least this fraction directly behind land
  shelterSamples: [50, 100, 200, 400, 800],
  cellKm: 60, eventDays: 2,        // D: weather cells and how long a weather event lasts (game days)
  stormChance: 0.12, calmChance: 0.15,
  stormRadiusKm: [8, 18], calmRadiusKm: [15, 30],
  stormMinSpeed: 18, stormGain: 2.5, // D: m/s (gale force 8), and speed multiplier when stronger
  calmFactor: 0.15,
});

const hash = (...a) => { let h = 2166136261 >>> 0; for (const v of a) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16; } return (h >>> 0) / 4294967296; };
const BEAUFORT = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
export const beaufort = (s) => { let b = 0; while (b < BEAUFORT.length && s >= BEAUFORT[b]) b++; return b; };

/**
 * @param {{ baseWind:(X:number,Y:number,t:number)=>{x:number,y:number}, elev:(X:number,Y:number)=>number,
 *           dayAt?:(t:number)=>number, toWorld?:(X:number,Y:number)=>{x:number,y:number}, seed?:number, params?:object }} o
 *  elev: ground height in metres, > 0 on land (negative or 0 = sea). toWorld: stable world metres (so weather cells do not move when the ship frame does).
 */
export function createWindField({ baseWind, elev, dayAt = () => 0, toWorld = (X, Y) => ({ x: X, y: Y }), seed = 1, params = {} }) {
  const P = { ...WIND_PARAMS, ...params }, sd = seed | 0, isLand = (X, Y) => elev(X, Y) > 0.5;
  const coastCache = new Map(), lee = new Map();
  const key = (X, Y, g) => `${Math.round(X / g)},${Math.round(Y / g)}`;

  /** Share of land around the position and the unit vector pointing toward it (cached on a 100 m grid). */
  function coast(X, Y) {
    const k = key(X, Y, 100); let c = coastCache.get(k); if (c) return c;
    let n = 0, land = 0, vx = 0, vy = 0;
    for (const r of P.coastRadii) for (let a = 0; a < 8; a++) { const dx = Math.cos(a * Math.PI / 4), dy = Math.sin(a * Math.PI / 4); n++; if (isLand(X + dx * r, Y + dy * r)) { land++; vx += dx; vy += dy; } }
    const m = Math.hypot(vx, vy); c = { frac: land / n, dx: m > 1e-9 ? vx / m : 0, dy: m > 1e-9 ? vy / m : 0 };
    if (coastCache.size > 6000) coastCache.clear(); coastCache.set(k, c); return c;
  }
  /** Fraction of the wind left after the land upwind of this spot (1 = open water). */
  function shelter(X, Y, wx, wy) {
    const sp = Math.hypot(wx, wy); if (sp < 0.05) return 1;
    const ux = -wx / sp, uy = -wy / sp, ang = Math.round(Math.atan2(uy, ux) / (Math.PI / 8)), k = `${key(X, Y, 40)}|${ang}`; let f = lee.get(k); if (f !== undefined) return f;
    const cx = Math.cos(ang * Math.PI / 8), cy = Math.sin(ang * Math.PI / 8); f = 1;
    for (const d of P.shelterSamples) { const h = elev(X + cx * d, Y + cy * d); if (h > 2) { const zone = P.shelterRatio * h, w = 1 - Math.min(1, d / zone); if (w > 0) f = Math.min(f, 1 - (1 - P.shelterMin) * w); } }
    if (lee.size > 6000) lee.clear(); lee.set(k, f); return f;
  }
  /** Storm (+) and calm (+) weights at a place and game day, each 0..1. */
  function weather(X, Y, day) {
    const w = toWorld(X, Y), cs = P.cellKm * 1000, k = Math.floor(day / P.eventDays), env = Math.sin(Math.PI * (day / P.eventDays - k)) ** 0.7;
    const ci = Math.floor(w.x / cs), cj = Math.floor(w.y / cs); let storm = 0, calm = 0;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const kind = (salt, chance, [r0, r1]) => {
        if (hash(sd, k, i, j, salt) >= chance) return 0;
        const px = (i + hash(sd, k, i, j, salt + 1)) * cs, py = (j + hash(sd, k, i, j, salt + 2)) * cs, rad = (r0 + hash(sd, k, i, j, salt + 3) * (r1 - r0)) * 1000, d = Math.hypot(w.x - px, w.y - py);
        return d >= rad ? 0 : (1 - d / rad) ** 0.8;
      };
      storm = Math.max(storm, kind(11, P.stormChance, P.stormRadiusKm)); calm = Math.max(calm, kind(31, P.calmChance, P.calmRadiusKm));
    }
    return { storm: storm * env, calm: calm * env };
  }

  function info(X, Y, t = 0) {
    const day = dayAt(t), b = baseWind(X, Y, t), c = coast(X, Y);
    // sea/land breeze: onshore by day (06-18 h), offshore at night; strongest at the coast, fading with distance from land
    const phase = Math.sin(2 * Math.PI * (day - Math.floor(day) - 0.25)), amp = P.breezeMax * Math.min(1, c.frac * 2) * phase;
    let x = b.x + c.dx * amp, y = b.y + c.dy * amp; // dx,dy point toward land: daytime air moves toward land
    const f = shelter(X, Y, x, y); x *= f; y *= f;
    const { storm, calm } = weather(X, Y, day); let s = Math.hypot(x, y);
    if (s > 1e-9 || storm > 0) {
      const ux = s > 1e-9 ? x / s : b.x / (Math.hypot(b.x, b.y) || 1), uy = s > 1e-9 ? y / s : b.y / (Math.hypot(b.x, b.y) || 1);
      const gale = Math.max(s * P.stormGain, P.stormMinSpeed), s2 = (s * (1 - storm) + gale * storm) * (1 - (1 - P.calmFactor) * calm);
      x = ux * s2; y = uy * s2; s = s2;
    }
    return { x, y, speed: s, fromDeg: ((Math.atan2(-x, -y) * 180 / Math.PI) % 360 + 360) % 360, beaufort: beaufort(s), base: b, breeze: amp, shelter: f, storm, calm };
  }
  const wind = (X, Y, t = 0) => { const i = info(X, Y, t); return { x: i.x, y: i.y }; };
  return { wind, info, weather: (X, Y, t = 0) => weather(X, Y, dayAt(t)), params: P };
}
