/**
 * Sea state from the wind field: wind-sea height limited by fetch (distance to land upwind), a regional swell from the
 * monthly-mean wind, and the resulting ship motion (roll, pitch, heave) and added resistance.
 * All coefficients are game hypotheses (level D) that follow ordinary seamanship / ocean-wave rules of thumb:
 * fully developed Hs ~ 0.0214 U^2, wind-sea period ~ 3.9 sqrt(Hs), roll resonance, head seas slow a ship.
 * Pure functions of (position, time): no hidden state.
 * Directions: waves travel TOWARD `dirToRad` (rad, clockwise from north, like the ship heading psi).
 */
export const SEA_PARAMS = Object.freeze({
  fullyDevelopedK: 0.0214,   // Hs = K U^2 (m, m/s)
  fetchScaleM: 60000,        // wind sea reaches ~63% of its full height at this fetch
  openFetchM: 150000,        // fetch when no land is found within the search range
  fetchProbesM: [1000, 3000, 8000, 20000, 50000, 100000],
  swellFraction: 0.45,       // swell height relative to a fully developed sea at the regional mean wind
  swellPeriodS: 8,
  rollDamping: 0.12,         // zeta
  maxRollDeg: 25, maxPitchDeg: 12,
  addedResistance: 25,       // R multiplier = 1 + k (Hs/L)^2 * headness
});
const G = 9.81;
const periodOf = (hs) => Math.max(1.5, 3.9 * Math.sqrt(Math.max(hs, 0)));

/** swellSource(X, Y) -> { hs, dirToRad } | null: long swell that outruns a distant storm (the first sign of one). */
export function createSeaState({ windField, elev, params = {}, swellSource = null }) {
  const P = { ...SEA_PARAMS, ...params }, cache = new Map();
  /** Distance to land straight upwind (m), cached on a 500 m grid and 16 directions. */
  function fetchM(X, Y, ux, uy) {
    const ang = Math.round(Math.atan2(uy, ux) / (Math.PI / 8)), k = `${Math.round(X / 500)},${Math.round(Y / 500)}|${ang}`; let f = cache.get(k); if (f !== undefined) return f;
    const cx = Math.cos(ang * Math.PI / 8), cy = Math.sin(ang * Math.PI / 8); f = P.openFetchM;
    for (const d of P.fetchProbesM) if (elev(X + cx * d, Y + cy * d) > 0.5) { f = d; break; }
    if (cache.size > 6000) cache.clear(); cache.set(k, f); return f;
  }
  function info(X, Y, t = 0) {
    const w = windField.info(X, Y, t), U = w.speed, base = Math.hypot(w.base.x, w.base.y);
    const f = U > 0.05 ? fetchM(X, Y, -w.x / U, -w.y / U) : P.openFetchM;
    const hws = P.fullyDevelopedK * U * U * (1 - Math.exp(-f / P.fetchScaleM)), hsw0 = P.swellFraction * P.fullyDevelopedK * base * base;
    const ex = swellSource ? swellSource(X, Y) : null, exHs = ex?.hs > 0 ? ex.hs : 0, hsw = Math.hypot(hsw0, exHs);
    const windDir = Math.atan2(w.x, w.y), swellDir = exHs > hsw0 ? ex.dirToRad : Math.atan2(w.base.x, w.base.y), hs = Math.hypot(hws, hsw);
    return { hs, tp: hws >= hsw ? periodOf(hws) : (exHs > hsw0 ? 11 : P.swellPeriodS), dirToRad: hws >= hsw ? windDir : swellDir, windSeaHs: hws, swellHs: hsw, precursorHs: exHs, fetchM: f };
  }
  return { info, params: P };
}

/**
 * Ship motion at time t (seconds) in a sea state. ship: { psi (rad), u (forward m/s), lengthM, beamM, rollPeriodS }.
 * Two superposed components (period Tp and 1.37 Tp) keep it from looking like a metronome. Returns degrees and metres.
 */
export function waveMotion(sea, ship, t, params = SEA_PARAMS) {
  const { hs, tp, dirToRad } = sea; if (!(hs > 0.01)) return { rollDeg: 0, pitchDeg: 0, heaveM: 0 };
  const L = ship.lengthM, rel = dirToRad - ship.psi, cr = Math.cos(rel), sr = Math.sin(rel), wn = 2 * Math.PI / (ship.rollPeriodS ?? 5);
  let roll = 0, pitch = 0, heave = 0;
  [[1, 1], [1.37, 0.5]].forEach(([tm, amp], i) => {
    const T = tp * tm, w = 2 * Math.PI / T, k = w * w / G, lam = 2 * Math.PI / k, h = hs * amp * 0.5, slope = Math.min(0.3, k * h);
    const we = Math.abs(w - k * Math.max(0, ship.u) * cr), r = we / wn, z = params.rollDamping, resp = 1 / Math.sqrt((1 - r * r) ** 2 + (2 * z * r) ** 2), ph = we * t + i * 1.7;
    roll += slope * Math.abs(sr) * Math.min(resp, 4) * Math.sin(ph);
    pitch += slope * Math.abs(cr) * Math.min(1, lam / L) * 0.8 * Math.sin(ph + 1.1);
    heave += h * 0.8 * Math.min(1, lam / L) * Math.sin(ph + 0.4);
  });
  const D = 180 / Math.PI;
  return { rollDeg: Math.max(-params.maxRollDeg, Math.min(params.maxRollDeg, roll * D)), pitchDeg: Math.max(-params.maxPitchDeg, Math.min(params.maxPitchDeg, pitch * D)), heaveM: heave };
}

/** Hull resistance multiplier from waves: full effect head-on, small when following. */
export function addedResistanceFactor(hs, lengthM, psi, dirToRad, k = SEA_PARAMS.addedResistance) {
  const head = Math.max(0.2, -Math.cos(dirToRad - psi)); // waves coming against the heading
  return 1 + k * (hs / lengthM) ** 2 * head;
}
