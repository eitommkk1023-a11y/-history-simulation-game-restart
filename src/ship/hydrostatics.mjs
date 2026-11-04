/**
 * Static hydrostatics for the ship prototype (Ver.7 basic design).
 * F_B = ρ g ∇ ; equilibrium = weight/buoyancy balance with free trim.
 * GZ(φ) is computed from the actual submerged shape at each heel angle (not from GM).
 * GM is reported only as an auxiliary small-angle indicator.
 * Assumptions (prototype, NOT approved rules):
 *  - The hull is treated as watertight up to the top of each section (deck/gunwale).
 *    Openings are only checked for submergence (downflooding angle); flooding,
 *    free-surface effects and internal water are not modelled yet.
 *  - Calm water, static equilibrium. No waves, wind or dynamics.
 */
import { breadthAtZ } from './hull-geometry.mjs';
import { computeMassProperties } from './mass.mjs';

export const WATER_DENSITY = Object.freeze({ seawater: 1025, freshwater: 1000 }); // kg/m^3
const DEG = Math.PI / 180;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Earth-up unit vector in the ship frame. heel>0: starboard down, trim>0: bow down. */
export function waterNormal(heel, trim) {
  return [-Math.sin(trim), -Math.sin(heel) * Math.cos(trim), Math.cos(heel) * Math.cos(trim)];
}

/** Keep the part of polygon where ay*y + az*z <= k (Sutherland–Hodgman, one half-plane). */
function clip(poly, ay, az, k) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const dp = ay * P[0] + az * P[1] - k, dq = ay * Q[0] + az * Q[1] - k;
    if (dp <= 0) out.push(P);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
    }
  }
  return out;
}

function areaCentroid(poly) {
  let a = 0, cy = 0, cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [y0, z0] = poly[i], [y1, z1] = poly[(i + 1) % poly.length];
    const c = y0 * z1 - y1 * z0;
    a += c; cy += (y0 + y1) * c; cz += (z0 + z1) * c;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) return null;
  return { area: Math.abs(a), y: cy / (6 * a), z: cz / (6 * a) };
}

/** Submerged volume and centre of buoyancy below the plane n·p = c. */
export function submergedVolume(slices, n, c) {
  let v = 0, mx = 0, my = 0, mz = 0;
  for (const s of slices) {
    const part = clip(s.poly, n[1], n[2], c - n[0] * s.x);
    if (part.length < 3) continue;
    const ac = areaCentroid(part);
    if (!ac) continue;
    const dv = ac.area * s.dx;
    v += dv; mx += s.x * dv; my += ac.y * dv; mz += ac.z * dv;
  }
  return v > 0 ? { volume: v, centroid: [mx / v, my / v, mz / v] } : { volume: 0, centroid: null };
}

/** Illinois (modified regula falsi). Returns null if [lo, hi] does not bracket a root. */
function findRoot(f, lo, hi, { ftol = 1e-12, xtol = 1e-10, maxIter = 100 } = {}) {
  let flo = f(lo), fhi = f(hi);
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (Math.sign(flo) === Math.sign(fhi)) return null;
  let side = 0, x = lo;
  for (let i = 0; i < maxIter; i++) {
    x = (lo * fhi - hi * flo) / (fhi - flo);
    const fx = f(x);
    if (Math.abs(fx) <= ftol || hi - lo <= xtol) return x;
    if (Math.sign(fx) === Math.sign(fhi)) { hi = x; fhi = fx; if (side === 1) flo /= 2; side = 1; }
    else { lo = x; flo = fx; if (side === -1) fhi /= 2; side = -1; }
  }
  return x;
}

function floatAt(slices, volume, n) {
  let lo = Infinity, hi = -Infinity;
  for (const s of slices) for (const [y, z] of s.poly) {
    const d = n[0] * s.x + n[1] * y + n[2] * z;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  const c = findRoot((cc) => submergedVolume(slices, n, cc).volume - volume, lo, hi, { ftol: volume * 1e-12 });
  if (c === null) return null;
  return { c, ...submergedVolume(slices, n, c) };
}

/** Righting arm (roll) and trimming arm (pitch) from B−G and the up vector n. */
function arms(B, G, n) {
  const m = cross([B[0] - G[0], B[1] - G[1], B[2] - G[2]], n);
  const eL = [1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]];
  const len = Math.hypot(...eL);
  const eLn = eL.map((v) => v / len);
  return { roll: dot(m, eLn), pitch: dot(m, cross(n, eLn)) };
}

/** Free-trim equilibrium at a fixed heel angle (radians). */
export function equilibriumAtHeel(slices, volume, G, heel, trimLimit = 20 * DEG) {
  const evalTrim = (trim) => {
    const n = waterNormal(heel, trim), f = floatAt(slices, volume, n);
    return f ? { trim, n, ...f, ...arms(f.centroid, G, n) } : null;
  };
  let failed = false;
  const trim = findRoot((t) => {
    const r = evalTrim(t);
    if (!r) { failed = true; return NaN; }
    return r.pitch;
  }, -trimLimit, trimLimit, { ftol: 1e-10, xtol: 1e-10, maxIter: 80 });
  if (failed || trim === null || !Number.isFinite(trim)) return { status: 'trim_out_of_range', heel };
  const r = evalTrim(trim);
  return { status: 'ok', heel, trim, normal: r.n, c: r.c, volume: r.volume, buoyancyCentre: r.centroid, gz: r.roll };
}

const DEFAULT_ANGLES = Object.freeze(Array.from({ length: 19 }, (_, i) => i * 5));

/**
 * Analyse a ship: mass properties, upright floating condition, GZ curve,
 * downflooding angles of openings, and static heel from an off-centre CG.
 */
export function analyzeHydrostatics(ship, { waterDensity = WATER_DENSITY.seawater, sliceCount = 80, heelAnglesDeg = DEFAULT_ANGLES, trimLimitDeg = 20 } = {}) {
  if (!Number.isFinite(waterDensity) || waterDensity <= 0) throw new RangeError('waterDensity must be > 0');
  const { hull, openings = [] } = ship;
  const mass = computeMassProperties(ship.massItems);
  const G = [mass.cg.x, mass.cg.y, mass.cg.z];
  const requiredVolume = mass.massKg / waterDensity;
  const slices = hull.slices(sliceCount);
  const hullVolume = submergedVolume(slices, [0, 0, 1], Infinity).volume;
  if (requiredVolume >= hullVolume) {
    return { status: 'insufficient_buoyancy', mass, requiredVolume, hullVolume };
  }
  const lim = trimLimitDeg * DEG;
  const up = equilibriumAtHeel(slices, requiredVolume, G, 0, lim);
  if (up.status !== 'ok') return { status: up.status, mass, requiredVolume, hullVolume };

  const wlZ = (x) => (up.c - up.normal[0] * x) / up.normal[2];
  let inertiaT = 0, waterplaneArea = 0;
  for (const s of slices) {
    const b = breadthAtZ(s.profile, wlZ(s.x));
    inertiaT += (2 / 3) * b ** 3 * s.dx;
    waterplaneArea += 2 * b * s.dx;
  }
  const KB = up.buoyancyCentre[2], BM = inertiaT / requiredVolume;
  const upright = {
    displacementKg: mass.massKg,
    volume: requiredVolume,
    draftAft: wlZ(hull.xMin), draftMid: wlZ((hull.xMin + hull.xMax) / 2), draftFore: wlZ(hull.xMax),
    trimDeg: up.trim / DEG,
    LCB: up.buoyancyCentre[0], KB, BM, KM: KB + BM, KG: G[2], GM: KB + BM - G[2],
    waterplaneArea,
  };

  const curve = heelAnglesDeg.map((deg) => {
    const e = equilibriumAtHeel(slices, requiredVolume, G, deg * DEG, lim);
    return e.status === 'ok'
      ? { heelDeg: deg, status: 'ok', gz: e.gz, trimDeg: e.trim / DEG, normal: e.normal, c: e.c }
      : { heelDeg: deg, status: e.status, gz: null };
  });

  const ok = curve.filter((p) => p.status === 'ok');
  let maxGz = null, angleOfMaxGzDeg = null, vanishingAngleDeg = null;
  for (const p of ok) if (maxGz === null || p.gz > maxGz) { maxGz = p.gz; angleOfMaxGzDeg = p.heelDeg; }
  for (let i = 1; i < ok.length; i++) {
    const a = ok[i - 1], b = ok[i];
    if (a.heelDeg >= angleOfMaxGzDeg && a.gz > 0 && b.gz <= 0) {
      vanishingAngleDeg = a.heelDeg + (b.heelDeg - a.heelDeg) * a.gz / (a.gz - b.gz);
      break;
    }
  }

  const downflooding = openings.map((o) => {
    const p = [o.x, o.y, o.z];
    let prev = null, angle = null;
    for (const q of ok) {
      const s = dot(q.normal, p) - q.c; // < 0 means below the waterplane
      if (s < 0) {
        angle = prev ? prev.deg + (q.heelDeg - prev.deg) * prev.s / (prev.s - s) : q.heelDeg;
        break;
      }
      prev = { deg: q.heelDeg, s };
    }
    return { id: o.id, downfloodingAngleDeg: angle };
  });

  let staticHeelDeg = 0;
  if (Math.abs(G[1]) > 1e-12) {
    const h = findRoot((phi) => {
      const e = equilibriumAtHeel(slices, requiredVolume, G, phi, lim);
      return e.status === 'ok' ? e.gz : NaN;
    }, -60 * DEG, 60 * DEG, { ftol: 1e-9, xtol: 1e-9, maxIter: 80 });
    staticHeelDeg = h === null || !Number.isFinite(h) ? null : h / DEG;
  }

  return {
    status: 'ok', mass, requiredVolume, hullVolume, reserveBuoyancyVolume: hullVolume - requiredVolume,
    upright, staticHeelDeg,
    gzCurve: curve.map(({ normal, c, ...rest }) => rest),
    summary: { maxGz, angleOfMaxGzDeg, vanishingAngleDeg },
    downflooding,
  };
}
