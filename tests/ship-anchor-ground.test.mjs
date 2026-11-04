import test from 'node:test';
import assert from 'node:assert/strict';
import { createShip, analyzeHydrostatics, createVessel } from '../src/ship/index.mjs';
import { galleonLikeHull, galleonLikeMassItems, galleyHull, galleyMassItems } from '../src/ship/samples.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);
const galleon = createShip({ id: 'g', hull: galleonLikeHull(), massItems: galleonLikeMassItems() });
const gAn = analyzeHydrostatics(galleon);
const galley = createShip({ id: 'ga', hull: galleyHull(), massItems: galleyMassItems() });
const yAn = analyzeHydrostatics(galley);
const mkGalley = (n = 50) => createVessel({ ship: galley, analysis: yAn, rudder: { x: 0.5, areaM2: 1.5 },
  oars: [{ id: 'P', side: 'port', rowers: n, x: 18 }, { id: 'S', side: 'starboard', rowers: n, x: 18 }] });
// Wind-blown hulk: large windage area, no sails.
const hulk = (o = {}) => createVessel({ ship: galleon, analysis: gAn, windageAreaM2: 300, ...o });
const northWind = { wind: { x: 0, y: -10 } }; // blowing toward the south

test('galley: both banks rowing give a plausible steady speed and no turn', () => {
  const v = mkGalley(); v.setAllOarEffort(1); v.run(60, 0.1, {}, { heading: 0 });
  const s = v.snapshot();
  assert.ok(s.speedOverGround > 2 && s.speedOverGround < 6, `speed ${s.speedOverGround}`);
  near(s.headingDeg % 360, 0, 0.5, 'heading');
});

test('galley: rowing harder on one side turns the ship away from that side', () => {
  const v = mkGalley(); v.setOarEffort('P', 1); v.setOarEffort('S', 0.2); v.run(60, 0.1, {});
  const h = v.snapshot().headingDeg;
  assert.ok(h > 3 && h < 90, `turns to starboard, heading ${h}`);
  const w = mkGalley(); w.setOarEffort('S', 1); w.setOarEffort('P', 0.2); w.run(60, 0.1, {});
  near(360 - w.snapshot().headingDeg, h, 1e-6, 'mirror');
});

test('galley: fatigue lowers speed over time and rest restores stamina', () => {
  const v = mkGalley(); v.setAllOarEffort(1); v.run(60, 0.1, {}, { heading: 0 });
  const early = v.snapshot().speedOverGround;
  v.run(560, 0.1, {}, { heading: 0 });
  const tired = v.snapshot();
  assert.ok(tired.speedOverGround < early && tired.stamina < 0.1, `${early} -> ${tired.speedOverGround}, stamina ${tired.stamina}`);
  v.setAllOarEffort(0); v.run(900, 0.1, {});
  assert.ok(v.snapshot().stamina > 0.6, `recovered ${v.snapshot().stamina}`);
});

test('galley: backing the oars brakes the ship', () => {
  const coast = mkGalley(); coast.state.u = 3; coast.run(10, 0.1, {});
  const back = mkGalley(); back.state.u = 3; back.setAllOarEffort(-1); back.run(10, 0.1, {});
  assert.ok(back.snapshot().u < coast.snapshot().u - 0.3);
});

test('anchor: a heavy anchor holds the wind-blown ship near the drop point', () => {
  const env = { ...northWind, depth: 8, seabed: 'sand' };
  const v = hulk(); assert.equal(v.dropAnchor(env, { anchorKg: 800, rodeM: 60 }).status, 'ok');
  v.run(400, 0.1, env);
  const s = v.snapshot();
  assert.equal(s.anchorDragging, false);
  assert.ok(Math.hypot(s.x, s.y) < 60 + 40, `distance ${Math.hypot(s.x, s.y)}`);
  assert.ok(s.speedOverGround < 0.3, `speed ${s.speedOverGround}`);
  assert.ok(s.y < 0, 'ship lies downwind of the anchor');
});

test('anchor: a light anchor drags and the ship drifts on', () => {
  const env = { ...northWind, depth: 8, seabed: 'sand' };
  const v = hulk(); v.dropAnchor(env, { anchorKg: 40, rodeM: 60 });
  v.run(400, 0.1, env);
  const s = v.snapshot();
  assert.equal(s.anchorDragging, true);
  assert.ok(Math.hypot(s.x, s.y) > 100, `drift ${Math.hypot(s.x, s.y)}`);
  assert.ok(v.takeEvents().some((e) => e.type === 'anchor_dragging'));
});

test('anchor: short scope and soft mud hold less than long scope and sand', () => {
  const hold = (env, rode) => hulk().dropAnchor({ depth: 10, ...env }, { anchorKg: 300, rodeM: rode }).holdN;
  assert.ok(hold({ seabed: 'sand' }, 60) > hold({ seabed: 'mud' }, 60));
  assert.ok(hold({ seabed: 'sand' }, 60) > hold({ seabed: 'sand' }, 20));
});

test('anchor: cannot drop in water deeper than the rode or without depth data; rode can part', () => {
  assert.equal(hulk().dropAnchor({ depth: 80 }, { rodeM: 60 }).status, 'too_deep');
  assert.equal(hulk().dropAnchor({}, { rodeM: 60 }).status, 'no_depth_data');
  const env = { ...northWind, depth: 8 }, v = hulk(); v.dropAnchor(env, { anchorKg: 800, rodeM: 60, breakingN: 3000 });
  v.run(300, 0.1, env);
  assert.equal(v.snapshot().anchored, false);
  assert.ok(v.takeEvents().some((e) => e.type === 'anchor_parted'));
});

test('anchor: raising it lets the ship go', () => {
  const env = { ...northWind, depth: 8 }, v = hulk(); v.dropAnchor(env, { anchorKg: 800, rodeM: 60 });
  v.run(100, 0.1, env); assert.equal(v.raiseAnchor(), true); v.run(200, 0.1, env);
  assert.ok(v.snapshot().speedOverGround > 0.5);
});

// Shelving beach: deep (20 m) for y < 300, then shoals 5 cm per metre.
const shelf = { depth: (x, y) => (y < 300 ? 20 : 20 - (y - 300) * 0.05) };
test('grounding: a ship running onto a shoal stops, with an impact event, and stays afloat-or-aground consistently', () => {
  const v = createVessel({ ship: galleon, analysis: gAn, rudder: { x: 0.5, areaM2: 6 }, sails: [{ id: 's', type: 'foreAndAft', areaM2: 500, x: 21, zCe: 12 }] });
  v.state.u = 3; v.state.Y = 250; // heading north, towards the shoal
  v.run(150, 0.1, shelf);
  const ev = v.takeEvents();
  assert.ok(ev.some((e) => e.type === 'grounded' && e.impactSpeed > 0.3), JSON.stringify(ev));
  const s = v.snapshot();
  assert.equal(s.aground, true); assert.ok(s.speedOverGround < 0.1, `speed ${s.speedOverGround}`);
  assert.ok(s.groundingDamageMJ > 0 && v.forces(shelf).clearanceM <= 0.05);
});

test('grounding: a rising tide floats the ship free, and astern oars take it off', () => {
  const v = createVessel({ ship: galley, analysis: yAn, rudder: { x: 0.5, areaM2: 1.5 }, oars: [{ id: 'P', side: 'port', rowers: 50, x: 18 }, { id: 'S', side: 'starboard', rowers: 50, x: 18 }] });
  v.state.u = 3;
  const tide = { v: 0 }, env = { depth: (x, y) => (y < 100 ? 10 : 10 - (y - 100) * 0.1) + tide.v };
  v.setAllOarEffort(0.5); v.run(80, 0.1, env);
  assert.equal(v.snapshot().aground, true);
  tide.v = 3; v.setAllOarEffort(-1); v.run(40, 0.1, env);
  const s = v.snapshot();
  assert.equal(s.aground, false); assert.ok(v.takeEvents().some((e) => e.type === 'refloated'));
  assert.ok(s.u < 0, `moving astern ${s.u}`);
});

test('anchor and oar inputs are validated', () => {
  assert.throws(() => createVessel({ ship: galley, analysis: yAn, oars: [{ id: 'x', side: 'up', rowers: 1 }] }), /oar bank/);
  assert.throws(() => mkGalley().setOarEffort('nope', 1), /unknown oar bank/);
});
