// Prints sailing/rowing performance tables for the sample ships so model parameters can be compared with
// historical reference ranges. Usage: node tools/ship-calibration.mjs [json of createVessel overrides]
import { createShip, analyzeHydrostatics, createVessel } from '../src/ship/index.mjs';
import { sampleDesigns } from '../src/ship/samples.mjs';

const KT = 1.9438;
export function measure(overrides = {}, { wind = 10, headings = [30, 40, 50, 60, 70, 80, 90, 110, 130, 150, 180], seconds = 400 } = {}) {
  const d = sampleDesigns.galleon, ship = createShip({ id: 'g', hull: d.hull, massItems: d.massItems });
  const analysis = analyzeHydrostatics(ship), rows = {};
  for (const type of ['square', 'foreAndAft']) {
    rows[type] = headings.map((h) => {
      const v = createVessel({ ship, analysis, rudder: d.rudder, sails: [{ ...d.sails[0], type }], ...d.tuning, ...overrides.vessel });
      if (overrides.sail) for (const s of v.sails) Object.assign(s, overrides.sail);
      v.state.psi = h * Math.PI / 180; v.state.u = 2;
      const env = { wind: { x: 0, y: -wind } };
      v.run(seconds, 0.1, env, { trim: true, heading: h });
      const s = v.snapshot(), f = v.forces(env);
      return { h, kt: s.speedOverGround * KT, vmg: s.velocity.y * KT, leeway: Math.abs(f.leewayDeg), heel: s.heelDeg };
    });
  }
  return rows;
}
/** Same table for a design with its own sails (e.g. the mixed square/lateen rig of the Pinta). */
export function measureDesign(designId, { wind = 10, headings = [40, 50, 60, 70, 80, 90, 110, 130, 180], seconds = 300 } = {}) {
  const d = sampleDesigns[designId], ship = createShip({ id: designId, hull: d.hull, massItems: d.massItems }), analysis = analyzeHydrostatics(ship);
  return headings.map((h) => {
    const v = createVessel({ ship, analysis, rudder: d.rudder, sails: d.sails.map((x) => ({ ...x })), windageAreaM2: d.windageAreaM2, ...d.tuning });
    v.state.psi = h * Math.PI / 180; v.state.u = 2;
    const env = { wind: { x: 0, y: -wind }, depth: 50 };
    v.run(seconds, 0.1, env, { trim: true, heading: h });
    const s = v.snapshot(), f = v.forces(env);
    return { h, kt: s.speedOverGround * KT, vmg: s.velocity.y * KT, leeway: Math.abs(f.leewayDeg), heel: s.heelDeg };
  });
}
if (process.argv[1].endsWith('ship-calibration.mjs')) {
  if (process.argv[2] && !process.argv[2].startsWith('{')) {
    for (const x of measureDesign(process.argv[2])) console.log(`  heading ${String(x.h).padStart(3)}  speed ${x.kt.toFixed(1)} kt  upwind VMG ${x.vmg.toFixed(1)} kt  leeway ${x.leeway.toFixed(1)}°  heel ${x.heel.toFixed(1)}°`);
    process.exit(0);
  }
  const ov = process.argv[2] ? JSON.parse(process.argv[2]) : {};
  const r = measure(ov);
  for (const [type, rows] of Object.entries(r)) {
    console.log(type);
    for (const x of rows) console.log(`  heading ${String(x.h).padStart(3)}  speed ${x.kt.toFixed(1)} kt  upwind VMG ${x.vmg.toFixed(1)} kt  leeway ${x.leeway.toFixed(1)}°  heel ${x.heel.toFixed(1)}°`);
  }
}
