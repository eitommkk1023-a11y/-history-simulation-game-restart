/**
 * Pinta 1492 design generator (research_compact_1690 profile). Builds, from the research figures and the labelled
 * game parameters only: hull stations, lightship mass items, interior layout and a fleet-compatible design.
 * Axes: x stern -> bow (0 .. LOA), y port -> starboard (+ starboard), z up from the keel underside. Metres.
 * The hull curve is a hypothesis (level D) shaped to hit the research waterline length, beam, waterline beam and
 * light draft; the lightship MASS is not an input: it is the water displaced by this hull at the research light draft.
 */
import { PINTA_1492_PROFILE as P } from './pinta-1492-data.mjs';
import { PINTA_1492_PARAMS as G } from './pinta-1492-params.mjs';
import { createHull } from './hull-geometry.mjs';
import { submergedVolume } from './hydrostatics.mjs';

const dim = (k) => P.dimensions[k].value;
export const LOA = dim('length_overall'), LWL = dim('length_waterline'), BEAM = dim('beam_max'), BEAM_WL = dim('beam_waterline'), DRAFT = dim('lightship_draft');
export const DECK_Z = G.hull.deckHeightZ.value;
export const RHO_SEA = 1025;
const AFT_WL = G.hull.sternOverhang.value, FWD_WL = AFT_WL + LWL;   // waterline runs from x = 0.45 to x = 16.20
const KEEL0 = G.hull.keelFlatFrom.value, KEEL1 = KEEL0 + G.hull.keelFlatLength.value;
const SPEC_STATIONS_U = [0, 0.03, 0.07, 0.12, 0.18, 0.25, 0.33, 0.42, 0.5, 0.58, 0.67, 0.75, 0.82, 0.88, 0.93, 0.97, 1]; // 17 stations (spec asks for 11-21)

/** Monotone cubic (Fritsch-Carlson) interpolation through the spec's test table: smooth, no overshoot above the max beam. */
function pchip(tbl) {
  const n = tbl.length, h = [], dl = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = tbl[i + 1][0] - tbl[i][0]; dl[i] = (tbl[i + 1][1] - tbl[i][1]) / h[i]; }
  m[0] = dl[0]; m[n - 1] = dl[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dl[i - 1] * dl[i] <= 0 ? 0 : 2 / (1 / dl[i - 1] + 1 / dl[i]);
  return (u) => {
    if (u <= tbl[0][0]) return tbl[0][1]; if (u >= tbl[n - 1][0]) return tbl[n - 1][1];
    let i = 0; while (u > tbl[i + 1][0]) i++;
    const t = (u - tbl[i][0]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * tbl[i][1] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * tbl[i + 1][1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
const deckHalf = (() => { const f = pchip(G.hull.deckHalfBreadthTable.value), tableMax = Math.max(...G.hull.deckHalfBreadthTable.value.map((r) => r[1])); return (u) => f(u) * (BEAM / 2) / tableMax; })();

/** Height of the keel underside (the hull bottom line) at x. Flat over the research keel length, rising to the waterline at the stem and stern. */
export function keelZ(x) {
  if (x < KEEL0) { if (x >= AFT_WL) return DRAFT * ((KEEL0 - x) / (KEEL0 - AFT_WL)) ** 2; return DRAFT + (AFT_WL - x) * 0.6; }
  if (x <= KEEL1) return 0;
  if (x <= FWD_WL) return DRAFT * ((x - KEEL1) / (FWD_WL - KEEL1)) ** 2.2;
  return DRAFT + (x - FWD_WL) * 0.9;
}

function section(x) {
  const u = x / LOA, bd = Math.max(deckHalf(u), 0.05), z0 = keelZ(x);
  const mid = 1 - Math.min(1, ((x - LOA / 2) / (LOA / 2)) ** 2);                 // 1 at midships, 0 at the ends
  const fw = Math.max(0.05, Math.min(G.hull.floorHalfWidthMid.value * mid, bd * 0.6)); // flat floor half-width
  const h = DECK_Z - z0, tw = (DRAFT - z0) / h;
  let k = 1.6;
  if (tw > 0.02 && tw < 0.98) { const r = Math.min(0.95, Math.max(0.05, (bd * G.hull.waterlineBreadthRatio.value - fw) / (bd - fw))); k = Math.log(1 - r) / Math.log(1 - tw); }
  const ts = [...new Set([0, 0.06, 0.15, 0.3, ...(tw > 0.02 && tw < 0.98 ? [tw] : []), 0.7, 0.85, 1].map((t) => +t.toFixed(5)))].sort((a, b) => a - b);
  return { x, points: ts.map((t) => ({ z: +(z0 + t * h).toFixed(5), b: +(fw + (bd - fw) * (1 - (1 - t) ** k)).toFixed(5) })) };
}

export function pintaHullSpec() { return { stations: SPEC_STATIONS_U.map((u) => section(u * LOA)) }; }

/** Quantities derived from the generated hull (nothing here is a measurement of the real ship). */
export function pintaHullReport(hull = createHull(pintaHullSpec())) {
  const slices = hull.slices(160), sub = submergedVolume(slices, [0, 0, 1], DRAFT);
  const wet = slices.filter((s) => s.profile[0].z < DRAFT - 1e-6);
  const lwl = wet.length ? (wet[wet.length - 1].x + wet[wet.length - 1].dx / 2) - (wet[0].x - wet[0].dx / 2) : 0;
  const b = (z) => Math.max(...slices.map((s) => { const p = s.profile; for (let i = 1; i < p.length; i++) if (z <= p[i].z) return p[i - 1].b + (p[i].b - p[i - 1].b) * (z - p[i - 1].z) / (p[i].z - p[i - 1].z); return p[p.length - 1].b; }));
  return { lengthOverall: hull.xMax - hull.xMin, lengthWaterline: lwl, beamMax: 2 * b(DECK_Z), beamWaterline: 2 * b(DRAFT), lightDisplacedVolumeM3: sub.volume, lightDisplacementKg: sub.volume * RHO_SEA, lcbX: sub.centroid[0], kbZ: sub.centroid[2], stationCount: hull.stations.length };
}

/** Lightship components. Mass comes from the displaced water at the research light draft, then is split by the D fractions. */
export function pintaLightshipMassItems(hull = createHull(pintaHullSpec()), rep = pintaHullReport(hull)) {
  const M = rep.lightDisplacementKg, s = G.mass.split.value, z = G.mass.centresZ.value, lcb = rep.lcbX;
  const masts = [G.rig.foremast.value, G.rig.mainmast.value, G.rig.mizzen.value], xr = masts.reduce((a, m) => a + m.u * LOA * m.sailAreaM2, 0) / masts.reduce((a, m) => a + m.sailAreaM2, 0);
  const mRig = M * s.rigAndGear, mBal = M * s.ballast, xBal = lcb - mRig * (xr - lcb) / mBal; // ballast placed so the total centre of gravity sits over the centre of buoyancy (zero trim)
  return [
    { id: 'hull-structure', massKg: M * s.hullStructure, x: lcb, y: 0, z: z.hullStructure },
    { id: 'ballast', massKg: mBal, x: xBal, y: 0, z: z.ballast },
    { id: 'rig-and-gear', massKg: mRig, x: xr, y: 0, z: z.rigAndGear },
    { id: 'fittings', massKg: M * s.fittings, x: lcb, y: 0, z: z.fittings },
  ];
}
