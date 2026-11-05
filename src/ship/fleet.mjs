/**
 * Fleet registry: ship ids, designs, simulation LOD, JSON save/restore (Ver.25-26 basic part).
 * LOD only changes the integration step (near: 0.1 s, far: 0.5 s) and which ships are stepped;
 * the state is the same object, so a ship never jumps when its LOD changes.
 * Ships beyond dormantRadius are NOT simulated (their state is frozen and dormantSeconds counts up);
 * catching up on that time (e.g. a voyage model) is not implemented yet.
 * People, cargo and owners are only referenced by id in `refs`; no ledger is duplicated here.
 * Designs are plain JSON data so they can be saved.
 */
import { createShip } from './ship-model.mjs';
import { analyzeHydrostatics } from './hydrostatics.mjs';
import { createVessel } from './dynamics.mjs';
import { createCaptain } from './captain.mjs';
import { createCrew } from './crew.mjs';
import { createInterior } from './interior.mjs';
import { createHull } from './hull-geometry.mjs';

const FORMAT = 1;
export const LOD = Object.freeze({ near: 'near', far: 'far', dormant: 'dormant' });

export function createFleet({ nearRadiusM = 1500, farRadiusM = 20000, nearDt = 0.1, farDt = 0.5, maxSubsteps = 40 } = {}) {
  const designs = new Map(), analyses = new Map(), ships = new Map();
  let nextId = 1, time = 0;
  const events = [];

  function registerDesign(id, d) {
    if (typeof id !== 'string' || !id) throw new TypeError('design id must be a non-empty string');
    if (!d?.hull?.stations || !Array.isArray(d.massItems)) throw new TypeError('design needs hull.stations and massItems');
    designs.set(id, JSON.parse(JSON.stringify(d))); analyses.delete(id);
  }

  function build(designId, massOverride = null) {
    const d = designs.get(designId);
    if (!d) throw new RangeError(`unknown design ${designId}`);
    const ship = createShip({ id: designId, hull: d.hull, massItems: massOverride ?? d.massItems, openings: d.openings });
    let analysis;
    if (massOverride) analysis = analyzeHydrostatics(ship);
    else { if (!analyses.has(designId)) analyses.set(designId, analyzeHydrostatics(ship)); analysis = analyses.get(designId); }
    if (analysis.status !== 'ok') throw new RangeError(`design ${designId} does not float (${analysis.status})`);
    return createVessel({ ship, analysis, sails: d.sails ?? [], rudder: d.rudder, oars: d.oars ?? [], windageAreaM2: d.windageAreaM2 ?? 0, ...(d.tuning ?? {}) });
  }

  function addShip({ designId, X = 0, Y = 0, headingDeg = 0, id, refs = {}, crew = false } = {}) {
    const shipId = id ?? `ship-${nextId++}`;
    if (ships.has(shipId)) throw new RangeError(`duplicate ship id ${shipId}`);
    if (id) { const m = /^ship-(\d+)$/.exec(id); if (m) nextId = Math.max(nextId, +m[1] + 1); }
    const vessel = build(designId);
    Object.assign(vessel.state, { X, Y, psi: headingDeg * Math.PI / 180 });
    const rec = { id: shipId, designId, vessel, captain: null, crew: null, crewNeeds: {}, massItems: null, lod: LOD.near, lifecycle: 'afloat', dormantSeconds: 0, refs: { owner: null, crew: [], cargo: [], ...refs }, history: [{ type: 'ship_created', time }] };
    if (crew) rec.crew = makeCrew(designId);
    ships.set(shipId, rec);
    return shipId;
  }

  /** Give the ship's captain a destination (ship frame metres). Returns the planner's {status, waypoints|reason}. */
  function setDestination(id, env, dest, options) {
    const rec = get(id);
    rec.captain ??= createCaptain(rec.vessel, options);
    return rec.captain.setDestination(env, dest);
  }
  function cancelDestination(id) { get(id).captain?.cancel(); }

  function makeCrew(designId) {
    const d = designs.get(designId); if (!d?.interior) throw new RangeError(`design ${designId} has no interior, so it cannot carry a walking crew`);
    return createCrew({ interior: createInterior(d.interior, { hull: createHull(d.hull) }), design: d });
  }
  /** Replace the ship's mass items (cargo, water, bilge) and rebuild its physics from them, keeping its motion and state. */
  function setLoad(id, massItems) {
    const rec = get(id), old = rec.vessel, nv = build(rec.designId, massItems);
    Object.assign(nv.state, old.state);
    for (const s of nv.sails) { const o = old.sails.find((x) => x.id === s.id); if (o) { s.trimDeg = o.trimDeg; s.deployed = o.deployed; s.targetTrimDeg = o.targetTrimDeg; } }
    for (const o of nv.oars) { const q = old.oars.find((x) => x.id === o.id); if (q) { o.effort = q.effort; o.stamina = q.stamina; } }
    rec.vessel = nv; rec.massItems = massItems.map((m) => ({ ...m }));
    if (rec.captain) { const data = rec.captain.serialize(); rec.captain = createCaptain(nv); rec.captain.restore(data); }
    return nv.params;
  }
  const setCrewNeeds = (id, needs) => { get(id).crewNeeds = { ...needs }; };

  const get = (id) => { const s = ships.get(id); if (!s) throw new RangeError(`unknown ship ${id}`); return s; };

  /** Advance every ship by dt seconds. focus = {X, Y} decides the LOD (usually the player's position). */
  function step(dt, env = {}, focus = null) {
    time += dt;
    for (const s of ships.values()) {
      if (s.lifecycle !== 'afloat') continue;
      const v = s.vessel, d = focus ? Math.hypot(v.state.X - focus.X, v.state.Y - focus.Y) : 0;
      s.lod = d <= nearRadiusM ? LOD.near : d <= farRadiusM ? LOD.far : LOD.dormant;
      if (s.lod === LOD.dormant) { s.dormantSeconds += dt; continue; }
      const h = s.lod === LOD.near ? nearDt : farDt, n = Math.min(maxSubsteps, Math.max(1, Math.round(dt / h)));
      const sub = dt / n;
      const fx = s.crew?.update(dt, s.crewNeeds);
      if (fx) v.setSailSlew(fx.sailHands > 0 ? 1.2 * fx.sailHands : 0.05); // braces and sheets move only as fast as the hands at the masts allow
      for (let i = 0; i < n; i++) { v.step(sub, env); s.captain?.update(env, sub); if (fx && !fx.helmManned) { v.setHeadingTarget(null); v.setRudder(0); } } // nobody at the tiller: the rudder stays amidships
      for (const e of [...v.takeEvents(), ...(s.captain?.takeEvents() ?? [])]) { const ev = { ...e, shipId: s.id }; events.push(ev); s.history.push(ev); }
    }
  }

  const num = (v) => (Number.isFinite(v) ? v : null);

  function serialize() {
    return JSON.parse(JSON.stringify({
      format: FORMAT, nextId, time,
      designs: Object.fromEntries(designs),
      ships: [...ships.values()].map((s) => {
        const v = s.vessel, st = v.state;
        return {
          id: s.id, designId: s.designId, lifecycle: s.lifecycle, dormantSeconds: s.dormantSeconds, refs: s.refs, history: s.history.slice(-200),
          state: { ...st, anchor: st.anchor ? { ...st.anchor, breakingN: num(st.anchor.breakingN) } : null },
          sails: v.sails.map((x) => ({ id: x.id, trimDeg: x.trimDeg, deployed: x.deployed })),
          oars: v.oars.map((o) => ({ id: o.id, effort: o.effort, stamina: o.stamina })),
          captain: s.captain ? s.captain.serialize() : null, crew: s.crew ? s.crew.serialize() : null, crewNeeds: s.crewNeeds, massItems: s.massItems,
        };
      }),
    }));
  }

  function restore(data) {
    if (!data || data.format !== FORMAT) throw new RangeError('unsupported fleet save format');
    designs.clear(); analyses.clear(); ships.clear(); events.length = 0;
    for (const [id, d] of Object.entries(data.designs)) registerDesign(id, d);
    nextId = data.nextId; time = data.time;
    for (const r of data.ships) {
      const vessel = build(r.designId, r.massItems ?? null);
      Object.assign(vessel.state, r.state);
      if (r.state.anchor) vessel.state.anchor = { ...r.state.anchor, breakingN: r.state.anchor.breakingN ?? Infinity };
      for (const x of r.sails) { const sl = vessel.sails.find((s) => s.id === x.id); if (sl) { sl.trimDeg = x.trimDeg; sl.deployed = x.deployed; } }
      for (const x of r.oars) { const o = vessel.oars.find((q) => q.id === x.id); if (o) { o.effort = x.effort; o.stamina = x.stamina; } }
      let captain = null;
      if (r.captain) { captain = createCaptain(vessel); captain.restore(r.captain); }
      let crew = null; if (r.crew) { crew = makeCrew(r.designId); crew.restore(r.crew); }
      ships.set(r.id, { id: r.id, designId: r.designId, vessel, captain, crew, crewNeeds: r.crewNeeds ?? {}, massItems: r.massItems ?? null, lod: LOD.near, lifecycle: r.lifecycle, dormantSeconds: r.dormantSeconds, refs: r.refs, history: r.history });
    }
  }

  return {
    registerDesign, addShip, step, serialize, restore, get, setDestination, cancelDestination, setLoad, setCrewNeeds,
    designMass: (designId) => designs.get(designId).massItems,
    has: (id) => ships.has(id),
    list: () => [...ships.values()],
    ids: () => [...ships.keys()],
    designIds: () => [...designs.keys()],
    removeShip: (id) => ships.delete(id),
    takeEvents: () => events.splice(0),
    get time() { return time; },
  };
}
