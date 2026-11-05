import test from 'node:test';
import assert from 'node:assert/strict';
import { createHull, createShip, analyzeHydrostatics, buildHullMesh } from '../src/ship/index.mjs';
import { pintaHullSpec, pintaHullReport, pintaLightshipMassItems, LOA, BEAM, BEAM_WL, DRAFT, DECK_Z } from '../src/ship/pinta-design.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b}, got ${a}`);
const spec = pintaHullSpec(), hull = createHull(spec), rep = pintaHullReport(hull);

test('hull dimensions reproduce the research figures (length, beam, waterline length and beam)', () => {
  near(rep.lengthOverall, 16.9, 1e-9, 'LOA'); near(rep.lengthWaterline, 15.75, 0.12, 'LWL'); near(rep.beamMax, 5.0, 0.01, 'max beam'); near(rep.beamWaterline, 4.7, 0.05, 'waterline beam');
  assert.ok(rep.stationCount >= 11 && rep.stationCount <= 21, `stations ${rep.stationCount}`);
  assert.ok(hull.stations.every((s) => s.points.every((p) => p.b <= 2.5 + 1e-9)), 'never wider than the research beam');
  near(DECK_Z, 2.6, 1e-9);
});

test('the bow is at +x and the narrowest end; maximum beam is amidships', () => {
  const half = (x) => hull.sectionAt(x).slice(-1)[0].b;
  assert.ok(half(16.8) < half(0.2) && half(0.2) < half(8.45), 'bow narrower than stern, stern narrower than midships');
  const widest = hull.stations.reduce((a, s) => (s.points.slice(-1)[0].b > a.b ? { x: s.x, b: s.points.slice(-1)[0].b } : a), { x: 0, b: 0 });
  near(widest.x, 8.45, 0.1, 'widest station');
});

test('the lightship mass is derived from the hull at the research draft, not from the historical tonnage', () => {
  near(rep.lightDisplacementKg, rep.lightDisplacedVolumeM3 * 1025, 1e-6);
  assert.ok(rep.lightDisplacementKg > 40000 && rep.lightDisplacementKg < 70000, `${rep.lightDisplacementKg}`);
  assert.notEqual(Math.round(rep.lightDisplacementKg), 40100, 'the 40.10 toneladas de arqueo figure is not a mass');
  const items = pintaLightshipMassItems(hull, rep);
  near(items.reduce((a, i) => a + i.massKg, 0), rep.lightDisplacementKg, 1e-6, 'items sum to the displacement');
});

test('the lightship floats at the research draft with no trim and is stable', () => {
  const ship = createShip({ id: 'p', hull, massItems: pintaLightshipMassItems(hull, rep) }), a = analyzeHydrostatics(ship, { sliceCount: 160 });
  assert.equal(a.status, 'ok');
  near(a.upright.draftMid, DRAFT, 0.03, 'draft'); near(a.upright.trimDeg, 0, 0.3, 'trim');
  assert.ok(a.upright.GM > 0.5, `GM ${a.upright.GM}`); assert.ok(a.gzCurve.find((p) => p.heelDeg === 40).gz > 0, 'positive righting arm at 40 deg');
});

test('the render mesh is closed and spans the same length and beam', () => {
  const m = buildHullMesh(hull, { stations: 40, levels: 12 });
  let minZ = Infinity, maxZ = -Infinity, maxX = 0; for (let i = 0; i < m.positions.length; i += 3) { maxX = Math.max(maxX, Math.abs(m.positions[i])); minZ = Math.min(minZ, m.positions[i + 2]); maxZ = Math.max(maxZ, m.positions[i + 2]); }
  near(maxZ - minZ, LOA, 0.01, 'length'); near(maxX * 2, BEAM, 0.02, 'beam');
  const edges = new Map(); const key = (i) => [0, 1, 2].map((k) => m.positions[i * 3 + k].toFixed(5)).join(',');
  for (let t = 0; t < m.indices.length; t += 3) for (const [p, q] of [[0, 1], [1, 2], [2, 0]]) { const a = key(m.indices[t + p]), b = key(m.indices[t + q]), k = a < b ? a + '|' + b : b + '|' + a; edges.set(k, (edges.get(k) ?? 0) + 1); }
  for (const [k, n] of edges) assert.equal(n, 2, `open edge ${k}`);
});
