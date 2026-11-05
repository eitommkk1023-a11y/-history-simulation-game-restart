/**
 * Cargo as real mass items placed in the hold. Masses per unit are level D (hypotheses); the point is that loading or
 * unloading changes total mass, centre of gravity and draft through the same physics (fleet.setLoad).
 */
import { PINTA_1492_PARAMS as G } from './pinta-1492-params.mjs';

export const CARGO_KINDS = Object.freeze({
  water_barrel: Object.freeze({ massKg: G.mass.waterBarrelKg.value, label: '水樽', evidence_level: 'D' }),
  provision_sack: Object.freeze({ massKg: 50, label: '食料袋', evidence_level: 'D' }),
  stone_ballast: Object.freeze({ massKg: 25, label: 'バラスト石', evidence_level: 'D' }),
});

/** One mass item for `count` units of a kind at hull position (x, y) and height z. */
export function cargoItem(kind, count, x, y, z, tag = '') {
  const k = CARGO_KINDS[kind]; if (!k) throw new RangeError(`unknown cargo kind ${kind}`);
  if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be a non-negative integer');
  return { id: `cargo:${kind}${tag ? ':' + tag : ''}`, massKg: count * k.massKg, x, y, z, ref: { kind, count } };
}
/** Design mass items with `cargo` items added (items with the same id replace the design's, never double count). */
export function withCargo(baseItems, cargo) {
  const ids = new Set(cargo.map((c) => c.id)); return [...baseItems.filter((m) => !ids.has(m.id)), ...cargo.filter((c) => c.massKg > 0)];
}
