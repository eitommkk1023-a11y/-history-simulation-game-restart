import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleet } from '../src/ship/fleet.mjs';
import { sampleDesigns } from '../src/ship/samples.mjs';
import { createBellonaInterior } from '../src/ship/bellona-interior.mjs';
import { BELLONA_MEASURED as M } from '../src/ship/bellona-data.mjs';
import { createShip } from '../src/ship/ship-model.mjs';
import { analyzeHydrostatics } from '../src/ship/hydrostatics.mjs';

const design = sampleDesigns['bellona-1760'];
test('Bellona design floats at the model draft and is stable', () => {
  const fleet = createFleet(); fleet.registerDesign('b', design); const id = fleet.addShip({ designId: 'b' });
  assert.ok(Math.abs(fleet.get(id).vessel.params.draftM - M.draftM) < 0.05, `draft ${fleet.get(id).vessel.params.draftM}`);
  const a = analyzeHydrostatics(createShip({ id: 'x', hull: design.hull, massItems: design.massItems }), { sliceCount: 100 });
  const gz = a.gzCurve.filter((p) => p.status === 'ok'); assert.ok(gz.find((p) => p.heelDeg === 10).gz > 0.1 && Math.max(...gz.map((p) => p.gz)) > 0.5);
});
test('the three masts carry measured sail areas', () => {
  assert.equal(design.sails.length, 3); assert.ok(design.sails.every((s) => s.type === 'square' && s.areaM2 > 100));
  assert.ok(design.sails.reduce((a, s) => a + s.areaM2, 0) > 700);
});
test('Bellona sails with a following wind', () => {
  const fleet = createFleet(); fleet.registerDesign('b', design); const id = fleet.addShip({ designId: 'b', headingDeg: 90 }); const v = fleet.get(id).vessel;
  const env = { wind: () => ({ x: 9, y: 0 }), current: () => ({ x: 0, y: 0 }), depth: () => 200 };
  for (let t = 0; t < 600; t += 0.1) { v.autoTrim(env); v.step(0.1, env); }
  assert.ok(v.snapshot().speedOverGround > 1.5, `speed ${v.snapshot().speedOverGround}`);
});
test('interior: floors, stairs and obstacles; start on the upper deck', () => {
  const it = createBellonaInterior(); const p = it.startPosition(); assert.equal(p.deck, 'upper');
  const a = it.move(p, 2, 0); assert.ok(a.x > p.x + 1 || a.blocked);
  for (const d of ['hold', 'orlop', 'lower', 'upper', 'quarter', 'fore', 'poop']) assert.ok(it.walkable(d, 28, 0) || d === 'poop' || d === 'fore' || d === 'quarter', d);
  assert.ok(Number.isFinite(it.deckAbove(it.snap('lower', 40, 0))) && it.deckAbove(it.snap('poop', 20, 0)) === Infinity);
});
test('crew stand at their stations and survive save/restore', () => {
  const fleet = createFleet(); fleet.registerDesign('b', design); const id = fleet.addShip({ designId: 'b', crew: 'empty' }); const r = fleet.get(id);
  for (let i = 0; i < 12; i++) r.crew.hire({ id: 'h' + i, name: 'h' + i });
  r.crew.update(3, {}); const tasks = r.crew.members.map((m) => m.task); assert.ok(tasks.includes('helm') && tasks.includes('lookout') && tasks.filter((t) => t === 'sail').length >= 3);
  const data = JSON.parse(JSON.stringify(fleet.serialize())); const f2 = createFleet(); f2.registerDesign('b', design); const res = f2.restore(data, { current: { b: design } });
  assert.equal(res.restored, 1); assert.equal(f2.get(id).crew.members.length, 12);
});
