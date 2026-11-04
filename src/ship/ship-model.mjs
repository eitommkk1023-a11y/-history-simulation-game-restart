/**
 * Minimal ship record for the independent prototype.
 * Only physics-relevant data is held here. Owners, crew, cargo ledgers etc. are
 * referenced by id (refs) and remain the responsibility of existing systems.
 */
import { createHull } from './hull-geometry.mjs';
import { computeMassProperties } from './mass.mjs';

export function createShip({ id, name = '', hull, massItems, openings = [] } = {}) {
  if (typeof id !== 'string' || !id) throw new TypeError('ship id must be a non-empty string');
  const h = hull && typeof hull.sectionAt === 'function' ? hull : createHull(hull);
  computeMassProperties(massItems); // validates
  const seen = new Set();
  for (const o of openings) {
    if (typeof o?.id !== 'string' || !o.id || seen.has(o.id)) throw new TypeError('each opening needs a unique string id');
    seen.add(o.id);
    for (const k of ['x', 'y', 'z']) if (!Number.isFinite(o[k])) throw new TypeError(`opening ${o.id}: ${k} must be finite`);
  }
  return Object.freeze({
    id, name, hull: h,
    massItems: Object.freeze(massItems.map((m) => Object.freeze({ ...m }))),
    openings: Object.freeze(openings.map((o) => Object.freeze({ ...o }))),
  });
}

/** Returns a new ship with mass items replaced (loading, consumption, moving cargo). */
export function withMassItems(ship, massItems) {
  return createShip({ ...ship, massItems });
}
