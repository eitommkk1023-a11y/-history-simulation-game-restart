/**
 * Crew prototype for the Pinta 1492 scenario: individual ids, roles, watches, stations, walking through the ship
 * interior, and the effects of who is where (is the helm manned, how many hands are at the masts, is there a lookout).
 * Historical figures (level A/B, from the research profile): Martin Alonso Pinzon (captain), Francisco Martin Pinzon
 * (maestre), Cristobal Garcia Sarmiento (piloto). Everyone else is a generic placeholder: the real roster is NOT
 * reproduced, and 26 is only the scenario start size (level D). Where a person stands, which watch they keep and the
 * task times are game hypotheses (level D). Person ids are placeholders until the population system exists.
 */
import { PINTA_1492_PARAMS as G } from './pinta-1492-params.mjs';

export const WATCH_SECONDS = 4 * 3600; // D: two watches alternating every 4 hours
const WALK = 1.4;                      // m/s on deck (D)
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function pintaRoster(size = G.crew.scenarioSize.value) {
  const named = [
    { name: 'Martín Alonso Pinzón', role: 'captain', evidence: 'A' },
    { name: 'Francisco Martín Pinzón', role: 'maestre', evidence: 'A-B' },
    { name: 'Cristóbal García Sarmiento', role: 'piloto', evidence: 'B' },
  ];
  const out = named.map((n) => ({ ...n, id: `person:pinta-1492:${slug(n.name)}`, generic: false }));
  for (let i = out.length; i < size; i++) out.push({ id: `person:pinta-1492:crew-${String(i + 1).padStart(2, '0')}`, name: `乗組員${i + 1}`, role: 'seaman', evidence: 'D', generic: true });
  return out;
}

/** Stations in the hull frame, derived from the interior and the design (all level D). */
export function pintaStations(interior, design) {
  const main = interior.rooms.find((r) => r.id === 'main'), quarter = interior.rooms.find((r) => r.id === 'quarter');
  const masts = design.sails.map((s) => ({ id: s.id, x: s.x })), hatch = interior.ladders.find((l) => l.id === 'l-hatch').a;
  return {
    helm: { x: quarter.x0 + 1.5, y: 0, deck: 'quarter' }, captain: { x: quarter.x1 - 1.0, y: -0.9, deck: 'quarter' }, repair: { x: quarter.x0 + 1.0, y: 0.8, deck: 'quarter' },
    lookout: { x: main.x1 - 0.6, y: 0, deck: 'main' }, hatch: { x: hatch.x, y: 0.7, deck: 'main' },
    // the mizzen stands under the quarterdeck, where nothing is walkable (that space is not modelled): its hands work on the quarterdeck
    mastFoot: Object.fromEntries(masts.map((m) => [m.id, m.x + 0.7 < quarter.x1 ? { x: m.x + 0.7, y: 0.9, deck: 'quarter' } : { x: m.x + 0.7, y: 0.9, deck: 'main' }])),
    rest: { x: main.x0 + 1.2, y: -1.2, deck: 'main' }, below: { x: hatch.x, y: 0, deck: 'hold' },
  };
}

export function createCrew({ interior, design, size = G.crew.scenarioSize.value, roster = pintaRoster(size) }) {
  const st = pintaStations(interior, design), mastIds = Object.keys(st.mastFoot);
  const members = roster.map((p, i) => ({ ...p, watch: i % 2, pos: { ...st.rest, y: st.rest.y + ((i % 5) - 2) * 0.35 }, task: 'rest', target: null, work: 0 }));
  let time = 0, watchOn = 0;

  const deckPath = (from, to) => { // BFS over decks joined by ladders: returns the first ladder to take
    if (from === to) return null;
    const q = [[from, null]], seen = new Set([from]);
    while (q.length) { const [d, first] = q.shift(); for (const l of interior.ladders) for (const [a, b] of [[l.a, l.b], [l.b, l.a]]) if (a.deck === d && !seen.has(b.deck)) { const f = first ?? { ladder: l, from: a }; if (b.deck === to) return f; seen.add(b.deck); q.push([b.deck, f]); } }
    return null;
  };
  /** One walking step toward `target` ({x, y, deck}); climbs a ladder when standing at its foot. Returns true when arrived. */
  function walkTo(m, target, dt) {
    let goal = target;
    if (m.pos.deck !== target.deck) {
      const hop = deckPath(m.pos.deck, target.deck); if (!hop) return false;
      goal = { ...hop.from, deck: m.pos.deck };
      if (Math.hypot(goal.x - m.pos.x, goal.y - m.pos.y) < 0.5) { m.pos = interior.climb(m.pos, hop.ladder.id); return false; }
    }
    const dx = goal.x - m.pos.x, dy = goal.y - m.pos.y, d = Math.hypot(dx, dy);
    if (d < 0.15) return m.pos.deck === target.deck;
    const step = Math.min(d, WALK * dt), np = interior.move(m.pos, dx / d * step, dy / d * step);
    m.pos = np; return false;
  }

  /** Assign duties for the current watch (D rules): helm, lookout, sail hands at each mast, the rest idle; captain, maestre, pilot on deck. */
  function assign(needs) {
    const onWatch = members.filter((m) => m.role === 'seaman' && m.watch === watchOn), free = [...onWatch];
    for (const m of members) { m.task = m.watch === watchOn || m.role !== 'seaman' ? 'rest' : 'off_watch'; m.target = null; }
    const take = (task, target) => { const m = free.shift(); if (m) { m.task = task; m.target = target; } };
    if (needs.helm !== false) take('helm', st.helm);
    if (needs.lookout !== false) take('lookout', st.lookout);
    for (const id of mastIds) for (let k = 0; k < (needs.sailHandsPerMast ?? 1); k++) take('sail', { ...st.mastFoot[id], y: st.mastFoot[id].y * (k % 2 ? -1 : 1) });
    for (let k = 0; k < (needs.pumpers ?? 0); k++) take('pump', st.hatch);
    for (let k = 0; k < (needs.repairers ?? 0); k++) take('repair', st.repair);
    for (const m of members) {
      if (m.role === 'captain') { m.task = 'command'; m.target = st.captain; } else if (m.role === 'piloto') { m.task = 'navigate'; m.target = { ...st.helm, x: st.helm.x + 1.2, y: -0.6 }; } else if (m.role === 'maestre') { m.task = 'supervise'; m.target = st.mastFoot[mastIds[1] ?? mastIds[0]]; }
      else if (m.task === 'off_watch') m.target = st.below; else if (m.task === 'rest') m.target = { ...st.rest, y: st.rest.y + (members.indexOf(m) % 5 - 2) * 0.35 };
    }
  }
  let lastNeeds = {}; assign(lastNeeds);

  const near = (m, t, r = 1.0) => m.pos.deck === t.deck && Math.hypot(m.pos.x - t.x, m.pos.y - t.y) <= r;
  function effects() {
    const at = (task, tgt) => members.filter((m) => m.task === task && near(m, tgt));
    return {
      helmManned: at('helm', st.helm).length > 0,
      lookout: at('lookout', st.lookout).length > 0,
      sailHands: members.filter((m) => m.task === 'sail' && Object.values(st.mastFoot).some((f) => near(m, f))).length,
      pumpers: at('pump', st.hatch).length, repairers: at('repair', st.repair).length,
    };
  }
  /** Advance the crew by dt seconds with the current needs. */
  function update(dt, needs = lastNeeds) {
    time += dt;
    const w = Math.floor(time / WATCH_SECONDS) % 2;
    if (w !== watchOn || JSON.stringify(needs) !== JSON.stringify(lastNeeds)) { watchOn = w; lastNeeds = { ...needs }; assign(lastNeeds); }
    for (const m of members) if (m.target) { const arrived = walkTo(m, m.target, dt); if (arrived && (m.task === 'repair')) m.work += dt; }
    return effects();
  }
  return {
    members, stations: st, interior, update, effects, get watchOn() { return watchOn; }, get time() { return time; },
    repairSeconds: () => Math.max(0, ...members.filter((m) => m.task === 'repair').map((m) => m.work)),
    serialize: () => JSON.parse(JSON.stringify({ time, watchOn, lastNeeds, members: members.map((m) => ({ id: m.id, pos: m.pos, task: m.task, target: m.target, watch: m.watch, work: m.work })) })),
    restore(d) { time = d.time; watchOn = d.watchOn; lastNeeds = d.lastNeeds; for (const r of d.members) { const m = members.find((x) => x.id === r.id); if (m) Object.assign(m, r); } },
  };
}
