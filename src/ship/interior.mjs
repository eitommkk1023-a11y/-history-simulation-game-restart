/**
 * Ship interior (Ver.5 basic part): decks, rooms, doors and ladders in the hull frame
 * (x = along the ship from hull.xMin, y = across, + starboard; z = deck height above the keel baseline).
 * Walkable space is the union of room rectangles and door rectangles, kept inside the hull breadth at that deck height.
 * Rooms on the same deck are separated by a wall gap; a door rectangle bridges the gap. Walls are the gaps, so the
 * same data drives movement, rendering and the later flooding/fire/NPC-path networks (toFloodingBoxes).
 * Prototype: axis-aligned rectangular rooms only; no furniture, no destructible walls, no closed doors yet.
 * The layout is plain JSON (stored with the ship design).
 */
import { breadthAtZ } from './hull-geometry.mjs';

const R = 0.3; // player radius (m)
const inside = (r, x, y) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
const inset = (r, m) => ({ x0: r.x0 + m, x1: r.x1 - m, y0: r.y0 + m, y1: r.y1 - m });

import { createBellonaInterior } from './bellona-interior.mjs';
export function createInterior(layout, { hull = null } = {}) {
  if (layout?.kind === 'bellona') return createBellonaInterior(); // the Bellona study's own floors, stairs and obstacles
  if (!layout || !Array.isArray(layout.decks) || !Array.isArray(layout.rooms)) throw new TypeError('interior layout needs decks and rooms');
  const decks = new Map(), rooms = new Map(), doors = layout.doors ?? [], ladders = layout.ladders ?? [];
  for (const d of layout.decks) {
    if (typeof d?.id !== 'string' || !Number.isFinite(d.z) || decks.has(d.id)) throw new TypeError('each deck needs a unique id and a z height');
    decks.set(d.id, d);
  }
  const rectOk = (r) => Number.isFinite(r.x0) && Number.isFinite(r.x1) && Number.isFinite(r.y0) && Number.isFinite(r.y1) && r.x1 > r.x0 && r.y1 > r.y0;
  for (const r of layout.rooms) {
    if (typeof r?.id !== 'string' || rooms.has(r.id)) throw new TypeError('each room needs a unique id');
    if (!decks.has(r.deck)) throw new RangeError(`room ${r.id}: unknown deck ${r.deck}`);
    if (!rectOk(r) || r.x1 - r.x0 < 2 * R + 0.2 || r.y1 - r.y0 < 2 * R + 0.2) throw new RangeError(`room ${r.id}: invalid or too small rectangle`);
    rooms.set(r.id, r);
  }
  const list = [...rooms.values()];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.deck === b.deck && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) throw new RangeError(`rooms ${a.id} and ${b.id} overlap (leave a wall gap)`);
  }
  const grow = (r, m) => ({ x0: r.x0 - m, x1: r.x1 + m, y0: r.y0 - m, y1: r.y1 + m });
  for (const d of doors) {
    if (typeof d?.id !== 'string' || !decks.has(d.deck) || !rectOk(d) || !['x', 'y'].includes(d.along)) throw new TypeError(`door ${d?.id}: needs id, deck, rectangle and along x|y`);
    const touching = list.filter((r) => r.deck === d.deck && inside(grow(r, 0.02), d.x0, d.y0) !== undefined && d.x0 <= r.x1 + 0.02 && d.x1 >= r.x0 - 0.02 && d.y0 <= r.y1 + 0.02 && d.y1 >= r.y0 - 0.02);
    if (touching.length < 2) throw new RangeError(`door ${d.id} must join two rooms`);
  }
  // Walkable pieces per deck: rooms inset by the player radius; doors inset only across their width.
  const pieces = new Map([...decks.keys()].map((k) => [k, []]));
  for (const r of list) pieces.get(r.deck).push({ rect: inset(r, R), room: r });
  for (const d of doors) {
    // `along` is the direction the wall runs: keep a margin along it, and reach R into the rooms on both sides so the pieces overlap.
    const across = d.along === 'y' ? { x0: d.x0 - R, x1: d.x1 + R, y0: d.y0 + R, y1: d.y1 - R } : { x0: d.x0 + R, x1: d.x1 - R, y0: d.y0 - R, y1: d.y1 + R };
    if (across.x1 > across.x0 && across.y1 > across.y0) pieces.get(d.deck).push({ rect: across, door: d });
  }
  const breadthLimit = (x, z) => { if (!hull) return Infinity; if (x < hull.xMin || x > hull.xMax) return -1; return breadthAtZ(hull.sectionAt(x), z) - 0.25; };
  for (const l of ladders) for (const end of [l.a, l.b]) {
    if (!end || !decks.has(end.deck) || !Number.isFinite(end.x) || !Number.isFinite(end.y)) throw new TypeError(`ladder ${l.id}: bad end`);
    if (!walkable(end.deck, end.x, end.y)) throw new RangeError(`ladder ${l.id}: an end is not on walkable floor`);
  }

  function walkable(deck, x, y) {
    const ps = pieces.get(deck); if (!ps) return false;
    if (Math.abs(y) > breadthLimit(x, decks.get(deck).z)) return false;
    return ps.some((p) => inside(p.rect, x, y));
  }
  const roomOf = (deck, x, y) => list.find((r) => r.deck === deck && inside(r, x, y)) ?? null;

  /** Move a position {x, y, deck} by (dx, dy), sliding along walls. Returns the new position (a new object). */
  function move(pos, dx, dy) {
    let { x, y } = pos;
    if (walkable(pos.deck, x + dx, y + dy)) { x += dx; y += dy; }
    else { if (walkable(pos.deck, x + dx, y)) x += dx; if (walkable(pos.deck, x, y + dy)) y += dy; }
    return { x, y, deck: pos.deck };
  }
  /** Ladders within reach of the position (each with the end you stand at and the end you would reach). */
  function laddersNear(pos, reach = 1.4) {
    const out = [];
    for (const l of ladders) for (const [here, there] of [[l.a, l.b], [l.b, l.a]]) {
      if (here.deck === pos.deck && Math.hypot(here.x - pos.x, here.y - pos.y) <= reach) out.push({ id: l.id, name: l.name ?? l.id, dist: Math.hypot(here.x - pos.x, here.y - pos.y), to: there.deck, direction: decks.get(there.deck).z > decks.get(pos.deck).z ? 'up' : 'down' });
    }
    return out;
  }
  function climb(pos, ladderId) {
    const l = ladders.find((q) => q.id === ladderId); if (!l) throw new RangeError(`unknown ladder ${ladderId}`);
    for (const [here, there] of [[l.a, l.b], [l.b, l.a]]) if (here.deck === pos.deck && Math.hypot(here.x - pos.x, here.y - pos.y) <= 1.4) return { x: there.x, y: there.y, deck: there.deck };
    throw new RangeError('not near that ladder');
  }
  /** Thin wall rectangles around a room on a deck, with door openings removed (for rendering). */
  function wallRects(deck, thickness = 0.16) {
    const out = [];
    for (const r of list.filter((q) => q.deck === deck && !q.open)) { // open rooms (weather decks) have no walls
      const ds = doors.filter((d) => d.deck === deck);
      const edge = (fixed, a0, a1, axis) => { // axis 'x': wall runs along x at y=fixed; 'y': runs along y at x=fixed
        const cuts = ds.filter((d) => (axis === 'x' ? d.along === 'x' && d.y0 <= fixed + 0.05 && d.y1 >= fixed - 0.05 : d.along === 'y' && d.x0 <= fixed + 0.05 && d.x1 >= fixed - 0.05))
          .map((d) => (axis === 'x' ? [d.x0, d.x1] : [d.y0, d.y1])).filter(([c0, c1]) => c1 > a0 && c0 < a1).sort((p, q) => p[0] - q[0]);
        let cur = a0;
        for (const [c0, c1] of cuts) { if (c0 > cur) out.push(seg(fixed, cur, c0, axis)); cur = Math.max(cur, c1); }
        if (cur < a1) out.push(seg(fixed, cur, a1, axis));
      };
      const seg = (fixed, a, b, axis) => ({ ...(axis === 'x' ? { x0: a, x1: b, y0: fixed - thickness / 2, y1: fixed + thickness / 2 } : { x0: fixed - thickness / 2, x1: fixed + thickness / 2, y0: a, y1: b }), room: r.id, h: r.wallHeight });
      edge(r.y0, r.x0, r.x1, 'x'); edge(r.y1, r.x0, r.x1, 'x'); edge(r.x0, r.y0, r.y1, 'y'); edge(r.x1, r.y0, r.y1, 'y');
    }
    return out;
  }
  /** Room boxes for the flooding model: floor at the deck, ceiling at the next deck up (or `topZ`). */
  function toFloodingBoxes(topZ) {
    const zs = [...decks.values()].map((d) => d.z).sort((a, b) => a - b);
    return list.map((r) => { const z0 = decks.get(r.deck).z, above = zs.find((z) => z > z0 + 1e-9) ?? topZ; return { id: r.id, box: { x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, z0, z1: above } }; });
  }
  const startPosition = () => { const r = list.find((q) => q.use === 'deck') ?? list[0]; return { x: (r.x0 + r.x1) / 2, y: 0, deck: r.deck }; };

  return Object.freeze({
    layout, decks: [...decks.values()], rooms: list, doors, ladders,
    walkable, roomOf, move, laddersNear, climb, wallRects, toFloodingBoxes, startPosition,
    deckZ: (id) => decks.get(id)?.z,
    floorRects: (deck) => list.filter((r) => r.deck === deck),
  });
}
