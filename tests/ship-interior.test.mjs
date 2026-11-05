import test from 'node:test';
import assert from 'node:assert/strict';
import { createHull, createInterior } from '../src/ship/index.mjs';
import { sampleDesigns, sampleInteriors } from '../src/ship/samples.mjs';

const hull = createHull(sampleDesigns.galleon.hull);
const make = (patch = (l) => l) => createInterior(patch(JSON.parse(JSON.stringify(sampleInteriors.galleon))), { hull });
const it = make();
const walk = (pos, dx, dy, n = 1) => { let p = pos; for (let i = 0; i < n; i++) p = it.move(p, dx, dy); return p; };

test('both sample interiors are valid and JSON-safe', () => {
  assert.doesNotThrow(() => JSON.stringify(sampleInteriors));
  const galley = createInterior(sampleInteriors.galley, { hull: createHull(sampleDesigns.galley.hull) });
  assert.equal(galley.rooms.length, 1); assert.equal(it.rooms.length, 6);
});

test('invalid layouts are rejected with a reason', () => {
  assert.throws(() => make((l) => { l.rooms[3].x0 = 32; return l; }), /overlap/);                    // bosun overlaps gundeck
  assert.throws(() => make((l) => { l.rooms[1].deck = 'nope'; return l; }), /unknown deck/);
  assert.throws(() => make((l) => { l.doors[0].x0 = 20; l.doors[0].x1 = 20.6; return l; }), /join two rooms/);
  assert.throws(() => make((l) => { l.ladders[0].a.x = 60; return l; }), /walkable/);
  assert.throws(() => make((l) => { l.rooms.push({ ...l.rooms[0] }); return l; }), /unique/);
  assert.throws(() => createInterior({}), /decks/);
});

test('walls block, doors let you through, and you slide along walls', () => {
  let p = { x: 8, y: 0, deck: 'gun' };                                   // captain's cabin, on the door line
  p = walk(p, 0.1, 0, 40);                                              // walk aft-to-fore through the door at x ~ 10.2
  assert.ok(p.x > 11, `through the door, x=${p.x}`);
  const off = { x: 8, y: 3, deck: 'gun' };                              // same direction away from the door: blocked by the wall
  const q = walk(off, 0.1, 0, 30);
  assert.ok(q.x < 10 && q.x > 9, `stopped at the wall, x=${q.x}`);
  const slide = it.move({ x: 9.6, y: 3, deck: 'gun' }, 0.2, 0.3);       // blocked in x, free in y
  assert.equal(slide.x, 9.6); assert.ok(slide.y > 3);
});

test('the player stays inside the hull breadth and the hull length', () => {
  const p = walk({ x: 20, y: 0, deck: 'weather' }, 0, 0.1, 80);
  assert.ok(p.y > 4 && p.y < 5.4, `y=${p.y}`);                          // weather deck half-breadth ~ 4.9-5.4 minus margins
  const bow = walk({ x: 30, y: 0, deck: 'weather' }, 0.2, 0, 60);
  assert.ok(bow.x < 38, `x=${bow.x}`);
  assert.equal(it.walkable('weather', 20, 8), false); assert.equal(it.walkable('weather', 45, 0), false);
});

test('ladders: found within reach, climbing changes deck and lands on the other end', () => {
  assert.deepEqual(it.laddersNear({ x: 22, y: 1, deck: 'weather' }).map((l) => [l.id, l.direction]), [['l-gun', 'down']]);
  assert.deepEqual(it.laddersNear({ x: 12, y: 0, deck: 'weather' }), []);
  const down = it.climb({ x: 22.5, y: 1.6, deck: 'weather' }, 'l-gun');
  assert.deepEqual(down, { x: 22, y: 1.8, deck: 'gun' });
  assert.deepEqual(it.laddersNear(down).map((l) => l.direction), ['up']);
  assert.throws(() => it.climb({ x: 5, y: 0, deck: 'weather' }, 'l-gun'), /not near/);
  assert.throws(() => it.climb(down, 'zzz'), /unknown ladder/);
  const hold = it.climb({ x: 28.4, y: -2, deck: 'gun' }, 'l-hold'); assert.equal(hold.deck, 'hold'); assert.ok(it.walkable('hold', hold.x, hold.y));
});

test('wall rectangles leave the door openings free', () => {
  const walls = it.wallRects('gun'), covers = (x, y) => walls.some((w) => x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1);
  assert.equal(covers(10, 0), false, 'door opening'); assert.equal(covers(10, 3), true, 'solid wall'); assert.equal(covers(33.2, 0), false);
  assert.equal(covers(2.5, 0), true, 'aft wall of the captain cabin');
});

test('rooms convert to flooding boxes with floors and ceilings from the decks', () => {
  const boxes = Object.fromEntries(it.toFloodingBoxes(8.6).map((b) => [b.id, b.box]));
  assert.equal(boxes.hold.z0, 2.4); assert.equal(boxes.hold.z1, 5.2);
  assert.equal(boxes.gundeck.z0, 5.2); assert.equal(boxes.gundeck.z1, 8);
  assert.equal(boxes.weather.z1, 8.6);
  assert.equal(it.roomOf('gun', 20, 0).id, 'gundeck'); assert.equal(it.roomOf('gun', 10.2, 0), null, 'in the wall gap');
});

test('Pinta interior: cabin door, ladders, poop deck and hold', () => {
  const ph = createHull(sampleDesigns.pinta.hull), pi = createInterior(sampleInteriors.pinta, { hull: ph });
  assert.equal(pi.rooms.length, 5); assert.deepEqual(pi.startPosition().deck, 'weather');
  // Walk aft from the main deck through the cabin door, then into the cabin; the cabin wall blocks off the door line.
  let p = { x: 8, y: 0, deck: 'weather' }; for (let i = 0; i < 40; i++) p = pi.move(p, -0.1, 0);
  assert.ok(p.x < 5 && p.x > 1, `inside the cabin, x=${p.x}`);
  let q = { x: 8, y: 2.5, deck: 'weather' }; for (let i = 0; i < 40; i++) q = pi.move(q, -0.1, 0);
  assert.ok(q.x > 5.5, `blocked by the cabin wall, x=${q.x}`);
  const up = pi.climb({ x: 6.8, y: 1.6, deck: 'weather' }, 'l-poop'); assert.equal(up.deck, 'poop'); assert.ok(pi.walkable('poop', up.x, up.y));
  const down = pi.climb({ x: 12, y: 1, deck: 'weather' }, 'l-hold'); assert.equal(down.deck, 'hold');
  assert.deepEqual(pi.wallRects('weather').map((w) => w.room).filter((r, i, a) => a.indexOf(r) === i), ['cabin'], 'only the cabin has walls on the main deck');
  assert.equal(pi.wallRects('weather')[0].h, 1.3);
  const boxes = Object.fromEntries(pi.toFloodingBoxes(5.5).map((b) => [b.id, b.box])); assert.equal(boxes.hold.z0, 1.3); assert.equal(boxes.hold.z1, 3.6);
});
