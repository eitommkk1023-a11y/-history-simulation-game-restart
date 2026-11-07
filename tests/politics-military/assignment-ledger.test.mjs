import {test} from 'node:test';
import assert from 'node:assert/strict';
import Npc from '../../npc/npc-core.js';
import {createAssignmentLedger} from '../../src/politics-military/assignment-ledger.mjs';
function setup(overrides={}) {
  const npc=new Npc.Population(321,2);for(let i=0;i<6;i++)npc.addFounder(1,25);
  const people={npc}, units=new Map([['a',{id:'a',commanderId:0}],['b',{id:'b',commanderId:1}]]);
  const ports={worldKey:'test-world',people,resolveUnit:id=>units.get(id),authorize:c=>units.get(c.unitId)?.commanderId===c.actorId,...overrides};
  return {people,units,ports,ledger:createAssignmentLedger(ports)};
}
const assign=(id,ids,unit='a',actor=0)=>({action:'assign',operationId:id,personIds:ids,unitId:unit,actorId:actor});
const release=(id,ids,unit='a',actor=0)=>({...assign(id,ids,unit,actor),action:'release'});
const signature=p=>JSON.stringify({n:p.n,checksum:p.checksum(),day:p.day,rng:p.rng,stats:p.stats,jobs:[...p.job],groups:[...p.group]});
test('assigns canonical ID zero without spawning, changing jobs or teleporting',()=>{
 const {people,ledger:l}=setup(),before=signature(people.npc);
 assert.equal(l.execute(assign('one',[0,2])).ok,true);
 assert.deepEqual(l.assignments().map(x=>x.personId),[0,2]);
 assert.equal(l.assignments()[0].unitId,'a');assert.equal(signature(people.npc),before);
 assert.ok(l.assignments().every(x=>!('position' in x)&&!('assembled' in x)));
});
test('one permanent assignment; reassignment requires explicit release',()=>{
 const {ledger:l}=setup();l.execute(assign('one',[2]));
 assert.equal(l.execute(assign('two',[2],'b',1)).code,'already-assigned');
 assert.equal(l.revision,1);assert.equal(l.execute(release('three',[2])).ok,true);
 assert.equal(l.execute(assign('four',[2],'b',1)).ok,true);assert.equal(l.assignments()[0].unitId,'b');
});
test('batch validation is atomic for conflict, nonexistent or duplicate people',()=>{
 const {ledger:l}=setup();l.execute(assign('first',[2]));
 for(const ids of [[3,2],[3,999],[3,3]]){const before=l.save();assert.equal(l.execute(assign('bad'+ids,ids,'b',1)).ok,false);assert.deepEqual(l.save(),before);}
});
test('requires a canonical unit and explicit authority; no implicit player privilege',()=>{
 const {ledger:l}=setup();assert.equal(l.execute(assign('bad',[2],'a',1)).code,'not-authorized');
 assert.equal(l.execute(assign('bad',[2],'missing')).code,'unknown-unit');
 const absent=setup({authorize:undefined}).ledger;assert.equal(absent.execute(assign('bad',[2])).code,'not-authorized');
 const thrown=setup({authorize:()=>{throw Error('offline')}}).ledger;assert.equal(thrown.execute(assign('bad',[2])).code,'authority-unavailable');
 assert.equal(thrown.revision,0);
});
test('rejects dead actor/member; death does not mutate the roster or double-count population',()=>{
 const {people,ledger:l}=setup();l.execute(assign('first',[2]));people.npc._die(2,1);
 const before=signature(people.npc);assert.equal(l.assignments()[0].alive,false);
 assert.equal(l.execute(assign('bad',[2],'b',1)).code,'person-not-alive');
 assert.equal(l.execute(release('release-dead',[2])).ok,true);assert.equal(signature(people.npc),before);
 people.npc._die(0,1);assert.equal(l.execute(assign('dead-actor',[3])).code,'actor-not-alive');
});
test('same operation retry is idempotent even after death and authority changes',()=>{
 const {people,units,ledger:l}=setup();const c=assign('once',[2,3]);const a=l.execute(c);people.npc._die(2,1);units.get('a').commanderId=4;
 const b=l.execute({...c,personIds:[3,2]});assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(b.replayed,true);assert.equal(l.revision,1);
 assert.equal(l.execute({...c,personIds:[4]}).code,'operation-id-conflict');assert.equal(l.pendingEvents().length,1);
});
test('release errors are atomic and wrong-unit release does not free people',()=>{
 const {ledger:l}=setup();l.execute(assign('first',[2,3]));const before=l.save();
 assert.equal(l.execute(release('wrong',[2],'b',1)).ok,false);assert.equal(l.execute(release('mixed',[2,4])).ok,false);assert.deepEqual(l.save(),before);
});
test('revision guard detects stale commands but allows replay of committed request',()=>{
 const {ledger:l}=setup(),c={...assign('one',[2]),expectedRevision:0};l.execute(c);
 assert.equal(l.execute({...assign('two',[3]),expectedRevision:0}).code,'stale-revision');
 assert.equal(l.execute(c).replayed,true);assert.equal(l.revision,1);
});
test('outbox survives reload until acknowledged; duplicate acknowledgements do nothing',()=>{
 const {ports,ledger:l}=setup();l.execute(assign('one',[2]));const saved=JSON.parse(JSON.stringify(l.save()));const restored=createAssignmentLedger(ports,saved);
 assert.deepEqual(restored.pendingEvents(),l.pendingEvents());assert.equal(restored.acknowledgeEvent('one'),true);assert.equal(restored.acknowledgeEvent('one'),false);
 assert.deepEqual(createAssignmentLedger(ports,restored.save()).pendingEvents(),[]);assert.equal(restored.acknowledgeEvent('unknown'),false);
});
test('round-trip retains references and idempotency without rerunning old authority',()=>{
 const {people,ports,ledger:l}=setup();l.execute(assign('one',[2]));people.npc._die(0,1);people.npc._die(2,1);const before=signature(people.npc);
 const restored=createAssignmentLedger({...ports,authorize:()=>false},JSON.parse(JSON.stringify(l.save())));
 assert.equal(restored.assignments()[0].alive,false);assert.equal(restored.execute(assign('one',[2])).replayed,true);assert.equal(signature(people.npc),before);
});
test('old saves without sidecar load empty; foreign/unsupported/corrupt saves fail completely',()=>{
 const {ports,ledger:l}=setup();assert.equal(createAssignmentLedger(ports,null).revision,0);l.execute(assign('one',[2]));const good=l.save();
 const corrupt=[{...good,worldKey:'other'},{...good,version:99},{...good,operations:[...good.operations,...good.operations]},{...good,acknowledged:['missing']},{...good,operations:[{...good.operations[0],command:assign('bad',[999])}]},{...good,operations:[{...good.operations[0],day:100}]}];
 for(const data of corrupt)assert.throws(()=>createAssignmentLedger(ports,data),/assignment snapshot/);
 assert.equal(l.revision,1);assert.throws(()=>createAssignmentLedger({...ports,worldKey:undefined}),/worldKey/);
});
test('returns detached values; failed attempts create neither journal nor history events',()=>{
 const {ledger:l}=setup();assert.equal(l.execute(assign('empty',[])).ok,false);assert.equal(l.revision,0);
 l.execute(assign('one',[2]));const saved=l.save();saved.operations[0].command.personIds.push(5);
 const view=l.assignments();view[0].unitId='b';const events=l.pendingEvents();events[0].personIds.push(5);
 assert.deepEqual(l.assignments().map(x=>x.personId),[2]);assert.equal(l.assignments()[0].unitId,'a');assert.deepEqual(l.pendingEvents()[0].personIds,[2]);
});
test('authority callbacks cannot reenter ledger mutation',()=>{
 let l,nested;const s=setup({authorize:()=>{nested=l.execute(assign('nested',[3]));return true;}});l=s.ledger;
 assert.equal(l.execute(assign('outer',[2])).ok,true);assert.equal(nested.code,'ledger-busy');assert.equal(l.revision,1);assert.deepEqual(l.assignments().map(x=>x.personId),[2]);
});
test('replacing the canonical population invalidates a bound adapter',()=>{
 const {people,ledger:l}=setup();people.npc=new Npc.Population(321,2);people.npc.addFounder(1,25);
 assert.equal(l.execute(assign('old-context',[2])).code,'world-reference-changed');assert.throws(()=>l.save(),/population reference/);
});
test('unit state and actor are rechecked after the external authority read',()=>{
 let s;s=setup({authorize:()=>{s.units.get('a').active=false;return true;}});
 assert.equal(s.ledger.execute(assign('one',[2])).code,'unit-inactive');assert.equal(s.ledger.revision,0);
});
