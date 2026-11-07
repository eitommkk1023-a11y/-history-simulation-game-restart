import {test} from 'node:test';import assert from 'node:assert/strict';
import People from '../../npc/people-core.js';import {peopleFixture} from '../fixtures/checkpoint-world.mjs';
test('canonical daily population update exists and matches the shared world day',()=>{
 assert.equal(typeof People.peopleDaily,'function');const p=People.peopleLoad(People.peopleSave(peopleFixture()));
 for(let day=1;day<=30;day++)People.peopleDaily(p,day);
 assert.equal(p.npc.day,30);const n=p.npc.n;People.peopleDaily(p,30);assert.equal(p.npc.day,30);assert.equal(p.npc.n,n);
 assert.throws(()=>People.peopleDaily(p,32),/day/);
});
test('service absence keeps population but removes double-booked home labor and food',()=>{
 const p=People.peopleLoad(People.peopleSave(peopleFixture()));p.npc._setJob(2,1);const full=People.peStats(p),need=full.need[1],labor=full.labor[1],count=full.pop[1];
 p.serviceAvailability=new Map([[2,{awayDays:30}]]);const away=People.peStats(p);
 assert.equal(away.pop[1],count);assert.ok(away.need[1]<need);assert.ok(away.labor[1]<labor);
 assert.equal(p.npc.job[2],1);assert.ok(People.peopleDailyFoodNeed(p,2)>0);
});
test('population save retains ordered social sampling references across deaths',()=>{
 const p=People.peopleLoad(People.peopleSave(peopleFixture()));p.npc._die(3,1);
 const saved=People.peopleSave(p),restored=People.peopleLoad(saved);
 assert.deepEqual(restored.npc.members,p.npc.members);
});
