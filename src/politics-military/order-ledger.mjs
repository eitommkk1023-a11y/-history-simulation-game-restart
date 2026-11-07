/** Referenced-person order lifecycle; no people, transport, resources or authority are created.
 * Ports are synchronous read-only observations/decisions from canonical world systems.
 * Outbox consumers must persistently deduplicate request keys in the same transaction as effects.
 */
const FORMAT='woh.military.orders';
const clone=x=>structuredClone(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const person=x=>Number.isSafeInteger(x)&&x>=0;
const id=x=>text(x)||person(x);
const fail=(code)=>({ok:false,code});
const terminal=new Set(['completed','lost','misunderstood','refused','blocked']);
function command(c){
 if(!text(c?.orderId)||!person(c.issuerId)||!person(c.recipientId)||!id(c.unitId)||!text(c.instruction))throw new TypeError('invalid order command');
 return {orderId:c.orderId,issuerId:c.issuerId,recipientId:c.recipientId,unitId:c.unitId,instruction:c.instruction};
}
const key=(worldKey,orderId,kind)=>JSON.stringify([worldKey,orderId,kind]);
export function createOrderLedger({worldKey,people,assignments,resolveUnit,authorize,readDelivery,interpret,assessExecution,readExecution}={},snapshot){
 if(!text(worldKey)||!people?.npc||typeof people.npc.alive!=='function'||typeof assignments?.assignments!=='function'||typeof resolveUnit!=='function')throw new TypeError('canonical world, people, assignments and units are required');
 if(typeof assignments.isBoundTo!=='function'||!assignments.isBoundTo(worldKey,people))throw new TypeError('assignment ledger must bind to the same world and people');
 const population=people.npc,orders=new Map(),journal=[];
 let busy=false,observedDay=population.day;
 const exists=n=>person(n)&&n<population.n;
 const validDay=d=>Number.isSafeInteger(d)&&d<=population.day;
 function clock(){
  if(people.npc!==population||!assignments.isBoundTo(worldKey,people))return fail('world-reference-changed');
  if(!Number.isSafeInteger(population.day)||population.day<observedDay)return fail('world-clock-reversed');
  observedDay=population.day;return null;
 }
 if(!Number.isSafeInteger(observedDay))throw new TypeError('canonical world day is required');
 function bound(){if(people.npc!==population||!assignments.isBoundTo(worldKey,people))throw new TypeError('canonical population reference changed');}
 function checkTarget(c,issuing=false){
  if(!exists(c.issuerId)||!exists(c.recipientId))return fail('unknown-person');
  if(!population.alive(c.recipientId)||(issuing&&!population.alive(c.issuerId)))return fail('person-not-alive');
  const unit=resolveUnit(c.unitId);
  if(unit?.id!==c.unitId||unit.active===false)return fail('unit-unavailable');
  if(!assignments.assignments().some(a=>a.personId===c.recipientId&&a.unitId===c.unitId&&a.alive))return fail('recipient-not-assigned');
  return null;
 }
 function read(port,request){
  if(typeof port!=='function')return null;
  const day=population.day,result=port(clone(request));
  if(result&&typeof result.then==='function')throw new TypeError('async world port');
  if(people.npc!==population||day!==population.day)throw new TypeError('world changed during read');
  return result;
 }
 function append(orderId,stage,data,day=population.day){
  const old=orders.get(orderId);
  if(!validDay(day)||(journal.length&&day<journal.at(-1).day))throw new TypeError('invalid journal day');
  let clean;
  if(stage==='issued'){
   clean=command(data);
   if(old||clean.orderId!==orderId||!exists(clean.issuerId)||!exists(clean.recipientId)||resolveUnit(clean.unitId)?.id!==clean.unitId)throw new TypeError('invalid issued reference');
   orders.set(orderId,{...clean,stage,issuedDay:day,updatedDay:day});
  }else{
   if(!old||terminal.has(old.stage))throw new TypeError('invalid order transition');
   if(stage==='dispatched'&&old.stage==='issued'&&text(data?.deliveryId)&&validDay(data.dispatchedDay)&&data.dispatchedDay>=old.issuedDay&&data.dispatchedDay<=day){
    clean={deliveryId:data.deliveryId,dispatchedDay:data.dispatchedDay};
   }else if(stage==='received'&&old.stage==='dispatched'&&validDay(data?.receivedDay)&&data.receivedDay>=old.dispatchedDay&&data.receivedDay<=day){
    clean={receivedDay:data.receivedDay};
   }else if(stage==='lost'&&old.stage==='dispatched'&&validDay(data?.lostDay)&&data.lostDay>=old.dispatchedDay&&data.lostDay<=day){
    clean={lostDay:data.lostDay};
   }else if(['understood','misunderstood'].includes(stage)&&old.stage==='received'&&text(data?.instruction)){
    clean={instruction:data.instruction};
   }else if(((stage==='refused'&&old.stage==='understood')||(stage==='blocked'&&['understood','execution-requested'].includes(old.stage)))&&text(data?.reason)){
    clean={reason:data.reason};
   }else if(stage==='execution-requested'&&old.stage==='understood'&&data?.executionKey===key(worldKey,orderId,'execute')){
    clean={executionKey:data.executionKey,requestedDay:day};
   }else if(stage==='completed'&&old.stage==='execution-requested'&&validDay(data?.completedDay)&&data.completedDay>=old.requestedDay&&data.completedDay<=day){
    clean={completedDay:data.completedDay};
   }else throw new TypeError('invalid order transition');
   // Original command remains intact; understanding may be different and is recorded separately.
   const details=['understood','misunderstood'].includes(stage)?{understoodInstruction:clean.instruction}:clean;
   orders.set(orderId,{...old,...details,stage,updatedDay:day});
  }
  journal.push({orderId,stage,day,data:clone(clean)});
 }
 if(snapshot!=null){
  try{
   if(snapshot.format!==FORMAT||snapshot.version!==1||snapshot.worldKey!==worldKey||!Array.isArray(snapshot.journal)||!validDay(snapshot.observedDay))throw new TypeError('format/world/day');
   for(const e of snapshot.journal)append(e.orderId,e.stage,e.data,e.day);
   if(journal.some(e=>e.day>snapshot.observedDay))throw new TypeError('observation precedes journal');
   observedDay=snapshot.observedDay;
  }catch(e){throw new TypeError('invalid order snapshot: '+e.message);}
 }
 function locked(action){
  if(busy)return fail('ledger-busy');
  const problem=clock();if(problem)return problem;
  busy=true;try{return action();}catch{return fail('port-unavailable');}finally{busy=false;}
 }
 function request(o){return {...o,worldKey,day:population.day};}
 function sameDelivery(o,d){return d?.worldKey===worldKey&&d.orderId===o.orderId&&d.recipientId===o.recipientId&&text(d.deliveryId)&&(!o.deliveryId||o.deliveryId===d.deliveryId);}
 function resultReceipt(o,r){return r?.worldKey===worldKey&&r.orderId===o.orderId&&r.recipientId===o.recipientId&&r.unitId===o.unitId&&r.executionKey===o.executionKey;}
 return {
  issue(input){return locked(()=>{
   let c;try{c=command(input);}catch{return fail('invalid-command');}
   const old=orders.get(c.orderId);
   if(old)return JSON.stringify(command(old))===JSON.stringify(c)?{ok:true,replayed:true,orderId:c.orderId}:fail('order-id-conflict');
   let problem=checkTarget(c,true);if(problem)return problem;
   if(read(authorize,{...c,worldKey,day:population.day,phase:'issue'})!==true)return fail('not-authorized');
   problem=checkTarget(c,true);if(problem)return problem;
   append(c.orderId,'issued',c);return {ok:true,replayed:false,orderId:c.orderId};
  });},
  step(orderId){return locked(()=>{
   const o=orders.get(orderId);if(!o)return fail('unknown-order');
   if(terminal.has(o.stage))return {ok:true,changed:false,stage:o.stage};
   // A committed external result is a historical fact; don't discard it after a later death/reassignment.
   if(o.stage==='execution-requested'){
    const r=read(readExecution,request(o));
    if(!r||r.status==='pending')return {ok:true,changed:false,stage:o.stage};
    if(!resultReceipt(o,r))return fail('invalid-execution-receipt');
    if(r.status==='completed'){
     if(!validDay(r.completedDay)||r.completedDay<o.requestedDay)return fail('invalid-execution-receipt');
     append(orderId,'completed',{completedDay:r.completedDay});
    }else if(r.status==='blocked'&&text(r.reason))append(orderId,'blocked',{reason:r.reason});
    else return fail('invalid-execution-receipt');
   }else{
    const problem=checkTarget(o);if(problem)return problem;
    if(o.stage==='issued'||o.stage==='dispatched'){
     const d=read(readDelivery,request(o));
     if(!d||d.status==='pending')return {ok:true,changed:false,stage:o.stage};
     if(!sameDelivery(o,d)||!validDay(d.dispatchedDay)||d.dispatchedDay<o.issuedDay)return fail('invalid-delivery-receipt');
     if(o.stage==='issued'){
      if(!['in-transit','arrived','lost'].includes(d.status))return fail('invalid-delivery-receipt');
      append(orderId,'dispatched',{deliveryId:d.deliveryId,dispatchedDay:d.dispatchedDay});
     }else if(d.dispatchedDay!==o.dispatchedDay)return fail('invalid-delivery-receipt');
     else if(d.status==='arrived'){
      if(!validDay(d.receivedDay)||d.receivedDay<o.dispatchedDay)return fail('invalid-delivery-receipt');
      append(orderId,'received',{receivedDay:d.receivedDay});
     }else if(d.status==='lost'){
      if(!validDay(d.lostDay)||d.lostDay<o.dispatchedDay)return fail('invalid-delivery-receipt');
      append(orderId,'lost',{lostDay:d.lostDay});
     }else if(d.status==='in-transit')return {ok:true,changed:false,stage:o.stage};
     else return fail('invalid-delivery-receipt');
    }else if(o.stage==='received'){
     const meaning=read(interpret,request(o));
     if(!meaning||meaning.status==='pending')return {ok:true,changed:false,stage:o.stage};
     if(!['understood','misunderstood'].includes(meaning.status)||!text(meaning.instruction))return fail('invalid-interpretation');
     const after=checkTarget(o);if(after)return after;
     append(orderId,meaning.status,{instruction:meaning.instruction});
    }else if(o.stage==='understood'){
     if(read(authorize,{...request(o),phase:'execute'})!==true)return fail('not-authorized');
     const decision=read(assessExecution,request(o));
     if(!decision||decision.status==='pending')return {ok:true,changed:false,stage:o.stage};
     const after=checkTarget(o);if(after)return after;
     if(decision.status==='ready')append(orderId,'execution-requested',{executionKey:key(worldKey,orderId,'execute')});
     else if(['refused','blocked'].includes(decision.status)&&text(decision.reason))append(orderId,decision.status,{reason:decision.reason});
     else return fail('invalid-execution-decision');
    }
   }
   return {ok:true,changed:true,stage:orders.get(orderId).stage};
  });},
  get(orderId){bound();return clone(orders.get(orderId)??null);},
  events(){bound();return clone(journal);},
  deliveryRequests(){bound();return [...orders.values()].filter(o=>['issued','dispatched'].includes(o.stage)).map(o=>({...clone(o),worldKey,deliveryKey:key(worldKey,o.orderId,'delivery')}));},
  executionRequests(){bound();return [...orders.values()].filter(o=>o.stage==='execution-requested').map(o=>({...clone(o),worldKey,instruction:o.understoodInstruction}));},
  save(){bound();if(busy)throw new TypeError('order ledger is busy');const problem=clock();if(problem)throw new TypeError(problem.code);return {format:FORMAT,version:1,worldKey,observedDay,journal:clone(journal)};}
 };
}
