import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeographyAdapter } from '../src/transport/geography-adapter.mjs';
import { createTransportNetwork } from '../src/transport/transport-network.mjs';

const known = () => true;
function fixture(width=5,height=3){
  const n=width*height;
  const world={elev:new Float32Array(n),type:new Uint8Array(n).fill(1),biome:new Uint8Array(n).fill(5),water:new Uint8Array(n)};
  const options={width,height,kmPerBlock:1};
  const network=createTransportNetwork(world,options);
  const router=createGeographyAdapter(world,{...options,infrastructure:network});
  const set=(x,y,key,value)=>world[key][y*width+x]=value;
  const route=(a,b,o={})=>router.route(a,b,{knows:known,knowsFacility:()=>true,...o});
  return {world,options,network,router,set,route};
}
const line=(...xs)=>xs.map(x=>({x,y:1}));
test('road infrastructure alters cost, not underlying geography arrays',()=>{
  const f=fixture();const before=f.route({x:0,y:1},{x:2,y:1});
  const type=Array.from(f.world.type);
  f.network.add({id:'r',kind:'road',path:line(0,1,2),speedFactor:2,level:1});
  const after=f.route({x:0,y:1},{x:2,y:1});
  assert.equal(after.status,'ok');assert.ok(after.hours<before.hours);
  assert.deepEqual(after.legs.map(x=>x.kind),['road','road']);
  assert.deepEqual(Array.from(f.world.type),type);
});
test('road importance does not independently affect speed',()=>{
  const f=fixture();f.network.add({id:'r',kind:'road',path:line(0,1,2),speedFactor:2,level:1});
  const a=f.route({x:0,y:1},{x:2,y:1});
  f.network.update('r',{level:4});
  assert.equal(f.route({x:0,y:1},{x:2,y:1}).hours,a.hours);
});
test('road restrictions leave ordinary dry terrain passable',()=>{
  const f=fixture();f.network.add({id:'private',kind:'road',path:line(0,1,2),speedFactor:2});
  const a=f.route({x:0,y:1},{x:2,y:1},{canUse:()=>false});
  assert.equal(a.status,'ok');assert.ok(a.legs.every(leg=>leg.kind==='terrain'));
});
test('river cannot be crossed without an explicit water crossing',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  assert.equal(f.route({x:0,y:0},{x:2,y:0}).status,'unreachable');
});
test('bridge construction creates a crossing, destruction removes it, repair restores it',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  f.network.add({id:'b',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}],allowedModes:['foot','cart'],maxLoadKg:1000});
  const yes=f.route({x:0,y:0},{x:2,y:0});
  assert.equal(yes.status,'ok');assert.equal(yes.legs[0].kind,'bridge');assert.equal(yes.distanceKm,2);
  f.network.update('b',{status:'destroyed'});
  assert.equal(f.route({x:0,y:0},{x:2,y:0}).status,'unreachable');
  f.network.update('b',{status:'open'});
  assert.equal(f.route({x:0,y:0},{x:2,y:0}).status,'ok');
});
test('crossing must be known and permission-allowed for each actor',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  f.network.add({id:'b',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]});
  assert.equal(f.route({x:0,y:0},{x:2,y:0},{knowsFacility:()=>false}).status,'unreachable');
  assert.equal(f.route({x:0,y:0},{x:2,y:0},{canUse:()=>false}).status,'unreachable');
});
test('crossing knowledge is not inferred from known banks alone',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  f.network.add({id:'b',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]});
  const result=f.router.route({x:0,y:0},{x:2,y:0},{knows:known});
  assert.equal(result.status,'unreachable');
});
test('ferry requires operator availability; fixed crossing duration is used',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  f.network.add({id:'f',kind:'ferry',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}],travelHours:1.5});
  assert.equal(f.route({x:0,y:0},{x:2,y:0}).status,'unreachable');
  f.network.update('f',{operating:true});
  const route=f.route({x:0,y:0},{x:2,y:0});
  assert.equal(route.status,'ok');assert.equal(route.hours,1.5);assert.equal(route.legs[0].kind,'ferry');
  f.network.update('f',{operating:false});
  assert.equal(f.route({x:0,y:0},{x:2,y:0}).status,'unreachable');
});
test('crossing rejects excess load and unsupported transport mode',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  f.network.add({id:'b',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}],allowedModes:['foot'],maxLoadKg:70});
  assert.equal(f.route({x:0,y:0},{x:2,y:0},{mode:'cart'}).status,'unreachable');
  assert.equal(f.route({x:0,y:0},{x:2,y:0},{loadKg:75}).status,'unreachable');
  assert.equal(f.route({x:0,y:0},{x:2,y:0},{loadKg:60}).status,'ok');
});
test('road paths never traverse water and crossing paths must connect banks',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  assert.throws(()=>f.network.add({id:'bad',kind:'road',path:[{x:0,y:0},{x:1,y:0}]}),/water/);
  assert.throws(()=>f.network.add({id:'bad',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:1,y:0}]}),/revisit/);
  assert.throws(()=>f.network.add({id:'bad',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}],speedFactor:0}),/speed/);
});
test('sea cells cannot become river crossings without altering actual terrain',()=>{
  const f=fixture(3,1);f.set(1,0,'type',0);
  assert.throws(()=>f.network.add({id:'b',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]}),/river\/lake/);
});
test('terrain change makes an existing crossing invalid without deleting it',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  f.network.add({id:'b',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]});
  assert.equal(f.route({x:0,y:0},{x:2,y:0}).status,'ok');
  f.set(1,0,'type',0);
  assert.equal(f.route({x:0,y:0},{x:2,y:0}).status,'unreachable');
  assert.ok(f.network.get('b'));
});
test('snapshot round-trip preserves infrastructure state and later route changes',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  f.network.add({id:'b',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]});
  f.network.update('b',{status:'closed'});
  const snap=JSON.parse(JSON.stringify(f.network.snapshot()));
  const network=createTransportNetwork(f.world,{...f.options,snapshot:snap});
  assert.deepEqual(network.snapshot(),snap);
  assert.equal(network.get('b').status,'closed');
  network.update('b',{status:'open'});
  const restoredRouter=createGeographyAdapter(f.world,{...f.options,infrastructure:network});
  assert.equal(restoredRouter.route({x:0,y:0},{x:2,y:0},{knows:known,knowsFacility:()=>true}).status,'ok');
});
test('invalid update leaves existing link intact',()=>{
  const f=fixture();f.network.add({id:'r',kind:'road',path:line(0,1)});
  assert.throws(()=>f.network.update('r',{speedFactor:-1}),/speed/);
  assert.equal(f.network.get('r').speedFactor,1);
  assert.throws(()=>f.network.update('r',{id:'forgery'}),/Unsupported/);
});
test('a bridge creates an explicit routed leg with physical intermediate path',()=>{
  const f=fixture(3,1);f.set(1,0,'water',1);
  f.network.add({id:'b',kind:'bridge',path:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]});
  const route=f.route({x:2,y:0},{x:0,y:0});
  assert.deepEqual(route.legs[0].path,[{x:2,y:0},{x:1,y:0},{x:0,y:0}]);
});
test('road closed/destroyed does not restore an invalid water path',()=>{
  const f=fixture(2,1);f.network.add({id:'r',kind:'road',path:[{x:0,y:0},{x:1,y:0}],speedFactor:2});
  f.network.update('r',{status:'destroyed'});
  const result=f.route({x:0,y:0},{x:1,y:0});
  assert.equal(result.status,'ok');assert.equal(result.legs[0].kind,'terrain');
  f.set(1,0,'water',1);
  assert.equal(f.route({x:0,y:0},{x:1,y:0}).status,'blocked');
});
