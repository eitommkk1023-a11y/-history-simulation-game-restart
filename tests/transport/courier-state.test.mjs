import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGeographyAdapter} from '../../src/transport/geography-adapter.mjs';
import {peopleFixture,worldKey} from '../fixtures/checkpoint-world.mjs';
import * as api from '../../src/transport/courier-state.mjs';
export function setup(){assert.equal(typeof api.createCourierRuntime,'function','courier runtime must exist');
 const people=peopleFixture(),state={worldKey,version:1,travelClockHours:0,positions:new Map([[0,{x:0,y:0}],[1,{x:0,y:0}],[2,{x:2,y:0}]]),deliveries:new Map(),cargo:new Map(),movementReceipts:new Map()};
 const terrain={elev:new Float32Array(3),type:new Uint8Array(3).fill(1),biome:new Uint8Array(3).fill(5),water:new Uint8Array(3)};
 const geography=createGeographyAdapter(terrain,{width:3,height:1,kmPerBlock:1});
 const ports={worldKey,people,state,geography,knows:()=>true,knowsTarget:()=>true,authorize:()=>true};
 return {people,state,terrain,ports,runtime:api.createCourierRuntime(ports)};
}
export const dispatch={request:{worldKey,orderId:'o1',issuerId:0,recipientId:2,unitId:'a',instruction:'連絡',issuedDay:0,deliveryKey:JSON.stringify([worldKey,'o1','delivery'])},courierId:1,deliveryId:'d1',profile:{baseKmH:1}};
const move=(id,hours)=>({operationId:id,deliveryId:'d1',travelHours:hours});
test('moves an existing person along canonical geography without spawning or teleportation',()=>{
 const s=setup(),before=s.people.npc.checksum();assert.equal(s.runtime.dispatch(dispatch).ok,true);
 assert.equal((s.state.travelClockHours=0.4,s.runtime.advance(move('m1',0.4))).ok,true);const p=s.state.positions.get(1);assert.ok(p.x>0&&p.x<1);
 assert.equal(s.state.deliveries.get('o1').status,'in-transit');assert.equal(s.people.npc.n,6);assert.equal(s.people.npc.checksum(),before);
});
test('save and rebind continue the same fractional leg and idempotent movement command',()=>{
 const a=setup();a.runtime.dispatch(dispatch);(a.state.travelClockHours=0.4,a.runtime.advance(move('m1',0.4)));const copied=structuredClone(a.state);
 const resumed=api.createCourierRuntime({...a.ports,state:copied});assert.equal(resumed.advance(move('m1',0.4)).replayed,true);
 a.state.travelClockHours=copied.travelClockHours=0.8;a.runtime.advance(move('m2',0.4));resumed.advance(move('m2',0.4));assert.deepEqual(copied,a.state);
 copied.travelClockHours=2.8;resumed.advance(move('m3',2));assert.equal(copied.deliveries.get('o1').status,'arrived');assert.equal(copied.positions.get(1).x,2);
});
test('one person cannot carry two concurrent missions and retry cannot spawn another courier',()=>{
 const s=setup();s.runtime.dispatch(dispatch);assert.equal(s.runtime.dispatch(dispatch).replayed,true);
 const another={...dispatch,deliveryId:'d2',request:{...dispatch.request,orderId:'o2',deliveryKey:JSON.stringify([worldKey,'o2','delivery'])}};
 assert.equal(s.runtime.dispatch(another).ok,false);assert.equal(s.state.deliveries.size,1);
});
test('no route or unknown recipient position/knowledge prevents dispatch',()=>{
 for(const change of [s=>s.terrain.water[1]=1,s=>s.state.positions.delete(2),s=>s.ports.knowsTarget=()=>false]){
  const s=setup();change(s);const r=api.createCourierRuntime(s.ports);assert.equal(r.dispatch(dispatch).ok,false);assert.equal(s.state.deliveries.size,0);
 }
});
test('death, a new obstacle, and a moved recipient do not imply successful arrival',()=>{
 const dead=setup();dead.runtime.dispatch(dispatch);dead.people.npc._die(1,1);assert.equal(dead.runtime.advance(move('m1',3)).ok,false);assert.equal(dead.state.positions.get(1).x,0);
 const blocked=setup();blocked.runtime.dispatch(dispatch);blocked.terrain.water[1]=1;blocked.state.travelClockHours=3;assert.equal(blocked.runtime.advance(move('m1',3)).ok,false);assert.equal(blocked.state.positions.get(1).x,0);
 const moved=setup();moved.runtime.dispatch(dispatch);moved.state.positions.set(2,{x:1,y:0});moved.state.travelClockHours=3;moved.runtime.advance(move('m1',3));assert.equal(moved.state.deliveries.get('o1').status,'interrupted');
 assert.equal('receivedDay' in moved.state.deliveries.get('o1'),false);
});
test('corrupt progress, mismatched physical position, and duplicate courier occupation fail validation',()=>{
 const s=setup();s.runtime.dispatch(dispatch);(s.state.travelClockHours=0.4,s.runtime.advance(move('m1',0.4)));
 for(const mutate of [d=>d.deliveries.get('o1').legIndex=99,d=>d.positions.get(1).x=99,d=>{const r=structuredClone(d.deliveries.get('o1'));r.orderId='o2';r.deliveryId='d2';d.deliveries.set('o2',r);}]){
  const bad=structuredClone(s.state);mutate(bad);assert.throws(()=>api.createCourierRuntime({...s.ports,state:bad}),/courier/);
 }
});
test('different operation IDs cannot spend the same world travel-time budget twice',()=>{
 const s=setup();s.state.travelClockHours=0;s.runtime.dispatch(dispatch);s.state.travelClockHours=0.4;
 (s.state.travelClockHours=0.4,s.runtime.advance(move('m1',0.4)));const pos=structuredClone(s.state.positions.get(1));
 assert.equal(s.runtime.advance(move('m2',0.4)).ok,false);assert.deepEqual(s.state.positions.get(1),pos);
});
test('saved courier identity, profile and consumed travel intervals must agree',()=>{
 const s=setup();s.runtime.dispatch(dispatch);s.state.travelClockHours=0.4;s.runtime.advance(move('m1',0.4));
 for(const mutate of [d=>d.deliveries.get('o1').command.courierId=2,d=>d.deliveries.get('o1').command.profile.baseKmH=0,d=>{const r=structuredClone(d.movementReceipts.get('m1'));r.command.operationId='duplicate-time';d.movementReceipts.set('duplicate-time',r);}]){
  const bad=structuredClone(s.state);mutate(bad);assert.throws(()=>api.createCourierRuntime({...s.ports,state:bad}),/courier/);
 }
});
