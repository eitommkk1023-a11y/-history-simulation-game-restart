/**
 * Captain AI prototype (Ver.14/15 basic part): turns "go to (X, Y)" into steering, sail and oar commands.
 *  - Route: A* over a depth grid (passable = depth >= draft margin), then line-of-sight smoothing.
 *  - Sailing: head straight for the waypoint unless it is inside the no-go zone; otherwise beat to windward
 *    on alternating tacks (square rigs wear round, fore-and-aft rigs tack through the wind).
 *  - Sails: re-trims every second, reefs when heeled hard, shortens sail again when it eases.
 *  - Oars: used when there are no sails; effort follows stamina.
 *  - Arrival: furls, brakes, and anchors when the depth allows.
 *  - Safety: looks ahead along the track and re-plans if shoal water is coming.
 * Simplifications (NOT approved rules): the captain reads depth/wind straight from the environment (no
 * chart or knowledge model yet; `knows(X,Y)` is a hook that unknown cells are avoided through), uses fixed
 * pointing angles per rig, and orders are applied instantly (no crew work time yet).
 * State is JSON-safe so it can be saved with the ship.
 */
const DEG = Math.PI / 180;
const norm360 = (d) => ((d % 360) + 360) % 360;
const angDiff = (a, b) => ((a - b + 540) % 360) - 180; // signed a-b in (-180, 180]
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const RIG_DEFAULTS = Object.freeze({
  square: Object.freeze({ tackDeg: 58 }),
  foreAndAft: Object.freeze({ tackDeg: 42 }),
  oars: Object.freeze({ tackDeg: 0 }),
});

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(f, v) { const a = this.a; a.push([f, v]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top[1]; }
}

export function createCaptain(vessel, { rig, tackDeg, minDepthM, clearanceM, arriveRadiusM = 60, knows = () => true, maxExpansions = 40000 } = {}) {
  const hp = vessel.params, st = vessel.state;
  const sailType = vessel.sails[0]?.type ?? null;
  const kind = rig ?? (sailType ?? 'oars');
  if (!RIG_DEFAULTS[kind]) throw new RangeError(`unknown rig ${kind}`);
  const tack = tackDeg ?? RIG_DEFAULTS[kind].tackDeg;
  const needDepth = minDepthM ?? hp.draftM * 1.5 + 3;
  const margin = clearanceM ?? hp.waterlineLengthM * 2; // keep this far from shoals: leeway, turning and gusts push the ship off its track
  const events = [];
  const S = { drift: 0, underway: false, mode: 'idle', dest: null, waypoints: [], wp: 0, tackSide: 1, phase: null, lastTrim: 0, noRouteReason: null, replanAt: -1e9, time: 0, reef: 1 };
  const emit = (type, extra = {}) => events.push({ type, time: S.time, ...extra });

  const rawDepth = (env, X, Y, t) => (typeof env.depth === 'function' ? env.depth(X, Y, t) : env.depth ?? Infinity);
  function depthOk(env, X, Y, t, m = margin) {
    if (!knows(X, Y) || rawDepth(env, X, Y, t) < needDepth) return false;
    return m <= 0 || [[m, 0], [-m, 0], [0, m], [0, -m]].every(([dx, dy]) => rawDepth(env, X + dx, Y + dy, t) >= needDepth);
  }
  const clearLine = (env, a, b, step, t) => {
    const d = Math.hypot(b.X - a.X, b.Y - a.Y), n = Math.max(1, Math.ceil(d / step));
    for (let i = 0; i <= n; i++) if (!depthOk(env, a.X + (b.X - a.X) * i / n, a.Y + (b.Y - a.Y) * i / n, t, margin * 1.6)) return false; // straight legs keep extra room: the ship cannot hold the line exactly
    return true;
  };

  /** A* route from the ship's position to dest. Returns waypoint list or a failure reason. */
  function plan(env, dest) {
    const t = S.time, s0 = { X: st.X, Y: st.Y }, dist = Math.hypot(dest.X - s0.X, dest.Y - s0.Y);
    if (dist < arriveRadiusM) return { status: 'ok', waypoints: [dest] };
    const cell = clamp(dist / 50, 40, 400), margin = Math.max(600, dist * 0.6);
    const x0 = Math.min(s0.X, dest.X) - margin, y0 = Math.min(s0.Y, dest.Y) - margin;
    const W = Math.ceil((Math.abs(dest.X - s0.X) + 2 * margin) / cell) + 1, H = Math.ceil((Math.abs(dest.Y - s0.Y) + 2 * margin) / cell) + 1;
    const cx = (i) => x0 + (i + 0.5) * cell, cy = (j) => y0 + (j + 0.5) * cell;
    const toI = (X) => clamp(Math.floor((X - x0) / cell), 0, W - 1), toJ = (Y) => clamp(Math.floor((Y - y0) / cell), 0, H - 1);
    const memo = new Map(), pass = (i, j) => { const k = j * W + i; let v = memo.get(k); if (v === undefined) { v = depthOk(env, cx(i), cy(j), t); memo.set(k, v); } return v; };
    const si = toI(s0.X), sj = toJ(s0.Y);
    let gi = toI(dest.X), gj = toJ(dest.Y);
    if (!depthOk(env, dest.X, dest.Y, t, 0)) return { status: 'no_route', reason: 'destination_too_shallow' };
    memo.set(sj * W + si, true); // the start is always usable
    if (!pass(gi, gj)) memo.set(gj * W + gi, true);
    const g = new Map([[sj * W + si, 0]]), from = new Map(), heap = new MinHeap(), closed = new Set();
    const h = (i, j) => { const dx = Math.abs(i - gi), dy = Math.abs(j - gj); return (Math.max(dx, dy) + 0.4142 * Math.min(dx, dy)) * cell; };
    heap.push(h(si, sj), sj * W + si);
    let expansions = 0, found = false;
    while (heap.size) {
      const k = heap.pop(); if (closed.has(k)) continue; closed.add(k);
      const i = k % W, j = (k / W) | 0;
      if (i === gi && j === gj) { found = true; break; }
      if (++expansions > maxExpansions) return { status: 'no_route', reason: 'search_limit' };
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H || !pass(ni, nj)) continue;
        if (di && dj && (!pass(i + di, j) || !pass(i, j + dj))) continue; // no corner cutting
        const nk = nj * W + ni, ng = g.get(k) + (di && dj ? 1.4142 : 1) * cell;
        if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); from.set(nk, k); heap.push(ng + h(ni, nj), nk); }
      }
    }
    if (!found) return { status: 'no_route', reason: 'blocked' };
    const cells = []; for (let k = gj * W + gi; k !== undefined; k = from.get(k)) cells.push({ X: cx(k % W), Y: cy((k / W) | 0) });
    cells.reverse(); cells[0] = s0; cells[cells.length - 1] = dest;
    // Line-of-sight smoothing.
    const out = []; let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1; while (b > a + 1 && !clearLine(env, cells[a], cells[b], Math.max(15, cell / 3), t)) b--;
      out.push(cells[b]); a = b;
    }
    return { status: 'ok', waypoints: out };
  }

  function setDestination(env, dest) {
    if (!Number.isFinite(dest?.X) || !Number.isFinite(dest?.Y)) throw new TypeError('destination needs finite X and Y');
    S.time = S.time; S.dest = { X: dest.X, Y: dest.Y };
    const r = plan(env, S.dest);
    if (r.status !== 'ok') { S.mode = 'idle'; S.noRouteReason = r.reason; emit('captain_no_route', { reason: r.reason }); return r; }
    S.waypoints = r.waypoints; S.wp = 0; S.mode = 'sailing'; S.phase = null; S.noRouteReason = null;
    if (st.anchor) vessel.raiseAnchor();
    for (const s of vessel.sails) s.deployed = 1;
    S.reef = 1;
    emit('captain_route_planned', { waypoints: S.waypoints.length });
    return { status: 'ok', waypoints: S.waypoints.map((w) => ({ ...w })) };
  }

  const bearingTo = (p) => norm360(Math.atan2(p.X - st.X, p.Y - st.Y) / DEG);

  function windFrom(env) {
    const w = typeof env.wind === 'function' ? env.wind(st.X, st.Y, S.time) : env.wind ?? { x: 0, y: 0 };
    const sp = Math.hypot(w.x, w.y);
    return { from: sp > 0.05 ? norm360(Math.atan2(-w.x, -w.y) / DEG) : null, speed: sp };
  }

  /** Course over ground vs heading (leeway, current): steer off the bearing by the measured drift so the TRACK meets the waypoint. */
  function crabbed(B) {
    const f = [Math.sin(st.psi), Math.cos(st.psi)], sd = [Math.cos(st.psi), -Math.sin(st.psi)];
    const vx = st.u * f[0] + st.v * sd[0], vy = st.u * f[1] + st.v * sd[1];
    if (Math.hypot(vx, vy) > 1.5 && st.u > 0) { const cog = norm360(Math.atan2(vx, vy) / DEG); S.drift += (angDiff(cog, st.psi / DEG) - S.drift) * 0.1; }
    return norm360(B - clamp(S.drift, -30, 30));
  }

  /** Heading to steer for the current waypoint, including beating to windward. */
  function chooseHeading(env, wp) {
    const B = bearingTo(wp), w = windFrom(env);
    if (vessel.sails.length === 0 || w.from === null || tack === 0) { S.phase = null; return crabbed(B); }
    const off = angDiff(B, w.from); // how far the bearing is from straight into the wind
    const sailing = Math.abs(off) > tack + 4;
    // Getting under way: a ship without steerage way that points into the wind falls astern ("in irons").
    // The crew first bears away onto a reach to build speed, then comes back up to the course.
    if (S.underway && st.u > 2.2) S.underway = false;
    if (!S.underway && st.u < 1.2 && !sailing) S.underway = true;
    if (S.underway) { S.phase = null; return norm360(w.from + S.tackSide * (tack + 40)); }
    if (sailing) { S.phase = null; return crabbed(B); }
    // Inside the no-go zone: beat on alternating tacks. Switch when the track has drifted outside the corridor.
    const dist = Math.hypot(wp.X - st.X, wp.Y - st.Y), lastWp = S.wp === 0 ? { X: S.startX ?? st.X, Y: S.startY ?? st.Y } : S.waypoints[S.wp - 1];
    const lx = wp.X - lastWp.X, ly = wp.Y - lastWp.Y, ll = Math.hypot(lx, ly) || 1;
    const cross = ((st.X - lastWp.X) * ly - (st.Y - lastWp.Y) * lx) / ll; // + = right of the rhumb line (looking at the waypoint)
    const corridor = kind === 'square' ? clamp(0.35 * ll, 300, 1000) : clamp(0.18 * ll, 120, 500); // wearing a square rig round costs a lot of ground, so square rigs tack less often
    const wantSide = S.tackSide; // +1: steer to the right of the wind (heading = from + tack), -1: left
    // heading on starboard tack side: wind from + tack offset
    if ((wantSide > 0 && cross > corridor) || (wantSide < 0 && cross < -corridor)) { S.tackSide = -S.tackSide; emit('captain_tack', { side: S.tackSide }); S.phase = kind === 'square' ? { wear: norm360(w.from + 180), to: null } : null; }
    const target = norm360(w.from + S.tackSide * tack);
    if (S.phase?.wear !== undefined) {
      // Square rigs wear: bear away through downwind before coming up on the new tack.
      if (Math.abs(angDiff(st.psi / DEG, S.phase.wear)) > 25 && Math.abs(angDiff(st.psi / DEG, target)) > 25) return S.phase.wear;
      S.phase = null;
    }
    return target;
  }

  function trimAndReef(env, dt) {
    S.lastTrim += dt;
    if (!vessel.sails.length || S.lastTrim < 1) return;
    S.lastTrim = 0;
    const hv = Math.abs(st.heelDeg);
    if ((hv > 9 || st.overpowered) && S.reef > 0.4) { S.reef = Math.max(0.4, S.reef - 0.3); emit('captain_reef', { deployed: S.reef }); }
    else if (hv < 3.5 && S.reef < 1) S.reef = Math.min(1, S.reef + 0.1);
    for (const s of vessel.sails) s.deployed = S.reef;
    vessel.autoTrim(env);
  }

  function lookAheadShallow(env) {
    const sp = Math.hypot(st.u, st.v); if (sp < 0.5) return false;
    const f = [Math.sin(st.psi), Math.cos(st.psi)], dirx = (st.u * f[0] + st.v * f[1]) / 1, v = [st.u * f[0] + st.v * Math.cos(st.psi), st.u * f[1] - st.v * Math.sin(st.psi)];
    const m = Math.hypot(v[0], v[1]) || 1;
    for (const d of [hp.waterlineLengthM * 1.5, hp.waterlineLengthM * 3.5]) if (!depthOk(env, st.X + v[0] / m * d, st.Y + v[1] / m * d, S.time, hp.waterlineLengthM * 0.5)) return true;
    return false;
  }

  /** Apply the captain's orders for one control tick of length dt seconds. */
  function update(env, dt) {
    S.time += dt;
    if (S.mode === 'idle' || S.mode === 'arrived') return;
    if (S.startX === undefined) { S.startX = st.X; S.startY = st.Y; }
    const wp = S.waypoints[S.wp], dWp = Math.hypot(wp.X - st.X, wp.Y - st.Y), last = S.wp === S.waypoints.length - 1;
    if (dWp < (last ? arriveRadiusM : Math.max(arriveRadiusM, 80))) {
      if (last) { S.mode = 'arriving'; S.arrivingFor = 0; emit('captain_arriving'); } else { S.wp++; S.startX = st.X; S.startY = st.Y; return; }
    }
    if (S.mode === 'arriving') {
      for (const s of vessel.sails) s.deployed = 0;
      const sp = Math.hypot(st.u, st.v);
      vessel.setAllOarEffort(sp > 1 ? -0.5 : 0);
      vessel.setHeadingTarget(norm360(st.psi / DEG));
      S.arrivingFor = (S.arrivingFor ?? 0) + dt;
      if (!st.anchor && sp < 3.5) {
        const r = vessel.dropAnchor(env, { anchorKg: 600, rodeM: 80 });
        if (r.status === 'ok') { S.mode = 'arrived'; vessel.setAllOarEffort(0); emit('captain_arrived', { anchored: true }); return; }
      }
      if (sp < 0.4 || S.arrivingFor > 180) { S.mode = 'arrived'; vessel.setAllOarEffort(0); emit('captain_arrived', { anchored: !!st.anchor }); }
      return;
    }
    // Shoal ahead: re-plan (at most every 20 s).
    if (S.time - S.replanAt > 20 && lookAheadShallow(env)) {
      S.replanAt = S.time; const r = plan(env, S.dest);
      if (r.status === 'ok') { S.waypoints = r.waypoints; S.wp = 0; S.startX = st.X; S.startY = st.Y; emit('captain_replan'); }
      else { S.mode = 'idle'; emit('captain_no_route', { reason: r.reason }); return; }
    }
    vessel.setHeadingTarget(chooseHeading(env, S.waypoints[S.wp]));
    trimAndReef(env, dt);
    if (vessel.oars.length) {
      const rowing = vessel.sails.length === 0 || windFrom(env).speed < 2.5;
      const stam = vessel.snapshot().stamina ?? 1;
      vessel.setAllOarEffort(rowing ? (stam < 0.25 ? 0.3 : 0.7) : 0);
    }
  }

  function cancel() { S.mode = 'idle'; S.dest = null; S.waypoints = []; vessel.setAllOarEffort?.(0); emit('captain_cancelled'); }

  return {
    setDestination, update, cancel,
    takeEvents: () => events.splice(0),
    get mode() { return S.mode; }, get destination() { return S.dest && { ...S.dest }; }, get waypoints() { return S.waypoints.map((w) => ({ ...w })); },
    get waypointIndex() { return S.wp; }, get reef() { return S.reef; },
    serialize: () => JSON.parse(JSON.stringify(S)),
    restore(data) { Object.assign(S, data); },
  };
}
