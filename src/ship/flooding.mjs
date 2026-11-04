/**
 * Flooding prototype (Ver.17 basic design, quasi-static).
 * Internal water is counted ONLY as weight (mass + centroid). Buoyancy comes from the
 * outer hull envelope alone, so lost buoyancy and water weight are never counted twice.
 * Compartments are boxes in the ship frame; water surface is level in the earth frame
 * (free-surface effect arises from the water centroid moving with heel/trim).
 * Flow through each opening: Q = Cd * A_eff * sqrt(2 g dh)  (orifice, explicit Euler).
 * Assumptions (experimental, NOT approved rules): no air compression/venting, no
 * overflow through the top of a compartment, no wave/dynamic effects, rigid hull,
 * the ship re-balances instantly (quasi-static) after each step.
 */
import { submergedVolume, floatAt, equilibriumAtHeel, findRoot, WATER_DENSITY } from './hydrostatics.mjs';
import { computeMassProperties } from './mass.mjs';

const DEG = Math.PI / 180, G_ACC = 9.80665;
const SLICES_PER_COMP = 12;

function boxSlices(b) {
  const poly = [[b.y0, b.z0], [b.y1, b.z0], [b.y1, b.z1], [b.y0, b.z1]];
  const dx = (b.x1 - b.x0) / SLICES_PER_COMP;
  return Array.from({ length: SLICES_PER_COMP }, (_, k) => ({ x: b.x0 + (k + 0.5) * dx, dx, poly }));
}

export function createFloodingModel(ship, { compartments, links, waterDensity = WATER_DENSITY.seawater, sliceCount = 80 } = {}) {
  if (!Array.isArray(compartments) || !compartments.length) throw new TypeError('compartments required');
  const comps = new Map();
  for (const c of compartments) {
    if (typeof c?.id !== 'string' || !c.id || c.id === 'sea' || comps.has(c.id)) throw new TypeError('compartment ids must be unique non-empty strings other than "sea"');
    const b = c.box;
    for (const k of ['x0', 'x1', 'y0', 'y1', 'z0', 'z1']) if (!Number.isFinite(b?.[k])) throw new TypeError(`compartment ${c.id}: box.${k} must be finite`);
    if (b.x1 <= b.x0 || b.y1 <= b.y0 || b.z1 <= b.z0) throw new RangeError(`compartment ${c.id}: empty box`);
    comps.set(c.id, { id: c.id, box: b, slices: boxSlices(b), capacity: (b.x1 - b.x0) * (b.y1 - b.y0) * (b.z1 - b.z0) });
  }
  const linkList = [];
  for (const l of links ?? []) {
    if (typeof l?.id !== 'string' || !l.id) throw new TypeError('link needs an id');
    for (const side of [l.from, l.to]) if (side !== 'sea' && !comps.has(side)) throw new RangeError(`link ${l.id}: unknown side ${side}`);
    if (l.from === l.to) throw new RangeError(`link ${l.id}: both sides identical`);
    for (const k of ['x', 'y', 'z', 'areaM2']) if (!Number.isFinite(l[k])) throw new TypeError(`link ${l.id}: ${k} must be finite`);
    if (l.areaM2 < 0) throw new RangeError(`link ${l.id}: areaM2 must be >= 0`);
    linkList.push({ cd: 0.6, open: true, heightM: Math.sqrt(l.areaM2) || 1e-6, ...l });
  }
  if (new Set(linkList.map((l) => l.id)).size !== linkList.length) throw new TypeError('duplicate link id');

  const hull = ship.hull, slices = hull.slices(sliceCount);
  const hullVolume = submergedVolume(slices, [0, 0, 1], Infinity).volume;
  const baseMass = computeMassProperties(ship.massItems);

  const state = { time: 0, status: 'afloat', water: Object.fromEntries([...comps.keys()].map((k) => [k, 0])), open: Object.fromEntries(linkList.map((l) => [l.id, l.open])) };
  let lastHeel = 0;

  /** Water properties of each compartment for water normal n. */
  function levels(n) {
    const out = {};
    for (const c of comps.values()) {
      const v = state.water[c.id];
      if (v <= 0) { out[c.id] = { volume: 0, level: -Infinity, centroid: null }; continue; }
      if (v >= c.capacity * (1 - 1e-12)) {
        const f = submergedVolume(c.slices, n, Infinity);
        out[c.id] = { volume: v, level: Infinity, centroid: f.centroid }; continue;
      }
      const f = floatAt(c.slices, v, n);
      out[c.id] = { volume: v, level: f ? f.c : -Infinity, centroid: f ? f.centroid : null };
    }
    return out;
  }

  function totals(n) {
    const lv = levels(n);
    let m = baseMass.massKg, mx = baseMass.massKg * baseMass.cg.x, my = baseMass.massKg * baseMass.cg.y, mz = baseMass.massKg * baseMass.cg.z;
    for (const c of comps.values()) {
      const w = lv[c.id]; if (!w.centroid) continue;
      const wm = w.volume * waterDensity;
      m += wm; mx += wm * w.centroid[0]; my += wm * w.centroid[1]; mz += wm * w.centroid[2];
    }
    return { massKg: m, cg: [mx / m, my / m, mz / m], levels: lv };
  }

  /** Quasi-static equilibrium for the current water distribution. */
  function equilibrium() {
    const waterMass = Object.values(state.water).reduce((a, b) => a + b, 0) * waterDensity;
    const massKg = baseMass.massKg + waterMass, volume = massKg / waterDensity;
    if (volume >= hullVolume) return { status: 'foundered', massKg };
    const Gfn = (n) => totals(n).cg;
    const gzAt = (deg) => { const e = equilibriumAtHeel(slices, volume, Gfn, deg * DEG, 20 * DEG); return e.status === 'ok' ? e : null; };
    const gz = (deg) => { const e = gzAt(deg); return e ? e.gz : NaN; };
    let root = null;
    // Warm start near the previous heel, then fall back to a full scan.
    for (const w of [1.5, 4]) {
      const a = lastHeel - w, b = lastHeel + w, fa = gz(a), fb = gz(b);
      if (fa < 0 && fb > 0) { root = findRoot(gz, a, b, { ftol: 1e-10, xtol: 1e-8, maxIter: 60 }); break; }
    }
    if (root === null) {
      let prev = null;
      const cands = [];
      for (let d = -90; d <= 90; d += 3) {
        const f = gz(d);
        if (prev && prev.f < 0 && f > 0) cands.push([prev.d, d]);
        prev = Number.isFinite(f) ? { d, f } : null;
      }
      cands.sort((p, q) => Math.min(Math.abs(p[0]), Math.abs(p[1])) - Math.min(Math.abs(q[0]), Math.abs(q[1])));
      if (cands.length) root = findRoot(gz, cands[0][0], cands[0][1], { ftol: 1e-10, xtol: 1e-8, maxIter: 60 });
    }
    if (root === null || !Number.isFinite(root)) return { status: 'capsized', massKg };
    const e = gzAt(root);
    if (!e) return { status: 'capsized', massKg };
    lastHeel = root;
    const t = totals(e.normal);
    return {
      status: 'ok', massKg, heelDeg: root, trimDeg: e.trim / DEG, normal: e.normal, seaLevel: e.c, cg: t.cg, levels: t.levels,
      draftMid: (e.c - e.normal[0] * (hull.xMin + hull.xMax) / 2) / e.normal[2],
      reserveBuoyancyVolume: hullVolume - volume,
    };
  }

  function flowRates(eq) {
    const n = eq.normal, rates = [];
    for (const l of linkList) {
      if (!state.open[l.id] || l.areaM2 === 0) { rates.push({ id: l.id, q: 0 }); continue; }
      const level = (s) => (s === 'sea' ? eq.seaLevel : eq.levels[s].level);
      const La = level(l.from), Lb = level(l.to);
      const hi = La >= Lb ? l.from : l.to, lo = hi === l.from ? l.to : l.from, Lhi = Math.max(La, Lb), Llo = Math.min(La, Lb);
      const e = n[0] * l.x + n[1] * l.y + n[2] * l.z, eb = e - l.heightM / 2;
      if (!(Lhi > eb)) { rates.push({ id: l.id, q: 0 }); continue; }
      const wet = Math.min((Lhi - eb) / l.heightM, 1);
      const dh = Lhi - Math.max(Llo, eb + Math.min(Lhi - eb, l.heightM) / 2);
      const q = dh > 0 ? l.cd * l.areaM2 * wet * Math.sqrt(2 * G_ACC * dh) : 0;
      rates.push({ id: l.id, q, from: hi, to: lo });
    }
    return rates;
  }

  /** Advance by dt seconds (one explicit step). Water volume is conserved (every outflow is an inflow elsewhere). */
  function step(dt = 0.5) {
    if (state.status !== 'afloat') return { status: state.status };
    const eq = equilibrium();
    if (eq.status !== 'ok') { state.status = eq.status === 'foundered' ? 'sunk' : eq.status; return { status: state.status }; }
    let seaIn = 0;
    for (const r of flowRates(eq)) {
      if (!(r.q > 0)) continue;
      let dv = r.q * dt;
      if (r.from !== 'sea') dv = Math.min(dv, state.water[r.from]);
      if (r.to !== 'sea') dv = Math.min(dv, comps.get(r.to).capacity - state.water[r.to]);
      if (dv <= 0) continue;
      if (r.from !== 'sea') state.water[r.from] -= dv; else seaIn += dv;
      if (r.to !== 'sea') state.water[r.to] += dv; else seaIn -= dv;
    }
    state.time += dt;
    return { status: 'afloat', netSeaInflowM3: seaIn };
  }

  function run(duration, dt = 0.5) {
    const steps = Math.round(duration / dt);
    for (let i = 0; i < steps && state.status === 'afloat'; i++) step(dt);
    return { status: state.status, time: state.time };
  }

  return {
    state, hullVolume, compartments: [...comps.values()].map(({ id, capacity }) => ({ id, capacity })),
    equilibrium, step, run,
    setWater(id, volumeM3) {
      const c = comps.get(id);
      if (!c) throw new RangeError(`unknown compartment ${id}`);
      if (!(volumeM3 >= 0 && volumeM3 <= c.capacity)) throw new RangeError('water volume out of range');
      state.water[id] = volumeM3;
    },
    setLinkOpen(id, open) { if (!(id in state.open)) throw new RangeError(`unknown link ${id}`); state.open[id] = !!open; },
    totalWaterM3: () => Object.values(state.water).reduce((a, b) => a + b, 0),
  };
}
