import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleet, LOD, createHull, buildHullMesh } from '../src/ship/index.mjs';
import { sampleDesigns, galleonLikeHull, galleyHull, boxBarge } from '../src/ship/samples.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);
const newFleet = () => { const f = createFleet(); f.registerDesign('galleon', sampleDesigns.galleon); f.registerDesign('galley', sampleDesigns.galley); return f; };
const env = { wind: { x: 0, y: -10 }, depth: 30 };

test('fleet: ids are unique and sequential, designs must exist', () => {
  const f = newFleet();
  assert.equal(f.addShip({ designId: 'galleon' }), 'ship-1'); assert.equal(f.addShip({ designId: 'galley' }), 'ship-2');
  assert.throws(() => f.addShip({ designId: 'nope' }), /unknown design/);
  assert.throws(() => f.addShip({ designId: 'galley', id: 'ship-1' }), /duplicate/);
  assert.throws(() => f.get('ship-9'), /unknown ship/);
});

test('fleet: LOD follows distance to the focus and dormant ships are frozen, not moved', () => {
  const f = newFleet();
  const a = f.addShip({ designId: 'galley', X: 0, Y: 0 }), b = f.addShip({ designId: 'galley', X: 5000, Y: 0 }), c = f.addShip({ designId: 'galley', X: 60000, Y: 0 });
  for (const id of [a, b, c]) f.get(id).vessel.state.u = 2;
  f.step(2, env, { X: 0, Y: 0 });
  assert.deepEqual([a, b, c].map((id) => f.get(id).lod), [LOD.near, LOD.far, LOD.dormant]);
  assert.ok(f.get(a).vessel.state.Y > 3 && f.get(b).vessel.state.Y > 3);
  assert.equal(f.get(c).vessel.state.Y, 0); near(f.get(c).dormantSeconds, 2, 1e-12);
});

test('fleet: near and far integration agree closely (LOD does not change the result)', () => {
  const run = (focusX) => { const f = newFleet(); const id = f.addShip({ designId: 'galleon' }); f.get(id).vessel.state.u = 3; f.get(id).vessel.setSailTrim('main', 45);
    for (let i = 0; i < 60; i++) f.step(1, env, { X: focusX, Y: 0 }); return f.get(id).vessel.snapshot(); };
  const n = run(0), fr = run(5000);
  near(n.x, fr.x, 1.0, 'x'); near(n.y, fr.y, 1.0, 'y'); near(n.u, fr.u, 0.05, 'u');
});

test('fleet: save/restore continues exactly where the ship was', () => {
  const f = newFleet(); const id = f.addShip({ designId: 'galley', X: 10, Y: 20, headingDeg: 30, refs: { owner: 'person-7' } });
  const v = f.get(id).vessel; v.setAllOarEffort(0.8); v.setSailTrim; v.dropAnchor({ depth: 10 }, { anchorKg: 300, rodeM: 60 });
  v.setRudder(5);
  for (let i = 0; i < 30; i++) f.step(1, env, { X: 0, Y: 0 });
  const saved = JSON.parse(JSON.stringify(f.serialize()));
  const g = newFleet(); g.restore(saved);
  assert.equal(g.get(id).refs.owner, 'person-7');
  for (let i = 0; i < 30; i++) { f.step(1, env, { X: 0, Y: 0 }); g.step(1, env, { X: 0, Y: 0 }); }
  const a = f.get(id).vessel.snapshot(), b = g.get(id).vessel.snapshot();
  for (const k of ['x', 'y', 'headingDeg', 'u', 'v', 'yawRateDegS', 'stamina']) near(a[k], b[k], 1e-9, k);
  assert.equal(g.addShip({ designId: 'galley' }), f.addShip({ designId: 'galley' }), 'id counter restored');
  assert.throws(() => g.restore({ format: 99 }), /format/);
});

test('fleet: events are collected with the ship id and kept in its history', () => {
  const f = newFleet(); const id = f.addShip({ designId: 'galleon' });
  f.get(id).vessel.state.u = 3;
  const shoal = { depth: 1 };
  f.step(1, shoal, { X: 0, Y: 0 });
  const ev = f.takeEvents();
  assert.ok(ev.some((e) => e.type === 'grounded' && e.shipId === id));
  assert.ok(f.get(id).history.some((e) => e.type === 'grounded'));
});

function edgeStats(mesh) {
  // Merge vertices at identical positions (the hull ring seams are separate indices only by the cap centres).
  const key = (i) => [0, 1, 2].map((k) => mesh.positions[i * 3 + k].toFixed(5)).join(',');
  const edges = new Map();
  for (let t = 0; t < mesh.indices.length; t += 3) for (const [p, q] of [[0, 1], [1, 2], [2, 0]]) {
    const a = key(mesh.indices[t + p]), b = key(mesh.indices[t + q]); const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
  return edges;
}

test('hull mesh: bounds match the hull, indices valid, and the surface is closed', () => {
  const hull = createHull(galleonLikeHull()), m = buildHullMesh(hull);
  assert.ok(m.indices.every((i) => i < m.vertexCount));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) { const [x, y, z] = [m.positions[i], m.positions[i + 1], m.positions[i + 2]]; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  near(maxZ - minZ, 40, 0.01, 'length'); near(minZ, -40, 0.01, 'bow toward -z');
  near(maxX - minX, 2 * 5.5, 0.2, 'beam'); near(maxY, 8, 0.1, 'top of the deck');
  for (const [k, n] of edgeStats(m)) assert.equal(n, 2, `edge ${k} used ${n} times`);
});

test('hull mesh: outward normals (positive enclosed volume) for several hulls', () => {
  for (const spec of [galleonLikeHull(), galleyHull(), boxBarge()]) {
    const m = buildHullMesh(createHull(spec), { stations: 12, levels: 6 });
    let vol = 0; const P = m.positions;
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t] * 3, m.indices[t + 1] * 3, m.indices[t + 2] * 3];
      vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    }
    assert.ok(vol > 0, `volume ${vol}`);
  }
  assert.throws(() => buildHullMesh(createHull(boxBarge()), { stations: 1 }), /integers/);
});

test('fleet restore: stale or unknown designs are skipped, and the current design data wins over the saved copy', () => {
  const f = newFleet(); const a = f.addShip({ designId: 'galley' }), b = f.addShip({ designId: 'galleon' });
  const saved = JSON.parse(JSON.stringify(f.serialize()));
  saved.ships[0].designId = 'removed-design'; saved.designs['removed-design'] = saved.designs.galley;          // a ship of a design that no longer exists
  saved.designs.galleon = { ...saved.designs.galleon, label: 'OLD COPY' };                                       // an out-of-date saved copy of a design that still exists
  const g = createFleet(); const r = g.restore(saved, { current: sampleDesigns });
  assert.equal(r.restored, 1); assert.deepEqual(r.skipped.map((s) => [s.id, s.designId]), [[a, 'removed-design']]);
  assert.equal(g.has(b), true); assert.equal(g.has(a), false);
  assert.ok(g.designIds().includes('pinta-1492'), 'every current design is available after a restore');
  assert.equal(g.addShip({ designId: 'galley' }).startsWith('ship-'), true);
  // without `current` the old behaviour (use the saved designs) is kept
  const h = createFleet(); assert.equal(h.restore(JSON.parse(JSON.stringify(f.serialize()))).restored, 2);
});
