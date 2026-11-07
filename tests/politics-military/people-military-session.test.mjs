import {test} from 'node:test';
import assert from 'node:assert/strict';
import Npc from '../../npc/npc-core.js';
import People from '../../npc/people-core.js';
import * as api from '../../src/politics-military/people-military-session.mjs';
const assign = (operationId, personIds = [2], actorId = 0) => ({action:'assign', operationId, personIds, actorId, unitId:'a'});
function fixture() {
  const npc = new Npc.Population(321, 2);
  for (let i = 0; i < 6; i++) npc.addFounder(1, 25);
  const haz = Object.fromEntries(['starv','cold','dis','hungerDis','fert'].map(k => [k, new Float32Array(66).fill(['hungerDis','fert'].includes(k) ? 1 : 0)]));
  return {npc, version:1, nextGroupId:2, nextEthId:2, rngState:123, playerEth:1,
    ethnicities:[{id:1, adultAge:18}], groups:[{id:1, alive:true, born:0, died:{natural:0,disease:0,starvation:0,cold:0}, fresh:100, c6:[]}],
    contacts:[], ties:{}, languages:[], haz};
}
function setup(extra = {}) {
  assert.equal(typeof api.createPeopleMilitarySession, 'function', 'population/military save session must exist');
  const people = fixture();
  const ports = {worldKey:'fixture-world', people, savePeople:People.peopleSave, loadPeople:People.peopleLoad,
    resolveUnit:(id, target) => id === 'a' && target.npc.n === 6 ? {id:'a'} : null,
    authorize:(command, target) => command.actorId === 0 && target.npc.alive(0), ...extra};
  return {ports, session:api.createPeopleMilitarySession(ports)};
}
const signature = p => ({n:p.n, day:p.day, checksum:p.checksum(), rng:p.rng, stats:{...p.stats}, jobs:[...p.job.slice(0,p.n)], group:[...p.group.slice(0,p.n)]});

test('uses actual peopleSave/peopleLoad and preserves person zero and population', () => {
  const {session:s} = setup(); const before = signature(s.people.npc);
  assert.equal(s.execute(assign('one',[0,2])).ok,true);
  const saved = s.save(); assert.ok(saved.people.birth instanceof Int32Array);
  s.restore(structuredClone(saved));
  assert.deepEqual(signature(s.people.npc),before);
  assert.deepEqual(s.assignments().map(x=>x.personId),[0,2]);
  assert.equal(s.execute(assign('one',[0,2])).replayed,true);
  assert.equal(s.revision,1);
});
test('saved population metadata, stocks and arrays are detached from the live world', () => {
  const {session:s} = setup(); s.execute(assign('one')); const saved=s.save(), baseline=structuredClone(saved);
  s.people.groups[0].fresh=3; s.people.npc.stats.deaths=9; s.people.ethnicities[0].adultAge=20;
  s.people.npc.job[2]=1; s.execute(assign('two',[3]));
  assert.deepEqual(saved,baseline);
});
test('load does not mutate input and failed military validation retains both active objects', () => {
  const {session:s} = setup();s.execute(assign('one'));const good=s.save();
  const bad=structuredClone(good);bad.military.operations[0].command.personIds=[999];
  const input=structuredClone(bad), active=s.people, before=s.save();
  assert.throws(()=>s.restore(bad),/snapshot/);
  assert.equal(s.people,active);assert.deepEqual(s.save(),before);assert.deepEqual(bad,input);
  const pristine=structuredClone(good);s.restore(good);assert.deepEqual(good,pristine);
});
test('death remains canonical after restore, without extra death accounting or revival', () => {
  const {session:s} = setup();s.execute(assign('one'));s.people.npc._die(2,1);
  const before=signature(s.people.npc);s.restore(s.save());
  assert.equal(s.assignments()[0].alive,false);assert.deepEqual(signature(s.people.npc),before);
  assert.equal(s.execute({...assign('release-dead'),action:'release'}).ok,true);
  assert.deepEqual(signature(s.people.npc),before);
});
test('outbox and acknowledgements survive together with population and retries', () => {
  const {session:s} = setup();s.execute(assign('one'));s.execute(assign('two',[3]));s.acknowledgeEvent('one');
  s.restore(s.save());assert.deepEqual(s.pendingEvents().map(x=>x.id),['two']);
  assert.equal(s.execute(assign('two',[3])).replayed,true);assert.equal(s.pendingEvents().length,1);
});
test('rejects foreign world, unsupported format, wrong clock and population metadata atomically', () => {
  const {session:s} = setup();s.execute(assign('one'));const good=s.save(), active=s.people;
  const bad=[{...good,worldKey:'other'},{...good,version:99},{...good,format:'other'},
    {...good,population:{...good.population,day:10}},{...good,population:{...good.population,n:7}},
    {...good,population:{...good.population,rng:123}},{...good,military:undefined}];
  for(const data of bad){assert.throws(()=>s.restore(data));assert.equal(s.people,active);assert.equal(s.revision,1);}
});
test('authority and unit resolution receive the restored canonical population', () => {
  const seen=[];const {session:s}=setup({resolveUnit:(id,p)=>{seen.push(p);return {id};},authorize:(c,p)=>{seen.push(p);return true;}});
  s.execute(assign('one'));const old=s.people;s.restore(s.save());seen.length=0;
  assert.notEqual(s.people,old);assert.equal(s.execute(assign('two',[3])).ok,true);
  assert.ok(seen.length>0 && seen.every(p=>p===s.people));
});
test('legacy people snapshot requires explicit import and starts with an empty ledger', () => {
  const {session:s}=setup();const legacy=structuredClone(People.peopleSave(s.people));s.execute(assign('one'));
  assert.throws(()=>s.restore(legacy));s.restoreLegacyPeople(legacy);
  assert.equal(s.revision,0);assert.deepEqual(s.assignments(),[]);assert.equal(s.people.npc.n,6);
  assert.equal(s.execute(assign('one')).replayed,false);
});
test('continued population RNG, clock and checksum match with and without save/load', () => {
  const {session:a}=setup(),{session:b}=setup();
  // Give both branches the same existing population-installed callbacks before continuing.
  a.restoreLegacyPeople(People.peopleSave(a.people));b.restoreLegacyPeople(People.peopleSave(b.people));
  a.execute(assign('one'));b.execute(assign('one'));b.restore(b.save());
  for(let i=0;i<60;i++){a.people.npc.stepDay();b.people.npc.stepDay();}
  assert.deepEqual(signature(b.people.npc),signature(a.people.npc));
  assert.deepEqual(b.pendingEvents(),a.pendingEvents());
});
test('failed population loading and missing units leave the active population and ledger intact', () => {
  let broken=false, noUnit=false;
  const {session:s}=setup({loadPeople:data=>{if(broken)throw Error('population load failed');return People.peopleLoad(data);},resolveUnit:id=>noUnit?null:{id}});
  s.execute(assign('one'));const saved=s.save(), active=s.people;broken=true;
  assert.throws(()=>s.restore(saved),/population load failed/);assert.equal(s.people,active);broken=false;noUnit=true;
  assert.throws(()=>s.restore(saved),/snapshot/);assert.equal(s.people,active);assert.equal(s.revision,1);
});
test('reentrant restore from authority is rejected without replacing population', () => {
  let s,saved,nested;
  ({session:s}=setup({authorize:()=>{try{s.restore(saved);}catch(e){nested=e.message;}return true;}}));
  saved=s.save();const active=s.people;assert.equal(s.execute(assign('one')).ok,true);
  assert.match(nested,/busy/);assert.equal(s.people,active);assert.equal(s.revision,1);
});
test('synchronous ports are required and canonical population replacement is detected', () => {
  const {session:s,ports}=setup();assert.throws(()=>api.createPeopleMilitarySession({...ports,savePeople:undefined}));
  const saved=s.save();s.people.npc=new Npc.Population(55,2);
  assert.throws(()=>s.save(),/population reference/);assert.equal(s.execute(assign('one')).code,'world-reference-changed');
  s.restore(saved);assert.equal(s.people.npc.n,6);
});
test('async save/load ports and a loader returning the active population are rejected', () => {
  const {session:source}=setup();const saved=source.save();
  const {session:asyncSave}=setup({savePeople:()=>Promise.resolve({})});
  assert.throws(()=>asyncSave.save(),/synchronous snapshot/);
  const {session:asyncLoad}=setup({loadPeople:()=>Promise.resolve(fixture())}), active=asyncLoad.people;
  assert.throws(()=>asyncLoad.restore(saved),/separate canonical population/);assert.equal(asyncLoad.people,active);
  let self;({session:self}=setup({loadPeople:()=>self.people}));
  assert.throws(()=>self.restore(saved),/separate canonical population/);assert.equal(self.revision,0);
});
