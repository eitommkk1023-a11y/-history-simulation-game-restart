import test from 'node:test';import assert from 'node:assert/strict';
import {selectTerrainLOD} from '../src/geography/terrain-lod.mjs';
import {createTerrainChunk} from '../src/geography/terrain-chunk.mjs';
import {seamGeometry} from '../src/geography/terrain-seams.mjs';
const t={widthM:100000,heightM:100000,sampleBase:(x,z)=>({baseElevationM:200+Math.sin(x*.003)*110+Math.cos(z*.004)*120,normal:{x:0,y:1,z:0}})};
test('normal LOD covers mountains six kilometers away with bounded coarse tiles',()=>{
 const plan=selectTerrainLOD(t,10000,10000);assert.ok(plan.length<260);assert.ok(plan.some(p=>p.sizeM>=2048));
 for(const [x,y]of [[16000,10000],[4000,10000],[10000,16000],[10000,4000]])assert.equal(plan.filter(p=>x>=p.tileX*p.sizeM&&x<(p.tileX+1)*p.sizeM&&y>=p.tileY*p.sizeM&&y<(p.tileY+1)*p.sizeM).length,1);
 let vertices=0;for(const q of plan){assert.ok(q.edgeCuts);const c=createTerrainChunk(t,q),g=seamGeometry(t,c,q.edgeCuts);vertices+=g.positions.length/3;}assert.ok(vertices<100000,`far vertices ${vertices}`);
});
function checkJoins(terrain,x,y){
 const plan=selectTerrainLOD(terrain,x,y),entries=plan.map(q=>{const c=createTerrainChunk(terrain,q);return {q,c,g:seamGeometry(terrain,c,q.edgeCuts)};});let joins=0;
 for(let yy=Math.max(0,Math.floor(y/64)-1);yy<=Math.floor(y/64)+1;yy++)for(let xx=Math.max(0,Math.floor(x/64)-1);xx<=Math.floor(x/64)+1;xx++){
  const c=createTerrainChunk(terrain,{tileX:xx,tileY:yy});if(!c)continue;const boundary=new Set();for(let i=0;i<=32;i++)for(let j=0;j<=32;j++)if(i===0||j===0||i===32||j===32)boundary.add(i*33+j);entries.push({q:null,c,g:{positions:c.positions,boundary}});
 }

 const side=(e,axis,value,min,max)=>{const out=new Map();for(const id of e.g.boundary){const p=id*3,px=e.c.originM.xM+e.g.positions[p],pz=e.c.originM.yM+e.g.positions[p+2];if(Math.abs((axis==='x'?px:pz)-value)>1e-3)continue;const along=axis==='x'?pz:px;if(along<min-1e-3||along>max+1e-3)continue;out.set(Math.round(along*1000),e.c.originM.elevationM+e.g.positions[p+1]);}return out;};
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j],ax=a.c.originM.xM,az=a.c.originM.yM,bx=b.c.originM.xM,bz=b.c.originM.yM;let axis,value,min,max;
  if(ax+a.c.widthM===bx||bx+b.c.widthM===ax){axis='x';value=Math.max(ax,bx);min=Math.max(az,bz);max=Math.min(az+a.c.heightM,bz+b.c.heightM);}
  else if(az+a.c.heightM===bz||bz+b.c.heightM===az){axis='z';value=Math.max(az,bz);min=Math.max(ax,bx);max=Math.min(ax+a.c.widthM,bx+b.c.widthM);}else continue;
  if(max-min<=0)continue;const aa=side(a,axis,value,min,max),bb=side(b,axis,value,min,max);assert.deepEqual([...aa.keys()].sort((a,b)=>a-b),[...bb.keys()].sort((a,b)=>a-b));for(const [k,h]of aa)assert.ok(Math.abs(h-bb.get(k))<.001);joins++;
 }assert.ok(joins>20);
}
test('adaptive LOD joins share every border sample',()=>checkJoins(t,10000,10000));
test('clipped world edges have finite matching border samples',()=>checkJoins({...t,widthM:10050.25,heightM:11111.5},9700,10800));
