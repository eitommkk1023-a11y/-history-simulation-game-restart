import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldTerrain} from '../src/geography/world-terrain.mjs';
import {createTerrainChunk} from '../src/geography/terrain-chunk.mjs';

function fixture({width=3,height=3,step=4}={}) {
  const n=width*height;
  const world={stats:{width,height},geology:{kmPerBlock:step/1000},
    elev:new Float32Array(n),type:new Uint8Array(n).fill(1),
    water:new Uint8Array(n),biome:new Uint8Array(n).fill(4)};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)world.elev[y*width+x]=100+x*step+2*y*step;
  return {world,terrain:createWorldTerrain(world)};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('chunk uses local meters and an upward-facing indexed mesh',()=>{
  const {terrain}=fixture();
  const c=createTerrainChunk(terrain,{tileX:0,tileY:0,sizeM:4,segments:2});
  assert.equal(c.positions.length,27);assert.equal(c.indices.length,24);
  assert.deepEqual(c.originM,{xM:0,yM:0,elevationM:100});
  assert.deepEqual(Array.from(c.positions.slice(0,3)),[0,0,0]);
  assert.deepEqual(Array.from(c.indices.slice(0,6)),[0,3,1,1,3,4]);
  assert.deepEqual(Array.from(c.positions.slice(-3)),[4,12,4]);
});

test('contact height, face normal and slope follow the planar mesh',()=>{
  const {terrain}=fixture();
  const c=createTerrainChunk(terrain,{tileX:0,tileY:0,sizeM:4,segments:2});
  for(const [x,y,h]of [[0,0,100],[1,1,103],[3,2,107],[4,4,112]]) {
    const p=c.sampleGround(x,y);near(p.elevationM,h);
    near(p.normal.x,-1/Math.sqrt(6));near(p.normal.y,1/Math.sqrt(6));near(p.normal.z,-2/Math.sqrt(6));
    near(p.slopeDegrees,65.90515744788931);
  }
});

test('contact follows both rendered triangles rather than the underlying bilinear surface',()=>{
  const {world}=fixture({width:2,height:2});world.elev.set([0,0,0,4]);
  const terrain=createWorldTerrain(world);
  const c=createTerrainChunk(terrain,{tileX:0,tileY:0,sizeM:4,segments:1});
  near(c.sampleGround(1,1).elevationM,0);
  near(c.sampleGround(3,3).elevationM,2);
  near(c.sampleGround(1,3).elevationM,0);
  near(terrain.sampleBase(1,1).baseElevationM,0.25);
});

test('adjacent chunks share edge heights, normals and contact values',()=>{
  const {terrain}=fixture();
  const a=createTerrainChunk(terrain,{tileX:0,tileY:0,sizeM:4,segments:2});
  const b=createTerrainChunk(terrain,{tileX:1,tileY:0,sizeM:4,segments:2});
  for(let row=0;row<3;row++) {
    const ai=(row*3+2)*3,bi=row*3*3;
    near(a.originM.elevationM+a.positions[ai+1],b.originM.elevationM+b.positions[bi+1]);
    assert.deepEqual(Array.from(a.normals.slice(ai,ai+3)),Array.from(b.normals.slice(bi,bi+3)));
    near(a.sampleGround(4,row*2).elevationM,b.sampleGround(4,row*2).elevationM);
  }
});

test('the last chunk is clipped and accepts its far boundary',()=>{
  const {terrain}=fixture({step:5});
  const c=createTerrainChunk(terrain,{tileX:2,tileY:2,sizeM:4,segments:2});
  assert.equal(c.widthM,2);assert.equal(c.heightM,2);
  near(c.sampleGround(10,10).elevationM,130);
  assert.equal(createTerrainChunk(terrain,{tileX:3,tileY:0,sizeM:4}),null);
});

test('out-of-chunk contact does not clamp to a false floor',()=>{
  const {terrain}=fixture();
  const c=createTerrainChunk(terrain,{tileX:0,tileY:0,sizeM:4,segments:2});
  assert.equal(c.sampleGround(-0.001,0),null);
  assert.equal(c.sampleGround(4.001,1),null);
  assert.throws(()=>c.sampleGround(NaN,1),RangeError);
});

test('render and contact stay on one snapshot until the chunk is rebuilt',()=>{
  const {world,terrain}=fixture();
  const options={tileX:0,tileY:0,sizeM:4,segments:2};
  const c=createTerrainChunk(terrain,options);
  world.elev[0]+=10;
  near(c.sampleGround(0,0).elevationM,100);
  near(createTerrainChunk(terrain,options).sampleGround(0,0).elevationM,110);
});

test('default chunk has two-meter spacing without skirts or detail noise',()=>{
  const {terrain}=fixture({step:100});
  const c=createTerrainChunk(terrain,{tileX:0,tileY:0});
  assert.equal(c.positions.length,33*33*3);assert.equal(c.indices.length,32*32*6);
  assert.equal(c.positions[3],2);
});

test('invalid chunk addresses and excessive segment counts are rejected',()=>{
  const {terrain}=fixture();
  for(const tileX of [-1,0.5,NaN,Infinity])assert.throws(()=>createTerrainChunk(terrain,{tileX,tileY:0}),RangeError);
  for(const segments of [0,129,1.5,NaN])assert.throws(()=>createTerrainChunk(terrain,{tileX:0,tileY:0,segments}),RangeError);
  assert.throws(()=>createTerrainChunk(terrain,{tileX:0,tileY:0,sizeM:0}),RangeError);
});
