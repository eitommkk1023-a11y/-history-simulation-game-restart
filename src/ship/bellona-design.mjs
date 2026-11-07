/**
 * Bellona (1760) design: a 74-gun ship of the line, from the Codex study model (assets/bellona).
 * Hull sections, mast/sail/rudder positions and sizes are MEASURED FROM THE MODEL (tools/bellona-extract-design.mjs). They are not
 * measurements of the real ship. Everything else (mass split, centres of gravity, tuning, crew size) is a game hypothesis (level D).
 * The model has no handling or combat data; guns are visual only here.
 * Axes: x stern -> bow (0 .. LOA), y starboard, z up from the keel underside (model Y = z - draft).
 */
import { BELLONA_MEASURED as M, BELLONA_LAYOUT } from './bellona-data.mjs';
import { createHull } from './hull-geometry.mjs';
import { submergedVolume } from './hydrostatics.mjs';

export const BELLONA_PARAMS = Object.freeze({
  massSplit: Object.freeze({ hullStructure: 0.47, ballast: 0.16, rigAndGear: 0.06, fittings: 0.31 }), // D: structure / iron+stone ballast / spars+rigging / guns+stores+crew
  centresZ: Object.freeze({ hullStructure: 3.9, ballast: 1.3, rigAndGear: 23, fittings: 8.0 }),        // D: m above the keel underside
  tuning: Object.freeze({ roughnessCf: 0.0018, form: 0.45, waveK: 40, keelLiftSlope: 0.5, windageAreaM2: 420 }), // D: generic, not calibrated
  crewSize: 12,                                                                                          // D: villagers aboard in the game (the real complement was ~600)
  rudderMassFraction: 0,
});

export function bellonaHull() { return { stations: M.stations }; }

export function bellonaHullReport(hull = createHull(bellonaHull())) {
  const slices = hull.slices(160), sub = submergedVolume(slices, [0, 0, 1], M.draftM);
  return { lengthOverall: hull.xMax - hull.xMin, draftM: M.draftM, volumeM3: sub.volume, displacementKg: sub.volume * 1025, lcbX: sub.centroid[0], kbZ: sub.centroid[2] };
}

/** Lightship + loads. The total mass is the water displaced at the model's draft; the ballast sits where the whole ship balances over the centre of buoyancy (zero trim). */
export function bellonaMassItems(hull = createHull(bellonaHull()), rep = bellonaHullReport(hull)) {
  const P = BELLONA_PARAMS, M0 = rep.displacementKg, s = P.massSplit, z = P.centresZ, lcb = rep.lcbX;
  const xr = M.sails.reduce((a, q) => a + q.x * q.areaM2, 0) / M.sails.reduce((a, q) => a + q.areaM2, 0);
  const mRig = M0 * s.rigAndGear, mBal = M0 * s.ballast, xBal = lcb - mRig * (xr - lcb) / mBal;
  return [
    { id: 'hull-structure', massKg: M0 * s.hullStructure, x: lcb, y: 0, z: z.hullStructure },
    { id: 'ballast', massKg: mBal, x: xBal, y: 0, z: z.ballast },
    { id: 'rig-and-gear', massKg: mRig, x: xr, y: 0, z: z.rigAndGear },
    { id: 'fittings', massKg: M0 * s.fittings, x: lcb, y: 0, z: z.fittings },
  ];
}

export function bellonaSails() {
  return M.sails.map((q) => ({ id: q.id === 'fore' ? 'foremast' : q.id === 'main' ? 'mainmast' : 'mizzen', type: 'square', shape: 'square', areaM2: q.areaM2, x: q.x, zCe: q.ceY + M.draftM, mastHeight: M.masts[q.id].topY - M.masts[q.id].baseY, yard: q.widest, glbKey: q.id }));
}

export function buildBellonaDesign() {
  const hull = createHull(bellonaHull()), rep = bellonaHullReport(hull), P = BELLONA_PARAMS;
  return {
    kind: 'bellona', label: 'ベローナ号 1760（74門艦・Codex研究モデル）',
    hull: bellonaHull(), massItems: bellonaMassItems(hull, rep), sails: bellonaSails(),
    rudder: { x: M.rudder.x, areaM2: M.rudder.areaM2 },
    tuning: { ...P.tuning },
    interior: { kind: 'bellona' }, crewSize: P.crewSize, visual: {},
    evidence: { profile: 'bellona-1760-study', level: 'D', lightDisplacementKg: rep.displacementKg, notes: ['hull sections, masts, sails, rudder: measured from the Codex study model', 'mass split, centres, tuning, crew: game hypotheses', 'interior layout: provisional fit-out, compartment assignments unverified', 'guns are visual only; no combat'] },
  };
}
