import {test} from 'node:test';
import assert from 'node:assert/strict';
import Npc from '../../npc/npc-core.js';
import {createPeopleMilitarySession} from '../../src/politics-military/people-military-session.mjs';
import {createAssignmentLedger} from '../../src/politics-military/assignment-ledger.mjs';
import * as api from '../../src/politics-military/order-ledger.mjs';
const command={orderId:'order-1',issuerId:0,recipientId:2,unitId:'a',instruction:'警戒配置を確認する'};
function setup(overrides={}) {
 assert.equal(typeof api.createOrderLedger,'function','order ledger API must exist');
 const npc=new Npc.Population(42,2);for(let i=0;i<5;i++)npc.addFounder(1,25);
 const people={npc},unit={id:'a'},assignments=createAssignmentLedger({people,worldKey:'world',resolveUnit:()=>unit,authorize:()=>true});
 assignments.execute({action:'assign',operationId:'assign',actorId:0,unitId:'a',personIds:[2]});
 const control={delivery:null,meaning:null,assessment:null,result:null,allowed:true};
 const ports={worldKey:'world',people,assignments,resolveUnit:id=>id==='a'?unit:null,
  authorize:()=>control.allowed,readDelivery:()=>control.delivery,interpret:()=>control.meaning,
  assessExecution:()=>control.assessment,readExecution:()=>control.result,...overrides};
 const ledger=api.createOrderLedger(ports);return {ledger,ports,people,assignments,control};
}
function delivery(day,status='arrived'){return {status,worldKey:'world',orderId:command.orderId,recipientId:2,deliveryId:'message-1',dispatchedDay:0,receivedDay:day};}
function reach(s){s.ledger.issue(command);s.control.delivery=delivery(2);s.people.npc.day=2;s.ledger.step(command.orderId);s.ledger.step(command.orderId);}
function ready(s){reach(s);s.control.meaning={status:'understood',instruction:command.instruction};s.ledger.step(command.orderId);s.control.assessment={status:'ready'};s.ledger.step(command.orderId);}
const status=s=>s.ledger.get(command.orderId).stage;
const signature=p=>({n:p.n,day:p.day,rng:p.rng,checksum:p.checksum(),stats:{...p.stats},jobs:[...p.job],groups:[...p.group]});

test('issues to actual assigned person from canonical ID zero without world mutations',()=>{
 const s=setup(),before=signature(s.people.npc);assert.equal(s.ledger.issue(command).ok,true);
 assert.equal(status(s),'issued');assert.equal(s.ledger.deliveryRequests().length,1);assert.deepEqual(signature(s.people.npc),before);
 assert.equal(s.ledger.get(command.orderId).recipientId,2);
});
test('requires explicit authority, living references and actual assignment',()=>{
 const s=setup();s.control.allowed=false;assert.equal(s.ledger.issue(command).code,'not-authorized');s.control.allowed=true;
 assert.equal(s.ledger.issue({...command,recipientId:3}).code,'recipient-not-assigned');
 assert.equal(s.ledger.issue({...command,recipientId:99}).code,'unknown-person');
 s.people.npc._die(2,1);assert.equal(s.ledger.issue(command).code,'person-not-alive');assert.equal(s.ledger.events().length,0);
});
test('same order ID retry is stable; changed content cannot reuse an ID',()=>{
 const s=setup();s.ledger.issue(command);assert.equal(s.ledger.issue({...command}).replayed,true);
 assert.equal(s.ledger.issue({...command,instruction:'別の命令'}).code,'order-id-conflict');assert.equal(s.ledger.events().length,1);
});
test('time passing or an ETA alone never proves delivery',()=>{
 const s=setup();s.ledger.issue(command);s.people.npc.day=50;s.control.delivery={status:'arrived',etaDay:1};
 assert.equal(s.ledger.step(command.orderId).ok,false);assert.equal(status(s),'issued');
 s.control.delivery=null;s.ledger.step(command.orderId);assert.equal(status(s),'issued');
});
test('dispatch, receipt, understanding and execution request are separate transitions',()=>{
 const s=setup();s.ledger.issue(command);s.control.delivery=delivery(2);s.people.npc.day=1;
 s.ledger.step(command.orderId);assert.equal(status(s),'dispatched');s.ledger.step(command.orderId);assert.equal(status(s),'dispatched');
 s.people.npc.day=2;s.ledger.step(command.orderId);assert.equal(status(s),'received');
 s.control.meaning={status:'understood',instruction:command.instruction};s.ledger.step(command.orderId);assert.equal(status(s),'understood');
 s.control.assessment={status:'ready'};s.ledger.step(command.orderId);assert.equal(status(s),'execution-requested');
 assert.equal(s.ledger.executionRequests().length,1);assert.equal(s.ledger.deliveryRequests().length,0);
});
test('wrong-world/person/message delivery cannot reach the recipient',()=>{
 for(const edit of [{worldKey:'elsewhere'},{recipientId:3},{orderId:'other'},{dispatchedDay:10}]){
  const s=setup();s.ledger.issue(command);s.people.npc.day=2;s.control.delivery={...delivery(2),...edit};
  assert.equal(s.ledger.step(command.orderId).ok,false);assert.equal(status(s),'issued');
 }
 const s=setup();s.ledger.issue(command);s.control.delivery=delivery(0);s.ledger.step(command.orderId);
 s.control.delivery={...delivery(0),deliveryId:'different'};assert.equal(s.ledger.step(command.orderId).ok,false);assert.equal(status(s),'dispatched');
});
test('misunderstanding, refusal and inability have different recorded outcomes',()=>{
 const mis=setup();reach(mis);mis.control.meaning={status:'misunderstood',instruction:'違う配置と受け取った'};mis.ledger.step(command.orderId);assert.equal(status(mis),'misunderstood');
 for(const decision of ['refused','blocked']){const s=setup();reach(s);s.control.meaning={status:'understood',instruction:command.instruction};s.ledger.step(command.orderId);
  s.control.assessment={status:decision,reason:decision==='refused'?'拒否':'必要な装備がない'};s.ledger.step(command.orderId);assert.equal(status(s),decision);assert.deepEqual(s.ledger.executionRequests(),[]);}
});
test('known lost delivery never becomes a received order',()=>{
 const s=setup();s.ledger.issue(command);s.control.delivery=delivery(0,'in-transit');s.ledger.step(command.orderId);
 s.people.npc.day=1;s.control.delivery={...delivery(0,'lost'),lostDay:1};s.ledger.step(command.orderId);assert.equal(status(s),'lost');
 s.control.delivery=delivery(1);s.ledger.step(command.orderId);assert.equal(status(s),'lost');
});
test('rechecks assignment and execution authority instead of assuming obedience',()=>{
 const s=setup();reach(s);s.control.meaning={status:'understood',instruction:command.instruction};s.ledger.step(command.orderId);
 s.control.assessment={status:'ready'};s.control.allowed=false;assert.equal(s.ledger.step(command.orderId).code,'not-authorized');assert.equal(status(s),'understood');
 s.control.allowed=true;s.assignments.execute({action:'release',operationId:'leave',actorId:0,unitId:'a',personIds:[2]});
 assert.equal(s.ledger.step(command.orderId).code,'recipient-not-assigned');assert.equal(status(s),'understood');
});
test('only matching canonical execution result completes an order',()=>{
 const s=setup();ready(s);const request=s.ledger.executionRequests()[0];
 s.control.result={status:'completed',worldKey:'world',orderId:command.orderId,executionKey:'wrong',recipientId:2,unitId:'a',completedDay:2};
 assert.equal(s.ledger.step(command.orderId).ok,false);assert.equal(status(s),'execution-requested');
 s.control.result.executionKey=request.executionKey;s.ledger.step(command.orderId);assert.equal(status(s),'completed');assert.equal(s.ledger.executionRequests().length,0);
 const count=s.ledger.events().length;s.ledger.step(command.orderId);assert.equal(s.ledger.events().length,count);
});
test('save/load retains requests and command retries without invoking old AI or authority',()=>{
 const s=setup();ready(s);const saved=s.ledger.save(),requests=s.ledger.executionRequests(),before=signature(s.people.npc);
 const restored=api.createOrderLedger({...s.ports,authorize:()=>false,interpret:()=>{throw Error('do not replay AI')}},structuredClone(saved));
 assert.deepEqual(restored.executionRequests(),requests);assert.equal(restored.issue(command).replayed,true);assert.deepEqual(signature(s.people.npc),before);
 const view=restored.get(command.orderId);view.instruction='changed';assert.equal(restored.get(command.orderId).instruction,command.instruction);
});
test('rejects foreign, future, duplicate and impossible snapshot histories',()=>{
 const s=setup();reach(s);const good=s.ledger.save(), bads=[{...good,worldKey:'other'},{...good,version:99},{...good,observedDay:99},
  {...good,journal:[...good.journal,good.journal[0]]},{...good,journal:[good.journal[0],{orderId:command.orderId,stage:'completed',day:2,data:{completedDay:2}}]}];
 for(const bad of bads)assert.throws(()=>api.createOrderLedger(s.ports,bad),/snapshot/);
 assert.equal(status(s),'received');assert.equal(api.createOrderLedger(s.ports,null).events().length,0);
});
test('dead recipient and replaced canonical population cannot execute or gain people',()=>{
 const s=setup();reach(s);s.people.npc._die(2,1);const before=signature(s.people.npc);
 assert.equal(s.ledger.step(command.orderId).code,'person-not-alive');assert.deepEqual(signature(s.people.npc),before);
 s.people.npc=new Npc.Population(99,2);assert.equal(s.ledger.step(command.orderId).code,'world-reference-changed');assert.throws(()=>s.ledger.save(),/population reference/);
});
test('callback exceptions, reentry and world-clock reversal never partially advance an order',()=>{
 let nested,l;const s=setup({readDelivery:()=>{nested=l.step(command.orderId);throw Error('offline')}});l=s.ledger;l.issue(command);
 assert.equal(l.step(command.orderId).code,'port-unavailable');assert.equal(nested.code,'ledger-busy');assert.equal(status(s),'issued');
 s.people.npc.day=2;l.save();s.people.npc.day=1;assert.equal(l.step(command.orderId).code,'world-clock-reversed');
});
test('NPC fixture executes once despite retry and save/load around an external result',()=>{
 const s=setup();ready(s);const receipts=new Map(),effects=[];
 function consume(l){for(const r of l.executionRequests())if(!receipts.has(r.executionKey)){
  effects.push({personId:r.recipientId,instruction:r.instruction});receipts.set(r.executionKey,{status:'completed',...r,completedDay:2});}}
 consume(s.ledger);consume(s.ledger);
 const restored=api.createOrderLedger({...s.ports,readExecution:r=>receipts.get(r.executionKey)},s.ledger.save());
 consume(restored);restored.step(command.orderId);assert.equal(effects.length,1);assert.equal(restored.get(command.orderId).stage,'completed');
 assert.equal(s.people.npc.n,5);
});
test('restore rejects refusal after an execution request because that requires a result receipt',()=>{
 const s=setup();ready(s);const saved=s.ledger.save();saved.journal.push({orderId:command.orderId,stage:'refused',day:2,data:{reason:'unvalidated external refusal'}});
 assert.throws(()=>api.createOrderLedger(s.ports,saved),/snapshot/);
});
test('arrival followed by sender death preserves the message, and completed facts survive recipient death',()=>{
 const s=setup();s.ledger.issue(command);s.people.npc._die(0,1);s.people.npc.day=2;s.control.delivery=delivery(2);
 s.ledger.step(command.orderId);s.ledger.step(command.orderId);assert.equal(status(s),'received');
 s.control.meaning={status:'understood',instruction:command.instruction};s.ledger.step(command.orderId);
 s.control.assessment={status:'ready'};s.ledger.step(command.orderId);const request=s.ledger.executionRequests()[0];
 s.people.npc._die(2,1);s.control.result={...request,status:'completed',completedDay:2};const before=signature(s.people.npc);
 s.ledger.step(command.orderId);assert.equal(status(s),'completed');assert.deepEqual(signature(s.people.npc),before);
});
test('future and mismatched execution facts cannot complete a request',()=>{
 const s=setup();ready(s);const request=s.ledger.executionRequests()[0];
 for(const change of [{completedDay:3},{recipientId:3},{unitId:'b'},{worldKey:'other'}]){
  s.control.result={...request,status:'completed',completedDay:2,...change};assert.equal(s.ledger.step(command.orderId).ok,false);assert.equal(status(s),'execution-requested');
 }
});
test('real assignment release survives a crash before order acknowledgement without double execution',()=>{
 const s=setup(),demobilize={...command,instruction:'配属を解除する'};s.ledger.issue(demobilize);
 s.people.npc.day=2;s.control.delivery=delivery(2);s.ledger.step(command.orderId);s.ledger.step(command.orderId);
 s.control.meaning={status:'understood',instruction:demobilize.instruction};s.ledger.step(command.orderId);
 s.control.assessment={status:'ready'};s.ledger.step(command.orderId);
 const request=s.ledger.executionRequests()[0];
 // Fixture maps only this explicit instruction to the real canonical assignment API.
 const release={action:'release',operationId:request.executionKey,actorId:0,unitId:request.unitId,personIds:[request.recipientId]};
 assert.equal(s.assignments.execute(release).ok,true);const before=signature(s.people.npc);
 const saved=structuredClone({assignment:s.assignments.save(),orders:s.ledger.save()});
 const assignments=createAssignmentLedger({worldKey:'world',people:s.people,resolveUnit:()=>({id:'a'}),authorize:()=>true},saved.assignment);
 let receipt;
 const restored=api.createOrderLedger({...s.ports,assignments,readExecution:()=>receipt},saved.orders);
 const retry=assignments.execute(release);assert.equal(retry.replayed,true);assert.equal(assignments.revision,2);
 receipt={...restored.executionRequests()[0],status:'completed',completedDay:retry.day};
 restored.step(command.orderId);assert.equal(restored.get(command.orderId).stage,'completed');
 assert.deepEqual(assignments.assignments(),[]);assert.deepEqual(signature(s.people.npc),before);
 assert.equal(assignments.pendingEvents().length,2);
});
test('assignment source must belong to the exact same world and canonical people',()=>{
 const s=setup();
 const foreign=createAssignmentLedger({worldKey:'other',people:s.people,resolveUnit:()=>({id:'a'}),authorize:()=>true});
 assert.throws(()=>api.createOrderLedger({...s.ports,assignments:foreign}),/assignment/);
 const npc=new Npc.Population(42,2);for(let i=0;i<5;i++)npc.addFounder(1,25);
 const stale=createAssignmentLedger({worldKey:'world',people:{npc},resolveUnit:()=>({id:'a'}),authorize:()=>true});
 assert.throws(()=>api.createOrderLedger({...s.ports,assignments:stale}),/assignment/);
});

test('existing people/military session can be the canonical assignment source',()=>{
 const s=setup(),session=createPeopleMilitarySession({worldKey:'world',people:s.people,savePeople:()=>({}),loadPeople:()=>({}),resolveUnit:()=>({id:'a'}),authorize:()=>true});
 session.execute({action:'assign',operationId:'session-assign',actorId:0,unitId:'a',personIds:[2]});
 const ledger=api.createOrderLedger({...s.ports,assignments:session});assert.equal(ledger.issue(command).ok,true);
});
test('assignment source replaced after a world load invalidates the old order adapter',()=>{
 const s=setup();let active=s.assignments;
 const source={assignments:()=>active.assignments(),isBoundTo:(...args)=>active.isBoundTo(...args)};
 const l=api.createOrderLedger({...s.ports,assignments:source});l.issue(command);
 active=createAssignmentLedger({worldKey:'world',people:{npc:new Npc.Population(7,2)},resolveUnit:()=>({id:'a'}),authorize:()=>true});
 assert.equal(l.step(command.orderId).code,'world-reference-changed');
});
