import test from 'node:test';
import assert from 'node:assert/strict';
import { createFleet, createAugust1492, cargoItem, withCargo, SCENARIO } from '../src/ship/index.mjs';
import { sampleDesigns } from '../src/ship/samples.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);
const env = { wind: { x: 0, y: -8 }, depth: 40 };
const newFleet = () => { const f = createFleet(); f.registerDesign('pinta', sampleDesigns['pinta-1492']); return f; };

test('cargo changes mass, centre of gravity, trim and draft through the physics, and never double counts', () => {
  const f = newFleet(), id = f.addShip({ designId: 'pinta' });
  const draft0 = f.get(id).vessel.params.draftM, m0 = f.get(id).vessel.params.massKg;
  const base = f.designMass('pinta');
  const load = withCargo(base, [cargoItem('water_barrel', 20, 4.0, 0, 0.9, 'aft')]);
  f.setLoad(id, load);
  const p1 = f.get(id).vessel.params;
  near(p1.massKg - m0, 20 * 260, 1e-6, 'mass grows by the barrels'); assert.ok(p1.draftM > draft0 + 0.05, `draft ${draft0} -> ${p1.draftM}`);
  assert.ok(f.get(id).vessel.params.cgX < 8.0, 'the centre of gravity moved aft');
  // loading the same id again replaces it, it does not add
  const again = withCargo(load, [cargoItem('water_barrel', 20, 4.0, 0, 0.9, 'aft')]); near(again.reduce((a, m) => a + m.massKg, 0), load.reduce((a, m) => a + m.massKg, 0), 1e-6);
  f.setLoad(id, base); near(f.get(id).vessel.params.massKg, m0, 1e-6, 'unloaded again');
  assert.throws(() => cargoItem('gold', 1, 0, 0, 0), /unknown cargo/);
});

test('a loaded ship keeps moving when its load changes, and saves with its load and crew', () => {
  const f = newFleet(), id = f.addShip({ designId: 'pinta', crew: true, headingDeg: 90 });
  f.get(id).vessel.state.u = 2;
  for (let i = 0; i < 20; i++) f.step(1, env, { X: 0, Y: 0 });
  const x0 = f.get(id).vessel.state.X; f.setLoad(id, withCargo(f.designMass('pinta'), [cargoItem('water_barrel', 5, 8, 0, 0.9)]));
  assert.equal(f.get(id).vessel.state.X, x0);
  for (let i = 0; i < 20; i++) f.step(1, env, { X: 0, Y: 0 });
  const g = newFleet(); g.restore(JSON.parse(JSON.stringify(f.serialize())));
  near(g.get(id).vessel.params.massKg, f.get(id).vessel.params.massKg, 1e-6, 'load restored'); assert.equal(g.get(id).crew.members.length, 26);
  for (let i = 0; i < 20; i++) { f.step(1, env, { X: 0, Y: 0 }); g.step(1, env, { X: 0, Y: 0 }); }
  near(f.get(id).vessel.state.X, g.get(id).vessel.state.X, 1e-6, 'same voyage after restore');
});

test('no hands at the helm: the rudder stays amidships; with a helmsman the ship holds a heading', () => {
  const f = newFleet(), id = f.addShip({ designId: 'pinta', crew: true, headingDeg: 90 }), v = f.get(id).vessel;
  const calm = { wind: { x: 0, y: 0 }, depth: 40 };
  v.state.u = 2; v.setHeadingTarget(60);
  f.step(2, calm, { X: 0, Y: 0 }); // the crew is still walking to the stations
  assert.equal(v.snapshot().rudderDeg, 0, 'unmanned helm');
  for (let i = 0; i < 150; i++) { v.setHeadingTarget(60); f.step(1, calm, { X: 0, Y: 0 }); }
  assert.ok(f.get(id).crew.effects().helmManned);
  assert.ok(Math.abs(((v.snapshot().headingDeg - 60 + 540) % 360) - 180) < 15, `heading ${v.snapshot().headingDeg}`);
});

test('sails are trimmed only as fast as the hands at the masts allow (never instantly)', () => {
  const f = newFleet(), id = f.addShip({ designId: 'pinta', crew: true, headingDeg: 90 }), v = f.get(id).vessel;
  f.step(1, env, { X: 0, Y: 0 }); // the crew's presence sets the sail slew rate
  v.sails[1].trimDeg = 90; v.sails[1].targetTrimDeg = 40; // main course braced square, to be hauled round to 40 degrees
  f.step(2, env, { X: 0, Y: 0 });
  const moved = 90 - v.sails[1].trimDeg; assert.ok(moved > 0 && moved <= 1.2 * 3 * 2 + 0.01, `moved ${moved} deg in 2 s`);
  for (let i = 0; i < 100; i++) f.step(1, env, { X: 0, Y: 0 });
  near(v.sails[1].trimDeg, 40, 0.01, 'arrives at the target');
});

test('August 1492: rudder disengaged -> lashed -> failed again -> repaired, then a leak that the pumps hold', () => {
  const f = newFleet(), id = f.addShip({ designId: 'pinta', crew: true, headingDeg: 90 }), sc = createAugust1492({ fleet: f, shipId: id, daySeconds: 600 }), v = () => f.get(id).vessel;
  v().state.u = 2; const log = [], stages = new Set(), hs = [];
  const turnRate = () => { const s = v(); s.setRudder(20); const r0 = s.snapshot().yawRateDegS; return Math.abs(r0); };
  for (let t = 0; t < 3.2 * 600; t += 1) {
    f.step(1, env, { X: 0, Y: 0 }); sc.update(1); stages.add(sc.stage); hs.push(v().state.rudderHealth);
    if (t % 3 === 0) { /* the ship keeps sailing; no steering input */ }
  }
  assert.deepEqual([...stages], ['sound', 'disengaged', 'lashed', 'repeat', 'repaired']);
  const kinds = sc.events.map((e) => e.historical.kind);
  assert.deepEqual(kinds, ['rudder_disengaged', 'rudder_repair_after_repeat_problem', 'rudder_disengaged', 'rudder_repair_after_repeat_problem', 'leak_reported']);
  assert.ok(sc.events.every((e) => e.historical.evidence_level === 'A' && e.historical.source === 'KCL_DIARY'), 'the dated events carry their source and level');
  assert.ok(sc.events.every((e) => typeof e.game.note === 'string' && /\(D\)|D\)/.test(e.game.note)), 'every how-detail is marked as a hypothesis');
  assert.ok(Math.min(...hs) <= 0.15 && hs.at(-1) === 0.85);
  assert.ok(sc.bilgeWaterM3 > 0, 'leak started');
  const water1 = sc.bilgeWaterM3; for (let t = 0; t < 1500; t += 1) { f.step(1, env, { X: 0, Y: 0 }); sc.update(1); }
  assert.ok(sc.bilgeWaterM3 <= water1 + 0.5 && sc.bilgeWaterM3 < 3, `bilge water ${water1} -> ${sc.bilgeWaterM3}`);
  assert.ok(f.get(id).vessel.params.massKg > f.designMass('pinta').reduce((a, m) => a + m.massKg, 0) - 1, 'water is carried as mass');
});

test('a ship without a rudder cannot turn: health 0 removes the rudder force', () => {
  const f = newFleet(), a = f.addShip({ designId: 'pinta' }), b = f.addShip({ designId: 'pinta' });
  for (const id of [a, b]) { f.get(id).vessel.state.u = 3; f.get(id).vessel.setRudder(25); }
  f.get(b).vessel.setRudderHealth(0);
  for (let i = 0; i < 40; i++) { f.step(1, { wind: { x: 0, y: 0 }, depth: 40 }, { X: 0, Y: 0 }); f.get(a).vessel.setRudder(25); f.get(b).vessel.setRudder(25); }
  const ya = Math.abs(f.get(a).vessel.snapshot().yawRateDegS), yb = Math.abs(f.get(b).vessel.snapshot().yawRateDegS);
  assert.ok(ya > 0.5 && yb < 0.15 && ya > 5 * yb, `yaw rates ${ya} vs ${yb}`);
});
