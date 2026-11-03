import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldTerrain } from '../src/geography/world-terrain.mjs';

function fixture() {
  // z=2*x + y on a 10m grid; slope is atan(sqrt(5)), not a display exaggeration.
  const world = {
    stats: { width: 3, height: 2 }, geology: { kmPerBlock: 0.01 },
    elev: Float32Array.from([0,20,40,10,30,50]),
    type: new Uint8Array(6).fill(1), biome: new Uint8Array(6).fill(4),
    water: new Uint8Array(6), lakeId: new Uint16Array(6),
    lakeLevels: Float32Array.from([0,35]),
  };
  return { world, terrain: createWorldTerrain(world) };
}
function near(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual-expected) <= epsilon, `${actual} != ${expected}`);
}

test('grid nodes keep their positions without an extra half-cell', () => {
  const {terrain:t} = fixture();
  assert.deepEqual(t.gridToMeters(0,0), {xM:0,yM:0});
  assert.deepEqual(t.gridToMeters(1,1), {xM:10,yM:10});
  assert.deepEqual(t.gridToMeters(2,1), {xM:20,yM:10});
  assert.equal(t.widthM,20); assert.equal(t.heightM,10);
});

test('metric positions convert back to fractional grid coordinates', () => {
  const {terrain:t} = fixture();
  assert.deepEqual(t.metersToGrid(5,2.5), {x:0.5,y:0.25});
  assert.deepEqual(t.metersToGrid(20,10), {x:2,y:1});
});

test('rectangular overview endpoints match the original centered map', () => {
  const {terrain:t} = fixture();
  assert.deepEqual(t.metersToOverview(0,0), {x:-1.5,z:-1});
  assert.deepEqual(t.metersToOverview(20,10), {x:1.5,z:1});
  assert.deepEqual(t.overviewToMeters(0,0), {xM:10,yM:5});
});

test('overview and metric round trips preserve interior positions', () => {
  const {terrain:t} = fixture();
  for (const [xM,yM] of [[0,0],[3.5,2.75],[20,10]]) {
    const p=t.metersToOverview(xM,yM), q=t.overviewToMeters(p.x,p.z);
    near(q.xM,xM); near(q.yM,yM);
  }
});

test('large world positions retain local human-scale offsets', () => {
  const n=4;
  const t=createWorldTerrain({elev:new Float32Array(n),type:new Uint8Array(n),
    biome:new Uint8Array(n),water:new Uint8Array(n)}, {width:2,height:2,metersPerCell:10_000_000});
  const origin={xM:9_000_000,yM:8_000_000,elevationM:100};
  const local=t.toLocal(9_000_001.25,8_000_000.5,101.7,origin);
  near(local.x,1.25); near(local.z,0.5); near(local.y,1.7);
  const p=t.fromLocal(local.x,local.y,local.z,origin);
  near(p.xM,9_000_001.25); near(p.yM,8_000_000.5); near(p.elevationM,101.7);
});

test('base height interpolates in meters and does not flatten to the overview', () => {
  const {terrain:t}=fixture();
  near(t.sampleBase(5,2.5).baseElevationM,12.5);
  near(t.sampleBase(20,10).baseElevationM,50);
});

test('bilinear interpolation includes its mixed term', () => {
  const {world}=fixture(); world.elev.set([0,0,0,0,40,0]);
  const t=createWorldTerrain(world);
  near(t.sampleBase(5,2.5).baseElevationM,5);
});

test('slope and upward normal use real horizontal distances at both edges', () => {
  const {terrain:t}=fixture();
  for(const [x,y]of [[0,0],[5,2.5],[20,10]]) {
    const p=t.sampleBase(x,y);
    near(p.slopeDegrees,65.90515744788931);
    near(p.normal.x,-2/Math.sqrt(6));
    near(p.normal.y,1/Math.sqrt(6));
    near(p.normal.z,-1/Math.sqrt(6));
  }
});

test('lake floor remains separate from the existing water surface', () => {
  const {world,terrain:t}=fixture();world.water[4]=2;world.lakeId[4]=1;
  const p=t.sampleBase(10,10);
  assert.equal(p.baseElevationM,30); assert.equal(p.waterSurfaceElevationM,35);
  assert.equal(p.water,2); assert.equal(p.land,true);
});

test('sea has a zero-meter surface while unknown lake and river levels stay unknown', () => {
  const {world,terrain:t}=fixture();
  world.type[0]=0;world.elev[0]=-100;
  assert.equal(t.sampleBase(0,0).waterSurfaceElevationM,0);
  assert.equal(t.sampleBase(0,0).baseElevationM,-100);
  world.water[1]=1; assert.equal(t.sampleBase(10,0).waterSurfaceElevationM,null);
  world.water[2]=2;world.lakeId[2]=9;
  assert.equal(t.sampleBase(20,0).waterSurfaceElevationM,null);
});

test('categorical metadata uses the nearest original grid node', () => {
  const {world,terrain:t}=fixture();world.biome[4]=7;world.water[4]=1;
  const p=t.sampleBase(12,8);
  assert.deepEqual(p.source,{x:1,y:1,index:4});
  assert.equal(p.biome,7); assert.equal(p.water,1);
});

test('queries do not modify source arrays and observe later terrain changes', () => {
  const {world,terrain:t}=fixture();
  const before=Object.fromEntries(['elev','type','biome','water','lakeId','lakeLevels'].map(k=>[k,Array.from(world[k])]));
  t.sampleBase(12,8); t.metersToOverview(3,4);
  for(const k of Object.keys(before)) assert.deepEqual(Array.from(world[k]),before[k]);
  world.elev[4]=130;
  assert.equal(t.sampleBase(10,10).baseElevationM,130);
});

test('invalid dimensions, scale and array sizes are rejected', () => {
  const {world}=fixture();
  for(const width of [1,0,-1,2.5,NaN]) assert.throws(()=>createWorldTerrain(world,{width}),RangeError);
  for(const metersPerCell of [0,-1,NaN,Infinity]) assert.throws(()=>createWorldTerrain(world,{metersPerCell}),RangeError);
  assert.throws(()=>createWorldTerrain({...world,elev:new Float32Array(1)}),TypeError);
  assert.throws(()=>createWorldTerrain(null),TypeError);
});

test('out-of-world and non-finite positions are rejected rather than clamped', () => {
  const {terrain:t}=fixture();
  for(const [x,y]of [[-0.001,0],[20.001,0],[0,10.001],[NaN,0],[0,Infinity]])
    assert.throws(()=>t.sampleBase(x,y),RangeError);
  assert.throws(()=>t.gridToMeters(3,0),RangeError);
  assert.throws(()=>t.overviewToMeters(1.501,0),RangeError);
  assert.throws(()=>t.toLocal(1,1,NaN,{xM:0,yM:0,elevationM:0}),RangeError);
});

test('non-finite source heights produce an explicit error', () => {
  const {world,terrain:t}=fixture();world.elev[0]=NaN;
  assert.throws(()=>t.sampleBase(5,2.5),RangeError);
});
