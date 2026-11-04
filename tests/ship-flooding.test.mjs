import test from 'node:test';
import assert from 'node:assert/strict';
import { createShip, createFloodingModel, analyzeHydrostatics } from '../src/ship/index.mjs';
import { boxBarge } from '../src/ship/samples.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);
const barge = (items = [{ id: 'all', massKg: 246000, x: 10, y: 0, z: 2 }]) => createShip({ id: 'b', hull: boxBarge(), massItems: items });
// Centred compartment 4 m x 6 m on the floor of the 20 x 6 x 4 m barge (floor area 24 m^2).
const centre = { id: 'c', box: { x0: 8, x1: 12, y0: -3, y1: 3, z0: 0, z1: 4 } };
const hole = (o = {}) => ({ id: 'h', from: 'sea', to: 'c', x: 10, y: 0, z: 0.05, areaM2: 0.02, ...o });

test('closed compartment takes no water', () => {
  const m = createFloodingModel(barge(), { compartments: [centre], links: [hole({ open: false })] });
  m.run(60);
  assert.equal(m.totalWaterM3(), 0);
});

test('bottom hole: ship settles at the analytic draft with inside level = sea level', () => {
  const m = createFloodingModel(barge(), { compartments: [centre], links: [hole()] });
  m.run(1500, 2);
  const eq = m.equilibrium();
  // d = M0 / (rho (A_waterplane - a)) = 246000 / (1025 * 96) = 2.5 m ; internal volume = 24 * 2.5 = 60 m^3
  near(eq.draftMid, 2.5, 0.02, 'draft');
  near(m.state.water.c, 60, 0.6, 'inside water volume');
  near(eq.levels.c.level, eq.seaLevel, 0.02, 'levels equalise');
  assert.equal(m.state.status, 'afloat');
});

test('water volume is conserved: sea inflow equals tank gain', () => {
  const m = createFloodingModel(barge(), { compartments: [centre], links: [hole()] });
  let inflow = 0;
  for (let i = 0; i < 200; i++) inflow += m.step(0.5).netSeaInflowM3;
  near(m.totalWaterM3(), inflow, 1e-9, 'conservation');
});

test('flooding on one side heels the ship toward that side', () => {
  const side = { id: 's', box: { x0: 8, x1: 12, y0: 1, y1: 3, z0: 0, z1: 4 } };
  const m = createFloodingModel(barge(), { compartments: [side], links: [{ id: 'h', from: 'sea', to: 's', x: 10, y: 2, z: 0.05, areaM2: 0.02 }] });
  m.run(300, 2);
  assert.ok(m.equilibrium().heelDeg > 0.5, `heel ${m.equilibrium().heelDeg}`);
});

test('free surface effect: loose water heels more than the same mass as a fixed weight', () => {
  const wide = { id: 'w', box: { x0: 5, x1: 15, y0: -3, y1: 3, z0: 0, z1: 4 } };
  const items = [{ id: 'all', massKg: 200000, x: 10, y: 0.05, z: 2 }];
  const m = createFloodingModel(barge(items), { compartments: [wide], links: [] });
  m.setWater('w', 20); // 20 m^3 = 20500 kg, mean water height ~0.33 m
  const free = m.equilibrium().heelDeg;
  const w = 20500, tot = 200000 + w;
  const solid = analyzeHydrostatics(barge([{ id: 'dry', massKg: 200000, x: 10, y: 0.05, z: 2 }, { id: 'water', massKg: w, x: 10, y: 0, z: 0.1666667 }]), { heelAnglesDeg: [0] }).staticHeelDeg;
  assert.ok(tot > 0 && free > solid, `free ${free} vs solid ${solid}`);
});

test('a hull flooded through a full-width tank is reported capsized or sunk, never given a draft', () => {
  const big = { id: 'big', box: { x0: 0, x1: 20, y0: -3, y1: 3, z0: 0, z1: 4 } };
  const m = createFloodingModel(barge(), { compartments: [big], links: [{ id: 'h', from: 'sea', to: 'big', x: 10, y: 0, z: 0.05, areaM2: 0.5 }] });
  m.run(600, 1);
  assert.ok(['sunk', 'capsized'].includes(m.state.status), m.state.status);
  assert.equal(m.equilibrium().status === 'ok', false);
});

test('link between compartments moves water without creating any', () => {
  const a = { id: 'a', box: { x0: 0, x1: 4, y0: -3, y1: 3, z0: 0, z1: 4 } }, b = { id: 'b', box: { x0: 4, x1: 8, y0: -3, y1: 3, z0: 0, z1: 4 } };
  const m = createFloodingModel(barge(), { compartments: [a, b], links: [{ id: 'ab', from: 'a', to: 'b', x: 4, y: 0, z: 0.1, areaM2: 0.05 }] });
  m.setWater('a', 24);
  m.run(200, 2);
  near(m.totalWaterM3(), 24, 1e-9, 'total');
  assert.ok(m.state.water.b > 5 && m.state.water.a < 19);
});

test('invalid inputs are rejected', () => {
  assert.throws(() => createFloodingModel(barge(), { compartments: [centre], links: [hole({ to: 'zzz' })] }), /unknown side/);
  assert.throws(() => createFloodingModel(barge(), { compartments: [centre, centre] }), /unique/);
});
