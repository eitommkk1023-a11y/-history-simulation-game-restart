/**
 * EXPERIMENTAL test ships. Dimensions and masses are rough placeholders for
 * testing the solver; they are NOT historical specifications of any real ship.
 */
export function boxBarge({ length = 20, breadth = 6, depth = 4 } = {}) {
  const pts = [{ z: 0, b: breadth / 2 }, { z: depth, b: breadth / 2 }];
  return { stations: [{ x: 0, points: pts }, { x: length, points: pts }] };
}

/** Galleon-like hull, ~40 m between ends, ~11 m beam, with tumblehome. Placeholder values. */
export function galleonLikeHull() {
  return {
    stations: [
      { x: 0, points: [{ z: 2.5, b: 0.4 }, { z: 4, b: 2.6 }, { z: 6, b: 3.6 }, { z: 8, b: 3.8 }] },
      { x: 4, points: [{ z: 0.6, b: 0.3 }, { z: 2, b: 2.4 }, { z: 4, b: 4.2 }, { z: 6, b: 4.6 }, { z: 7.8, b: 4.4 }] },
      { x: 10, points: [{ z: 0, b: 0.4 }, { z: 1, b: 3.0 }, { z: 2.5, b: 4.8 }, { z: 4.5, b: 5.4 }, { z: 6, b: 5.3 }, { z: 7.4, b: 4.9 }] },
      { x: 20, points: [{ z: 0, b: 0.5 }, { z: 1, b: 3.8 }, { z: 2.5, b: 5.2 }, { z: 4.5, b: 5.5 }, { z: 6, b: 5.4 }, { z: 7.2, b: 5.0 }] },
      { x: 28, points: [{ z: 0, b: 0.4 }, { z: 1, b: 3.0 }, { z: 2.5, b: 4.6 }, { z: 4.5, b: 5.2 }, { z: 6, b: 5.1 }, { z: 7.2, b: 4.8 }] },
      { x: 35, points: [{ z: 0.4, b: 0.2 }, { z: 2, b: 2.2 }, { z: 4, b: 3.6 }, { z: 6, b: 4.0 }, { z: 7.4, b: 3.8 }] },
      { x: 40, points: [{ z: 1.5, b: 0.1 }, { z: 4, b: 0.6 }, { z: 6, b: 1.0 }, { z: 7.8, b: 1.2 }] },
    ],
  };
}

export function galleonLikeMassItems({ gunZ = 6.0 } = {}) {
  return [
    { id: 'hull-structure', massKg: 420000, x: 19.5, y: 0, z: 4.0 },
    { id: 'ballast', massKg: 140000, x: 20, y: 0, z: 0.9 },
    { id: 'cargo-hold', massKg: 180000, x: 21, y: 0, z: 2.4 },
    { id: 'guns', massKg: 40000, x: 20, y: 0, z: gunZ },
    { id: 'masts-rigging', massKg: 45000, x: 21, y: 0, z: 15 },
    { id: 'crew-stores', massKg: 60000, x: 18, y: 0, z: 4.8 },
  ];
}

/** Slender oared galley, ~36 m, 5 m beam. Placeholder values, NOT a historical specification. */
export function galleyHull() {
  const sec = (b) => [{ z: 0, b: 0.25 * b }, { z: 0.5, b: 0.65 * b }, { z: 1.2, b: 0.9 * b }, { z: 2.2, b }];
  return {
    stations: [
      { x: 0, points: [{ z: 0.9, b: 0.3 }, { z: 1.5, b: 0.9 }, { z: 2.2, b: 1.2 }] },
      { x: 4, points: sec(2.0) }, { x: 12, points: sec(2.4) }, { x: 20, points: sec(2.5) }, { x: 28, points: sec(2.2) },
      { x: 33, points: [{ z: 0.2, b: 0.2 }, { z: 0.8, b: 0.7 }, { z: 1.4, b: 1.1 }, { z: 2.2, b: 1.3 }] },
      { x: 36, points: [{ z: 1.0, b: 0.1 }, { z: 2.2, b: 0.5 }] },
    ],
  };
}
export function galleyMassItems() {
  return [
    { id: 'hull-structure', massKg: 14000, x: 18, y: 0, z: 1.0 },
    { id: 'rowers', massKg: 13600, x: 18, y: 0, z: 1.4 }, // 170 rowers x 80 kg
    { id: 'gear-stores', massKg: 6000, x: 18, y: 0, z: 0.8 },
  ];
}

/** Plain-data designs (JSON-safe) for the fleet. Placeholder values, NOT historical specifications. */
export const sampleDesigns = Object.freeze({
  galleon: Object.freeze({
    hull: galleonLikeHull(), massItems: galleonLikeMassItems(),
    sails: [{ id: 'main', type: 'foreAndAft', areaM2: 1200, x: 21, zCe: 13 }], rudder: { x: 0.5, areaM2: 6 },
    openings: [{ id: 'gunport', x: 20, y: 5.3, z: 5.2 }],
    // Hull/rig tuning for the vessel model (EXPERIMENTAL, being calibrated against rough historical ranges).
    tuning: { roughnessCf: 0.0015, form: 0.4, waveK: 40, keelLiftSlope: 0.5, windageAreaM2: 150 },
  }),
  galley: Object.freeze({
    hull: galleyHull(), massItems: galleyMassItems(), sails: [], rudder: { x: 0.5, areaM2: 1.5 },
    oars: [{ id: 'P', side: 'port', rowers: 85, x: 18 }, { id: 'S', side: 'starboard', rowers: 85, x: 18 }],
    tuning: { roughnessCf: 0.0005, form: 0.15, waveK: 1, keelLiftSlope: 0.5, windageAreaM2: 25 },
  }),
});
