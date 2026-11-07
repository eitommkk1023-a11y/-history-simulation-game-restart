import {test} from 'node:test';import assert from 'node:assert/strict';
import People from '../../npc/people-core.js';import {peopleFixture} from '../fixtures/checkpoint-world.mjs';
const api=await import('../../src/integration/main-military.mjs').catch(e=>{if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;return {};});
function setup(){assert.equal(typeof api.createMainMilitary,'function');const people=People.peopleLoad(People.peopleSave(peopleFixture()));
 const terrain={stats:{width:3,height:1},elev:new Float32Array(3),type:new Uint8Array(3).fill(1),biome:new Uint8Array(3).fill(5),water:new Uint8Array(3)};
 const ports={people,People,getTerrain:()=>terrain,worldKey:'main-test',day:0,developerEnabled:()=>true,onEvent:()=>{}};
 return {people,ports,c:api.createMainMilitary(ports)};
}
const fixture={unitId:'unit-a',issuerId:0,recipientId:2,courierId:1,positions:[[0,{x:0,y:0}],[1,{x:0,y:0}],[2,{x:2,y:0}]],knownCells:[[0,0],[1,0],[2,0]],profile:{baseKmH:0.1,travelHoursPerDay:2},capacityKg:15,loadKg:12,groupId:1,foodKind:'dried'};
test('main day advances exactly once with real rations and no home labor/food duplication',()=>{
 const s=setup();s.people.npc._setJob(1,1);assert.equal(s.c.installDeveloperMission(fixture).ok,true);const stock=s.people.groups[0].food;
 for(let d=1;d<=5;d++){People.peopleDaily(s.people,d);s.c.day(d);}
 assert.equal(s.c.audit().day,5);assert.equal(s.people.npc.day,5);assert.equal(s.people.serviceAvailability.get(1).awayDays,5);
 assert.ok(s.c.audit().foodConsumedKg>0);assert.equal(s.people.groups[0].food,stock);assert.equal(s.people.npc.n,6);
 const before=s.c.save();s.c.day(5);assert.deepEqual(s.c.save(),before);
});
test('native extension survives JSON and rebinds service labor/food and request receipts',()=>{
 const a=setup();a.c.installDeveloperMission(fixture);for(let d=1;d<=3;d++){People.peopleDaily(a.people,d);a.c.day(d);}
 const saved=JSON.parse(JSON.stringify(a.c.save())),loaded=People.peopleLoad(People.peopleSave(a.people));
 const c=api.createMainMilitary({...a.ports,people:loaded,day:3,snapshot:saved});
 for(let d=4;d<=10;d++){People.peopleDaily(a.people,d);a.c.day(d);People.peopleDaily(loaded,d);c.day(d);}
 assert.deepEqual(c.save(),a.c.save());assert.equal(loaded.npc.checksum(),a.people.npc.checksum());
});
test('malformed or foreign native state is rejected before changing population',()=>{
 const s=setup();s.c.installDeveloperMission(fixture);const saved=s.c.save(),before=s.people.npc.checksum();
 saved.worldKey='foreign';assert.throws(()=>api.createMainMilitary({...s.ports,snapshot:saved}));assert.equal(s.people.npc.checksum(),before);
});
test('invalid developer mission cannot debit food or leave partial units and positions',()=>{
 const s=setup(),before=s.c.save(),stock=s.people.groups[0].food;s.ports.getTerrain().water[1]=1;
 assert.equal(s.c.installDeveloperMission(fixture).ok,false);assert.equal(s.people.groups[0].food,stock);assert.deepEqual(s.c.save(),before);
});
test('a second mission cannot overwrite an existing person cargo or physical position',()=>{
 const s=setup();s.c.installDeveloperMission(fixture);const before=s.c.save(),stock=s.people.groups[0].food;
 assert.equal(s.c.installDeveloperMission({...fixture,unitId:'different-unit'}).ok,false);assert.equal(s.people.groups[0].food,stock);assert.deepEqual(s.c.save(),before);
});
