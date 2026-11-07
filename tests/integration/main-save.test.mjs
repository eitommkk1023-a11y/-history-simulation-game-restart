import {test} from 'node:test';import assert from 'node:assert/strict';import People from '../../npc/people-core.js';
import {peopleFixture} from '../fixtures/checkpoint-world.mjs';import {createMainMilitary} from '../../src/integration/main-military.mjs';
import {sealMainSave,prepareMainSave} from '../../src/integration/main-save.mjs';
function setup(){const p=People.peopleLoad(People.peopleSave(peopleFixture())),c=createMainMilitary({people:p,People,getTerrain:()=>null,worldKey:'world-main',day:0});const raw={format:1,seed:'12345',clock:{day:0,acc:0.2,pending:2,playing:false},people:People.peopleSave(p),history:{list:[],nextId:1}};return {p,c,raw};}
test('main save seals the existing world format with the same checkpoint and stages without mutation',()=>{
 const {raw,c}=setup(),saved=sealMainSave(raw,c),before=structuredClone(saved);const staged=prepareMainSave(saved,{People,getTerrain:()=>null});
 assert.equal(staged.people.npc.day,0);assert.equal(staged.snapshot.clock.pending,2);assert.deepEqual(saved,before);assert.equal(staged.controller.worldKey,'world-main');
});
test('main preflight rejects corrupt and mixed extensions before host globals can change',()=>{
 const {raw,c,p}=setup(),good=sealMainSave(raw,c),before=p.checksum?.()??p.npc.checksum();
 for(const edit of [s=>s.military.seed='other',s=>s.military.checkpointId='other',s=>s.people.birth=new Int32Array(0),s=>s.military.data.day=2,s=>s.people.mother[0]=999999,s=>s.clock.pending=Infinity]){const bad=structuredClone(good);edit(bad);assert.throws(()=>prepareMainSave(bad,{People}));assert.equal(p.npc.checksum(),before);}
});
test('old main save without an extension stages empty without duplicating any resident',()=>{const {raw}=setup();const staged=prepareMainSave(raw,{People,getTerrain:()=>null});assert.equal(staged.people.npc.n,6);assert.equal(staged.controller.audit().orders.length,0);});
test('very early world saves without any population retain the existing host migration path',()=>{
 const {raw}=setup();delete raw.people;const staged=prepareMainSave(raw,{People,getTerrain:()=>null});
 assert.equal(staged.people,null);assert.equal(staged.controller,null);assert.equal(staged.snapshot.people,undefined);
});
