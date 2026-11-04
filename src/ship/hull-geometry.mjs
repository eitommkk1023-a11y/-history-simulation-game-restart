/**
 * World of History ship system: physics hull geometry (independent prototype).
 * Ship-fixed frame, SI units:
 *   x = longitudinal (m, positive forward), y = transverse (m, positive starboard),
 *   z = vertical (m, positive up, 0 = baseline / lowest keel reference).
 * The hull is defined by transverse stations (half-breadth b at height z).
 * Between control points interpolation is linear, so intentional chines are kept.
 * This geometry is for buoyancy/physics only and is separate from any render mesh.
 * Asymmetric hulls, multihulls and outriggers are NOT supported yet.
 */
const EPS = 1e-9;
const lerp = (a, b, w) => a + (b - a) * w;

function assertFinite(v, name) {
  if (!Number.isFinite(v)) throw new TypeError(`${name} must be a finite number`);
}

function validateStations(stations) {
  if (!Array.isArray(stations) || stations.length < 2) throw new TypeError('hull.stations needs at least 2 stations');
  stations.forEach((st, i) => {
    assertFinite(st?.x, `stations[${i}].x`);
    if (i && st.x <= stations[i - 1].x) throw new RangeError('stations must be sorted by strictly increasing x');
    if (!Array.isArray(st.points) || st.points.length < 2) throw new TypeError(`stations[${i}] needs at least 2 points`);
    st.points.forEach((p, j) => {
      assertFinite(p?.z, `stations[${i}].points[${j}].z`);
      assertFinite(p?.b, `stations[${i}].points[${j}].b`);
      if (p.b < 0) throw new RangeError('half-breadth b must be >= 0');
      if (j && p.z <= st.points[j - 1].z) throw new RangeError('station points must have strictly increasing z');
    });
  });
}

/** Half-breadth of a profile at height z: 0 below its keel, top breadth above its top. */
export function breadthAtZ(points, z) {
  if (z < points[0].z - EPS) return 0;
  const top = points[points.length - 1];
  if (z >= top.z) return top.b;
  for (let i = 1; i < points.length; i++) {
    if (z <= points[i].z) {
      const a = points[i - 1], c = points[i];
      return lerp(a.b, c.b, (z - a.z) / (c.z - a.z));
    }
  }
  return top.b;
}

/** Closed section polygon [[y, z], ...] (starboard upward, then port downward). */
export function sectionPolygon(profile) {
  const poly = [];
  if (profile[0].b > EPS) poly.push([0, profile[0].z]);
  for (const p of profile) poly.push([p.b, p.z]);
  for (let i = profile.length - 1; i >= 0; i--) poly.push([-profile[i].b, profile[i].z]);
  return poly;
}

export function createHull({ stations } = {}) {
  validateStations(stations);
  const st = stations.map((s) => Object.freeze({ x: s.x, points: Object.freeze(s.points.map((p) => Object.freeze({ z: p.z, b: p.b }))) }));
  const xMin = st[0].x, xMax = st[st.length - 1].x;
  const sliceCache = new Map();

  function sectionAt(x) {
    if (!(x >= xMin && x <= xMax)) return null;
    let i = 0;
    while (i < st.length - 2 && x > st[i + 1].x) i++;
    const A = st[i].points, B = st[i + 1].points, w = (x - st[i].x) / (st[i + 1].x - st[i].x);
    const zKeel = lerp(A[0].z, B[0].z, w), zTop = lerp(A[A.length - 1].z, B[B.length - 1].z, w);
    const zs = new Set([zKeel, zTop]);
    for (const p of [...A, ...B]) if (p.z > zKeel && p.z < zTop) zs.add(p.z);
    return [...zs].sort((a, b) => a - b).map((z) => ({ z, b: lerp(breadthAtZ(A, z), breadthAtZ(B, z), w) }));
  }

  /** Midpoint slices along x, cached per count. */
  function slices(count = 80) {
    if (!Number.isInteger(count) || count < 2) throw new RangeError('slice count must be an integer >= 2');
    if (!sliceCache.has(count)) {
      const dx = (xMax - xMin) / count, out = [];
      for (let k = 0; k < count; k++) {
        const x = xMin + (k + 0.5) * dx, profile = sectionAt(x);
        out.push(Object.freeze({ x, dx, profile, poly: sectionPolygon(profile) }));
      }
      sliceCache.set(count, Object.freeze(out));
    }
    return sliceCache.get(count);
  }

  return Object.freeze({ stations: Object.freeze(st), xMin, xMax, sectionAt, slices });
}
