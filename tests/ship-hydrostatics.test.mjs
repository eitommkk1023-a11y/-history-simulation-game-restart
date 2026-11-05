import test from 'node:test';
import assert from 'node:assert/strict';
import { createHull, createShip, withMassItems, computeMassProperties, analyzeHydrostatics, WATER_DENSITY } from '../src/ship/index.mjs';
import { boxBarge, galleonLikeHull, galleonLikeMassItems } from '../src/ship/samples.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);
// Box 20 x 6 x 4 m. 246,000 kg in seawater -> 240 m^3 -> draft 2.0 m.
const box = (items, openings) => createShip({ id: 'box', hull: boxBarge(), massItems: items, openings });
const boxMass = (o = {}) => [{ id: 'all', massKg: 246000, x: 10, y: 0, z: 2, ...o }];

test('mass properties combine items and reject duplicate ids', () => {
  const mp = computeMassProperties([{ id: 'a', massKg: 1, x: 0, y: 0, z: 0 }, { id: 'b', massKg: 3, x: 4, y: 0, z: 2 }]);
  assert.equal(mp.massKg, 4); assert.deepEqual(mp.cg, { x: 3, y: 0, z: 1.5 });
  assert.throws(() => computeMassProperties([{ id: 'a', massKg: 1, x: 0, y: 0, z: 0 }, { id: 'a', massKg: 1, x: 0, y: 0, z: 0 }]), /duplicate/);
});

test('hull validation rejects unsorted stations and negative breadth', () => {
  const p = [{ z: 0, b: 1 }, { z: 1, b: 1 }];
  assert.throws(() => createHull({ stations: [{ x: 5, points: p }, { x: 1, points: p }] }), /increasing x/);
  assert.throws(() => createHull({ stations: [{ x: 0, points: [{ z: 0, b: -1 }, { z: 1, b: 1 }] }, { x: 1, points: p }] }), />= 0/);
});

test('box barge upright hydrostatics match analytic values', () => {
  const r = analyzeHydrostatics(box(boxMass()));
  assert.equal(r.status, 'ok');
  near(r.hullVolume, 480, 1e-9, 'hull volume');
  near(r.upright.draftMid, 2, 1e-6, 'draft'); near(r.upright.trimDeg, 0, 1e-6, 'trim');
  near(r.upright.KB, 1, 1e-6, 'KB'); near(r.upright.BM, 1.5, 1e-6, 'BM'); near(r.upright.GM, 0.5, 1e-6, 'GM');
});

test('fresh water gives a deeper draft than sea water', () => {
  const r = analyzeHydrostatics(box(boxMass()), { waterDensity: WATER_DENSITY.freshwater, heelAnglesDeg: [0] });
  near(r.upright.draftMid, 2.05, 1e-6, 'fresh draft');
});

test('GZ follows the wall-sided formula before deck-edge immersion', () => {
  const r = analyzeHydrostatics(box(boxMass()), { heelAnglesDeg: [0, 10, 20] });
  for (const p of r.gzCurve) {
    const f = p.heelDeg * Math.PI / 180;
    near(p.gz, Math.sin(f) * (0.5 + 0.75 * Math.tan(f) ** 2), 1e-6, `GZ at ${p.heelDeg}`);
  }
});

test('forward CG trims the bow down', () => {
  const r = analyzeHydrostatics(box(boxMass({ x: 11 })), { heelAnglesDeg: [0] });
  assert.ok(r.upright.trimDeg > 0 && r.upright.draftFore > r.upright.draftAft);
  // B and G lie on the same earth-vertical line: xB - xG = tan(trim) * (KG - KB)
  const u = r.upright, t = Math.tan(u.trimDeg * Math.PI / 180);
  near(u.LCB, 11 + t * (u.KG - u.KB), 1e-6, 'B vertically under G');
});

test('off-centre CG produces a static heel toward that side', () => {
  const r = analyzeHydrostatics(box(boxMass({ y: 0.05 })), { heelAnglesDeg: [0] });
  // wall-sided: tan(phi) * (GM + BM/2 tan^2 phi) = yG  ->  phi ~ 5.63 deg
  const t = Math.tan(r.staticHeelDeg * Math.PI / 180);
  near(t * (0.5 + 0.75 * t * t), 0.05, 1e-6, 'static heel balance');
  assert.ok(r.staticHeelDeg > 5.5 && r.staticHeelDeg < 5.8);
});

test('opening downflooding angle is detected on the immersed side only', () => {
  const r = analyzeHydrostatics(box(boxMass(), [{ id: 'stb-port', x: 10, y: 2.9, z: 3.5 }, { id: 'port-port', x: 10, y: -2.9, z: 3.5 }]));
  near(r.downflooding[0].downfloodingAngleDeg, Math.atan(1.5 / 2.9) * 180 / Math.PI, 0.2, 'starboard opening');
  assert.equal(r.downflooding[1].downfloodingAngleDeg, null);
});

test('overloaded hull reports insufficient buoyancy instead of a draft', () => {
  const r = analyzeHydrostatics(box([{ id: 'all', massKg: 500 * 1025, x: 10, y: 0, z: 2 }]));
  assert.equal(r.status, 'insufficient_buoyancy');
});

test('galleon-like prototype floats sensibly; raising gun weight reduces stability', () => {
  const low = createShip({ id: 'g1', hull: galleonLikeHull(), massItems: galleonLikeMassItems() });
  const a = analyzeHydrostatics(low);
  assert.equal(a.status, 'ok');
  assert.ok(a.upright.draftMid > 2 && a.upright.draftMid < 6, `draft ${a.upright.draftMid}`);
  assert.ok(a.upright.GM > 0, `GM ${a.upright.GM}`);
  assert.ok(a.gzCurve.find((p) => p.heelDeg === 30).gz > 0);
  const b = analyzeHydrostatics(withMassItems(low, galleonLikeMassItems({ gunZ: 10 })));
  assert.ok(b.upright.GM < a.upright.GM && b.summary.maxGz < a.summary.maxGz);
});
