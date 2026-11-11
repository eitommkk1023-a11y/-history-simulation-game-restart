import {test} from 'node:test';
import assert from 'node:assert/strict';
import Npc from '../../npc/npc-core.js';
import {inspectRoster} from '../../src/politics-military/person-reference.mjs';
function world(){const npc=new Npc.Population(123,2);npc.addFounder(1,25);npc.addFounder(1,30);return {npc};}
test('existing zero ID is preserved; inspection does not change world or RNG',()=>{const w=world(),before=w.npc.checksum(),rng=w.npc.rng,n=w.npc.n;const v=inspectRoster(w,[0,1]);assert.equal(v.ok,true);assert.deepEqual(v.members.map(p=>p.personId),[0,1]);assert.equal(v.members[0].communityId,1);assert.equal(v.members[0].physicalPosition,null);assert.equal(w.npc.checksum(),before);assert.equal(w.npc.rng,rng);assert.equal(w.npc.n,n);});
test('repeated ID rejects whole roster; no partial assignment',()=>{const w=world();const v=inspectRoster(w,[0,0]);assert.equal(v.ok,false);assert.equal(v.issues[0].code,'duplicate-person');assert.deepEqual(v.members,[]);assert.equal(w.npc.n,2);});
test('invalid IDs never read typed-array default slots',()=>{for(const id of [-1,2,0.5,'0',NaN,null]){assert.equal(inspectRoster(world(),[id]).ok,false);}});
test('death is read from population each time; no invented death or population change',()=>{const w=world();assert.equal(inspectRoster(w,[1]).ok,true);w.npc._die(1,1);const deaths=w.npc.stats.deaths;const v=inspectRoster(w,[1]);assert.equal(v.ok,false);assert.equal(v.issues[0].code,'person-not-alive');assert.equal(w.npc.stats.deaths,deaths);assert.equal(w.npc.livingCount(),1);});
test('community coordinates are not used as a soldier physical position',()=>{const w=world();w.groups=[{id:1,x:100,y:200}];assert.equal(inspectRoster(w,[0]).members[0].physicalPosition,null);});
test('empty roster is a valid read; missing canonical population fails explicitly',()=>{assert.equal(inspectRoster(world(),[]).ok,true);assert.throws(()=>inspectRoster({},[0]),/population/);assert.throws(()=>inspectRoster(world(),null),/array/);});
