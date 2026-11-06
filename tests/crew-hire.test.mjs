import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrew } from '../src/ship/crew.mjs';
import { buildPintaDesign } from '../src/ship/pinta-design.mjs';
import { createInterior } from '../src/ship/interior.mjs';
import { createHull } from '../src/ship/hull-geometry.mjs';

const make = () => { const d = buildPintaDesign(); return createCrew({ interior: createInterior(d.interior, { hull: createHull(d.hull) }), design: d }); };

test('hire adds a hand, dismiss removes only hired hands', () => {
  const c = make(), n = c.members.length;
  c.hire({ id: 'npc:12', name: 'タロ', npcRef: 12 });
  assert.equal(c.members.length, n + 1);
  assert.throws(() => c.hire({ id: 'npc:12', name: 'タロ' }));
  assert.equal(c.dismiss(c.members[0].id), false); // historical captain stays
  assert.equal(c.dismiss('npc:12'), true);
  assert.equal(c.members.length, n);
});
test('hired hands survive serialize/restore', () => {
  const a = make(); a.hire({ id: 'npc:7', name: 'ハナ', npcRef: 7 }); a.update(30);
  const b = make(); b.restore(JSON.parse(JSON.stringify(a.serialize())));
  const h = b.members.find((m) => m.id === 'npc:7');
  assert.ok(h && h.name === 'ハナ' && h.hired);
});
