import test from 'node:test';import assert from 'node:assert/strict';import * as model from '../src/vegetation/grass-renderer.mjs';
test('simple upright grass uses six thin triangular leaves with uneven tips',()=>{
 const g=model.grassBladeGeometry();assert.equal(g.indices.length/3,6);assert.equal(g.positions.length/3,18);const heights=[];
 for(let i=0;i<6;i++){const j=i*9,rootX=(g.positions[j]+g.positions[j+3])/2,rootZ=(g.positions[j+2]+g.positions[j+5])/2,h=g.positions[j+7];heights.push(h);assert.ok(h>=.5&&h<=1);assert.ok(Math.hypot(g.positions[j+6]-rootX,g.positions[j+8]-rootZ)<.05);assert.equal(g.positions[j+1],0);assert.equal(g.positions[j+4],0);}
 assert.ok(new Set(heights).size>=5);assert.ok(Math.max(...heights)-Math.min(...heights)>.3);
});
