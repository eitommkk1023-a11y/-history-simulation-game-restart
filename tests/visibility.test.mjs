import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisibility } from '../src/ship/visibility.mjs';

const mk = (wx, o = {}) => createVisibility({ weatherAt: () => wx, windAt: () => ({ speed: o.wind ?? 6 }), dayAt: () => o.day ?? 0.5, seed: 5, params: o.params });
test('clear weather gives the horizon-limited maximum', () => { assert.equal(mk({ P: 0, cloud: 0, storm: 0 }).info(0, 0).visM, 20000); });
test('rain reduces visibility, heavier rain more', () => {
  const a = mk({ P: 5, cloud: 0.8, storm: 0 }).info(0, 0).visM, b = mk({ P: 60, cloud: 1, storm: 0 }).info(0, 0).visM; assert.ok(a < 20000 && b < a && b < 1500, `${a} ${b}`);
});
test('storm darkens the light and reduces visibility further', () => {
  const r = mk({ P: 60, cloud: 1, storm: 0 }).info(0, 0), s = mk({ P: 60, cloud: 1, storm: 1 }).info(0, 0); assert.ok(s.visM < r.visM && s.dim < r.dim && s.dim < 0.2);
});
test('sea fog needs light wind and the morning, and is local', () => {
  const v = (day, wind, X) => mk({ P: 0, cloud: 0, storm: 0 }, { day, wind, params: { fogChance: 1 } }).info(X, 0);
  const xs = Array.from({ length: 200 }, (_, i) => i * 1000), foggy = xs.filter((X) => v(0.3, 1, X).fog > 0.2);
  assert.ok(foggy.length > 20 && foggy.length < 200, `foggy ${foggy.length}/200`); assert.ok(v(0.3, 1, foggy[0]).visM < 20000);
  assert.ok(xs.every((X) => v(0.3, 8, X).fog === 0), 'strong wind: none'); assert.ok(xs.every((X) => v(0.8, 1, X).fog === 0), 'afternoon: none');
});
test('deterministic', () => { const a = mk({ P: 3, cloud: 0.5, storm: 0 }, { params: { fogChance: 0.5 }, day: 0.3, wind: 1 }), b = mk({ P: 3, cloud: 0.5, storm: 0 }, { params: { fogChance: 0.5 }, day: 0.3, wind: 1 }); assert.deepEqual(a.info(1234, -4321), b.info(1234, -4321)); });
