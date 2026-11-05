import test from 'node:test';
import assert from 'node:assert/strict';
import { createShip, analyzeHydrostatics, createVessel, heelFromMoment } from '../src/ship/index.mjs';
import { galleonLikeHull, galleonLikeMassItems } from '../src/ship/samples.mjs';

const ship = createShip({ id: 'g', hull: galleonLikeHull(), massItems: galleonLikeMassItems() });
const analysis = analyzeHydrostatics(ship);
const mk = (sails = [{ id: 's', type: 'foreAndAft', areaM2: 500, x: 21, zCe: 12 }], extra = {}) =>
  createVessel({ ship, analysis, rudder: { x: 0.5, areaM2: 6 }, sails, ...extra });
const northWind = { wind: { x: 0, y: -10 } }; // blowing toward the south = wind FROM the north
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);
const sailAt = (type, headingDeg, seconds = 300) => {
  const v = mk([{ id: 's', type, areaM2: 500, x: 21, zCe: 12 }]);
  v.state.psi = headingDeg * Math.PI / 180; v.state.u = 2;
  v.run(seconds, 0.1, northWind, { trim: true, heading: headingDeg });
  return v.snapshot();
};

test('derived hull parameters are sane', () => {
  const p = mk().params;
  near(p.waterlineLengthM, 40, 0.6, 'Lwl'); assert.ok(p.wettedAreaM2 > 300 && p.lateralAreaM2 > 100);
  assert.ok(p.clrX > 10 && p.clrX < 30);
});

test('without wind a moving hull only slows down, straight, never reversing', () => {
  const v = mk([]); v.state.u = 4;
  let prev = 4;
  for (let i = 0; i < 2000; i++) { v.step(0.1, {}); const u = v.state.u; assert.ok(u <= prev + 1e-12 && u >= 0); prev = u; }
  const s = v.snapshot();
  assert.ok(s.u < 4 && s.u > 0.5);
  near(s.x, 0, 1e-6, 'no sideways drift'); near(s.headingDeg % 360, 0, 1e-6, 'heading kept'); assert.ok(s.y > 100);
});

test('a fore-and-aft rig makes headway to windward; a square rig cannot at the same heading', () => {
  const fa = sailAt('foreAndAft', 30), sq = sailAt('square', 30);
  assert.ok(fa.velocity.y > 1, `fore-and-aft northward ${fa.velocity.y}`);
  assert.ok(sq.velocity.y < 0.3, `square northward ${sq.velocity.y}`);
});

test('running before the wind is slower than the wind and positive', () => {
  const s = sailAt('square', 180, 400);
  assert.ok(s.speedOverGround > 2 && s.speedOverGround < 10, `speed ${s.speedOverGround}`);
});

test('rudder: starboard helm turns to starboard, port helm to port, no helm keeps heading', () => {
  const turn = (deg) => { const v = mk([]); v.state.u = 4; v.setRudder(deg); v.run(120, 0.1, {}); return v.snapshot(); };
  const stb = turn(20), port = turn(-20), none = turn(0);
  assert.ok(stb.yawRateDegS > 0.5 && port.yawRateDegS < -0.5, `${stb.yawRateDegS} ${port.yawRateDegS}`);
  near(stb.yawRateDegS, -port.yawRateDegS, 1e-6, 'symmetry');
  near(none.yawRateDegS, 0, 1e-9, 'straight');
  const radius = Math.hypot(stb.u, stb.v) / (stb.yawRateDegS * Math.PI / 180);
  assert.ok(radius > 1 * 40 && radius < 8 * 40, `turning radius ${radius} m`);
});

test('beam wind heels away from the wind; sign follows the side', () => {
  const heelWith = (wx) => { const v = mk(); v.setSailTrim('s', 60); v.run(60, 0.1, { wind: { x: wx, y: 0 } }, { heading: 0 }); return v.snapshot().heelDeg; };
  assert.ok(heelWith(10) > 0.5, 'wind from port pushes to starboard: starboard down (+)');
  near(heelWith(-10), -heelWith(10), 0.3, 'mirror');
  assert.ok(Math.abs(heelWith(16)) > Math.abs(heelWith(8)));
});

test('an enormous rig is flagged overpowered', () => {
  const v = mk([{ id: 's', type: 'foreAndAft', areaM2: 8000, x: 21, zCe: 12 }]);
  v.setSailTrim('s', 60); v.run(0.5, 0.1, { wind: { x: 25, y: 0 } }, { heading: 0 }); // before the ship gathers speed
  assert.equal(v.snapshot().overpowered, true);
});

test('heelFromMoment follows the GZ curve and caps at its peak', () => {
  const g = analysis.mass.massKg * 9.80665;
  const h = heelFromMoment(analysis, g * analysis.upright.GM * Math.sin(5 * Math.PI / 180));
  assert.ok(h.heelDeg > 4 && h.heelDeg < 6.5 && !h.overpowered, `${h.heelDeg}`);
  const big = heelFromMoment(analysis, -1e12);
  assert.equal(big.overpowered, true); assert.ok(big.heelDeg < 0);
});

test('reefing a sail halves its force', () => {
  const v = mk(); v.setSailTrim('s', 60);
  const full = v.forces({ wind: { x: 10, y: 0 } }).sailForceN[1];
  v.setSailDeployed('s', 0.5);
  near(v.forces({ wind: { x: 10, y: 0 } }).sailForceN[1] / full, 0.5, 1e-9, 'reef ratio');
});

test('a current carries an unpowered ship at the current velocity', () => {
  const v = mk([]); v.run(1500, 0.1, { current: { x: 1, y: 0 } });
  const s = v.snapshot();
  near(s.velocity.x, 1, 0.05, 'drift east'); near(s.velocity.y, 0, 0.05, 'no north drift');
});

test('the simulation is deterministic and finite', () => {
  const a = sailAt('foreAndAft', 60, 100), b = sailAt('foreAndAft', 60, 100);
  assert.deepEqual(a, b);
  for (const k of ['x', 'y', 'u', 'v', 'yawRateDegS', 'heelDeg']) assert.ok(Number.isFinite(a[k]), k);
});

test('invalid sail definitions are rejected', () => {
  assert.throws(() => mk([{ id: 'a', type: 'nope', areaM2: 1, x: 1, zCe: 1 }]), /unknown sail type/);
  assert.throws(() => mk([{ id: 'a', areaM2: 1, x: 1, zCe: 1 }, { id: 'a', areaM2: 1, x: 1, zCe: 1 }]), /duplicate sail/);
  assert.throws(() => mk().setSailTrim('x', 1), /unknown sail/);
});
