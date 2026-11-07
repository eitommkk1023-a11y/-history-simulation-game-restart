import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldKey,order,rootFixture,worldPart,militaryPart,validRoot,inFlight} from '../fixtures/checkpoint-world.mjs';
import * as api from '../../src/persistence/world-checkpoint.mjs';
function setup(extra={}){assert.equal(typeof api.createWorldCheckpoint,'function','world checkpoint gate must exist');const root=rootFixture();
 const store=api.createWorldCheckpoint({worldKey,world:root,participants:[militaryPart,worldPart],getDay:r=>r.world.clock.day,validate:validRoot,...extra});return {root,store};}

test('captures the world-owned people/economy/transport and military as one typed checkpoint',()=>{
 const {root,store}=setup();inFlight(root);const saved=store.capture('save-1');
 assert.ok(saved.sections.world.data.people.birth instanceof Int32Array);assert.equal(saved.sections.world.checkpointId,'save-1');
 assert.equal(saved.sections.military.checkpointId,'save-1');assert.equal(saved.sections.world.data.people.meta.npc.n,6);
 const baseline=structuredClone(saved);root.world.people.groups[0].food=2;root.world.transport.positions.get(1).x=99;assert.deepEqual(saved,baseline);
});
test('restores all parts into a new candidate without mutating input or active objects',()=>{
 const {root,store}=setup();inFlight(root);const saved=store.capture('save-1'),input=structuredClone(saved);
 store.restore(saved);assert.notEqual(store.current,root);assert.notEqual(store.current.world.people.npc,root.world.people.npc);
 assert.equal(store.current.world.transport.deliveries.get('o1').progress,0.5);assert.equal(store.current.military.orders.get('o1').stage,'dispatched');
 assert.deepEqual(saved,input);assert.deepEqual(store.current.world.otherExistingExtension,{kept:true});
 assert.equal(store.current.world.people.groups[0].layout.items[0].id,100004);assert.equal(store.current.world.people.ethnicities[0].id,1);
});
test('one corrupt military subsection keeps the entire prior world and inventories active',()=>{
 const {root,store}=setup();inFlight(root);const saved=store.capture('save-1');saved.sections.military.data.assignments.operations[0].command.personIds=[999];
 const before=store.capture('before');assert.throws(()=>store.restore(saved));assert.equal(store.current,root);
 assert.deepEqual(store.capture('after').sections.world.data,before.sections.world.data);
});
test('cross-component invalid delivery, duplicated community and invalid stock are rejected atomically',()=>{
 for(const mutate of [d=>d.transport.deliveries.delete('o1'),d=>d.transport.deliveries.get('o1').courierId=999,d=>d.people.meta.groups.push(structuredClone(d.people.meta.groups[0])),d=>d.people.meta.groups[0].food=-1]){
  const {root,store}=setup();inFlight(root);const saved=store.capture('save-1');mutate(saved.sections.world.data);
  assert.throws(()=>store.restore(saved));assert.equal(store.current,root);
 }
});
test('rejects foreign, missing, unknown, unsupported and mixed-time/ID components',()=>{
 const {root,store}=setup();const good=store.capture('save-1');
 for(const mutate of [s=>s.worldKey='other',s=>s.version=99,s=>delete s.sections.military,s=>s.sections.unknown={},s=>s.sections.world.version=99,s=>s.sections.world.day=5,s=>s.sections.military.checkpointId='older',s=>s.sections.world.data.clock.day=7]){
  const bad=structuredClone(good);mutate(bad);assert.throws(()=>store.restore(bad));assert.equal(store.current,root);
 }
});
test('real release committed before order acknowledgement reloads without applying twice',()=>{
 const {root,store}=setup();inFlight(root);const w=root.world,m=root.military;w.clock.day=w.people.npc.day=2;
 Object.assign(w.transport.deliveries.get('o1'),{status:'arrived',receivedDay:2});m.orders.step('o1');m.orders.step('o1');m.orders.step('o1');
 const request=m.orders.executionRequests()[0],release={action:'release',operationId:request.executionKey,actorId:0,unitId:'a',personIds:[2]};
 m.assignments.execute(release);const save=store.capture('after-effect');store.restore(save);
 const restored=store.current,receipt=restored.military.assignments.execute(release);assert.equal(receipt.replayed,true);assert.equal(restored.military.assignments.revision,2);
 restored.world.actions.receipts.set(request.executionKey,{...request,status:'completed',completedDay:receipt.day});restored.military.orders.step('o1');
 assert.equal(restored.military.orders.get('o1').stage,'completed');assert.equal(restored.world.people.npc.n,6);assert.equal(restored.world.people.groups[0].food,120);
});
test('failure in a late loader and an async validator never installs a partial world',()=>{
 const {root,store}=setup();const snapshot=store.capture('save-1');
 const broken={...militaryPart,restore:()=>{throw Error('late failure')}};
 const second=setup({world:root,participants:[worldPart,broken]}).store;
 assert.throws(()=>second.restore(snapshot),/late failure/);assert.equal(second.current,root);
 assert.throws(()=>setup({validate:()=>Promise.resolve(true)}),/asynchronous/);
});
test('rejects duplicate parts and cyclic/missing dependencies before any loading',()=>{
 assert.throws(()=>setup({participants:[worldPart,worldPart]}),/participant/);
 assert.throws(()=>setup({participants:[{...worldPart,dependsOn:['military']},militaryPart]}),/depend/);
 assert.throws(()=>setup({participants:[militaryPart]}),/depend/);
});
test('reentrant restore is rejected while building a candidate',()=>{
 let store,saved,nested;
 const part={...worldPart,restore:sv=>{try{store.restore(saved);}catch(e){nested=e.message;}return worldPart.restore(sv);}};
 ({store}=setup({participants:[part,militaryPart]}));saved=store.capture('save-1');store.restore(saved);assert.match(nested,/busy/);
});
test('rejects a loader that reuses active mutable data, including ArrayBuffer views',()=>{
 const {root,store}=setup();const saved=store.capture('save-1');
 const alias={...worldPart,restore:sv=>({...worldPart.restore(sv),history:root.world.history})};
 const guarded=setup({world:root,participants:[alias,militaryPart]}).store;
 assert.throws(()=>guarded.restore(saved),/active/);assert.equal(guarded.current,root);
});
test('cross-world or different-recipient delivery records cannot justify restored receipt state',()=>{
 for(const edit of [{worldKey:'other'},{recipientId:3}]){
  const {root,store}=setup();inFlight(root);const saved=store.capture('save-1');Object.assign(saved.sections.world.data.transport.deliveries.get('o1'),edit);
  assert.throws(()=>store.restore(saved));assert.equal(store.current,root);
 }
});
test('shared ArrayBuffer aliases and reused checkpoint IDs are rejected',()=>{
 const {root,store}=setup();const saved=store.capture('save-1');assert.throws(()=>store.capture('save-1'),/checkpointId/);
 const alias={...worldPart,restore:sv=>{const w=worldPart.restore(sv);w.people.npc.birth=new Int32Array(root.world.people.npc.birth.buffer);return w;}};
 const guarded=setup({world:root,participants:[alias,militaryPart]}).store;assert.throws(()=>guarded.restore(saved),/active/);assert.equal(guarded.current,root);
});
