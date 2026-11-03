import test from 'node:test';import assert from 'node:assert/strict';import {selectTerrainLOD,skirtGeometry} from '../src/geography/terrain-lod.mjs';
test('LOD covers surrounding tiles with no overlap or near collider replacement',()=>{
 const t={widthM:100000,heightM:100000},a=selectTerrainLOD(t,10000,10000),again=selectTerrainLOD(t,10001,10001);assert.deepEqual(a,again);assert.ok(a.length<200);assert.ok(new Set(a.map(x=>x.sizeM)).size>2);
 for(let y=9000;y<11000;y+=64)for(let x=9000;x<11000;x+=64){const px=x+1,py=y+1;const count=a.filter(q=>px>=q.tileX*q.sizeM&&px<(q.tileX+1)*q.sizeM&&py>=q.tileY*q.sizeM&&py<(q.tileY+1)*q.sizeM).length;
 const near=Math.floor(px/64)>=155&&Math.floor(px/64)<=157&&Math.floor(py/64)>=155&&Math.floor(py/64)<=157;assert.equal(count,near?0:1);}
});
