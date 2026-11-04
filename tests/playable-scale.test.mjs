import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldTerrain} from '../src/geography/world-terrain.mjs';
import * as scale from '../src/integration/playable-scale.mjs';

const world=()=>({stats:{width:3,height:2},geology:{kmPerBlock:3.33},
 elev:Float32Array.from([0,20,40,10,30,50]),type:new Uint8Array(6).fill(1),
 biome:new Uint8Array(6),water:new Uint8Array(6)});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('playable width is one hundredth while source geography and elevations stay intact',()=>{
 const w=world(),before=structuredClone(w),original=createWorldTerrain(w),t=scale.createPlayableTerrain(w);
 near(t.metersPerCell,33.3);near(t.widthM,original.widthM/100);near(t.heightM,original.heightM/100);
 const a=original.gridToMeters(.5,.25),b=t.gridToMeters(.5,.25);
 near(t.sampleBase(b.xM,b.yM).baseElevationM,original.sampleBase(a.xM,a.yM).baseElevationM);
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
