import test from 'node:test';import assert from 'node:assert/strict';import {createTerrainChunk} from '../src/geography/terrain-chunk.mjs';import {seamGeometry} from '../src/geography/terrain-seams.mjs';
const terrain={widthM:2048,heightM:2048,sampleBase:(x,z)=>({baseElevationM:100+Math.sin(x*.14)*3+Math.sin(z*.07)*4,normal:{x:0,y:1,z:0}})};
test('mixed resolutions share the same two-meter edge vertices without skirts',()=>{
 const large=createTerrainChunk(terrain,{tileX:0,tileY:0,sizeM:128,segments:8}),small=createTerrainChunk(terrain,{tileX:2,tileY:0,sizeM:64,segments:8});const a=seamGeometry(terrain,large),b=seamGeometry(terrain,small);
 function edge(g,c,x){const values=new Map();for(const id of g.boundary){const p=id*3;if(g.positions[p]===x)values.set(c.originM.yM+g.positions[p+2],c.originM.elevationM+g.positions[p+1]);}return values;}
 const ea=edge(a,large,128),eb=edge(b,small,0);assert.equal(eb.size,33);for(const [z,h]of eb)assert.ok(Math.abs(ea.get(z)-h)<1e-5);
 assert.ok(a.indices.length/3<1500);for(const i of a.indices)assert.ok(i<a.positions.length/3);assert.ok(Math.min(...a.positions.filter((_,i)=>i%3===1))>-30);
 for(let i=0;i<a.indices.length;i+=3){const p=a.indices[i]*3,q=a.indices[i+1]*3,r=a.indices[i+2]*3;const up=(a.positions[q+2]-a.positions[p+2])*(a.positions[r]-a.positions[p])-(a.positions[q]-a.positions[p])*(a.positions[r+2]-a.positions[p+2]);assert.ok(up>0);}
});
