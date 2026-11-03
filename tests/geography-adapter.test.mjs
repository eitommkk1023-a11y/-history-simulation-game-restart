import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeographyAdapter} from '../src/transport/geography-adapter.mjs';

function fixture(width=5,height=5) {
  const n=width*height;
  const world={elev:new Float32Array(n),type:new Uint8Array(n).fill(1),biome:new Uint8Array(n).fill(5),water:new Uint8Array(n)};
  const adapter=()=>createGeographyAdapter(world,{width,height,kmPerBlock:1});
  return {world,adapter,set(x,y,field,value){world[field][y*width+x]=value;}};
}
const all=()=>true;

test('samples the existing generator array layout',()=>{
  const {adapter,set}=fixture();set(2,3,'elev',150);set(2,3,'biome',13);
  assert.deepEqual(adapter().sample(2,3),{x:2,y:3,index:17,elevationM:150,land:true,water:0,biome:13,traversable:true});
});
test('rejects missing or inconsistent geographic arrays',()=>{
  assert.throws(()=>createGeographyAdapter({elev:[0],type:[1]},{width:1,height:1}),/biome/);
});
test('routing requires actor knowledge',()=>{
  assert.throws(()=>fixture().adapter().route({x:0,y:0},{x:4,y:4}),/knows/);
});
test('unknown destination is not auto-revealed',()=>{
  assert.equal(fixture().adapter().route({x:0,y:0},{x:4,y:4},{knows:(x)=>x===0}).status,'unknown');
});
test('routes on known dry land',()=>{
  const r=fixture().adapter().route({x:0,y:0},{x:4,y:0},{knows:all});
  assert.equal(r.status,'ok'); assert.equal(r.distanceKm,4);assert.equal(r.path.at(-1).x,4);
});
test('water and sea block passage; detours are possible',()=>{
  const {adapter,set}=fixture();set(2,2,'water',1);
  const r=adapter().route({x:0,y:2},{x:4,y:2},{knows:all});
  assert.equal(r.status,'ok');assert.ok(r.path.every(p=>!(p.x===2&&p.y===2)));
  for(let y=0;y<5;y++)set(2,y,'type',0);
  assert.equal(adapter().route({x:0,y:2},{x:4,y:2},{knows:all}).status,'unreachable');
});
test('unknown orthogonal cells prevent diagonal corner cutting',()=>{
  const {adapter}=fixture(2,2);
  const known=(x,y)=>(x===0&&y===0)||(x===1&&y===1);
  assert.equal(adapter().route({x:0,y:0},{x:1,y:1},{knows:known}).status,'unreachable');
});
test('steeper uphill slopes increase travel time',()=>{
  const {adapter,set}=fixture(2,1);
  const flat=adapter().route({x:0,y:0},{x:1,y:0},{knows:all});
  set(1,0,'elev',300);
  const uphill=adapter().route({x:0,y:0},{x:1,y:0},{knows:all});
  assert.ok(uphill.hours>flat.hours);
});
test('travel profiles can prohibit steep slopes',()=>{
  const {adapter,set}=fixture(2,1);set(1,0,'elev',400);
  assert.equal(adapter().route({x:0,y:0},{x:1,y:0},{knows:all,maxSlopeDeg:10}).status,'unreachable');
});
test('search budget exhaustion is not mistaken for no path',()=>{
  const result=fixture(50,50).adapter().route({x:0,y:0},{x:49,y:49},{knows:all,maxExpanded:1});
  assert.equal(result.status,'budget-exceeded');
});
test('invalid start position is rejected',()=>{
  assert.throws(()=>fixture().adapter().route({x:-1,y:0},{x:1,y:1},{knows:all}),RangeError);
});
