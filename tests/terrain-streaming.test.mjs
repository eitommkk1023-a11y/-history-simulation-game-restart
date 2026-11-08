import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerrainSystem,createTerrainTileCache} from '../src/geography/terrain-streaming.mjs';

function fixture(width=8,height=8, extra={}) {
  const n=width*height;
  const world={elev:new Float32Array(n),type:new Uint8Array(n).fill(1),water:new Uint8Array(n),biome:new Uint8Array(n).fill(4),
    lakeId:new Int32Array(n),lakeLevels:new Float32Array([0,25]),stats:{width,height,version:11},geology:{kmPerBlock:.064}};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)world.elev[y*width+x]=x*4+y*2;
  const terrain=createTerrainSystem(world,{seed:123,metersPerCell:64,tileSizeM:128,segments:8,detailAmplitudeM:0,...extra});
  return {world,terrain};
}

test('metric coordinates use world-cell centers and detect out-of-bounds points',()=>{
  const {terrain}=fixture();
  assert.deepEqual(terrain.cellCenter(1,2),{xM:96,yM:160});
  assert.deepEqual(terrain.cellAt(96,160),{x:1,y:2});
  assert.equal(terrain.sample(96,160).groundElevationM,8);
  assert.throws(()=>terrain.sample(-1,1),RangeError);
  assert.throws(()=>terrain.cellCenter(100,0),RangeError);
  assert.deepEqual(terrain.toLocal(200,300,190,270),{x:10,z:30});
});

test('continuous bilinear heights across world-cell boundaries',()=>{
  const {terrain}=fixture();
  const a=terrain.sample(128-1e-6,176).groundElevationM;
  const b=terrain.sample(128+1e-6,176).groundElevationM;
  assert.ok(Math.abs(a-b)<1e-5);
});

test('global deterministic subcell terrain detail does not depend on chunk order',()=>{
  const {world}=fixture();
  const a=createTerrainSystem(world,{seed:123,metersPerCell:64,tileSizeM:128,segments:8});
  const b=createTerrainSystem(world,{seed:123,metersPerCell:64,tileSizeM:128,segments:8});
  const v=a.sample(91,83).groundElevationM;
  a.buildMesh(a.makeTile(0,0,0));
  assert.equal(a.sample(91,83).groundElevationM,v);
  assert.equal(v,b.sample(91,83).groundElevationM);
  assert.notEqual(v,createTerrainSystem(world,{seed:124,metersPerCell:64,tileSizeM:128,segments:8}).sample(91,83).groundElevationM);
});

test('water and lake levels come from the canonical world, not per-tile RNG',()=>{
  const {terrain,world}=fixture();
  world.water[3*8+3]=2; world.lakeId[3*8+3]=1;
  const p=terrain.sample(224,224);
  assert.equal(p.water,2);assert.equal(p.waterSurfaceElevationM,25);
  assert.equal(p.visibleElevationM,25);assert.equal(p.groundElevationM,18);
  const dry=terrain.sample(32,32);
  assert.equal(dry.waterSurfaceElevationM,null);
});

test('tile mesh shares exactly corresponding boundary elevations and adds skirts',()=>{
  const {terrain}=fixture();
  const left=terrain.buildMesh(terrain.makeTile(0,0,0));
  const right=terrain.buildMesh(terrain.makeTile(0,1,0));
  const edge=terrain.segments+1;
  for(let y=0;y<edge;y++)assert.equal(left.positions[(y*edge+edge-1)*3+1],right.positions[y*edge*3+1]);
  assert.equal(left.positions.length,((edge*edge)+(4*edge))*3);
  assert.equal(left.indices.length,(8*8+4*8)*6);
  assert.ok(Math.max(...left.indices)<left.positions.length/3);
});

test('different LOD tiles derive shared corner heights from the same sampling function',()=>{
  const {terrain}=fixture();
  const near=terrain.buildMesh(terrain.makeTile(0,0,0));
  const far=terrain.buildMesh(terrain.makeTile(1,0,0));
  assert.equal(near.positions[1],far.positions[1]);
  assert.equal(near.positions[1],terrain.sample(0,0).visibleElevationM);
});

test('selectTiles stays within budget, covers the player, and stays on the map',()=>{
  const {terrain}=fixture(12,12);
  const tiles=terrain.selectTiles({xM:260,yM:270,radiusM:600,maxTiles:32});
  assert.ok(tiles.length>0 && tiles.length<=32);
  assert.ok(tiles.some(t=>t.xM<=260 && t.xM+t.widthM>=260 && t.yM<=270 && t.yM+t.heightM>=270));
  assert.ok(tiles.every(t=>t.xM>=0 && t.yM>=0 && t.xM+t.widthM<=terrain.worldWidthM && t.yM+t.heightM<=terrain.worldHeightM));
});

test('world events change sample values and survive serialize/restore',()=>{
  const {terrain,world}=fixture();
  const before=terrain.sample(220,220).groundElevationM;
  const ev={id:'eruption-22',kind:'eruption',day:100,xM:220,yM:220,radiusM:80,deltaM:10};
  terrain.addEvent(ev);
  assert.equal(terrain.sample(220,220).groundElevationM,before+10);
  assert.equal(terrain.sample(10,10).hydrologyNeedsReview,false);
  assert.equal(terrain.sample(220,220).hydrologyNeedsReview,true);
  assert.throws(()=>terrain.addEvent(ev),/Duplicate/);
  const next=createTerrainSystem(world,{seed:123,metersPerCell:64,tileSizeM:128,segments:8,detailAmplitudeM:0});
  next.loadEvents(terrain.serializeEvents());
  assert.equal(next.sample(220,220).groundElevationM,terrain.sample(220,220).groundElevationM);
  assert.equal(next.eventCount,1);
});

test('malformed event log is rejected atomically and foreign world save is not loaded',()=>{
  const {terrain}=fixture();
  assert.throws(()=>terrain.addEvent({id:'x',kind:'invalid',day:1,xM:0,yM:0,radiusM:5,deltaM:1}),/kind/);
  const saved=terrain.serializeEvents();
  assert.throws(()=>terrain.loadEvents({...saved,worldId:'other'}),/Incompatible/);
  assert.equal(terrain.eventCount,0);
  assert.throws(()=>terrain.loadEvents({...saved,events:[{id:'bad',kind:'eruption',day:0,xM:-1,yM:0,radiusM:5,deltaM:1}]}),RangeError);
  assert.equal(terrain.eventCount,0);
});

test('conditions exposes raw slope and hydrology without imposing travel or building rules',()=>{
  const {terrain}=fixture();
  const c=terrain.conditions(96,96,16);
  assert.ok(c.slopeDegrees>0);
  assert.ok(!Object.hasOwn(c,'buildable'));
  assert.ok(!Object.hasOwn(c,'traversable'));
});

test('tile cache yields between constructions, retains a bounded set, and evicts stale views',async()=>{
  const {terrain}=fixture();
  let yields=0;
  const cache=createTerrainTileCache(terrain,{maxResidentTiles:16,yieldTask:async()=>{yields++;}});
  const result=await cache.update({xM:80,yM:80,radiusM:300,maxTiles:16});
  assert.equal(result.status,'ok');assert.ok(yields>0);assert.ok(cache.size<=16);
  const again=await cache.update({xM:80,yM:80,radiusM:300,maxTiles:16});
  assert.equal(again.status,'ok');assert.equal(cache.size,result.tiles.length);
  assert.equal(yields,result.tiles.length);
  cache.dispose();assert.equal(cache.size,0);
  await assert.rejects(cache.update({xM:80,yM:80}),/disposed/);
});

test('a newer camera request can supersede an outstanding older request',async()=>{
  const {terrain}=fixture();
  let release=()=>{};
  const gate=new Promise(r=>release=r);
  let first=true;
  const cache=createTerrainTileCache(terrain,{maxResidentTiles:16,yieldTask:()=>first?(first=false,gate):Promise.resolve()});
  const pending=cache.update({xM:64,yM:64,radiusM:300,maxTiles:16});
  const next=await cache.update({xM:420,yM:420,radiusM:300,maxTiles:16});
  release();
  assert.equal((await pending).status,'superseded');
  assert.equal(next.status,'ok');
});

test('river polyline from the world is clipped to each tile without seam gaps',()=>{
  const {world}=fixture();
  world.riverPts=Float32Array.from([0,1.5,0.25,4,1.5,0.25]);
  world.riverStarts=Int32Array.from([0]);world.riverLine=Int32Array.from([23]);
  const t=createTerrainSystem(world,{seed:123,metersPerCell:64,tileSizeM:128,segments:8});
  const a=t.riverSegmentsInTile(t.makeTile(0,0,0));
  const b=t.riverSegmentsInTile(t.makeTile(0,1,0));
  assert.equal(a.length,1);assert.equal(b.length,1);
  assert.equal(a[0].end.xM,128);assert.equal(b[0].start.xM,128);
  assert.equal(a[0].end.yM,b[0].start.yM);
  assert.equal(a[0].lineId,23);
});

test('tight tile budget prioritizes the player rather than exhausting detail far away',()=>{
  const {terrain}=fixture(128,128);
  const tiles=terrain.selectTiles({xM:3700,yM:3700,radiusM:3000,maxTiles:64});
  assert.ok(tiles.length<=64);
  assert.ok(tiles.some(t=>t.level===0 && t.xM<=3700 && t.xM+t.widthM>=3700 && t.yM<=3700 && t.yM+t.heightM>=3700));
});
