import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldTerrain} from '../src/geography/world-terrain.mjs';
import {createWaterSurface} from '../src/geography/water-surface.mjs';
import {createTerrainChunk} from '../src/geography/terrain-chunk.mjs';
import {stepTerrainWalker} from '../src/player/terrain-walker.mjs';
import * as scale from '../src/integration/playable-scale.mjs';

const world=()=>({stats:{width:3,height:2},geology:{kmPerBlock:3.33},
 elev:Float32Array.from([0,20,40,10,30,50]),type:new Uint8Array(6).fill(1),
 biome:new Uint8Array(6),water:new Uint8Array(6)});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('all terrain axes shrink equally while source geography stays intact',()=>{
 const w=world(),before=structuredClone(w),original=createWorldTerrain(w),t=scale.createPlayableTerrain(w);
 near(t.metersPerCell,33.3);near(t.widthM,original.widthM/100);near(t.heightM,original.heightM/100);
 const a=original.gridToMeters(.5,.25),b=t.gridToMeters(.5,.25);
 near(t.sampleBase(b.xM,b.yM).baseElevationM,original.sampleBase(a.xM,a.yM).baseElevationM/100);
 near(t.sampleBase(b.xM,b.yM).slopeDegrees,original.sampleBase(a.xM,a.yM).slopeDegrees);
 assert.deepEqual(t.metersToOverview(b.xM,b.yM),original.metersToOverview(a.xM,a.yM));
 assert.deepEqual(w,before);
});

test('legacy saves and overview markers retain their original geographic locations',()=>{
 const w=world(),original=createWorldTerrain(w),t=scale.createPlayableTerrain(w);
 for(const [x,y] of [[0,0],[.4,.75],[2,1]]){
  const saved={...original.gridToMeters(x,y),yaw:.7};
  const loaded=scale.playerFromSource(saved),grid=t.metersToGrid(loaded.xM,loaded.yM);
  near(grid.x,x);near(grid.y,y);assert.equal(loaded.yaw,.7);
  const out=scale.playerToSource(loaded);near(out.xM,saved.xM);near(out.yM,saved.yM);
  assert.equal(out.yaw,saved.yaw);
  const a=original.metersToOverview(out.xM,out.yM),b=t.metersToOverview(loaded.xM,loaded.yM);
  near(a.x,b.x);near(a.z,b.z);
 }
 assert.equal(scale.playerFromSource(null),null);assert.equal(scale.playerToSource(null),null);
});

 test('lake level, water depth and collision height use the same vertical scale',()=>{
 const w=world();w.water[4]=2;w.lakeId=new Uint16Array(6);w.lakeId[4]=1;w.lakeLevels=Float32Array.from([0,35]);
 const t=scale.createPlayableTerrain(w),p=t.gridToMeters(1,1),water=createWaterSurface(t,w);
 near(t.sampleBase(p.xM,p.yM).baseElevationM,.3);near(t.sampleBase(p.xM,p.yM).waterSurfaceElevationM,.35);
 near(water.sample(p.xM,p.yM,.3).surfaceM,.35);near(water.sample(p.xM,p.yM,.3).depthM,.05);
 const patch=water.patches(p.xM,p.yM,1).find(p=>p.kind==='lake');near(patch.surfaceM,.35);
 near(w.elev[4],30);near(w.lakeLevels[1],35);
 });
 test('ordinary walking crosses a slope that horizontal-only shrinking made impassable',()=>{
 const w=world();w.elev=Float32Array.from([0,200,400,100,300,500]);
 const t=scale.createPlayableTerrain(w),chunk=createTerrainChunk(t,{tileX:0,tileY:0,sizeM:32,segments:32});
 const start={xM:10,yM:10,elevationM:chunk.sampleGround(10,10).elevationM};
 const end=stepTerrainWalker(start,{x:1,y:0,yaw:0},.05,(x,y)=>chunk.sampleGround(x,y));
 assert.equal(end.blocked,false);assert.ok(end.xM>start.xM);near(end.elevationM,chunk.sampleGround(end.xM,end.yM).elevationM);
 });
