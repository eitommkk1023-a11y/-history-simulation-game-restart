import test from 'node:test';
import assert from 'node:assert/strict';
import {stepTerrainWalker} from '../src/player/terrain-walker.mjs';
const flat=(x,y)=>({elevationM:0,slopeDegrees:0});
const p={xM:10,yM:10,elevationM:0};
function travel(input,ground=flat,start=p){let q=start;for(let i=0;i<60;i++)q=stepTerrainWalker(q,input,1/60,ground);return q;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('walking is camera-relative and diagonal speed is bounded',()=>{
  const a=travel({x:0,y:-1,yaw:0});near(a.yM,8.5);near(a.xM,10);
  const b=travel({x:0,y:-1,yaw:Math.PI/2});near(b.xM,8.5);near(b.yM,10);
  const c=travel({x:1,y:-1,yaw:0});near(Math.hypot(c.xM-10,c.yM-10),1.5);
});
test('sprint travels four meters in one second',()=>near(travel({x:1,y:0,yaw:0,sprint:true}).xM,14));
test('walks slopes and stays on the ground',()=>{
 const q=travel({x:1,y:0,yaw:0},(x,y)=>({elevationM:x*.2,slopeDegrees:12}),{...p,elevationM:2});near(q.elevationM,q.xM*.2);
});
test('stops before steep slopes, cliffs and missing chunks',()=>{
 for(const outside of [null,{elevationM:0,slopeDegrees:60},{elevationM:-10,slopeDegrees:0}]){
  const q=travel({x:1,y:0,yaw:0,sprint:true},(x,y)=>x>11?outside:flat(x,y));assert.ok(q.xM<=10.76);assert.equal(q.blocked,true);
 }
});
test('caps long frame gaps and ignores invalid timestep',()=>{
 assert.ok(stepTerrainWalker(p,{x:1,y:0,yaw:0,sprint:true},10,flat).xM<=10.2+1e-9);
 assert.deepEqual(stepTerrainWalker(p,{x:1},NaN,flat),{...p,blocked:false});
});
