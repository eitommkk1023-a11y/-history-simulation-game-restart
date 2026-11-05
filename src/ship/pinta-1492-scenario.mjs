/**
 * August 1492 scenario for the Pinta: rudder disengaged (8/6), repair after a repeat problem (8/7), leak reported (8/8).
 * HISTORICAL (level A, Columbus diary abridgement): those three dated events happened. GAME (level D): everything about how:
 * the lashing, the second failure, work times, the leak rate and pumping rate are hypotheses. One scenario day lasts `daySeconds`
 * of simulated time (default 86400; use something short to play it). Bilge water is carried as mass in the hold.
 */
import { PINTA_1492_PROFILE as P } from './pinta-1492-data.mjs';
import { cargoItem, withCargo } from './cargo.mjs';

const src = (kind) => { const e = P.historical_events.find((x) => x.kind === kind); return { date: e.date, kind: e.kind, source: e.source, evidence_level: e.evidence_level }; };
// Work and flow figures are per GAME hour (one scenario day = daySeconds), so the scenario can be played in minutes.
export const SCENARIO = Object.freeze({ lashRepairWorkH: 2, properRepairWorkH: 6, leakM3PerH: 0.5, pumpM3PerHPerPumper: 0.35, bilgeItemId: 'bilge-water', rudderLashHealth: 0.5 });

export function createAugust1492({ fleet, shipId, daySeconds = 86400, baseMass = null, hold = { x: 8.0, y: 0, z: 0.9 } }) {
  const rec = () => fleet.get(shipId), base = baseMass ?? rec().vessel.analysis?.items ?? null;
  const designMass = () => (rec().massItems ?? fleet.designMass(rec().designId));
  const hourS = daySeconds / 24;
  let t = 0, stage = 'sound', water = 0, appliedWater = 0, work = 0; const events = [];
  const emit = (h, extra) => events.push({ time: t, historical: src(h), game: extra });
  const apply = () => { // push the bilge water into the ship's mass items when it changed enough to matter
    if (Math.abs(water - appliedWater) < 0.1) return;
    const items = withCargo(designMass().filter((m) => m.id !== SCENARIO.bilgeItemId), [{ id: SCENARIO.bilgeItemId, massKg: water * 1025, ...hold }]);
    fleet.setLoad(shipId, items); appliedWater = water;
  };
  return {
    update(dt) {
      t += dt; const crew = rec().crew, v = rec().vessel, day = t / daySeconds, fx = crew?.effects?.() ?? {};
      if (stage === 'sound' && day >= 0.1) { v.setRudderHealth(0); stage = 'disengaged'; emit('rudder_disengaged', { note: 'rudder comes off its fittings; steering lost (D)' }); fleet.setCrewNeeds(shipId, { repairers: 2 }); }
      if (stage === 'disengaged' && crew && crew.repairSeconds() >= SCENARIO.lashRepairWorkH * hourS) { v.setRudderHealth(SCENARIO.rudderLashHealth); stage = 'lashed'; work = 0; emit('rudder_repair_after_repeat_problem', { note: 'emergency lashing (D): reduced steering' }); fleet.setCrewNeeds(shipId, {}); }
      if (stage === 'lashed' && day >= 1.1) { v.setRudderHealth(0.15); stage = 'repeat'; emit('rudder_disengaged', { note: 'the lashing works loose again (D)' }); fleet.setCrewNeeds(shipId, { repairers: 3 }); }
      if (stage === 'repeat' && crew && crew.repairSeconds() >= SCENARIO.properRepairWorkH * hourS) { v.setRudderHealth(0.85); stage = 'repaired'; emit('rudder_repair_after_repeat_problem', { note: 'proper repair (D)' }); fleet.setCrewNeeds(shipId, {}); }
      if (day >= 2.1 && !events.some((e) => e.historical.kind === 'leak_reported')) emit('leak_reported', { note: `leak of ${SCENARIO.leakM3PerH} m3/h (D)` });
      if (day >= 2.1) {
        const pumpers = fx.pumpers ?? 0; water = Math.max(0, water + (SCENARIO.leakM3PerH - pumpers * SCENARIO.pumpM3PerHPerPumper) * dt / hourS);
        const needs = rec().crewNeeds; if (water > 0.3 && !needs.pumpers) fleet.setCrewNeeds(shipId, { ...needs, pumpers: 3 }); if (water < 0.05 && needs.pumpers) fleet.setCrewNeeds(shipId, { ...needs, pumpers: 0 });
        apply();
      }
    },
    get stage() { return stage; }, get bilgeWaterM3() { return water; }, get events() { return events; }, takeEvents: () => events.splice(0),
  };
}
