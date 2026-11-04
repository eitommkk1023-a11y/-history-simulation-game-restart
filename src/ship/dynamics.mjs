/**
 * 2D (surge, sway, yaw) vessel dynamics prototype (Ver.8/9/11 basic design).
 * World frame: X east, Y north (m). Heading psi: clockwise from north (rad).
 * Body frame: x forward, y STARBOARD (same as the hull frame), r = dpsi/dt (+ = turning to starboard).
 *  forward = (sin psi, cos psi), starboard = (cos psi, -sin psi)
 * mx(du/dt) = X + my v r ;  my(dv/dt) = Y - mx u r ;  Iz dr/dt = N.
 * Forces: hull friction (ITTC-1957 line) + form + simple wave-making, keel lift and cross-flow
 * drag, yaw damping, rudder, sails (apparent wind), hull windage. Sail heel from the GZ curve.
 * ALL COEFFICIENTS ARE EXPERIMENTAL placeholders, NOT approved rules or calibrated data.
 * Not modelled yet: roll/pitch/heave dynamics, waves, oars, mooring, shallow-water effects.
 */
import { deriveHullParams } from './hull-params.mjs';
import { analyzeHydrostatics, WATER_DENSITY } from './hydrostatics.mjs';

const DEG = Math.PI / 180, G_ACC = 9.80665, NU_SEA = 1.2e-6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const sail_defaults = Object.freeze({ cnMax: 1.5, cnSlope: 4, cd0: 0.05 });

/** Sail presets: minTrimDeg = how close to the centreline the sail chord can be set (square sails are limited by shrouds/yard bracing); trim can go up to 90 deg (square to the wind). */
export const SAIL_TYPES = Object.freeze({
  square: Object.freeze({ ...sail_defaults, cnMax: 1.4, minTrimDeg: 32 }),
  foreAndAft: Object.freeze({ ...sail_defaults, cnMax: 1.6, cnSlope: 4.5, minTrimDeg: 8 }),
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

export function createVessel({ ship, analysis, hullParams, sails = [], rudder, waterDensity = WATER_DENSITY.seawater, airDensity = 1.225,
  windageAreaM2 = 0, form = 0.2, keelLiftSlope = 2, crossFlowCd = 1.0, initial = {} } = {}) {
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
  const s0 = { x: 0, y: 0, headingDeg: 0, u: 0, v: 0, r: 0, ...initial };
  const st = { time: 0, X: s0.x, Y: s0.y, psi: s0.headingDeg * DEG, u: s0.u, v: s0.v, r: s0.r, rudderDeg: 0, rudderTargetDeg: 0, heelDeg: 0, overpowered: false };
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

  function forces(env = {}) {
    const c = currentBody(env), uw = st.u - c.u, vw = st.v - c.v; // water-relative
    const U = Math.hypot(uw, vw), q = 0.5 * waterDensity;
    let X = 0, Y = 0, N = 0;
    const out = {};
    // Hull: friction + form + wave-making along the flow direction, using total water speed.
    if (U > 1e-9) {
      const Re = Math.max(U * L / NU_SEA, 1e5), Cf = 0.075 / (Math.log10(Re) - 2) ** 2;
      const Fr = U / Math.sqrt(G_ACC * L), Cw = Math.min(0.0005 + 0.003 * (Fr / 0.35) ** 4, 0.05);
      const Rhull = q * U * U * hp.wettedAreaM2 * (Cf * (1 + form) + Cw);
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
    setRudder(deg) { st.rudderTargetDeg = deg; },
    setSailTrim(id, deg) { const s = sailById(id); s.trimDeg = (deg < 0 ? -1 : 1) * clamp(Math.abs(deg), s.minTrimDeg, 90); },
    setSailDeployed(id, frac) { sailById(id).deployed = clamp(frac, 0, 1); },
    snapshot() {
      const f = fwd(), s = stb(), sx = st.u * f[0] + st.v * s[0], sy = st.u * f[1] + st.v * s[1];
      return { time: st.time, x: st.X, y: st.Y, headingDeg: ((st.psi / DEG) % 360 + 360) % 360, u: st.u, v: st.v, yawRateDegS: st.r / DEG, speedOverGround: Math.hypot(sx, sy), velocity: { x: sx, y: sy }, heelDeg: st.heelDeg, overpowered: st.overpowered, rudderDeg: st.rudderDeg };
    },
  };
}
