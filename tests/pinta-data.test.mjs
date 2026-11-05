import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PINTA_1492_PROFILE as P, PINTA_1492_PARAMS as G, validatePintaProfile, validatePintaParams } from '../src/ship/index.mjs';

test('the embedded profile is identical to the research pack JSON', () => {
  const file = JSON.parse(readFileSync(new URL('../docs/pinta-1492/pinta_1492_reconstruction.json', import.meta.url), 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(P)), file);
});

test('the profile passes validation and keeps the research figures exactly', () => {
  assert.deepEqual(validatePintaProfile(), []);
  const v = (k) => P.dimensions[k].value;
  assert.equal(v('length_overall'), 16.9); assert.equal(v('length_waterline'), 15.75); assert.equal(v('beam_max'), 5.0); assert.equal(v('beam_waterline'), 4.7);
  assert.equal(v('lightship_draft'), 1.58); assert.equal(v('puntal_reconstructed'), 2.28); assert.equal(v('keel_length_research'), 10.31);
  assert.equal(P.selected_profile, 'research_compact_1690');
});

test('validation catches mislabelled or confused data', () => {
  const clone = () => JSON.parse(JSON.stringify(P));
  let p = clone(); p.dimensions.displacement_mass.value = 40100; assert.ok(validatePintaProfile(p).some((m) => /displacement_mass/.test(m)));
  p = clone(); p.dimensions.toneladas_de_arqueo.unit = 'kg'; assert.ok(validatePintaProfile(p).some((m) => /toneladas/.test(m)));
  p = clone(); delete p.dimensions.beam_max.evidence_level; assert.ok(validatePintaProfile(p).some((m) => /beam_max/.test(m)));
  p = clone(); p.dimensions.masts_height.evidence_level = 'B'; assert.ok(validatePintaProfile(p).some((m) => /masts_height/.test(m)));
  p = clone(); p.dimensions.crew_size.evidence_level = 'A'; assert.ok(validatePintaProfile(p).some((m) => /crew_size/.test(m)));
  p = clone(); p.rig_presets.pop(); assert.ok(validatePintaProfile(p).some((m) => /rig preset/.test(m)));
  p = clone(); p.unresolved = []; assert.ok(validatePintaProfile(p).length >= 3);
});

test('every game parameter is labelled as a hypothesis (D) or derived, with a note', () => {
  assert.deepEqual(validatePintaParams(), []);
  assert.equal(G.armament.status, 'unresolved');
  assert.equal(G.rig.cloth.value.includes('no insignia'), true);
  // derived values follow the research figures
  assert.equal(G.hull.stemOverhang.value + 0.45, +(P.dimensions.length_overall.value - P.dimensions.length_waterline.value).toFixed(2));
  assert.equal(G.hull.keelFlatLength.value, P.dimensions.keel_length_research.value);
  assert.ok(Math.abs(G.hull.waterlineBreadthRatio.value - 0.94) < 1e-9);
  const bad = JSON.parse(JSON.stringify(G)); bad.hull.deckHeightZ.evidence_level = 'A'; assert.ok(validatePintaParams(bad).length > 0);
  assert.equal(JSON.stringify(G).includes('40.1'), false, 'the arqueo figure never appears among game parameters');
});
