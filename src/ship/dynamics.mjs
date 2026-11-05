/**
 * 2D (surge, sway, yaw) vessel dynamics prototype (Ver.8/9/11 basic design).
 * World frame: X east, Y north (m). Heading psi: clockwise from north (rad).
 * Body frame: x forward, y STARBOARD (same as the hull frame), r = dpsi/dt (+ = turning to starboard).
 *  forward = (sin psi, cos psi), starboard = (cos psi, -sin psi)
 * mx(du/dt) = X + my v r ;  my(dv/dt) = Y - mx u r ;  Iz dr/dt = N.
 * Forces: hull friction (ITTC-1957 line) + form + simple wave-making, keel lift and cross-flow
 * drag, yaw damping, rudder, sails (apparent wind), hull windage. Sail heel from the GZ curve.
 * ALL COEFFICIENTS ARE EXPERIMENTAL placeholders, NOT approved rules or calibrated data.
 * Oars (Ver.10): thrust = eta*P/(U+U0) per bank, power drains stamina. Anchors/grounding (Ver.12):
 * spring-damper rode, holding limit from seabed/scope, dragging, parting; seabed contact friction with
 * normal force limited by lost buoyancy (rho g Awp pen). Depth comes from env.depth(x, y, t) (m, or a number).
 * Not modelled yet: roll/pitch/heave dynamics, waves, mooring lines/berthing, tides generation, hull damage effects.
 */
import { deriveHullParams } from './hull-params.mjs';
import { analyzeHydrostatics, WATER_DENSITY } from './hydrostatics.mjs';

const DEG = Math.PI / 180, G_ACC = 9.80665, NU_SEA = 1.2e-6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Seabed presets (EXPERIMENTAL): hold = anchor holding coefficient (holding force / anchor weight), mu = hull friction. */
export const SEABED = Object.freeze({
  sand: Object.freeze({ hold: 12, mu: 0.4 }), mud: Object.freeze({ hold: 8, mu: 0.25 }), clay: Object.freeze({ hold: 10, mu: 0.3 }),
  gravel: Object.freeze({ hold: 10, mu: 0.5 }), rock: Object.freeze({ hold: 4, mu: 0.6 }),
});
const depthAt = (env, x, y, t) => (typeof env?.depth === 'function' ? env.depth(x, y, t) : env?.depth ?? Infinity);
const seabedAt = (env, x, y, t) => SEABED[typeof env?.seabed === 'function' ? env.seabed(x, y, t) : env?.seabed ?? 'sand'] ?? SEABED.sand;
const sail_defaults = Object.freeze({ cnMax: 1.5, cnSlope: 4, cd0: 0.05 });

/** Sail presets: minTrimDeg = how close to the centreline the sail chord can be set (square sails are limited by shrouds/yard bracing); trim can go up to 90 deg (square to the wind). */
export const SAIL_TYPES = Object.freeze({
  square: Object.freeze({ ...sail_defaults, cnMax: 1.3, cnSlope: 3, cd0: 0.2, minTrimDeg: 40 }),
  foreAndAft: Object.freeze({ ...sail_defaults, cnMax: 1.5, cnSlope: 4, cd0: 0.1, minTrimDeg: 8 }),
});

/** Heel angle (deg, signed) at which the righting moment equals the heeling moment (N m). */
export function heelFromMoment(analysis, momentNm) {
  const m = analysis.mass.massKg * G_ACC, sgn = Math.sign(momentNm), need = Math.abs(momentNm);
  const pts = [{ heelDeg: 0, gz: 0 }, ...analysis.gzCurve.filter((p) => p.status === 'ok' && p.heelDeg > 0)];
  let prev = pts[0], peak = pts[0];
  for (const p of pts.slice(1)) {
    if (p.gz > peak.gz) peak = p;
    if (m * p.gz >= need) {
      const a = m * prev.gz, b = m * p.gz;
      return { heelDeg: sgn * (prev.heelDeg + (p.heelDeg - prev.heelDeg) * (need - a) / (b - a || 1)), overpowered: false };
    }
    if (p.gz < prev.gz && p.heelDeg > peak.heelDeg) break;
    prev = p;
  }
  return { heelDeg: sgn * peak.heelDeg, overpowered: need > 0 && need > m * peak.gz };
}

export function createVessel({ ship, analysis, hullParams, sails = [], rudder, oars = [], waterDensity = WATER_DENSITY.seawater, airDensity = 1.225,
  windageAreaM2 = 0, form = 0.2, roughnessCf = 0, waveK = 1, keelLiftSlope = 2, crossFlowCd = 1.0, initial = {} } = {}) {
  const an = analysis ?? analyzeHydrostatics(ship, { waterDensity });
  const hp = hullParams ?? deriveHullParams(ship, an);
  const m = hp.massKg, L = hp.waterlineLengthM, T = hp.draftM;
  const mx = 1.1 * m, my = 1.7 * m, Iz = 1.3 * m * (0.25 * L) ** 2;
  const clrRel = hp.clrX - hp.cgX;
  const rud = rudder ? { maxDeg: 35, rateDegS: 4, areaM2: 1, x: -L / 2, ...rudder, xRel: (rudder.x ?? 0) } : null;
  const sailList = sails.map((s) => {
    if (!s?.id) throw new TypeError('sail needs an id');
    const type = SAIL_TYPES[s.type ?? 'foreAndAft'];
    if (!type) throw new RangeError(`unknown sail type ${s.type}`);
    return { ...type, ...s, deployed: s.deployed ?? 1, trimDeg: s.trimDeg ?? (SAIL_TYPES[s.type ?? 'foreAndAft'].minTrimDeg), xRel: s.x - hp.cgX };
  });
  if (new Set(sailList.map((s) => s.id)).size !== sailList.length) throw new TypeError('duplicate sail id');
  const oarList = oars.map((o) => {
    if (!o?.id || !['port', 'starboard'].includes(o.side) || !(o.rowers >= 0)) throw new TypeError('oar bank needs id, side (port/starboard) and rowers >= 0');
    return { powerPerRowerW: 120, efficiency: 0.6, enduranceS: 600, recoveryS: 300, sync: 0.9, ...o, effort: 0, stamina: 1,
      yRel: (o.side === 'port' ? -1 : 1) * Math.abs(o.y ?? hp.beamM / 2), xRel: (o.x ?? hp.cgX) - hp.cgX };
  });
  if (new Set(oarList.map((o) => o.id)).size !== oarList.length) throw new TypeError('duplicate oar bank id');
  const events = [];
  const s0 = { x: 0, y: 0, headingDeg: 0, u: 0, v: 0, r: 0, ...initial };
  const st = { time: 0, X: s0.x, Y: s0.y, psi: s0.headingDeg * DEG, u: s0.u, v: s0.v, r: s0.r, rudderDeg: 0, rudderTargetDeg: 0, headingTarget: null, heelDeg: 0, overpowered: false, anchor: null, aground: false, groundingDamageMJ: 0 };
  if (rud) rud.xRel = rud.x - hp.cgX;

  const fwd = () => [Math.sin(st.psi), Math.cos(st.psi)];
  const stb = () => [Math.cos(st.psi), -Math.sin(st.psi)];
  const windVec = (env) => {
    const w = typeof env?.wind === 'function' ? env.wind(st.X, st.Y, st.time) : env?.wind ?? { x: 0, y: 0 };
    return w;
  };
  const currentBody = (env) => {
    const c = typeof env?.current === 'function' ? env.current(st.X, st.Y, st.time) : env?.current ?? { x: 0, y: 0 };
    const f = fwd(), s = stb();
    return { u: c.x * f[0] + c.y * f[1], v: c.x * s[0] + c.y * s[1] };
  };

  /** Sail force (body frame) for a given trim, using the apparent wind. Returns [Fx, Fy] in N. */
  function sailForce(sail, trimDeg, aw, heelDeg) {
    const speed = Math.hypot(aw.x, aw.y);
    if (speed < 1e-6 || sail.deployed <= 0) return [0, 0];
    const th = trimDeg * DEG, c = [-Math.cos(th), Math.sin(th)];
    const n = [c[1], -c[0]], d = [aw.x / speed, aw.y / speed];
    const sN = d[0] * n[0] + d[1] * n[1];
    const qA = 0.5 * airDensity * speed * speed * sail.areaM2 * sail.deployed * Math.cos(heelDeg * DEG) ** 2;
    const cn = sail.cnMax * Math.tanh(sail.cnSlope * sN / sail.cnMax);
    return [qA * (cn * n[0] + sail.cd0 * d[0]), qA * (cn * n[1] + sail.cd0 * d[1])];
  }

  function apparentWind(env) {
    const w = windVec(env), f = fwd(), s = stb();
    const wx = w.x * f[0] + w.y * f[1], wy = w.x * s[0] + w.y * s[1];
    const c = currentBody(env);
    // Ship velocity over ground is (u + current, v + current); air relative to ship = wind - ship ground velocity.
    return { x: wx - (st.u + c.u), y: wy - (st.v + c.v) };
  }

  const pointWorld = (xb, yb) => { const f = fwd(), sd = stb(); return [st.X + xb * f[0] + yb * sd[0], st.Y + xb * f[1] + yb * sd[1]]; };
  const bowRel = ship.hull.xMax - hp.cgX, sternRel = ship.hull.xMin - hp.cgX;

  /** Spring-damper anchor rode. Returns null while the rode is slack. */
  function rode(A, env) {
    const B = pointWorld(bowRel, 0), dx = A.X - B[0], dy = A.Y - B[1], d = Math.hypot(dx, dy);
    const Lh = Math.sqrt(Math.max(A.rodeM ** 2 - A.depthM ** 2, 0));
    const ext = d - Lh;
    if (!(ext > 0) || d < 1e-9) return null;
    const ux = dx / d, uy = dy / d, f = fwd(), sd = stb();
    const vx = st.u * f[0] + st.v * sd[0], vy = st.u * f[1] + st.v * sd[1];
    const k = A.stiffnessN / A.rodeM, c = 0.3 * 2 * Math.sqrt(k * m);
    const T = Math.max(0, k * ext - c * (vx * ux + vy * uy));
    const Fw = [T * ux, T * uy];
    return { T, Tstatic: k * ext, k, ext, Lh, ux, uy, forceBody: [Fw[0] * f[0] + Fw[1] * f[1], Fw[0] * sd[0] + Fw[1] * sd[1]], attach: bowRel };
  }

  /** Seabed contact: depth under bow/centre/stern vs draft; support limited by lost buoyancy. */
  function ground(env) {
    let dMin = Infinity;
    for (const xb of [sternRel, 0, bowRel]) { const p = pointWorld(xb, 0); dMin = Math.min(dMin, depthAt(env, p[0], p[1], st.time)); }
    const clearance = dMin - T, pen = -clearance, c = pointWorld(0, 0);
    if (!(pen > 0)) return { contact: false, clearance };
    const sb = seabedAt(env, c[0], c[1], st.time);
    return { contact: true, clearance, mu: sb.mu, normalN: Math.min(m * G_ACC, waterDensityUsed * G_ACC * an.upright.waterplaneArea * pen) };
  }
  const waterDensityUsed = waterDensity;

  function forces(env = {}) {
    const c = currentBody(env), uw = st.u - c.u, vw = st.v - c.v; // water-relative
    const U = Math.hypot(uw, vw), q = 0.5 * waterDensity;
    let X = 0, Y = 0, N = 0;
    const out = {};
    // Hull: friction + form + wave-making along the flow direction, using total water speed.
    if (U > 1e-9) {
      const Re = Math.max(U * L / NU_SEA, 1e5), Cf = 0.075 / (Math.log10(Re) - 2) ** 2;
      const Fr = U / Math.sqrt(G_ACC * L), Cw = Math.min(0.0005 + waveK * 0.003 * (Fr / 0.35) ** 4, 0.05);
      const Rhull = q * U * U * hp.wettedAreaM2 * ((Cf + roughnessCf) * (1 + form) + Cw);
      X -= Rhull * uw / U; Y -= Rhull * vw / U;
      out.hullResistanceN = Rhull;
    }
    // Keel lift (small leeway) and cross-flow drag on lateral area; both act at the centre of lateral resistance.
    const Fkeel = -q * hp.lateralAreaM2 * keelLiftSlope * Math.abs(uw) * vw - q * crossFlowCd * hp.lateralAreaM2 * vw * Math.abs(vw);
    Y += Fkeel; N += Fkeel * clrRel;
    // Yaw damping (strip theory, cross-flow): N = -0.5 rho Cd T L^4/32 r|r|
    N -= q * crossFlowCd * T * (L ** 4) / 32 * st.r * Math.abs(st.r);
    out.leewayDeg = Math.abs(uw) > 1e-6 ? Math.atan2(vw, Math.abs(uw)) / DEG : 0;
    // Rudder
    if (rud) {
      const vr = vw + st.r * rud.xRel, Vr2 = uw * uw + vr * vr;
      const alpha = st.rudderDeg * DEG + Math.atan2(vr, Math.abs(uw) + 1e-9) * Math.sign(uw || 1);
      const CN = Math.sin(2 * clamp(alpha, -35 * DEG, 35 * DEG));
      const Yr = -q * rud.areaM2 * Vr2 * CN;
      Y += Yr; N += Yr * rud.xRel;
      out.rudderForceN = Yr;
    }
    // Oars: thrust = eta * P / (U + U0). Left/right difference turns the ship.
    let oarThrust = 0;
    for (const o of oarList) {
      const e = clamp(o.effort, -1, 1), P = o.rowers * o.powerPerRowerW * Math.abs(e) * (0.4 + 0.6 * o.stamina) * o.sync;
      if (P <= 0) continue;
      const sg = Math.sign(e), F = sg * o.efficiency * P / (Math.max(sg * uw, 0) + 0.5);
      X += F; N -= F * o.yRel; N += 0; oarThrust += F;
    }
    if (oarList.length) out.oarThrustN = oarThrust;
    // Anchor rode
    const A = st.anchor;
    if (A) {
      const r = rode(A, env);
      if (r) { const fxy = r.forceBody; X += fxy[0]; Y += fxy[1]; N += r.attach * fxy[1]; out.rodeTensionN = r.T; }
    }
    // Seabed contact
    const g0 = ground(env);
    if (g0.contact) {
      const sp = Math.hypot(st.u, st.v), k = Math.tanh(sp / 0.05), mu = g0.mu * g0.normalN;
      if (sp > 1e-9) { X -= mu * k * st.u / sp; Y -= mu * k * st.v / sp; }
      N -= 0.1 * mu * L * Math.tanh(st.r / 0.02);
      out.groundNormalN = g0.normalN;
    }
    out.clearanceM = g0.clearance;
    // Sails
    const aw = apparentWind(env);
    let Fsx = 0, Fsy = 0, Mheel = 0;
    for (const s of sailList) {
      const [fx, fy] = sailForce(s, s.trimDeg, aw, st.heelDeg);
      Fsx += fx; Fsy += fy; N += fy * s.xRel; Mheel += fy * (s.zCe - hp.waterlineZ + T / 2);
    }
    X += Fsx; Y += Fsy;
    out.sailForceN = [Fsx, Fsy]; out.heelingMomentNm = Mheel; out.apparentWind = aw;
    // Hull windage (drag along apparent wind)
    if (windageAreaM2 > 0) {
      const sp = Math.hypot(aw.x, aw.y);
      X += 0.5 * airDensity * 0.8 * windageAreaM2 * sp * aw.x; Y += 0.5 * airDensity * 0.8 * windageAreaM2 * sp * aw.y;
    }
    return { X, Y, N, ...out };
  }

  /** Choose, for each sail, the trim (within its brace limit) that maximises forward drive. */
  function autoTrim(env = {}) {
    const aw = apparentWind(env);
    for (const s of sailList) {
      let best = s.trimDeg, bestFx = -Infinity;
      for (let a = s.minTrimDeg; a <= 90; a += 2.5) for (const sg of [1, -1]) {
        const fx = sailForce(s, sg * a, aw, st.heelDeg)[0];
        if (fx > bestFx) { bestFx = fx; best = sg * a; }
      }
      s.trimDeg = best;
    }
  }

  function deriv(v, env) {
    const save = [st.u, st.v, st.r, st.psi];
    [st.u, st.v, st.r] = v;
    const F = forces(env);
    const d = [(F.X + my * st.v * st.r) / mx, (F.Y - mx * st.u * st.r) / my, F.N / Iz];
    [st.u, st.v, st.r, st.psi] = save;
    return { d, F };
  }

  function step(dt = 0.1, env = {}) {
    if (st.headingTarget !== null && st.headingTarget !== undefined) steerTowards(st.headingTarget); // helm runs every physics step
    // Rudder follows its target at a limited rate.
    if (rud) {
      const tgt = clamp(st.rudderTargetDeg, -rud.maxDeg, rud.maxDeg), dr = rud.rateDegS * dt;
      st.rudderDeg += clamp(tgt - st.rudderDeg, -dr, dr);
    }
    // Heel from the previous step's heeling moment (one-step lag), via the hydrostatic GZ curve.
    const f0 = forces(env);
    const h = heelFromMoment(an, f0.heelingMomentNm);
    st.heelDeg = h.heelDeg; st.overpowered = h.overpowered;
    // Heun (RK2)
    const v0 = [st.u, st.v, st.r], { d: k1 } = deriv(v0, env);
    const v1 = v0.map((x, i) => x + dt * k1[i]), { d: k2 } = deriv(v1, env);
    st.u += dt * 0.5 * (k1[0] + k2[0]); st.v += dt * 0.5 * (k1[1] + k2[1]); st.r += dt * 0.5 * (k1[2] + k2[2]);
    const f = fwd(), s = stb();
    st.X += dt * (st.u * f[0] + st.v * s[0]); st.Y += dt * (st.u * f[1] + st.v * s[1]);
    st.psi += dt * st.r; st.time += dt;
    for (const o of oarList) {
      const e = Math.abs(clamp(o.effort, -1, 1));
      o.stamina = clamp(o.stamina - dt * e * e / o.enduranceS + dt * (1 - o.stamina) * Math.max(0, 0.5 - e) / o.recoveryS, 0, 1);
    }
    const A = st.anchor;
    if (A) {
      const r = rode(A, env);
      if (r && r.Tstatic > A.breakingN) { st.anchor = null; events.push({ type: 'anchor_parted', time: st.time }); }
      else if (r && r.Tstatic > A.holdN) {
        if (!A.dragging) events.push({ type: 'anchor_dragging', time: st.time });
        A.dragging = true;
        const hold = r.Lh + A.holdN / r.k, B = pointWorld(bowRel, 0), d = r.Lh + r.ext;
        A.X = B[0] + (A.X - B[0]) * hold / d; A.Y = B[1] + (A.Y - B[1]) * hold / d;
      } else if (A.dragging && (!r || r.Tstatic < 0.9 * A.holdN)) A.dragging = false;
    }
    const g1 = ground(env), sp = Math.hypot(st.u, st.v);
    if (g1.contact && !st.aground) {
      const dmg = 0.5 * m * sp * sp * (g1.mu / 0.4) / 1e6;
      st.groundingDamageMJ += dmg;
      events.push({ type: 'grounded', time: st.time, impactSpeed: sp, clearanceM: g1.clearance, damageMJ: dmg });
    } else if (!g1.contact && st.aground) events.push({ type: 'refloated', time: st.time });
    st.aground = g1.contact;
  }

  /** Simple PD helm: sets the rudder target to hold a compass heading (deg). Placeholder for a captain AI. */
  function steerTowards(headingDeg, { kp = 1.2, kd = 12 } = {}) {
    let err = ((headingDeg - st.psi / DEG + 540) % 360) - 180;
    st.rudderTargetDeg = clamp(kp * err - kd * (st.r / DEG), -35, 35);
  }

  function run(duration, dt = 0.1, env = {}, { trim = false, heading = null } = {}) {
    for (let i = 0, n = Math.round(duration / dt); i < n; i++) {
      if (trim && i % 10 === 0) autoTrim(env);
      if (heading !== null) steerTowards(heading);
      step(dt, env);
    }
  }

  const sailById = (id) => { const s = sailList.find((x) => x.id === id); if (!s) throw new RangeError(`unknown sail ${id}`); return s; };
  return {
    params: Object.freeze({ ...hp, mx, my, Iz }), state: st, sails: sailList,
    forces, step, run, autoTrim, apparentWind, steerTowards,
    setRudder(deg) { st.headingTarget = null; st.rudderTargetDeg = deg; },
    /** Hold a compass heading (deg) automatically every physics step; null returns to manual rudder control. */
    setHeadingTarget(deg) { st.headingTarget = deg === null ? null : ((deg % 360) + 360) % 360; },
    setOarEffort(id, e) { const o = oarList.find((x) => x.id === id); if (!o) throw new RangeError(`unknown oar bank ${id}`); o.effort = clamp(e, -1, 1); },
    setAllOarEffort(e) { for (const o of oarList) o.effort = clamp(e, -1, 1); },
    oars: oarList,
    /** Drop the anchor at the bow. Returns {status}: ok | already | no_depth_data | too_deep. */
    dropAnchor(env = {}, { anchorKg = 500, rodeM = 60, stiffnessN = 1e6, breakingN = Infinity } = {}) {
      if (st.anchor) return { status: 'already' };
      const B = pointWorld(bowRel, 0), depthM = depthAt(env, B[0], B[1], st.time);
      if (!Number.isFinite(depthM)) return { status: 'no_depth_data' };
      if (depthM >= rodeM) return { status: 'too_deep', depthM };
      const sb = seabedAt(env, B[0], B[1], st.time), scope = rodeM / Math.max(depthM, 0.1);
      const holdN = sb.hold * anchorKg * G_ACC * clamp(scope / 5, 0.2, 1);
      st.anchor = { X: B[0], Y: B[1], anchorKg, rodeM, depthM, stiffnessN, breakingN, holdN, scope, dragging: false };
      events.push({ type: 'anchor_dropped', time: st.time, depthM, scope, holdN });
      return { status: 'ok', depthM, scope, holdN };
    },
    raiseAnchor() { const had = !!st.anchor; st.anchor = null; if (had) events.push({ type: 'anchor_raised', time: st.time }); return had; },
    takeEvents() { return events.splice(0); },
    setSailTrim(id, deg) { const s = sailById(id); s.trimDeg = (deg < 0 ? -1 : 1) * clamp(Math.abs(deg), s.minTrimDeg, 90); },
    setSailDeployed(id, frac) { sailById(id).deployed = clamp(frac, 0, 1); },
    snapshot() {
      const f = fwd(), s = stb(), sx = st.u * f[0] + st.v * s[0], sy = st.u * f[1] + st.v * s[1];
      return { time: st.time, x: st.X, y: st.Y, headingDeg: ((st.psi / DEG) % 360 + 360) % 360, u: st.u, v: st.v, yawRateDegS: st.r / DEG, speedOverGround: Math.hypot(sx, sy), velocity: { x: sx, y: sy }, heelDeg: st.heelDeg, overpowered: st.overpowered, rudderDeg: st.rudderDeg, aground: st.aground, anchored: !!st.anchor, anchorDragging: !!st.anchor?.dragging, groundingDamageMJ: st.groundingDamageMJ, stamina: oarList.length ? Math.min(...oarList.map((o) => o.stamina)) : null };
    },
  };
}
