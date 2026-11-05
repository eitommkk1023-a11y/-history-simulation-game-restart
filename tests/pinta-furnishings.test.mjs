import test from 'node:test';
import assert from 'node:assert/strict';
import { createHull, createInterior, planFurnishings, withCargo, cargoItem, PINTA_1492_PARAMS as G, validatePintaParams } from '../src/ship/index.mjs';
import { sampleDesigns } from '../src/ship/samples.mjs';

const design = sampleDesigns['pinta-1492'], interior = createInterior(design.interior, { hull: createHull(design.hull) });
const plan = (massItems) => planFurnishings({ design, interior, massItems });

test('item counts follow the ship\'s real mass items (casks = water mass / cask mass, sacks = provisions / sack mass)', () => {
  const p = plan(design.massItems);
  assert.equal(p.wanted.casks, 10); assert.equal(p.wanted.sacks, 24); assert.equal(p.casks.length, 10); assert.equal(p.sacks.length, 24);
  const more = plan(withCargo(design.massItems, [cargoItem('water_barrel', 10, 3.5, 0, 1, 'player')]));
  assert.equal(more.casks.length, 20, 'loading 10 more casks shows 10 more casks');
  const none = plan(design.massItems.filter((m) => !/water[-_]barrel|provision/.test(m.id)));
  assert.equal(none.casks.length + none.sacks.length, 0, 'an unloaded hold shows no stores');
});

test('every item stands on walkable floor, outside the walking aisle, and no two stores share a place', () => {
  const p = plan(withCargo(design.massItems, [cargoItem('water_barrel', 14, 3.5, 0, 1, 'player')]));
  const aisle = G.furnishings.aisleHalfWidth.value;
  for (const c of p.casks) { assert.ok(interior.walkable('hold', c.x, c.y), `cask at ${c.x},${c.y}`); assert.ok(Math.abs(c.y) >= aisle - 1e-9, 'aisle kept clear'); }
  for (const s of p.sacks) assert.ok(interior.walkable('hold', s.x, s.y));
  const key = (a) => [a.x.toFixed(2), a.y.toFixed(2), a.z.toFixed(2)].join(',');
  assert.equal(new Set(p.casks.map(key)).size, p.casks.length); assert.equal(new Set(p.sacks.map(key)).size, p.sacks.length);
  assert.ok(p.casks.every((c) => ['hold-aft', 'hold'].includes(interior.roomOf('hold', c.x, c.y)?.id)), 'casks in the after store (overflow into the cargo hold)');
});

test('gear: rope in the fore locker, a spare sail, repair boards, a coil at each mast foot and one anchor; nothing that the sources do not support', () => {
  const p = plan(design.massItems);
  assert.equal(p.coils.filter((c) => c.deck === 'hold').length, G.furnishings.forelocker.value.ropeCoils);
  assert.equal(p.coils.length, G.furnishings.forelocker.value.ropeCoils + design.sails.length);
  assert.equal(p.sailRolls.length, 1); assert.equal(p.planks.length, G.furnishings.forelocker.value.repairPlanks); assert.equal(p.anchors.length, 1);
  assert.deepEqual(Object.keys(p).sort(), ['anchors', 'casks', 'coils', 'evidence', 'planks', 'sacks', 'sailRolls', 'wanted']);
  for (const c of p.coils) assert.ok(interior.walkable(c.deck, c.x, c.y), `coil on ${c.deck} at ${c.x},${c.y}`);
  assert.equal(p.evidence, 'D');
});

test('the furnishing parameters are all labelled hypotheses and say what was deliberately left out', () => {
  assert.deepEqual(validatePintaParams(), []);
  assert.equal(G.furnishings.foodSackKg.evidence_level, 'D');
});
