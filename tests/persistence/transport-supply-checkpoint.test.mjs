import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeRoot,storeFor,start,arrive,unload,food,courier,pickup} from '../fixtures/transport-supply-world.mjs';
const stock=r=>r.world.people.groups.reduce((s,g)=>s+g.food,0)+[...r.world.transport.cargo.values()].reduce((s,c)=>s+c.food,0);
test('real courier and food cargo resume mid-leg from one world checkpoint',()=>{
 const root=makeRoot(),store=storeFor(root);start(root);const saved=store.capture('mid-trip');store.restore(saved);const restored=store.current;
 assert.ok(restored.world.transport.positions.get(1).x>0&&restored.world.transport.positions.get(1).x<1);
 assert.equal(restored.world.transport.cargo.get(1).food,10);assert.equal(stock(restored),120);
 arrive(root);arrive(restored);assert.deepEqual(restored.world.transport,root.world.transport);assert.equal(restored.military.orders.get('supply').stage,'execution-requested');
 assert.equal(restored.world.people.npc.n,6);assert.equal(restored.world.people.groups[0].layout.items[0].id,100004);
});
test('food transfer committed before order-result acknowledgement survives load and retry exactly once',()=>{
 const root=makeRoot(),store=storeFor(root);start(root);arrive(root);const first=unload(root);assert.equal(first.result.ok,true);
 const saved=store.capture('after-unload');store.restore(saved);const restored=store.current;
 assert.equal(food(restored).transfer(first.command).replayed,true);assert.equal(food(restored).transfer(pickup).replayed,true);
 assert.equal(restored.world.people.groups[0].food,110);assert.equal(restored.world.people.groups[1].food,10);assert.equal(restored.world.transport.cargo.get(1).food,0);assert.equal(stock(restored),120);
 restored.world.actions.receipts.set(first.request.executionKey,{...first.request,status:'completed',completedDay:first.result.day});restored.military.orders.step('supply');
 assert.equal(restored.military.orders.get('supply').stage,'completed');const finished=store.capture('finished');store.restore(finished);
 assert.deepEqual(store.current.military.orders.executionRequests(),[]);assert.equal(stock(store.current),120);
});
test('movement result retries and duplicate IDs cannot re-spend saved travel hours or create people',()=>{
 const root=makeRoot(),store=storeFor(root);start(root);store.restore(store.capture('mid-trip'));const restored=store.current,where=structuredClone(restored.world.transport.positions.get(1));
 assert.equal(courier(restored).advance({operationId:'travel-1',deliveryId:'supply-delivery',travelHours:0.4}).replayed,true);
 assert.equal(courier(restored).advance({operationId:'changed-id',deliveryId:'supply-delivery',travelHours:0.4}).ok,false);
 assert.deepEqual(restored.world.transport.positions.get(1),where);assert.equal(restored.world.people.npc.n,6);
});
test('bad transport progress, duplicate cargo and bad receipt reject the entire candidate',()=>{
 for(const mutate of [w=>w.transport.deliveries.get('supply').legIndex=99,w=>w.transport.cargo.set(2,w.transport.cargo.get(1)),w=>w.economy.receipts.get('pickup').command.actorId=999,w=>w.transport.positions.get(1).x=99]){
  const root=makeRoot(),store=storeFor(root);start(root);const saved=store.capture('mid-trip');mutate(saved.sections.world.data);
  assert.throws(()=>store.restore(saved));assert.equal(store.current,root);assert.equal(stock(root),120);assert.equal(root.world.transport.cargo.get(1).food,10);
 }
});
test('the same seed and 60 population days preserve results across an in-flight reload',()=>{
 const a=storeFor(makeRoot()),b=storeFor(makeRoot());a.restore(a.capture('initial-a'));b.restore(b.capture('initial-b'));
 start(a.current);start(b.current);b.restore(b.capture('in-flight'));
 for(let i=0;i<60;i++){for(const store of [a,b]){store.current.world.people.npc.stepDay();store.current.world.clock.day=store.current.world.people.npc.day;}}
 arrive(a.current);arrive(b.current);
 const pa=a.current.world.people.npc,pb=b.current.world.people.npc;
 assert.equal(pa.checksum(),pb.checksum());assert.equal(pa.rng,pb.rng);assert.deepEqual(pa.stats,pb.stats);
 assert.deepEqual(a.current.world.transport,b.current.world.transport);assert.equal(stock(a.current),stock(b.current));assert.equal(stock(a.current),120);
});
