/**
 * Mass and centre of gravity: M = Σ m_i, G = Σ(m_i r_i) / Σ m_i.
 * Each item is a reference to a real object (structure group, cargo lot, person,
 * equipment, ballast). Duplicate ids are rejected to avoid double counting.
 * Items may carry refs (e.g. inventoryRef, personId) to existing ledgers.
 */
export function computeMassProperties(items) {
  if (!Array.isArray(items) || items.length === 0) throw new TypeError('massItems must be a non-empty array');
  const ids = new Set();
  let m = 0, mx = 0, my = 0, mz = 0;
  for (const it of items) {
    if (typeof it?.id !== 'string' || !it.id) throw new TypeError('each mass item needs a string id');
    if (ids.has(it.id)) throw new RangeError(`duplicate mass item id: ${it.id}`);
    ids.add(it.id);
    for (const k of ['massKg', 'x', 'y', 'z']) {
      if (!Number.isFinite(it[k])) throw new TypeError(`mass item ${it.id}: ${k} must be finite`);
    }
    if (it.massKg < 0) throw new RangeError(`mass item ${it.id}: massKg must be >= 0`);
    m += it.massKg; mx += it.massKg * it.x; my += it.massKg * it.y; mz += it.massKg * it.z;
  }
  if (m <= 0) throw new RangeError('total mass must be > 0');
  return Object.freeze({ massKg: m, cg: Object.freeze({ x: mx / m, y: my / m, z: mz / m }) });
}
