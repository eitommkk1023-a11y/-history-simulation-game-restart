import test from 'node:test';
import assert from 'node:assert/strict';
import { createShip, analyzeHydrostatics, createVessel } from '../src/ship/index.mjs';
import { sampleDesigns } from '../src/ship/samples.mjs';
import { measure } from '../tools/ship-calibration.mjs';

// ROUGH reference ranges for a ~900 t galleon-like ship in a 10 m/s (about 19 kt) wind and a 170-oar galley.
// They are the author's order-of-magnitude estimates from general knowledge of historical sailing and rowing
// performance, NOT sourced measurements. Replace with documented figures when available.
const table = measure({}, { headings: [40, 60, 80, 90, 130, 180], seconds: 300 });
const by = (rows, h) => rows.find((r) => r.h === h);
const inRange = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what}: ${v.toFixed(2)} not in [${lo}, ${hi}]`);

test('galleon, square rig: reaching and running speeds are those of a full-bodied sailing ship', () => {
  for (const h of [80, 90, 130]) inRange(by(table.square, h).kt, 5.5, 8.5, `square reach ${h} deg`);
  inRange(by(table.square, 180).kt, 4, 8, 'square running');
});

test('galleon, square rig: cannot make way to windward close to the wind; modest VMG when braced up', () => {
  assert.ok(by(table.square, 40).vmg < 0, `VMG at 40 deg ${by(table.square, 40).vmg}`);
  inRange(by(table.square, 60).vmg, 0.3, 1.8, 'square VMG at 60 deg');
  inRange(by(table.square, 60).leeway, 4, 12, 'square leeway at 60 deg');
});

test('galleon, fore-and-aft rig: points higher than a square rig, with real leeway and some heel', () => {
  const best = Math.max(...table.foreAndAft.filter((r) => r.h <= 60).map((r) => r.vmg));
  inRange(best, 1.0, 3.0, 'fore-and-aft best VMG');
  assert.ok(best > Math.max(...table.square.filter((r) => r.h <= 60).map((r) => r.vmg)), 'higher than square');
  inRange(by(table.foreAndAft, 60).leeway, 4, 12, 'leeway at 60 deg');
  inRange(by(table.foreAndAft, 80).heel, 2, 10, 'heel on a close reach');
});

test('galley (170 rowers): sustained and burst speeds, fatigue, and turning', () => {
  const d = sampleDesigns.galley, ship = createShip({ id: 'g', hull: d.hull, massItems: d.massItems }), analysis = analyzeHydrostatics(ship);
  const make = () => createVessel({ ship, analysis, rudder: d.rudder, oars: d.oars, windageAreaM2: d.windageAreaM2, ...d.tuning });
  const v = make(); v.setAllOarEffort(0.7); v.run(120, 0.1, {}, { heading: 0 });
  const early = v.snapshot().speedOverGround * 1.9438; inRange(early, 4.5, 7.5, 'speed after 2 min at 70% effort');
  v.run(480, 0.1, {}, { heading: 0 });
  const late = v.snapshot().speedOverGround * 1.9438; inRange(late, 4, 6.5, 'speed after 10 min'); assert.ok(late < early, 'fatigue');
  const t = make(); t.setAllOarEffort(0.7); t.run(60, 0.1, {}, { heading: 0 }); t.setRudder(35); t.run(40, 0.1, {});
  const s = t.snapshot(), radius = Math.hypot(s.u, s.v) / (s.yawRateDegS * Math.PI / 180);
  inRange(radius, 0.8 * 36, 3 * 36, 'turning radius (m)');
});

// Pinta 1492 (research_compact_1690 hull, level D rig). These are SANITY bounds on model output, not historical
// performance: the sources give no reliable speed data and distances in the log must not be converted to knots mechanically.
import { measureDesign } from '../tools/ship-calibration.mjs';
const sq = measureDesign('pinta-1492', { headings: [40, 60, 90, 130, 180], seconds: 300 }), lat = measureDesign('pinta-1492-lateen', { headings: [40, 60, 90, 130, 180], seconds: 300 });
const at = (rows, h) => rows.find((r) => r.h === h);

test('Pinta 1492: model output is finite and in a plausible band for a small ship in a 10 m/s wind', () => {
  for (const rows of [sq, lat]) for (const r of rows) { assert.ok(Number.isFinite(r.kt) && r.kt > 1.5 && r.kt < 9, `speed ${r.kt} at ${r.h}`); assert.ok(r.heel < 15); }
});

test('Pinta 1492: the square-sail preset cannot make way close to the wind; the lateen hypothesis can', () => {
  assert.ok(at(sq, 40).vmg < 0, `square VMG at 40 deg ${at(sq, 40).vmg}`);
  assert.ok(at(lat, 40).vmg > 0.3, `lateen VMG at 40 deg ${at(lat, 40).vmg}`);
  assert.ok(at(sq, 60).leeway > 3 && at(lat, 40).leeway > 3, 'real leeway, not a keel-boat');
});
