import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindField } from '../src/ship/wind-field.mjs';
import { createSeaState, waveMotion, addedResistanceFactor } from '../src/ship/sea-state.mjs';

const mk = (U, landAt = null, baseU = U) => {
  const elev = (X) => (landAt !== null && X > landAt ? 30 : -50);
  const wf = createWindField({ baseWind: () => ({ x: -baseU, y: 0 }), elev, dayAt: () => 1, seed: 3, params: { breezeMax: 0, calmChance: 0, stormChance: 0, shelterMin: 1 } });
  return createSeaState({ windField: wf, elev });
};
test('stronger wind gives higher seas, roughly with U^2', () => {
  const a = mk(6).info(-1e6, 0), b = mk(12).info(-1e6, 0); assert.ok(b.windSeaHs > a.windSeaHs * 3.5 && b.windSeaHs < a.windSeaHs * 4.5);
});
test('short fetch limits wind sea (a ship close under a lee shore)', () => {
  const open = mk(12).info(0, 0).windSeaHs, shore = mk(12, 2000).info(0, 0).windSeaHs; assert.ok(shore < open * 0.5, `${shore} vs ${open}`); // land 2 km upwind
});
test('swell remains when local wind is calm', () => {
  const wf = createWindField({ baseWind: () => ({ x: -8, y: 0 }), elev: () => -50, dayAt: () => 1, seed: 3, params: { breezeMax: 0, stormChance: 0, calmChance: 1, calmFactor: 0 }, toWorld: (X, Y) => ({ x: X, y: Y }) });
  const s = createSeaState({ windField: wf, elev: () => -50 }).info(0, 0); assert.ok(s.swellHs > 0.4);
});
test('beam seas roll more, head seas pitch more', () => {
  const sea = { hs: 3, tp: 7, dirToRad: 0 }, ship = { u: 2, lengthM: 21, beamM: 6.4, rollPeriodS: 5 };
  const amp = (psi, key) => { let m = 0; for (let t = 0; t < 120; t += 0.1) m = Math.max(m, Math.abs(waveMotion(sea, { ...ship, psi }, t)[key])); return m; };
  const beamRoll = amp(Math.PI / 2, 'rollDeg'), headRoll = amp(Math.PI, 'rollDeg'), headPitch = amp(Math.PI, 'pitchDeg'), beamPitch = amp(Math.PI / 2, 'pitchDeg');
  assert.ok(beamRoll > headRoll * 3 && headPitch > beamPitch * 3, `${beamRoll} ${headRoll} ${headPitch} ${beamPitch}`);
});
test('flat sea means no motion; motion is bounded', () => {
  assert.deepEqual(waveMotion({ hs: 0, tp: 5, dirToRad: 0 }, { psi: 0, u: 0, lengthM: 21, beamM: 6 }, 3), { rollDeg: 0, pitchDeg: 0, heaveM: 0 });
  const m = waveMotion({ hs: 9, tp: 12, dirToRad: 0 }, { psi: 1.5, u: 0, lengthM: 21, beamM: 6, rollPeriodS: 5 }, 10); assert.ok(Math.abs(m.rollDeg) <= 25 && Math.abs(m.pitchDeg) <= 12);
});
test('head seas slow the ship more than following seas', () => {
  const head = addedResistanceFactor(3, 21, Math.PI, 0), foll = addedResistanceFactor(3, 21, 0, 0); assert.ok(head > foll && head > 1.3 && foll < 1.3);
});

test('a distant storm sends long swell ahead of itself', () => {
  const wf = createWindField({ baseWind: () => ({ x: -2, y: 0 }), elev: () => -50, dayAt: () => 1, seed: 3, params: { breezeMax: 0, stormChance: 0, calmChance: 0 } });
  const calm = createSeaState({ windField: wf, elev: () => -50 }).info(0, 0), s = createSeaState({ windField: wf, elev: () => -50, swellSource: () => ({ hs: 2, dirToRad: 1 }) }).info(0, 0);
  assert.ok(s.hs > calm.hs + 1 && s.precursorHs === 2 && s.tp > 10 && Math.abs(s.dirToRad - 1) < 1e-9);
});
