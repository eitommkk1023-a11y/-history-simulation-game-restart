import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleet } from '../src/ship/fleet.mjs';
import { sampleDesigns, sampleInteriors } from '../src/ship/samples.mjs';
import { createInterior } from '../src/ship/interior.mjs';
import { createHull } from '../src/ship/hull-geometry.mjs';

const calm = { wind: () => ({ x: 0, y: 0 }), current: () => ({ x: 0, y: 0 }), depth: () => 20 };
test('the rowboat floats level at a shallow draft and keeps freeboard', () => {
  const f = createFleet(); f.registerDesign('r', sampleDesigns.rowboat); const v = f.get(f.addShip({ designId: 'r' })).vessel;
  assert.ok(v.params.draftM > 0.08 && v.params.draftM < 0.3, `draft ${v.params.draftM}`); assert.ok(Math.abs(v.snapshot().heelDeg) < 1);
});
test('rowing moves it forward at a human pace; resting stops it', () => {
  const f = createFleet(); f.registerDesign('r', sampleDesigns.rowboat); const id = f.addShip({ designId: 'r', headingDeg: 0 }), v = f.get(id).vessel;
  v.setAllOarEffort(1); for (let t = 0; t < 60; t += 0.1) v.step(0.1, calm);
  const sp = v.snapshot().speedOverGround; assert.ok(sp > 0.8 && sp < 3, `speed ${sp}`);
  v.setAllOarEffort(0); for (let t = 0; t < 40; t += 0.1) v.step(0.1, calm); assert.ok(v.snapshot().speedOverGround < sp * 0.5);
});
test('a person can walk the boat but not leave the hull', () => {
  const f = createFleet(); f.registerDesign('r', sampleDesigns.rowboat); const hull = createHull(sampleDesigns.rowboat.hull), it = createInterior(sampleInteriors.rowboat, { hull });
  let p = it.startPosition(); for (let i = 0; i < 100; i++) p = it.move(p, 0.1, 0); assert.ok(p.x < 4.6); for (let i = 0; i < 100; i++) p = it.move(p, 0, 0.1); assert.ok(Math.abs(p.y) < 0.8);
});
