import {test} from 'node:test';
import assert from 'node:assert/strict';
import {peopleFixture,worldKey} from '../fixtures/checkpoint-world.mjs';
import * as api from '../../src/economy/food-transfer.mjs';
function setup(){assert.equal(typeof api.createFoodTransfer,'function','canonical food transfer must exist');
 const people=peopleFixture(),transport={positions:new Map([[0,{x:0,y:0}],[1,{x:0,y:0}]]),cargo:new Map([[1,{food:0,fresh:0,dried:0,capacityKg:15}]])},economy={worldKey,version:1,receipts:new Map()};
 const ports={worldKey,people,transport,economy,authorize:()=>true};return {people,transport,economy,ports,transfer:api.createFoodTransfer(ports)};
}
const command={worldKey,operationId:'food-1',actorId:0,from:{kind:'community',id:1},to:{kind:'cargo',id:1},foodKind:'dried',kg:10};
test('transfers existing food to one existing person cargo; total and components conserve kg',()=>{
 const s=setup(),before=s.people.npc.checksum();assert.equal(s.transfer.transfer(command).ok,true);
 const g=s.people.groups[0],cargo=s.transport.cargo.get(1);assert.equal(g.food,110);assert.equal(g.dried,20);assert.equal(cargo.food,10);assert.equal(cargo.dried,10);
 assert.equal(g.food+cargo.food,120);assert.equal(s.people.npc.n,6);assert.equal(s.people.npc.checksum(),before);
});
test('load and same operation retry do not debit stock twice; changed payload conflicts',()=>{
 const s=setup();s.transfer.transfer(command);const saved=structuredClone({g:s.people.groups[0],transport:s.transport,economy:s.economy});
 s.people.groups[0]=saved.g;const t=api.createFoodTransfer({...s.ports,transport:saved.transport,economy:saved.economy});
 assert.equal(t.transfer(command).replayed,true);assert.equal(t.transfer({...command,kg:11}).code,'operation-id-conflict');assert.equal(s.people.groups[0].food,110);
});
test('fresh and durable use the existing food total and do not add derived stock twice',()=>{
 for(const foodKind of ['fresh','durable']){const s=setup();s.transfer.transfer({...command,foodKind});const g=s.people.groups[0],c=s.transport.cargo.get(1);
  assert.equal(g.food+c.food,120);assert.equal(g.food-g.fresh-g.dried+(c.food-c.fresh-c.dried),70);}
});
test('missing authority, physical distance, stock or carrying capacity causes no partial transfer',()=>{
 for(const alter of [s=>s.ports.authorize=()=>false,s=>s.transport.positions.set(1,{x:5,y:0}),s=>s.transport.cargo.get(1).capacityKg=5]){
  const s=setup();alter(s);const before=structuredClone({g:s.people.groups[0],t:s.transport,e:s.economy});
  const t=api.createFoodTransfer(s.ports);assert.equal(t.transfer(command).ok,false);assert.deepEqual({g:s.people.groups[0],t:s.transport,e:s.economy},before);
 }
 const s=setup();assert.equal(s.transfer.transfer({...command,kg:40}).ok,false);assert.equal(s.people.groups[0].food,120);
});
test('unloading requires the same actual location and restores stock without generating food',()=>{
 const s=setup();s.transfer.transfer(command);assert.equal(s.transfer.transfer({...command,operationId:'unload',from:command.to,to:command.from}).ok,true);
 assert.equal(s.people.groups[0].food,120);assert.equal(s.transport.cargo.get(1).food,0);assert.equal(s.economy.receipts.size,2);
});
test('invalid populations, duplicated cargo ownership, negative or inconsistent inventories fail validation',()=>{
 for(const alter of [s=>s.transport.cargo.set(2,s.transport.cargo.get(1)),s=>s.transport.cargo.set(99,{food:0,fresh:0,dried:0,capacityKg:1}),s=>s.people.groups[0].food=-1,s=>s.people.groups[0].fresh=121]){
  const s=setup();alter(s);assert.throws(()=>api.createFoodTransfer(s.ports),/food/);
 }
});
test('dead actor and unknown person do not create new cargo or resources',()=>{
 const s=setup();s.people.npc._die(0,1);assert.equal(s.transfer.transfer(command).ok,false);
 assert.equal(s.transfer.transfer({...command,actorId:5,to:{kind:'cargo',id:99}}).ok,false);assert.equal(s.transport.cargo.size,1);
});
test('a read-only destination cannot leave a debited source without an execution receipt',()=>{
 const s=setup();Object.freeze(s.transport.cargo.get(1));const before=s.people.groups[0].food;
 assert.equal(s.transfer.transfer(command).ok,false);assert.equal(s.people.groups[0].food,before);assert.equal(s.economy.receipts.size,0);
});
