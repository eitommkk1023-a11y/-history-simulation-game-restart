import test from 'node:test';
import assert from 'node:assert/strict';
import { createShip, analyzeHydrostatics, createVessel, createCaptain, createFleet } from '../src/ship/index.mjs';
import { sampleDesigns as D } from '../src/ship/samples.mjs';

const mk = (design = 'galleon', sailType, extra = {}) => {
  const d = D[design], ship = createShip({ id: design, hull: d.hull, massItems: d.massItems }), analysis = analyzeHydrostatics(ship);
  const sails = sailType ? [{ ...d.sails[0], type: sailType }] : d.sails;
  return createVessel({ ship, analysis, rudder: d.rudder, sails, oars: d.oars ?? [], windageAreaM2: d.windageAreaM2, ...d.tuning, ...extra });
};
// Run vessel + captain together: physics at 0.1 s, captain every 0.5 s.
function sail(v, c, env, seconds, until = () => false) {
  let t = 0; for (; t < seconds && !until(); t += 0.5) { for (let i = 0; i < 5; i++) v.step(0.1, env); c.update(env, 0.5); } return t;
}
const open = (extra = {}) => ({ wind: { x: 0, y: -10 }, depth: 60, ...extra });
const dist = (v, d) => Math.hypot(v.state.X - d.X, v.state.Y - d.Y);

test('captain: sails downwind to the destination, anchors and stops', () => {
  const v = mk('galleon', 'foreAndAft'); v.state.u = 2; const env = open(), c = createCaptain(v), dest = { X: 0, Y: -1500 };
  assert.equal(c.setDestination(env, dest).status, 'ok');
  sail(v, c, env, 3000, () => c.mode === 'arrived');
  assert.equal(c.mode, 'arrived'); assert.ok(dist(v, dest) < 250, `distance ${dist(v, dest)}`);
  assert.equal(v.snapshot().anchored, true);
  assert.ok(c.takeEvents().some((e) => e.type === 'captain_arrived'));
});

test('captain: a fore-and-aft ship beats to windward by tacking', () => {
  const v = mk('galleon', 'foreAndAft'); v.state.u = 2; const env = open(), c = createCaptain(v), dest = { X: 0, Y: 1000 };
  c.setDestination(env, dest);
  sail(v, c, env, 3000, () => c.mode === 'arrived');
  assert.equal(c.mode, 'arrived'); assert.ok(dist(v, dest) < 250, `distance ${dist(v, dest)}`);
  const tacks = c.takeEvents().filter((e) => e.type === 'captain_tack').length;
  assert.ok(tacks >= 1, `tacks ${tacks}`);
});

test('captain: a square-rigged ship makes (slow) headway to windward by wearing', () => {
  const v = mk('galleon', 'square'); v.state.u = 2; const env = open(), c = createCaptain(v);
  c.setDestination(env, { X: 0, Y: 2500 });
  sail(v, c, env, 4000);
  assert.ok(v.state.Y > 400, `northing ${v.state.Y}`);
  assert.ok(Math.hypot(v.state.X, v.state.Y) < 6000);
});

test('captain: routes around an island and never touches the bottom', () => {
  // Shallow disc (radius 400 m) centred between start and destination; wind from the east (crosswind).
  const depth = (X, Y) => (Math.hypot(X, Y + 800) < 400 ? 2 : 60);
  const v = mk('galleon', 'foreAndAft'); v.state.u = 2; v.state.psi = Math.PI; const env = open({ wind: { x: -10, y: 0 }, depth }), c = createCaptain(v);
  const r = c.setDestination(env, { X: 0, Y: -1600 }); assert.equal(r.status, 'ok'); assert.ok(r.waypoints.length >= 2, 'goes around');
  let maxX = 0; sail(v, c, env, 3000, () => { maxX = Math.max(maxX, Math.abs(v.state.X)); return c.mode === 'arrived'; });
  assert.equal(c.mode, 'arrived'); assert.ok(maxX > 300, `detour ${maxX}`);
  assert.equal(v.snapshot().groundingDamageMJ, 0); assert.equal(v.snapshot().aground, false);
});

test('captain: refuses impossible destinations with a reason', () => {
  const v = mk('galleon', 'foreAndAft'), c = createCaptain(v);
  assert.deepEqual(c.setDestination({ depth: (X, Y) => (Y < -500 ? 1 : 60), wind: { x: 0, y: 0 } }, { X: 0, Y: -800 }), { status: 'no_route', reason: 'destination_too_shallow' });
  assert.equal(c.mode, 'idle');
  // Destination in a lagoon enclosed by shallows.
  const ring = (X, Y) => { const d = Math.hypot(X, Y + 1200); return d > 200 && d < 400 ? 1 : 60; };
  const r = c.setDestination({ depth: ring, wind: { x: 0, y: 0 } }, { X: 0, Y: -1200 });
  assert.equal(r.status, 'no_route'); assert.equal(r.reason, 'blocked');
  assert.throws(() => c.setDestination({}, { X: NaN, Y: 0 }), /finite/);
});

test('captain: a galley rows to the destination, saves stamina, and anchors', () => {
  const v = mk('galley'); const env = { wind: { x: 0, y: 0 }, depth: 30 }, c = createCaptain(v), dest = { X: 1200, Y: 900 };
  assert.equal(c.setDestination(env, dest).status, 'ok');
  sail(v, c, env, 3000, () => c.mode === 'arrived');
  assert.equal(c.mode, 'arrived'); assert.ok(dist(v, dest) < 250, `distance ${dist(v, dest)}`);
  assert.ok(v.snapshot().stamina > 0.2, 'not rowed to exhaustion');
});

test('captain: reefs in a strong wind instead of being overpowered', () => {
  const v = mk('galleon', 'foreAndAft'); v.state.u = 3; const env = open({ wind: { x: 24, y: 0 } }), c = createCaptain(v);
  c.setDestination(env, { X: 0, Y: 4000 });
  sail(v, c, env, 600);
  assert.ok(c.takeEvents().some((e) => e.type === 'captain_reef')); assert.ok(c.reef < 1);
  assert.ok(Math.abs(v.snapshot().heelDeg) < 25);
});

test('captain: saved and restored in the fleet, the voyage continues identically', () => {
  const build = () => { const f = createFleet(); f.registerDesign('galleon', D.galleon); return f; };
  const env = open(), f = build(); const id = f.addShip({ designId: 'galleon', headingDeg: 180 });
  f.get(id).vessel.state.u = 2; assert.equal(f.setDestination(id, env, { X: 100, Y: -2000 }).status, 'ok');
  for (let i = 0; i < 120; i++) f.step(1, env, { X: 0, Y: 0 });
  const g = build(); g.restore(JSON.parse(JSON.stringify(f.serialize())));
  for (let i = 0; i < 120; i++) { f.step(1, env, { X: 0, Y: 0 }); g.step(1, env, { X: 0, Y: 0 }); }
  const a = f.get(id).vessel.snapshot(), b = g.get(id).vessel.snapshot();
  for (const k of ['x', 'y', 'headingDeg', 'u']) assert.ok(Math.abs(a[k] - b[k]) < 1e-6, k);
  assert.equal(g.get(id).captain.mode, f.get(id).captain.mode);
});

test('captain: the Pinta 1492 (mostly square rig) sails a downwind leg and arrives', () => {
  const d = D['pinta-1492'], ship = createShip({ id: 'p', hull: d.hull, massItems: d.massItems }), analysis = analyzeHydrostatics(ship);
  const v = createVessel({ ship, analysis, rudder: d.rudder, sails: d.sails.map((s) => ({ ...s })), windageAreaM2: d.windageAreaM2, ...d.tuning });
  v.state.u = 2; v.state.psi = Math.PI; const env = open(), c = createCaptain(v), dest = { X: 100, Y: -1400 };
  assert.equal(c.setDestination(env, dest).status, 'ok');
  sail(v, c, env, 3000, () => c.mode === 'arrived');
  assert.equal(c.mode, 'arrived'); assert.ok(dist(v, dest) < 250, `distance ${dist(v, dest)}`);
});
