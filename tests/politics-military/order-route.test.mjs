import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGeographyAdapter} from '../../src/transport/geography-adapter.mjs';
import * as api from '../../src/politics-military/order-route.mjs';
function setup(){
 assert.equal(typeof api.estimateOrderRoute,'function','order route adapter API must exist');
 const world={elev:new Float32Array(9),type:new Uint8Array(9).fill(1),biome:new Uint8Array(9).fill(5),water:new Uint8Array(9)};
 const geography=createGeographyAdapter(world,{width:3,height:3,kmPerBlock:1});
 const locations=new Map([[0,{x:0,y:1}],[2,{x:2,y:1}]]);
 const ports={geography,locate:id=>locations.get(id),knows:()=>true,profile:{baseKmH:4}};
 return {world,ports,locations};
}
const order={issuerId:0,recipientId:2};
test('uses existing geographic routing and returns an estimate, never a delivery receipt',()=>{
 const {ports}=setup(),r=api.estimateOrderRoute(ports,order);
 assert.equal(r.status,'estimated');assert.equal(r.distanceKm,2);assert.ok(r.hours>0);assert.equal(r.path.at(-1).x,2);
 for(const field of ['receivedDay','deliveryId','arrived'])assert.equal(field in r,false);
});
test('unknown physical position is not replaced by home/community position',()=>{
 const {ports,locations}=setup();locations.delete(2);assert.equal(api.estimateOrderRoute(ports,order).status,'position-unknown');
});
test('missing knowledge and travel profile are not filled with omniscience or a fixed speed',()=>{
 const {ports}=setup();assert.equal(api.estimateOrderRoute({...ports,knows:undefined},order).status,'knowledge-unavailable');
 assert.equal(api.estimateOrderRoute({...ports,profile:undefined},order).status,'profile-unavailable');
 assert.equal(api.estimateOrderRoute({...ports,knows:()=>false},order).status,'unknown');
});
test('existing river crossing restriction is retained',()=>{
 const {ports,world}=setup();for(let y=0;y<3;y++)world.water[y*3+1]=1;
 assert.equal(api.estimateOrderRoute(ports,order).status,'unreachable');
});
test('actor-specific knowledge is used; invalid positions and port exceptions fail closed',()=>{
 const {ports,locations}=setup();let actor;
 api.estimateOrderRoute({...ports,knows:(who)=>{actor=who;return true;}},order);assert.equal(actor,0);
 locations.set(2,{x:-1,y:0});assert.equal(api.estimateOrderRoute(ports,order).status,'route-unavailable');
 assert.equal(api.estimateOrderRoute({...ports,locate:()=>{throw Error('offline')}},order).status,'route-unavailable');
});
