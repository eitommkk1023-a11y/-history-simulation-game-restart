/** World-owned checkpoint gate, independent of politics, rendering, and storage backends.
 * Participants are synchronous, side-effect-free serializers/stagers supplied by world owners.
 * This stages a complete candidate before one root-pointer swap; it does not call global applyState.
 */
const FORMAT='woh.world.checkpoint';
const label=x=>typeof x==='string'&&x.trim().length>0;
const sync=value=>{if(value&&typeof value.then==='function')throw new TypeError('asynchronous checkpoint participant');return value;};
function objectGraph(root,visit){
 const seen=new WeakSet(),todo=[root];
 while(todo.length){const v=todo.pop();if(!v||typeof v!=='object'||seen.has(v))continue;seen.add(v);visit(v);
  if(ArrayBuffer.isView(v)){todo.push(v.buffer);continue;}
  if(v instanceof ArrayBuffer)continue;
  if(v instanceof Map){for(const [k,x]of v)todo.push(k,x);}
  else if(v instanceof Set){for(const x of v)todo.push(x);}
  else for(const k of Object.keys(v))todo.push(v[k]);
 }
}
function orderedParts(input){
 if(!Array.isArray(input)||!input.length)throw new TypeError('checkpoint participants required');
 const byId=new Map();
 for(const p of input){
  if(!label(p?.id)||['__proto__','prototype','constructor'].includes(p.id)||byId.has(p.id)||!Number.isSafeInteger(p.version)||p.version<1||typeof p.save!=='function'||typeof p.restore!=='function'||!Array.isArray(p.dependsOn)||p.dependsOn.some(d=>!label(d)))throw new TypeError('invalid checkpoint participant');
  byId.set(p.id,{...p,dependsOn:[...p.dependsOn]});
 }
 const result=[],visiting=new Set(),done=new Set();
 function walk(id){if(done.has(id))return;if(visiting.has(id)||!byId.has(id))throw new TypeError('invalid participant dependencies');visiting.add(id);
  const p=byId.get(id);for(const d of p.dependsOn)walk(d);visiting.delete(id);done.add(id);result.push(p);
 }
 for(const id of byId.keys())walk(id);return result;
}
export function createWorldCheckpoint({worldKey,world,participants,getDay,validate}={}){
 if(!label(worldKey)||typeof getDay!=='function'||typeof validate!=='function')throw new TypeError('world key, clock and validation ports required');
 const parts=orderedParts(participants);let current=world,busy=false;const captureIds=new Set();
 function day(root){const value=sync(getDay(root));if(!Number.isFinite(value)||value<0)throw new TypeError('invalid checkpoint day');return value;}
 function verify(root){
  if(!root||typeof root!=='object'||Object.keys(root).length!==parts.length||parts.some(p=>!Object.hasOwn(root,p.id))||sync(validate(root))!==true)throw new TypeError('world checkpoint validation failed');
 }
 verify(current);day(current);
 function exclusive(fn){if(busy)throw new TypeError('world checkpoint is busy');busy=true;try{return fn();}finally{busy=false;}}
 return {
  get current(){return current;},
  capture(checkpointId){return exclusive(()=>{
   if(!label(checkpointId)||captureIds.has(checkpointId))throw new TypeError('unique world-owned checkpointId required');
   verify(current);const at=day(current),sections=Object.create(null);
   for(const p of parts){const data=sync(p.save(current));if(data===undefined)throw new TypeError('missing checkpoint data');sections[p.id]={version:p.version,checkpointId,day:at,data};}
   const saved=structuredClone({format:FORMAT,version:1,worldKey,checkpointId,day:at,sections});
   if(day(current)!==at)throw new TypeError('world clock changed during capture');
   verify(current);captureIds.add(checkpointId);return saved;
  });},
  restore(snapshot){return exclusive(()=>{
   if(snapshot?.format!==FORMAT||snapshot.version!==1||snapshot.worldKey!==worldKey||!label(snapshot.checkpointId)||!Number.isFinite(snapshot.day)||snapshot.day<0||!snapshot.sections||Object.keys(snapshot.sections).length!==parts.length)throw new TypeError('invalid world checkpoint snapshot');
   const data=structuredClone(snapshot);
   for(const p of parts){const section=data.sections[p.id];if(!section||section.version!==p.version||section.day!==data.day||section.checkpointId!==data.checkpointId||!Object.hasOwn(section,'data'))throw new TypeError('mixed or unsupported checkpoint component');}
   const staged=Object.create(null),activeObjects=new WeakSet();objectGraph(current,v=>activeObjects.add(v));
   for(const p of parts){
    const candidate=sync(p.restore(data.sections[p.id].data,staged));
    if(candidate===undefined)throw new TypeError('missing staged component');
    objectGraph(candidate,v=>{if(activeObjects.has(v))throw new TypeError('staged component aliases active state');});
    staged[p.id]=candidate;
   }
   if(day(staged)!==data.day)throw new TypeError('world clock differs from checkpoint');
   verify(staged);current=staged;captureIds.add(data.checkpointId);return current;
  });}
 };
}
