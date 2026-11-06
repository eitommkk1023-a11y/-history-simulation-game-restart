import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindField, beaufort } from '../src/ship/wind-field.mjs';

// land: a flat island for X > 0 (height 40 m); sea elsewhere. Base wind: from the east (blows west), 6 m/s.
const elev = (X) => (X > 0 ? 40 : -20);
let day = 0.5; // midday
const mk = (o = {}) => createWindField({ baseWind: () => ({ x: -6, y: 0 }), elev, dayAt: () => day, seed: 7, params: { stormChance: 0, calmChance: 0, ...o } });

test('open sea far from land equals the base wind', () => {
  const f = mk(); const w = f.wind(-50000, 0); assert.ok(Math.abs(w.x + 6) < 1e-9 && Math.abs(w.y) < 1e-9);
});
test('daytime breeze blows toward land, night breeze away', () => {
  const f = mk({ shelterMin: 1 }); // isolate the breeze: no shelter
  day = 0.5; const d = f.info(-200, 0).breeze; day = 0.0; const n = f.info(-200, 0).breeze; day = 0.5;
  assert.ok(d > 0 && n < 0 && Math.abs(d) <= 2.5 + 1e-9);
});
test('wind is weaker in the lee of high land and recovers far downwind', () => {
  const f = mk({ breezeMax: 0 }); // wind blows west; land is east, so a spot just west of the shore is in the lee
  const near = f.info(0.5, 0), open = f.info(-50000, 0); // on the shore line, upwind land begins right there
  const lee = createWindField({ baseWind: () => ({ x: -6, y: 0 }), elev: (X) => (X > 0 && X < 300 ? 40 : -20), dayAt: () => 0.5, seed: 7, params: { breezeMax: 0, stormChance: 0, calmChance: 0 } });
  const behind = lee.info(-50, 0).speed, far = lee.info(-5000, 0).speed;
  assert.ok(behind < 6 && behind >= 6 * 0.35 - 1e-9, `behind=${behind}`); assert.ok(Math.abs(far - 6) < 1e-6); assert.ok(open.shelter === 1 && near.shelter <= 1);
});
test('same place and time always give the same wind (deterministic)', () => {
  const a = mk({ stormChance: 0.5, calmChance: 0.5 }), b = mk({ stormChance: 0.5, calmChance: 0.5 });
  for (const [X, Y] of [[-40000, 1000], [-120000, -50000], [-33000, 90000]]) assert.deepEqual(a.wind(X, Y), b.wind(X, Y));
});
test('storms are strong, localised and not everywhere', () => {
  const f = mk({ stormChance: 0.6, calmChance: 0 }); let stormy = 0, total = 0, maxS = 0;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) { const r = f.info(-100000 - i * 5000, j * 5000 - 100000); total++; if (r.storm > 0.5) stormy++; maxS = Math.max(maxS, r.speed); }
  assert.ok(stormy > 0 && stormy < total * 0.5, `stormy ${stormy}/${total}`); assert.ok(maxS >= 14, `max ${maxS}`);
});
test('calms reduce the wind', () => {
  const f = mk({ stormChance: 0, calmChance: 1 }); let min = 99; day = 1; // mid-event: full strength
  for (let i = 0; i < 300; i++) min = Math.min(min, f.info(-100000 - i * 1000, 0).speed); day = 0.5; assert.ok(min < 3, `min ${min}`);
});
test('Beaufort scale', () => { assert.equal(beaufort(0), 0); assert.equal(beaufort(4.5), 3); assert.equal(beaufort(20), 8); assert.equal(beaufort(40), 12); });
