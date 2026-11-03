import test from 'node:test';import assert from 'node:assert/strict';import {createChunkWindow} from '../src/geography/chunk-window.mjs';
test('keeps shared chunks, releases departed entries and bounds cache size',()=>{
 const freed=[];let made=0;const w=createChunkWindow({widthM:2048,heightM:2048},(x,y)=>({x,y,id:++made}),e=>freed.push(e));
 w.update(128,128);assert.equal(w.entries.length,9);const shared=w.entries.find(e=>e.x===2&&e.y===2);w.update(193,128);assert.equal(w.entries.length,9);assert.ok(w.entries.includes(shared));assert.equal(freed.length,3);assert.equal(made,12);w.update(194,128);assert.equal(made,12);
 for(let x=256;x<1800;x+=64){w.update(x,128);assert.equal(w.entries.length,9);}w.clear();assert.equal(w.entries.length,0);assert.equal(freed.length,made);
});
test('clips the cache at true world boundaries',()=>{const w=createChunkWindow({widthM:128,heightM:128},(x,y)=>({x,y}),()=>{});w.update(0,0);assert.equal(w.entries.length,4);assert.ok(w.entries.every(e=>e.x<2&&e.y<2));});
