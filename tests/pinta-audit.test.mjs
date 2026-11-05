import test from 'node:test';
import assert from 'node:assert/strict';
import { createHull, createShip, analyzeHydrostatics, createInterior, PINTA_1492_PROFILE as P } from '../src/ship/index.mjs';
import { sampleDesigns } from '../src/ship/samples.mjs';

// M5 audit: anachronism and over-claiming checks, from the spec's quality checklist (section 12).
for (const id of ['pinta-1492', 'pinta-1492-lateen']) {
  const d = sampleDesigns[id];
  test(`audit ${id}: a small three-masted ship with no later-period features`, () => {
    assert.equal(d.sails.length, 3, 'three sails on three masts; no topsails or extra sails');
    assert.ok(d.sails.every((s) => ['square', 'lateen'].includes(s.shape)), 'only square or lateen sails');
    assert.ok(d.sails.every((s) => !s.cross && !s.insignia), 'no sail insignia (unresolved in the sources)');
    assert.ok(!d.visual.flag && !d.visual.bowsprit && !d.visual.cross, 'no flag, bowsprit or cross added without a source');
    assert.ok(!d.massItems.some((m) => /gun|cannon|cannonball|armament/i.test(m.id)), 'no guns: armament is unresolved');
    assert.ok(!d.openings, 'no gun ports');
    const hull = createHull(d.hull); assert.ok(hull.xMax - hull.xMin <= 16.9 + 1e-9, 'not longer than the research overall length');
    assert.ok(Math.max(...d.hull.stations.flatMap((s) => s.points.map((p) => p.z))) <= 2.6 + 1e-9, 'one low hull; no forecastle or tall castles in the hull');
    const it = createInterior(d.interior, { hull }); assert.ok(it.rooms.every((r) => r.use !== 'cabin'), 'no invented captain\'s cabin');
    assert.ok(Math.max(...it.decks.map((x) => x.z)) - 2.6 < 1.0, 'the quarterdeck is small');
  });
}

test('audit: nothing mistakes the historical volume tonnage for a weight', () => {
  const d = sampleDesigns['pinta-1492'], ship = createShip({ id: 'p', hull: d.hull, massItems: d.massItems }), a = analyzeHydrostatics(ship, { sliceCount: 120 });
  const mass = a.mass.massKg; assert.ok(Math.abs(mass - 40100) > 5000 && Math.abs(mass - 40100 * 1.0) > 1);
  assert.equal(P.dimensions.displacement_mass.value, null);
  assert.equal(d.evidence.notes.some((n) => /arqueo/.test(n) && /not used as mass/.test(n)), true);
});

test('audit: the two rig presets are both kept and disagree on purpose (square main/fore vs all lateen)', () => {
  const a = sampleDesigns['pinta-1492'].sails.map((s) => s.shape), b = sampleDesigns['pinta-1492-lateen'].sails.map((s) => s.shape);
  assert.deepEqual(a, ['square', 'square', 'lateen']); assert.deepEqual(b, ['lateen', 'lateen', 'lateen']);
  assert.equal(sampleDesigns['pinta-1492'].evidence.rigPreset, 'atlantic_square_rig'); assert.equal(sampleDesigns['pinta-1492-lateen'].evidence.rigPreset, 'departure_lateen_hypothesis');
});

test('audit: the lightship floats at the research draft; the loaded crossing scenario is deeper and says so', () => {
  const light = sampleDesigns['pinta-1492'];
  assert.ok(light.evidence.loadout === 'crossing_1492_scenario', 'default loadout is the scenario');
  assert.ok(light.evidence.lightDisplacementKg > 55000 && light.evidence.lightDisplacementKg < 75000);
});
