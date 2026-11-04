/**
 * Render mesh built from the physics hull (display only; physics keeps using the sections).
 * Output is plain arrays so it needs no 3D library and can be tested. Axes of the output
 * match Three.js with north up: x = starboard, y = up, z = -forward (bow toward -z). Origin: keel baseline,
 * ship x = 0 at hull.xMin. Rotate a mesh by rotation.y = -heading to match the world.
 * The mesh is closed (every edge is shared by two triangles): skin, deck, keel flat and end caps.
 */
export function buildHullMesh(hull, { stations = 28, levels = 14 } = {}) {
  if (!Number.isInteger(stations) || stations < 2 || !Number.isInteger(levels) || levels < 2) throw new RangeError('stations and levels must be integers >= 2');
  const eps = 1e-6, rings = [];
  for (let i = 0; i <= stations; i++) {
    const x = hull.xMin + eps + (hull.xMax - hull.xMin - 2 * eps) * i / stations;
    const sec = hull.sectionAt(x), z0 = sec[0].z, z1 = sec[sec.length - 1].z, side = [];
    for (let k = 0; k <= levels; k++) {
      const z = z0 + (z1 - z0) * k / levels;
      let b = sec[sec.length - 1].b;
      for (let j = 1; j < sec.length; j++) if (z <= sec[j].z) { const a = sec[j - 1], c = sec[j], w = c.z === a.z ? 1 : (z - a.z) / (c.z - a.z); b = a.b + (c.b - a.b) * w; break; }
      side.push([Math.max(b, 1e-4), z]);
    }
    const ring = [...side.map(([b, z]) => [b, z]), ...side.slice().reverse().map(([b, z]) => [-b, z])];
    rings.push({ x: x - hull.xMin, ring });
  }
  const per = rings[0].ring.length, positions = [], indices = [];
  for (const { x, ring } of rings) for (const [y, z] of ring) positions.push(y, z, -x);
  for (let i = 0; i < stations; i++) for (let j = 0; j < per; j++) {
    const a = i * per + j, b = i * per + (j + 1) % per, c = (i + 1) * per + j, d = (i + 1) * per + (j + 1) % per;
    indices.push(a, c, b, b, c, d);
  }
  // End caps: fan around a centre vertex.
  const cap = (ringIndex, flip) => {
    const base = ringIndex * per, centre = positions.length / 3;
    let cy = 0, cz = 0; for (let j = 0; j < per; j++) { cy += positions[(base + j) * 3]; cz += positions[(base + j) * 3 + 1]; }
    positions.push(cy / per, cz / per, positions[base * 3 + 2]);
    for (let j = 0; j < per; j++) { const a = base + j, b = base + (j + 1) % per; indices.push(centre, flip ? b : a, flip ? a : b); }
  };
  cap(0, false); cap(stations, true);
  // Fix winding so triangle normals point outwards (checked against the centroid).
  const P = positions;
  let cx = 0, cy = 0, cz = 0; for (let v = 0; v < P.length; v += 3) { cx += P[v]; cy += P[v + 1]; cz += P[v + 2]; }
  const nv = P.length / 3; cx /= nv; cy /= nv; cz /= nv;
  let vol = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
    vol += (P[a] - cx) * ((P[b + 1] - cy) * (P[c + 2] - cz) - (P[b + 2] - cz) * (P[c + 1] - cy)) - (P[a + 1] - cy) * ((P[b] - cx) * (P[c + 2] - cz) - (P[b + 2] - cz) * (P[c] - cx)) + (P[a + 2] - cz) * ((P[b] - cx) * (P[c + 1] - cy) - (P[b + 1] - cy) * (P[c] - cx));
  }
  if (vol < 0) for (let t = 0; t < indices.length; t += 3) { const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp; }
  // Smooth vertex normals.
  const normals = new Float32Array(P.length);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3, ib = indices[t + 1] * 3, ic = indices[t + 2] * 3;
    const ux = P[ib] - P[ia], uy = P[ib + 1] - P[ia + 1], uz = P[ib + 2] - P[ia + 2], vx = P[ic] - P[ia], vy = P[ic + 1] - P[ia + 1], vz = P[ic + 2] - P[ia + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [ia, ib, ic]) { normals[i] += nx; normals[i + 1] += ny; normals[i + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) { const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1; normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l; }
  return { positions: Float32Array.from(P), normals, indices: Uint32Array.from(indices), vertexCount: nv, triangleCount: indices.length / 3 };
}
