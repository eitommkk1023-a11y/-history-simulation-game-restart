/**
 * Game-side assumptions for the 1492 Pinta. EVERY value here that is not a copy of the research profile is a
 * hypothesis (evidence level "D": made up to let the model work, NOT historical) or "derived" (computed from level B
 * research values plus the stated rule). Nothing here is a measurement of the original ship, which has no surviving plans.
 * Research figures (16.90 m, 5.00 m, 1.58 m ...) are read from pinta-1492-data.mjs, never retyped here.
 */
import { PINTA_1492_PROFILE as P } from './pinta-1492-data.mjs';

const d = (value, note) => Object.freeze({ value, evidence_level: 'D', note });
const derived = (value, note) => Object.freeze({ value, evidence_level: 'derived', note });
const dim = (k) => P.dimensions[k].value;

export const PINTA_1492_PARAMS = Object.freeze({
  hull: Object.freeze({
    // The research "Puntal" (2.28 m) is not an absolute deck height; deck = Puntal + allowance for keel/ceiling thickness.
    deckHeightZ: d(+(dim('puntal_reconstructed') + 0.32).toFixed(2), 'Puntal 2.28 m (B) + 0.32 m allowance (D): height of the main deck above the keel underside'),
    bulwarkHeight: d(0.7, 'low waist bulwark above the main deck; no modern safety rails'),
    sternOverhang: d(0.45, 'share of (overall - waterline length) behind the waterline'),
    stemOverhang: derived(+(dim('length_overall') - dim('length_waterline') - 0.45).toFixed(2), 'overall - waterline length (B) - stern overhang (D)'),
    keelFlatFrom: d(3.0, 'aft end of the flat keel; the flat length itself is the research keel value'),
    keelFlatLength: derived(dim('keel_length_research'), 'research "Quilla" (B) used as the flat run of the keel'),
    waterlineBreadthRatio: derived(+(dim('beam_waterline') / dim('beam_max')).toFixed(4), 'waterline beam / maximum beam (both B)'),
    floorHalfWidthMid: derived(+(dim('plan_width_research') / 2).toFixed(3), 'research "Plan" (B) taken as the flat floor width at midships'),
    deckHalfBreadthTable: d([[0, 0.45], [0.1, 1.45], [0.2, 2.05], [0.35, 2.43], [0.5, 2.5], [0.65, 2.35], [0.8, 1.75], [0.9, 1.05], [1, 0.08]], 'half-breadth at deck level for u = 0 (stern) .. 1 (bow): the spec\'s TEST values, scaled so the maximum is half the research beam'),
    plankWidth: d(0.18, 'visual only: horizontal carvel plank seams'),
  }),
  quarterdeck: Object.freeze({ lengthU: d(0.26, 'small after deck; no stern gallery'), rise: d(0.95, 'height of the quarterdeck above the main deck') }),
  interior: Object.freeze({
    holdWalkClearance: d(1.85, 'head room under the deck beams used to place the hold walking level (cargo and ballast fill below)'),
    hatch: d({ u0: 0.44, u1: 0.56, width: 1.3 }, 'main hatch to the hold'),
    // The research gives only the hold's overall internal size; how it was divided is unknown. This 3-way split follows the spec's list of hold contents
    // (water casks, food, gear, repair materials, ballast, cargo) and is a hypothesis.
    holdPartitions: d({ aft: { x0: 1.4, x1: 4.6 }, main: { x0: 5.0, x1: 12.6 }, fore: { x0: 13.0, x1: 15.3 }, doorWidth: 1.4, gap: 0.4 }, 'hold divided into an after store (casks, food), a central cargo hold (with the hatch) and a fore locker (sails, rope, repair material); two doorways'),
  }),
  rudder: Object.freeze({ hingeX: d(0.15, 'sternpost-hung rudder hinge, metres from the transom'), bladeWidth: d(0.85, 'm'), bladeDepth: d(2.0, 'm, from the keel line down/up'), tillerLength: d(2.2, 'm'), maxDeg: d(35, 'deg'), areaM2: d(1.4, 'm2 effective blade area') }),
  rig: Object.freeze({
    // Positions u = 0 stern .. 1 bow. All level D (no surviving rig plan; the research gives only a 3-mast square/square/lateen candidate).
    foremast: d({ u: 0.8, height: 9.0, yard: 6.0, sailAreaM2: 24 }, 'square sail'),
    mainmast: d({ u: 0.5, height: 11.5, yard: 8.5, sailAreaM2: 50 }, 'square sail'),
    mizzen: d({ u: 0.15, height: 8.0, yard: 11.0, sailAreaM2: 28 }, 'lateen sail'),
    cloth: d('unbleached linen, no insignia', 'sail insignia unresolved: off by default'),
  }),
  mass: Object.freeze({
    // Lightship mass is DERIVED from the hull form at the research light draft; this only splits it among components.
    split: d({ hullStructure: 0.55, ballast: 0.28, rigAndGear: 0.07, fittings: 0.1 }, 'fractions of the lightship mass'),
    centresZ: d({ hullStructure: 1.35, ballast: 0.55, rigAndGear: 4.6, fittings: 1.8 }, 'heights above the keel underside'),
    waterBarrelKg: d(260, 'one water barrel with contents (assumed 250 L)'),
    personKg: d(75, 'per person'),
  }),
  crew: Object.freeze({ scenarioSize: d(P.dimensions.crew_size.value, 'scenario starting value only; other sources differ, never a fixed roster size') }),
  tuning: Object.freeze({ roughnessCf: d(0.0015, 'generic carvel hull, not calibrated to this ship'), form: d(0.4, 'generic'), waveK: d(40, 'generic'), keelLiftSlope: d(0.5, 'generic low-aspect hull'), windageAreaM2: d(12, 'm2 hull and rig windage') }),
  armament: Object.freeze({ status: 'unresolved', note: 'number, calibre and positions of guns are not established; none is modelled' }),
});

const LEVELS = ['A', 'B', 'C', 'D'];
/** Checks the research profile (evidence labels, units, forbidden confusions). Returns a list of problems (empty = ok). */
export function validatePintaProfile(profile = P) {
  const bad = [];
  if (profile.not_original_blueprints !== true) bad.push('not_original_blueprints must be true');
  for (const [k, v] of Object.entries(profile.dimensions ?? {})) {
    if (!LEVELS.includes(v.evidence_level)) bad.push(`${k}: evidence_level missing`);
    if (typeof v.unit !== 'string') bad.push(`${k}: unit missing`);
    if (v.value === null && v.evidence_level !== 'D') bad.push(`${k}: unknown value must be level D`);
    if (v.value !== null && !(typeof v.value === 'number' && Number.isFinite(v.value))) bad.push(`${k}: value must be a finite number or null`);
    if (['A', 'B', 'C'].includes(v.evidence_level) && !v.source) bad.push(`${k}: a sourced level needs a source`);
    if (v.source && !(v.source in profile.sources)) bad.push(`${k}: unknown source ${v.source}`);
  }
  const dm = profile.dimensions;
  if (dm.displacement_mass?.value !== null) bad.push('displacement_mass must stay null: it is computed from the hull form');
  if (!/historical/.test(dm.toneladas_de_arqueo?.unit ?? '')) bad.push('toneladas_de_arqueo must stay a historical volume measure');
  if (!(dm.length_waterline.value < dm.length_overall.value && dm.beam_waterline.value < dm.beam_max.value && dm.lightship_draft.value < dm.puntal_reconstructed.value)) bad.push('inconsistent main dimensions');
  const rigs = (profile.rig_presets ?? []).map((r) => r.id);
  for (const id of ['atlantic_square_rig', 'departure_lateen_hypothesis']) if (!rigs.includes(id)) bad.push(`rig preset ${id} missing`);
  for (const u of ['authentic_blueprints', 'rig_refit_ship_identity', 'armament_exact_number', 'sail_insignia']) if (!(profile.unresolved ?? []).includes(u)) bad.push(`unresolved list lacks ${u}`);
  if (!profile.dimensions.crew_size || profile.dimensions.crew_size.evidence_level !== 'D') bad.push('crew_size must stay a level D scenario value');
  return bad;
}

/** Every game parameter must be labelled as hypothesis (D) or derived. */
export function validatePintaParams(params = PINTA_1492_PARAMS) {
  const bad = [], walk = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && 'evidence_level' in v) { if (!['D', 'derived'].includes(v.evidence_level)) bad.push(`${path}${k}: must be D or derived`); if (!v.note) bad.push(`${path}${k}: note missing`); }
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${path}${k}.`);
      else if (k !== 'status' && k !== 'note') bad.push(`${path}${k}: unlabelled value`);
    }
  };
  walk(params, '');
  return bad;
}
