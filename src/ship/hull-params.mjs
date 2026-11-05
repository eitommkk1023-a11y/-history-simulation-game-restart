/**
 * Derives manoeuvring parameters (waterline length, wetted surface, lateral area...)
 * from the physics hull and an upright hydrostatics result. Read-only helper.
 */
import { breadthAtZ } from './hull-geometry.mjs';

export function deriveHullParams(ship, analysis, { sliceCount = 80 } = {}) {
  if (analysis?.status !== 'ok') throw new RangeError('hydrostatics analysis must have status ok');
  const { hull } = ship, u = analysis.upright, slices = hull.slices(sliceCount);
  const wl = (x) => u.draftAft + (u.draftFore - u.draftAft) * (x - hull.xMin) / (hull.xMax - hull.xMin);
  let lat = 0, latMoment = 0, wetted = 0, beam = 0, xMinW = Infinity, xMaxW = -Infinity;
  for (const s of slices) {
    const zw = wl(s.x), zk = s.profile[0].z;
    if (zw <= zk) continue;
    const depth = zw - zk;
    lat += depth * s.dx; latMoment += depth * s.dx * s.x;
    const b = breadthAtZ(s.profile, zw);
    beam = Math.max(beam, 2 * b);
    if (b > 1e-6) { xMinW = Math.min(xMinW, s.x - s.dx / 2); xMaxW = Math.max(xMaxW, s.x + s.dx / 2); }
    let per = 2 * s.profile[0].b, prev = s.profile[0];
    for (let i = 1; i < s.profile.length && prev.z < zw; i++) {
      const p = s.profile[i], z1 = Math.min(p.z, zw), b1 = breadthAtZ(s.profile, z1);
      per += 2 * Math.hypot(b1 - prev.b, z1 - prev.z);
      prev = { z: z1, b: b1 };
    }
    wetted += per * s.dx;
  }
  return Object.freeze({
    massKg: analysis.mass.massKg, cgX: analysis.mass.cg.x,
    waterlineLengthM: xMaxW - xMinW, beamM: beam, draftM: u.draftMid, waterlineZ: u.draftMid,
    wettedAreaM2: wetted, lateralAreaM2: lat, clrX: latMoment / lat,
  });
}
