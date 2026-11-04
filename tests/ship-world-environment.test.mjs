import test from 'node:test';
import assert from 'node:assert/strict';
import { createShip, analyzeHydrostatics, createVessel, createWorldEnvironment } from '../src/ship/index.mjs';
import { galleonLikeHull, galleonLikeMassItems } from '../src/ship/samples.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);
// 8 x 8 block world, climate grid step 4 -> 2 x 2 cells. Block size 100 m so numbers stay small.
const W = 8, H = 8, STEP = 4, GW = 2, GH = 2, CN = GW * GH;
function fixture({ dir = 0, speed = 100 } = {}) {
  const elev = new Float32Array(W * H).fill(-100), type = new Uint8Array(W * H);
  const windDir = new Uint8Array(12 * CN).fill(dir), windSpeed = new Uint8Array(12 * CN).fill(speed);
  const currentU = new Int16Array(CN).fill(150), currentV = new Int16Array(CN).fill(-50);
  return { elev, type, climate: { cell: { gridStep: STEP, gridW: GW, gridH: GH, windDir, windSpeed, currentU, currentV } } };
}
const env = (world, o = {}) => createWorldEnvironment(world, { origin: { x: 4, y: 4 }, width: W, height: H, blockM: 100, ...o });

test('wind direction convention: from north blows south, from east blows west', () => {
  for (const [dir, ex, ey] of [[0, 0, -10], [64, -10, 0], [128, 0, 10], [192, 10, 0]]) {
    const w = env(fixture({ dir })).wind(0, 0, 0);
    near(w.x, ex, 1e-9, `dir ${dir} x`); near(w.y, ey, 1e-9, `dir ${dir} y`);
  }
});

test('current is converted from cm/s, east/north, and is zero on land', () => {
  const world = fixture(); world.type[4 * W + 4] = 1; // block (4,4) is land
  const e = env(world);
  assert.deepEqual(e.current(-250, 250), { x: 1.5, y: -0.5 }); // a sea block
  assert.deepEqual(e.current(50, -50), { x: 0, y: 0 });        // ship (50,-50) -> block (4.5, 4.5): land
});

test('north is up: ship +Y maps to smaller block y, and the mapping round-trips', () => {
  const e = env(fixture());
  assert.deepEqual(e.toBlock(0, 100), { x: 4, y: 3 });
  const p = e.toShip(2.5, 6.25), b = e.toBlock(p.X, p.Y);
  near(b.x, 2.5, 1e-9); near(b.y, 6.25, 1e-9);
});

test('depth: sea depth is -elevation, land is 0, bilinear between blocks, edges clamp', () => {
  const world = fixture();
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) world.elev[y * W + x] = -10 * (y + 1); // deeper to the south
  const e = env(world);
  near(e.depth(0, 0), 40 + 5, 1e-6, 'between rows 3 and 4 at block y = 4 -> (-40 + -50)/2 -> 45');
  assert.ok(e.depth(0, 300) < e.depth(0, -300), 'north (Y+) is shallower');
  near(e.depth(0, 1e6), 10, 1e-6, 'clamped at the north edge');
  world.type[4 * W + 4] = 1; world.elev[4 * W + 4] = 20;
  assert.equal(env(world).depth(50, -50), 0);
});

test('wind blends between months around mid-month and wraps December to January', () => {
  const world = fixture({ dir: 0, speed: 100 });
  for (let k = 0; k < CN; k++) { world.climate.cell.windSpeed[k] = 100; world.climate.cell.windSpeed[1 * CN + k] = 200; world.climate.cell.windSpeed[11 * CN + k] = 50; }
  const at = (day) => Math.hypot(...Object.values(env(world, { dayAt: () => day }).wind(0, 0, 0)));
  near(at(15), 10, 1e-9, 'mid January'); near(at(45), 20, 1e-9, 'mid February');
  near(at(30), 15, 1e-9, 'end of January is halfway'); near(at(360 + 15), 10, 1e-9, 'next year');
  near(at(0), 7.5, 1e-9, 'Jan 1 blends with December (5 and 10)');
});

test('wind is bilinear across climate cells', () => {
  const world = fixture({ dir: 0, speed: 100 });
  world.climate.cell.windSpeed[1] = 200; // cell (1,0) in month 0 is stronger
  const e = env(world, { dayAt: () => 15 });
  near(Math.hypot(...Object.values(e.wind(-200, 200, 0))), 10, 1e-9, 'centre of cell (0,0)');
  near(Math.hypot(...Object.values(e.wind(0, 200, 0))), 15, 1e-9, 'half way to cell (1,0)');
});

test('the environment drives a vessel: northerly wind pushes a windy hulk south; shallow water grounds it', () => {
  const ship = createShip({ id: 'g', hull: galleonLikeHull(), massItems: galleonLikeMassItems() });
  const analysis = analyzeHydrostatics(ship);
  const e = env(fixture({ dir: 0, speed: 100 }), { dayAt: () => 15 });
  const v = createVessel({ ship, analysis, windageAreaM2: 300 });
  v.run(120, 0.1, e);
  assert.ok(v.snapshot().y < -5, `drifted south, y=${v.snapshot().y}`);
  const shallow = fixture({ dir: 0, speed: 100 }); shallow.elev.fill(-2);
  const s = createVessel({ ship, analysis, windageAreaM2: 300 });
  s.run(5, 0.1, env(shallow, { dayAt: () => 15 }));
  assert.equal(s.snapshot().aground, true);
});

test('invalid world data is rejected', () => {
  const ok = fixture();
  assert.throws(() => createWorldEnvironment(ok, { width: W, height: H }), /origin/);
  assert.throws(() => env({ ...ok, elev: new Float32Array(3) }), /cells/);
  assert.throws(() => env({ ...ok, climate: undefined }), /climate/);
  const bad = fixture(); bad.climate.cell.windDir = new Uint8Array(5);
  assert.throws(() => env(bad), /windDir/);
});
