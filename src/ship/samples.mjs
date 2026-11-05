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
export const sampleDesigns = {
  galleon: Object.freeze({
    label: 'ガレオン',
    hull: galleonLikeHull(), massItems: galleonLikeMassItems(),
    sails: [{ id: 'main', type: 'foreAndAft', areaM2: 1200, x: 21, zCe: 13 }], rudder: { x: 0.5, areaM2: 6 },
    openings: [{ id: 'gunport', x: 20, y: 5.3, z: 5.2 }],
    interiorId: 'galleon',
    // Hull/rig tuning for the vessel model (EXPERIMENTAL, being calibrated against rough historical ranges).
    tuning: { roughnessCf: 0.0015, form: 0.4, waveK: 40, keelLiftSlope: 0.5, windageAreaM2: 150 },
  }),
  galley: Object.freeze({
    label: 'ガレー',
    hull: galleyHull(), massItems: galleyMassItems(), sails: [], rudder: { x: 0.5, areaM2: 1.5 },
    oars: [{ id: 'P', side: 'port', rowers: 85, x: 18 }, { id: 'S', side: 'starboard', rowers: 85, x: 18 }],
    tuning: { roughnessCf: 0.0005, form: 0.15, waveK: 1, keelLiftSlope: 0.5, windageAreaM2: 25 },
    interiorId: 'galley',
  }),
};

/** Interior layouts (EXPERIMENTAL placeholders, NOT historical plans). x from the stern (0) to the bow, y + starboard, z above the keel. */
export const sampleInteriors = {
  galleon: Object.freeze({
    decks: [{ id: 'weather', z: 8.0, name: '上甲板', exterior: true }, { id: 'gun', z: 5.2, name: '砲甲板' }, { id: 'hold', z: 2.4, name: '船倉' }],
    rooms: [
      { id: 'weather', deck: 'weather', name: '上甲板', use: 'deck', open: true, floor: false, x0: 3, x1: 38, y0: -6, y1: 6 },
      { id: 'captain', deck: 'gun', name: '船長室', use: 'cabin', x0: 2.5, x1: 10, y0: -4.2, y1: 4.2 },
      { id: 'gundeck', deck: 'gun', name: '砲甲板', use: 'crew', x0: 10.4, x1: 33, y0: -5.2, y1: 5.2 },
      { id: 'bosun', deck: 'gun', name: '艏倉庫', use: 'store', x0: 33.4, x1: 37.5, y0: -2.6, y1: 2.6 },
      { id: 'hold', deck: 'hold', name: '船倉', use: 'cargo', x0: 6, x1: 31.5, y0: -3.8, y1: 3.8 },
      { id: 'stores', deck: 'hold', name: '食料庫', use: 'store', x0: 31.9, x1: 36.5, y0: -2.2, y1: 2.2 },
    ],
    doors: [
      { id: 'd-captain', deck: 'gun', along: 'y', x0: 9.9, x1: 10.5, y0: -0.7, y1: 0.7 },
      { id: 'd-bosun', deck: 'gun', along: 'y', x0: 32.9, x1: 33.5, y0: -0.7, y1: 0.7 },
      { id: 'd-stores', deck: 'hold', along: 'y', x0: 31.4, x1: 32.0, y0: -0.7, y1: 0.7 },
    ],
    ladders: [
      { id: 'l-gun', name: '階段（上甲板↔砲甲板）', a: { deck: 'weather', x: 22, y: 1.8 }, b: { deck: 'gun', x: 22, y: 1.8 } },
      { id: 'l-hold', name: '階段（砲甲板↔船倉）', a: { deck: 'gun', x: 28, y: -2.2 }, b: { deck: 'hold', x: 28, y: -2.2 } },
    ],
  }),
  galley: Object.freeze({
    decks: [{ id: 'deck', z: 2.2, name: '甲板', exterior: true }],
    rooms: [{ id: 'deck', deck: 'deck', name: '甲板', use: 'deck', open: true, floor: false, x0: 3, x1: 33.5, y0: -3, y1: 3 }],
  }),
};

/**
 * Pinta-like caravela redonda (square sails on fore and main, lateen mizzen). Dimensions are rough, UNVERIFIED
 * reconstruction values (about 21 m long, 6.4 m beam, ~99 t displaced), NOT a documented plan; check against
 * reconstruction sources before relying on them.
 */
export function pintaHull() {
  return {
    stations: [
      { x: 0, points: [{ z: 1.0, b: 0.9 }, { z: 2.0, b: 1.5 }, { z: 3.6, b: 1.9 }] },
      { x: 2, points: [{ z: 0.5, b: 0.6 }, { z: 1.2, b: 1.9 }, { z: 2.2, b: 2.6 }, { z: 3.6, b: 2.7 }] },
      { x: 6, points: [{ z: 0.2, b: 0.4 }, { z: 0.8, b: 2.2 }, { z: 1.8, b: 3.0 }, { z: 3.0, b: 3.15 }, { z: 3.6, b: 3.05 }] },
      { x: 11, points: [{ z: 0, b: 0.4 }, { z: 0.8, b: 2.4 }, { z: 1.8, b: 3.1 }, { z: 3.0, b: 3.2 }, { z: 3.6, b: 3.1 }] },
      { x: 15.5, points: [{ z: 0.3, b: 0.35 }, { z: 1.0, b: 2.0 }, { z: 2.0, b: 2.8 }, { z: 3.0, b: 3.0 }, { z: 3.6, b: 2.9 }] },
      { x: 18.5, points: [{ z: 1.0, b: 0.3 }, { z: 2.0, b: 1.4 }, { z: 3.0, b: 2.0 }, { z: 3.6, b: 2.1 }] },
      { x: 21, points: [{ z: 2.0, b: 0.1 }, { z: 3.0, b: 0.5 }, { z: 3.6, b: 0.7 }] },
    ],
  };
}
export function pintaMassItems() {
  return [
    { id: 'hull-structure', massKg: 34000, x: 8.6, y: 0, z: 1.7 },
    { id: 'ballast', massKg: 44000, x: 9.0, y: 0, z: 0.6 },
    { id: 'cargo-stores', massKg: 14000, x: 11, y: 0, z: 1.5 },
    { id: 'crew', massKg: 2100, x: 10, y: 0, z: 2.8 }, // about 26 men x 80 kg
    { id: 'rig-sails', massKg: 5200, x: 9.5, y: 0, z: 8.2 },
  ];
}
sampleDesigns.pinta = Object.freeze({
  label: 'ピンタ号（キャラベル）',
  hull: pintaHull(), massItems: pintaMassItems(),
  sails: [
    { id: 'main', type: 'square', areaM2: 120, x: 9, zCe: 7.0, shape: 'square', cross: true },
    { id: 'fore', type: 'square', areaM2: 55, x: 16, zCe: 5.8, shape: 'square', cross: true },
    { id: 'mizzen', type: 'lateen', areaM2: 60, x: 3.5, zCe: 6.0, shape: 'lateen' },
  ],
  rudder: { x: 0.3, areaM2: 1.6 },
  tuning: { roughnessCf: 0.0015, form: 0.4, waveK: 40, keelLiftSlope: 0.5, windageAreaM2: 30 },
  visual: { bowsprit: true, flag: true },
  interiorId: 'pinta',
});
Object.freeze(sampleDesigns);

sampleInteriors.pinta = Object.freeze({
  decks: [{ id: 'poop', z: 4.9, name: '船尾甲板', exterior: true }, { id: 'weather', z: 3.6, name: '主甲板', exterior: true }, { id: 'hold', z: 1.3, name: '船倉' }],
  rooms: [
    { id: 'weather', deck: 'weather', name: '主甲板', use: 'deck', open: true, floor: false, x0: 6.0, x1: 19.6, y0: -3.2, y1: 3.2 },
    { id: 'poop', deck: 'poop', name: '船尾甲板', use: 'deck', open: true, x0: 0.8, x1: 5.6, y0: -1.8, y1: 1.8 },
    { id: 'cabin', deck: 'weather', name: '船尾の船室', use: 'cabin', wallHeight: 1.3, hideDecks: ['poop'], x0: 1.0, x1: 5.4, y0: -2.0, y1: 2.0 },
    { id: 'hold', deck: 'hold', name: '船倉（乗員区画・貨物）', use: 'cargo', x0: 3.5, x1: 17.0, y0: -2.4, y1: 2.4 },
    { id: 'stores', deck: 'hold', name: '食料庫', use: 'store', x0: 17.4, x1: 19.4, y0: -1.2, y1: 1.2 },
  ],
  doors: [
    { id: 'd-cabin', deck: 'weather', along: 'y', x0: 5.3, x1: 6.1, y0: -0.7, y1: 0.7 },
    { id: 'd-stores', deck: 'hold', along: 'y', x0: 16.9, x1: 17.5, y0: -0.7, y1: 0.7 },
  ],
  ladders: [
    { id: 'l-poop', name: 'はしご（主甲板↔船尾甲板）', a: { deck: 'weather', x: 6.6, y: 1.8 }, b: { deck: 'poop', x: 5.0, y: 1.4 } },
    { id: 'l-hold', name: '昇降口（主甲板↔船倉）', a: { deck: 'weather', x: 12, y: 1.0 }, b: { deck: 'hold', x: 12, y: 1.0 } },
  ],
});
Object.freeze(sampleInteriors);
