import test from 'node:test';import assert from 'node:assert/strict';
import * as profile from '../src/integration/playable-scale.mjs';
import {createWaterSurface} from '../src/geography/water-surface.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const world=()=>({stats:{width:2,height:2},geology:{kmPerBlock:3.33},elev:Float32Array.from([0,3000,0,6000]),type:new Uint8Array(4).fill(1),water:new Uint8Array(4),biome:new Uint8Array(4)});
test('mountains have meter heights up to 1000 without flattening all high peaks',()=>{
 const w=world(),before=structuredClone(w),t=profile.createPlayableTerrain(w);
 const low=t.sampleBase(33.3,0).baseElevationM,high=t.sampleBase(33.3,33.3).baseElevationM;
 assert.ok(low>500&&low<1000);assert.ok(high>low&&high<1000);assert.deepEqual(w,before);
});
test('height mapping preserves sea level and downstream ordering',()=>{
 const f=profile.playableElevationMeters;close(f(0),0);let old=-Infinity;
 for(const e of [-9000,-1000,-1,0,1,100,1000,3000,6000,9000]){const h=f(e);assert.ok(h>old);assert.ok(Math.abs(h)<=1000);old=h;}
});
test('overview uses the same ground and flat lake levels in matching meter units',()=>{
 const w=world(),t=profile.createPlayableTerrain(w),p=t.sampleBase(16.65,16.65),unit=2/(33.3);
 close(profile.playableOverviewHeight(w,.5,.5),p.baseElevationM*unit);
 w.water[3]=2;w.lakeId=Uint16Array.from([0,0,0,1]);w.lakeLevels=Float32Array.from([0,6500]);
 const water=createWaterSurface(t,w),q=water.sample(33.3,33.3,t.sampleBase(33.3,33.3).baseElevationM);
 close(q.surfaceM,profile.playableElevationMeters(6500));assert.ok(q.depthM>0);
 close(profile.playableOverviewHeight(w,1,1),q.surfaceM*unit);
});

test('mountain review retains a walkable foothill when the summit is hidden by a shoulder',async()=>{
 const {findMountainReview}=await import('../src/development/developer-tools.mjs');
 const n=201,w={stats:{width:n,height:n},elev:new Float32Array(n*n),type:new Uint8Array(n*n).fill(1),water:new Uint8Array(n*n),biome:new Uint8Array(n*n)};
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)w.elev[y*n+x]=6000*Math.exp(-((x-100)**2+(y-100)**2)/1600);
 const t=profile.createPlayableTerrain(w),r=findMountainReview(t,w);assert.ok(r);assert.ok(t.sampleBase(r.point.xM,r.point.yM).slopeDegrees<25);
 assert.equal(r.summitVisible,false);assert.ok(r.peak.elevationM>r.point.elevationM);
});
