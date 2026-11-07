import {createMainMilitary} from './main-military.mjs';
export function newWorldKey(){const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);return 'world-'+[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function sealMainSave(st,controller){
 const snapshot=structuredClone(st);snapshot.worldKey=controller.worldKey;snapshot.checkpointId=newWorldKey();
 snapshot.military={version:1,worldKey:controller.worldKey,seed:snapshot.seed,checkpointId:snapshot.checkpointId,day:snapshot.clock.day,populationChecksum:controller.populationChecksum(),data:controller.save()};return snapshot;
}
function validateNaturalSnapshot(st,terrainSize,simulationSize){
 if(st.sim){
  const sim=st.sim;for(const k of ['snow','soil','flood','drop','ash'])if(!ArrayBuffer.isView(sim[k])||(simulationSize&&sim[k].length!==simulationSize))throw new TypeError('invalid simulation array '+k);
  for(const k of ['snow','soil','flood','drop','ash'])for(const v of sim[k])if(!Number.isFinite(v))throw new TypeError('invalid weather value');
  const t=sim.terrain;if(t){const count=t.idx?.length;if(!Number.isSafeInteger(count))throw new TypeError('invalid terrain save');for(const k of ['cur','curT','curR','org','orgT','orgR'])if(!ArrayBuffer.isView(t[k])||t[k].length!==count)throw new TypeError('invalid terrain component');for(const id of t.idx)if(!Number.isSafeInteger(id)||id<0||(terrainSize&&id>=terrainSize))throw new TypeError('invalid terrain index');}
 }
}
/** Validate/stage before the host regenerates terrain or mutates globals. Existing unknown fields are retained. */
export function prepareMainSave(input,{People,getTerrain,developerEnabled,onEvent,terrainSize,simulationSize}={}){
 const st=structuredClone(input);
 if(!st||st.format!==1||typeof st.seed!=='string'||!st.clock||!Number.isSafeInteger(st.clock.day)||st.clock.day<0||!st.history||!Array.isArray(st.history.list)||!Number.isSafeInteger(st.history.nextId))throw new TypeError('invalid main world save');
 for(const k of ['acc','pending'])if(st.clock[k]!==undefined&&(!Number.isFinite(st.clock[k])||st.clock[k]<0||(k==='pending'&&!Number.isSafeInteger(st.clock[k]))))throw new TypeError('invalid world clock accumulator');
 validateNaturalSnapshot(st,terrainSize,simulationSize);
 if(st.people==null){if(st.military)throw new TypeError('military references missing population');return {snapshot:st,people:null,controller:null};}
 if(!st.people.meta?.npc)throw new TypeError('invalid saved population');
 const npc=st.people.meta.npc,n=npc.n;
 if(!Number.isSafeInteger(n)||n<0||!Number.isSafeInteger(npc.groups)||npc.groups<1||!Array.isArray(st.people.meta.groups)||!Array.isArray(st.people.meta.ethnicities))throw new TypeError('invalid saved population');
 const strides={birth:1,death:1,sex:1,group:1,mother:1,father:1,spouse:1,job:1,flags:1,...People.peopleStorageStrides()};
 for(const [k,mult]of Object.entries(strides))if((!['relId','relV','pers'].includes(k)||st.people[k])&&(!ArrayBuffer.isView(st.people[k])||st.people[k].length!==n*mult))throw new TypeError('invalid population array '+k);
 if(st.people.gflags?.length!==npc.groups||(st.people.eth&&st.people.groupEth?.length!==npc.groups)||st.people.poolStart?.length!==npc.groups+1)throw new TypeError('invalid population groups');
 for(const [values,starts]of [['pool','poolStart'],['members','memberStart']]){
  if(values==='members'&&!st.people.members&&!st.people.memberStart)continue;
  const a=st.people[values],b=st.people[starts];if(!ArrayBuffer.isView(a)||!ArrayBuffer.isView(b)||b.length!==npc.groups+1||b[0]!==0||b.at(-1)!==a.length)throw new TypeError('invalid population reference index');
  for(let i=1;i<b.length;i++)if(b[i]<b[i-1]||b[i]>a.length)throw new TypeError('invalid reference offsets');
  for(const id of a)if(!Number.isSafeInteger(id)||id<0||id>=n)throw new TypeError('invalid person reference');
 }
 const groupIds=new Set(st.people.meta.groups.map(g=>g.id));if(groupIds.size!==st.people.meta.groups.length)throw new TypeError('duplicate communities');
 for(let i=0;i<n;i++){if(!groupIds.has(st.people.group[i])||st.people.sex[i]>1||st.people.job[i]>strides.skills)throw new TypeError('invalid person record');for(const k of ['mother','father','spouse']){const id=st.people[k][i];if(id!==0xffffffff&&(!Number.isSafeInteger(id)||id<0||id>=n||id===i))throw new TypeError('invalid family reference');}}
 const people=People.peopleLoad(st.people);
 const extension=st.military;
 let worldKey;
 if(extension){
  worldKey=st.worldKey;
  if(extension.version!==1||!worldKey||extension.worldKey!==worldKey||extension.seed!==st.seed||extension.checkpointId!==st.checkpointId||extension.day!==st.clock.day||people.npc.day!==st.clock.day||extension.populationChecksum!==people.npc.checksum())throw new TypeError('mixed main world/military checkpoint');
 }else{worldKey=st.worldKey||newWorldKey();people.npc.day=st.clock.day;}
 const controller=createMainMilitary({people,People,getTerrain,worldKey,day:st.clock.day,snapshot:extension?.data,developerEnabled,onEvent});
 return {snapshot:st,people,controller};
}
