import test from 'node:test';import assert from 'node:assert/strict';
import {createPlayableTerrain,playableElevationMeters} from '../src/integration/playable-scale.mjs';
import {createTerrainChunk} from '../src/geography/terrain-chunk.mjs';
import {stepTerrainWalker} from '../src/player/terrain-walker.mjs';
const world=(n=121)=>({stats:{width:n,height:n},geology:{kmPerBlock:3.33},elev:new Float32Array(n*n).fill(300),type:new Uint8Array(n*n).fill(1),water:new Uint8Array(n*n),biome:new Uint8Array(n*n)});
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('dry land has bounded seed-based relief that survives rereading and recreation',()=>{
 const w=world(),before=structuredClone(w),a=createPlayableTerrain(w,'alpha'),b=createPlayableTerrain(w,'beta'),again=createPlayableTerrain(w,'alpha');let relief=0,changed=0;
 for(let x=1000.5;x<1100;x+=3.2){const p=a.sampleBase(x,1501.3),h=p.baseElevationM;near(h,again.sampleBase(x,1501.3).baseElevationM);assert.ok(Math.abs(h-playableElevationMeters(300))<=1.25);relief=Math.max(relief,Math.abs(h-playableElevationMeters(300)));if(Math.abs(h-b.sampleBase(x,1501.3).baseElevationM)>.01)changed++;}
 assert.ok(relief>.1);assert.ok(changed>10);assert.deepEqual(w,before);
});
test('sea, lake and river bands retain their exact macro floor height',()=>{
 for(const kind of ['sea','lake','river']){const w=world();for(let y=0;y<121;y++){const i=y*121+60;if(kind==='sea')w.type[i]=0;else w.water[i]=kind==='lake'?2:1;}const t=createPlayableTerrain(w,'alpha');
 for(const dx of [-49,-30,-10,0,10,30,49])near(t.sampleBase(60*33.3+dx,1500.4).baseElevationM,playableElevationMeters(300));
 }
});
test('detail normals match local height derivatives and collider joins remain continuous',()=>{
 const w=world(),t=createPlayableTerrain(w,'alpha'),x=1050.3,y=1040.7,p=t.sampleBase(x,y),e=.01;
 near(-p.normal.x/p.normal.y,(t.sampleBase(x+e,y).baseElevationM-t.sampleBase(x-e,y).baseElevationM)/(2*e),1e-5);
 near(-p.normal.z/p.normal.y,(t.sampleBase(x,y+e).baseElevationM-t.sampleBase(x,y-e).baseElevationM)/(2*e),1e-5);
 const a=createTerrainChunk(t,{tileX:16,tileY:16}),b=createTerrainChunk(t,{tileX:17,tileY:16});for(let z=1024;z<=1088;z+=.5)near(a.sampleGround(1088,z).elevationM,b.sampleGround(1088,z).elevationM);
 let pos={xM:1040,yM:1040,elevationM:a.sampleGround(1040,1040).elevationM};for(let i=0;i<100;i++)pos=stepTerrainWalker(pos,{x:1,y:0,yaw:0},.05,(x,y)=>a.sampleGround(x,y));assert.ok(pos.xM>1047);assert.equal(pos.blocked,false);
});
test('detail weight cache is bounded during long journeys',()=>{const t=createPlayableTerrain(world(201),'alpha');for(let y=10;y<190;y+=2)for(let x=10;x<190;x+=2)t.sampleBase(x*33.3+.4,y*33.3+.7);assert.ok(t.detailCacheSize>0&&t.detailCacheSize<=8192);});

test('summits and steep faces retain the macro surface',()=>{
 const high=world();high.elev.fill(6000);const top=createPlayableTerrain(high,'alpha');near(top.sampleBase(1800,1800).detailElevationM,0);
 const steep=world();for(let y=0;y<121;y++)for(let x=0;x<121;x++)steep.elev[y*121+x]=1000+(x-60)*200;
 const t=createPlayableTerrain(steep,'alpha'),p=t.sampleBase(60*33.3+1,60*33.3+1);assert.ok(p.slopeDegrees>30);near(p.detailElevationM,0);
});
