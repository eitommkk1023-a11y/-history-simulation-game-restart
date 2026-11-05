import test from 'node:test';
import assert from 'node:assert/strict';
import { createHull, createInterior, createCrew, pintaRoster, WATCH_SECONDS } from '../src/ship/index.mjs';
import { sampleDesigns } from '../src/ship/samples.mjs';

const design = sampleDesigns['pinta-1492'], interior = createInterior(design.interior, { hull: createHull(design.hull) });
const newCrew = () => createCrew({ interior, design });
const run = (c, seconds, needs, dt = 0.5) => { let e; for (let t = 0; t < seconds; t += dt) e = c.update(dt, needs); return e; };

test('roster: 26 scenario members, three historical names, the rest generic placeholders; ids unique', () => {
  const r = pintaRoster(); assert.equal(r.length, 26);
  assert.deepEqual(r.filter((p) => !p.generic).map((p) => p.role), ['captain', 'maestre', 'piloto']);
  assert.equal(new Set(r.map((p) => p.id)).size, 26);
  assert.ok(r.filter((p) => p.generic).every((p) => p.evidence === 'D' && /^乗組員\d+$/.test(p.name)), 'no invented names for the rest of the crew');
  assert.equal(pintaRoster(8).length, 8, 'the size is a scenario setting, not a fixed complement');
});

test('crew walk from their rest places to their stations, including up the ladders, and the effects follow', () => {
  const c = newCrew();
  const e0 = c.effects(); assert.equal(e0.helmManned, false, 'nobody is at the helm at the start');
  const e = run(c, 120, { sailHandsPerMast: 1 });
  assert.equal(e.helmManned, true); assert.equal(e.lookout, true); assert.equal(e.sailHands, 3);
  const helmsman = c.members.find((m) => m.task === 'helm'); assert.equal(helmsman.pos.deck, 'quarter');
  const captain = c.members.find((m) => m.role === 'captain'); assert.equal(captain.pos.deck, 'quarter');
  for (const m of c.members) assert.ok(interior.walkable(m.pos.deck, m.pos.x, m.pos.y), `${m.id} stands on a walkable floor`);
});

test('off-watch hands go below; the watches swap after four hours', () => {
  const c = newCrew(); run(c, 120, {});
  const off = c.members.filter((m) => m.task === 'off_watch'); assert.ok(off.length >= 10);
  assert.ok(off.every((m) => m.pos.deck === 'hold'), 'off watch below deck');
  const firstHelm = c.members.find((m) => m.task === 'helm').id;
  c.update(WATCH_SECONDS, {}); run(c, 200, {});
  assert.notEqual(c.members.find((m) => m.task === 'helm').id, firstHelm, 'the other watch has the helm');
  assert.equal(c.watchOn, 1);
});

test('pumping and repair need hands at their stations; repair work time accumulates only there', () => {
  const c = newCrew(); const e = run(c, 150, { pumpers: 2, repairers: 2 });
  assert.equal(e.pumpers, 2); assert.equal(e.repairers, 2);
  const w0 = c.repairSeconds(); run(c, 60, { pumpers: 2, repairers: 2 }); assert.ok(c.repairSeconds() >= w0 + 59, 'work accrues while at the station');
});

test('crew state saves and restores', () => {
  const c = newCrew(); run(c, 90, {}); const d = JSON.parse(JSON.stringify(c.serialize()));
  const g = newCrew(); g.restore(d);
  for (let i = 0; i < 20; i++) { c.update(0.5, {}); g.update(0.5, {}); }
  assert.deepEqual(c.serialize().members, g.serialize().members);
});
