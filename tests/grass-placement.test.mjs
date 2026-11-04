import test from 'node:test';import assert from 'node:assert/strict';import * as grass from '../src/vegetation/grass-placement.mjs';
const terrain={widthM:1000,heightM:1000,sampleBase:(x,y)=>({land:true,water:0,biome:5,baseElevationM:20,slopeDegrees:0})};
const ground=(x,y)=>({elevationM:20+x*.01+y*.02,slopeDegrees:2,waterDepthM:0,waterSurfaceM:null});
test('below-knee grass is deterministic, bounded and extensible by type',()=>{
 const a=grass.generateGrassPatch(terrain,ground,500,500,'alpha'),b=grass.generateGrassPatch(terrain,ground,500,500,'alpha'),c=grass.generateGrassPatch(terrain,ground,500,500,'beta');assert.deepEqual(a,b);assert.notDeepEqual(a,c);assert.ok(a.length>1000&&a.length<=7000);for(const p of a){assert.ok(p.heightM>=.2&&p.heightM<=.35);assert.ok(Math.hypot(p.xM-500,p.yM-500)<=32);assert.ok(Math.abs(p.elevationM-ground(p.xM,p.yM).elevationM)<1e-9);}
 const short={...grass.SHORT_GRASS,minHeightM:.1,maxHeightM:.15};assert.ok(grass.generateGrassPatch(terrain,ground,500,500,'alpha',short).every(p=>p.heightM>=.1&&p.heightM<=.15));
});
test('grass does not appear in water, desert, snow, salt or steep terrain',()=>{
 for(const biome of [0,1,2,8,12,14,15,16])assert.equal(grass.generateGrassPatch({...terrain,sampleBase:()=>({...terrain.sampleBase(),biome})},ground,500,500,'a').length,0);
 for(const patch of [{land:false},{water:1},{water:2},{slopeDegrees:60}])assert.equal(grass.generateGrassPatch({...terrain,sampleBase:()=>({...terrain.sampleBase(),...patch})},ground,500,500,'a').length,0);
 assert.equal(grass.generateGrassPatch(terrain,()=>({...ground(0,0),waterDepthM:.1}),500,500,'a').length,0);
 assert.equal(grass.generateGrassPatch(terrain,()=>null,500,500,'a').length,0);
});
test('overlapping patches retain the same plants and clip at world boundaries',()=>{
 const a=grass.generateGrassPatch(terrain,ground,500,500,'alpha'),b=grass.generateGrassPatch(terrain,ground,508,500,'alpha'),map=new Map(a.map(p=>[p.key,p]));let shared=0;for(const p of b)if(map.has(p.key)){assert.deepEqual(p,map.get(p.key));shared++;}assert.ok(shared>1000);
 const edge=grass.generateGrassPatch(terrain,ground,0,0,'a');assert.ok(edge.every(p=>p.xM>=0&&p.yM>=0&&p.xM<=1000&&p.yM<=1000));
});
