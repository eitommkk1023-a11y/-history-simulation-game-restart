import test from 'node:test';import assert from 'node:assert/strict';import * as mod from '../src/geography/terrain-prefetch.mjs';
test('directional prefetch builds one chunk per tick and promotes by identity',()=>{
 let built=0;const p=mod.createTerrainPrefetch({widthM:10000,heightM:10000},(x,y)=>({x,y,id:++built}));p.request(128,128,1,0);assert.equal(p.pending,3);assert.equal(p.tick(),1);assert.equal(built,1);const saved=p.take(4,2);assert.ok(saved&&saved.x===4&&saved.y===2);assert.equal(p.take(4,2),null);p.tick();p.tick();assert.ok(p.size<=3);p.clear();assert.equal(p.size,0);assert.equal(p.pending,0);
});
test('reversal cancels stale work and clips prediction at world bounds',()=>{const p=mod.createTerrainPrefetch({widthM:640,heightM:640},(x,y)=>({x,y}));p.request(256,256,1,0);p.tick();p.request(256,256,-1,0);while(p.pending)p.tick();assert.equal(p.take(6,4),null);assert.ok(p.take(2,4));p.request(0,0,-1,-1);assert.equal(p.pending,0);assert.equal(p.size,0);});
