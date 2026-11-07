(()=>{const mods={};
mods['src/politics-military/person-reference.mjs']=(()=>{
/** P0 read-only bridge. IDs belong to the existing world; no people are created here.
 * This validates references, not recruitment eligibility, command authority or arrival.
 * Caller must revalidate at execution time; this is not a reservation/assignment ledger.
 */
function inspectRoster(people, personIds) {
  const p = people?.npc;
  if (!p || !Number.isSafeInteger(p.n) || !p.group || !p.eth || typeof p.alive !== 'function') {
    throw new TypeError('canonical population is required');
  }
  if (!Array.isArray(personIds)) throw new TypeError('personIds must be an array');
  const seen = new Set(), issues = [], members = [];
  for (const id of personIds) {
    if (!Number.isSafeInteger(id) || id < 0 || id >= p.n) {
      issues.push({code: 'unknown-person', personId: id}); continue;
    }
    if (seen.has(id)) { issues.push({code: 'duplicate-person', personId: id}); continue; }
    seen.add(id);
    if (!p.alive(id)) { issues.push({code: 'person-not-alive', personId: id}); continue; }
    members.push(Object.freeze({personId: id, communityId: p.group[id],
      ethnicityId: p.eth[id] || p.groupEth[p.group[id]], observedDay: p.day,
      physicalPosition: null}));
  }
  return {ok: issues.length === 0, members: issues.length ? [] : members, issues};
}

return {inspectRoster};})();
mods['src/politics-military/assignment-ledger.mjs']=(()=>{const {inspectRoster}=mods['src/politics-military/person-reference.mjs'];


const FORMAT = 'woh.military.assignments';
const copy = value => JSON.parse(JSON.stringify(value));
const validId = id => (typeof id === 'string' && id.trim().length > 0) || (Number.isSafeInteger(id) && id >= 0);
const fail = (code, detail = {}) => ({ok: false, code, ...detail});

function normalize(input) {
  if (!input || !['assign', 'release'].includes(input.action) ||
      typeof input.operationId !== 'string' || !input.operationId.trim() ||
      !Number.isSafeInteger(input.actorId) || input.actorId < 0 || !validId(input.unitId) ||
      !Array.isArray(input.personIds) || input.personIds.some(id => !Number.isSafeInteger(id) || id < 0) ||
      (input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0))) {
    throw new TypeError('invalid assignment command');
  }
  if (!input.personIds.length) throw new TypeError('empty roster');
  if (new Set(input.personIds).size !== input.personIds.length) throw new TypeError('duplicate person');
  const c = {action: input.action, operationId: input.operationId, actorId: input.actorId,
    unitId: input.unitId, personIds: [...input.personIds].sort((a, b) => a - b)};
  if (input.expectedRevision !== undefined) c.expectedRevision = input.expectedRevision;
  return c;
}

/** Referenced-person sidecar; no creation of people, units, rank, stock, movement or authority.
 * authorize is a synchronous, read-only world port. Only explicit true permits mutation.
 * Snapshot journal is trusted save data validated structurally, not a proof of past authority.
 */
function createAssignmentLedger({worldKey, people, resolveUnit, authorize} = {}, snapshot) {
  if (typeof worldKey !== 'string' || !worldKey.trim()) throw new TypeError('canonical worldKey is required');
  inspectRoster(people, []);
  if (typeof resolveUnit !== 'function') throw new TypeError('canonical resolveUnit is required');
  const population = people.npc, assignments = new Map(), operations = [], operationIndex = new Map(), acknowledged = new Set();
  let executing = false;
  function requireBoundWorld() {
    if (people.npc !== population) throw new TypeError('canonical population reference changed; recreate the adapter');
  }
  const exists = id => Number.isSafeInteger(id) && id >= 0 && id < population.n;
  function unit(id) { const value = resolveUnit(id); return value?.id === id ? value : null; }
  function conflict(c) {
    for (const personId of c.personIds) {
      const old = assignments.get(personId);
      if (c.action === 'assign' && old) return fail('already-assigned', {personId, assignedUnitId: old.unitId});
      if (c.action === 'release' && (!old || old.unitId !== c.unitId)) return fail('not-assigned-to-unit', {personId});
    }
    return null;
  }
  function commit(c, day) {
    for (const personId of c.personIds) {
      if (c.action === 'assign') assignments.set(personId, {personId, unitId: c.unitId, assignedBy: c.actorId, assignedDay: day});
      else assignments.delete(personId);
    }
    operationIndex.set(c.operationId, operations.length);
    operations.push({command: c, day});
  }
  function receipt(index, replayed) {
    const record = operations[index];
    return {ok: true, operationId: record.command.operationId, revision: index + 1, day: record.day, replayed};
  }

  if (snapshot != null) {
    try {
      if (snapshot.format !== FORMAT || snapshot.version !== 1 || snapshot.worldKey !== worldKey ||
          !Array.isArray(snapshot.operations) || !Array.isArray(snapshot.acknowledged)) throw Error('format or world');
      for (const record of snapshot.operations) {
        const c = normalize(record?.command);
        if (!Number.isSafeInteger(record.day) || record.day > population.day ||
            (operations.length && record.day < operations.at(-1).day) || operationIndex.has(c.operationId) ||
            (c.expectedRevision !== undefined && c.expectedRevision !== operations.length) ||
            !exists(c.actorId) || c.personIds.some(id => !exists(id)) || !unit(c.unitId) || conflict(c)) throw Error('invalid journal');
        // Rebuild historical committed facts without rerunning present-day authority or reviving people.
        commit(c, record.day);
      }
      for (const id of snapshot.acknowledged) {
        if (!operationIndex.has(id) || acknowledged.has(id)) throw Error('invalid acknowledgement');
        acknowledged.add(id);
      }
    } catch (error) {
      throw new TypeError('invalid assignment snapshot: ' + error.message);
    }
  }

  function perform(input) {
      let c;
      try { c = normalize(input); } catch (error) { return fail('invalid-command', {reason: error.message}); }
      const prior = operationIndex.get(c.operationId);
      if (prior !== undefined) {
        return JSON.stringify(operations[prior].command) === JSON.stringify(c)
          ? receipt(prior, true) : fail('operation-id-conflict');
      }
      if (c.expectedRevision !== undefined && c.expectedRevision !== operations.length) return fail('stale-revision');
      if (!exists(c.actorId)) return fail('unknown-actor');
      if (!population.alive(c.actorId)) return fail('actor-not-alive');
      let target;
      try { target = unit(c.unitId); } catch { return fail('unit-unavailable'); }
      if (!target) return fail('unknown-unit');
      if (c.action === 'assign' && target.active === false) return fail('unit-inactive');
      try {
        const request = Object.freeze({...c, personIds: Object.freeze([...c.personIds]), worldKey, day: population.day});
        if (typeof authorize !== 'function' || authorize(request) !== true) return fail('not-authorized');
      } catch { return fail('authority-unavailable'); }
      // Recheck canonical people after the external authority callback, before any ledger mutation.
      if (people.npc !== population) return fail('world-reference-changed');
      if (!exists(c.actorId) || !population.alive(c.actorId)) return fail('actor-not-alive');
      try { target = unit(c.unitId); } catch { return fail('unit-unavailable'); }
      if (!target) return fail('unknown-unit');
      if (c.action === 'assign' && target.active === false) return fail('unit-inactive');
      if (c.action === 'assign') {
        const result = inspectRoster(people, c.personIds);
        if (!result.ok) return fail(result.issues[0].code, {personId: result.issues[0].personId});
      } else if (c.personIds.some(id => !exists(id))) return fail('unknown-person');
      const problem = conflict(c); if (problem) return problem;
      if (!Number.isSafeInteger(population.day) || (operations.length && population.day < operations.at(-1).day)) return fail('world-clock-reversed');
      commit(c, population.day);
      return receipt(operations.length - 1, false);
  }
  return {
    get revision() { return operations.length; },
    isBoundTo(key, targetPeople) { return key === worldKey && targetPeople === people && people.npc === population; },
    execute(input) {
      if (people.npc !== population) return fail('world-reference-changed');
      if (executing) return fail('ledger-busy');
      executing = true;
      try { return perform(input); } finally { executing = false; }
    },
    assignments() {
      requireBoundWorld();
      return [...assignments.values()].sort((a, b) => a.personId - b.personId)
        .map(record => ({...record, exists: exists(record.personId), alive: exists(record.personId) && population.alive(record.personId)}));
    },
    pendingEvents() {
      requireBoundWorld();
      return operations.filter(record => !acknowledged.has(record.command.operationId)).map(({command: c, day}) =>
        ({id: c.operationId, type: 'military.person-assignment', action: c.action, worldKey, day,
          actorId: c.actorId, unitId: c.unitId, personIds: [...c.personIds]}));
    },
    acknowledgeEvent(id) {
      requireBoundWorld();
      if (executing) return false;
      if (!operationIndex.has(id) || acknowledged.has(id)) return false;
      acknowledged.add(id); return true;
    },
    save() {
      requireBoundWorld();
      return {format: FORMAT, version: 1, worldKey, operations: copy(operations), acknowledged: [...acknowledged].sort()};
    }
  };
}

return {createAssignmentLedger};})();
mods['src/politics-military/order-ledger.mjs']=(()=>{
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
function createOrderLedger({worldKey,people,assignments,resolveUnit,authorize,readDelivery,interpret,assessExecution,readExecution}={},snapshot){
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

return {createOrderLedger};})();
mods['src/transport/courier-state.mjs']=(()=>{
/** Optional world-owned transport facet. All occupants reference existing Population IDs.
 * Explicit travel-hours budgets use the existing geography prototype; no calendar/speed rule is adopted.
 */
const clone=x=>structuredClone(x),str=x=>typeof x==='string'&&x.trim().length>0;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const equal=(a,b)=>point(a)&&point(b)&&a.x===b.x&&a.y===b.y;
const fail=code=>({ok:false,code});
function positionAt(d){
 if(d.legIndex===d.edgeHours.length)return d.path.at(-1);
 const a=d.path[d.legIndex],b=d.path[d.legIndex+1],f=d.legElapsedHours/d.edgeHours[d.legIndex];return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};
}
function validateCourierState({worldKey,people,state}){
 try{
  const p=people.npc,exists=id=>Number.isSafeInteger(id)&&id>=0&&id<p.n,day=d=>Number.isSafeInteger(d)&&d>=0&&d<=p.day;
  if(state.worldKey!==worldKey||state.version!==1||!Number.isFinite(state.travelClockHours)||state.travelClockHours<0||!['positions','deliveries','cargo','movementReceipts'].every(k=>state[k] instanceof Map))return false;
  for(const [id,pos]of state.positions)if(!exists(id)||!point(pos))return false;
  const ids=new Set(),active=new Set(),byDelivery=new Map(),consumed=new Map();
  for(const [id,d]of state.deliveries){
   if(id!==d.orderId||d.worldKey!==worldKey||!str(id)||!str(d.deliveryId)||ids.has(d.deliveryId)||!exists(d.courierId)||!exists(d.issuerId)||!exists(d.recipientId)||!day(d.dispatchedDay)||!day(d.lastAdvancedDay)||d.lastAdvancedDay<d.dispatchedDay||!Number.isFinite(d.lastTravelHour)||d.lastTravelHour<0||d.lastTravelHour>state.travelClockHours||!['in-transit','arrived','interrupted'].includes(d.status))return false;
   ids.add(d.deliveryId);byDelivery.set(d.deliveryId,d);
   const c=d.command,r=c?.request;
   if(c?.courierId!==d.courierId||c.deliveryId!==d.deliveryId||!Number.isFinite(c.profile?.baseKmH)||c.profile.baseKmH<=0||r?.worldKey!==worldKey||r.orderId!==d.orderId||r.issuerId!==d.issuerId||r.recipientId!==d.recipientId||r.deliveryKey!==JSON.stringify([worldKey,d.orderId,'delivery'])||!str(r.instruction)||!day(r.issuedDay)||r.issuedDay>d.dispatchedDay||!Number.isFinite(d.dispatchedTravelHour)||d.dispatchedTravelHour<0||d.dispatchedTravelHour>d.lastTravelHour)return false;
   consumed.set(d.deliveryId,d.dispatchedTravelHour);
   if(!Array.isArray(d.path)||!d.path.length||!d.path.every(point)||!Array.isArray(d.edgeHours)||d.edgeHours.length!==d.path.length-1||d.edgeHours.some(h=>!Number.isFinite(h)||h<=0)||!Number.isInteger(d.legIndex)||d.legIndex<0||d.legIndex>d.edgeHours.length||!Number.isFinite(d.legElapsedHours)||d.legElapsedHours<0)return false;
   if(d.legIndex===d.edgeHours.length?d.legElapsedHours!==0:d.legElapsedHours>=d.edgeHours[d.legIndex])return false;
   if(d.status==='arrived'){
    if(d.legIndex!==d.edgeHours.length||!day(d.receivedDay)||d.receivedDay<d.dispatchedDay)return false;
   }else{
    if(active.has(d.courierId)||!equal(state.positions.get(d.courierId),positionAt(d)))return false;active.add(d.courierId);
   }
  }
  for(const [id,r]of state.movementReceipts){
   const d=byDelivery.get(r.command?.deliveryId);
   if(!str(id)||r.command?.operationId!==id||!d||!Number.isFinite(r.command.travelHours)||r.command.travelHours<=0||!day(r.day)||r.day<d.dispatchedDay||r.day>d.lastAdvancedDay||r.fromTravelHour!==consumed.get(d.deliveryId)||!Number.isFinite(r.throughTravelHour)||r.throughTravelHour<=r.fromTravelHour||r.throughTravelHour>d.lastTravelHour)return false;
   consumed.set(d.deliveryId,r.throughTravelHour);
  }
  for(const d of byDelivery.values())if(consumed.get(d.deliveryId)!==d.lastTravelHour)return false;
  return true;
 }catch{return false;}
}
function createCourierRuntime({worldKey,people,state,geography,knows,knowsTarget,authorize}={}){
 if(!validateCourierState({worldKey,people,state})||typeof geography?.route!=='function')throw new TypeError('invalid canonical courier state');
 const population=people.npc;let busy=false;
 function run(fn){if(busy)return fail('courier-busy');if(people.npc!==population)return fail('world-reference-changed');busy=true;try{return fn();}catch{return fail('courier-port-unavailable');}finally{busy=false;}}
 const alive=id=>Number.isSafeInteger(id)&&id>=0&&id<population.n&&population.alive(id);
 const options=(profile,courierId)=>({...profile,knows:(x,y)=>typeof knows==='function'&&knows(courierId,x,y)===true});
 return {
  dispatch(input){return run(()=>{
   const {request:r,courierId,deliveryId,profile}=input||{};
   if(r?.worldKey!==worldKey||!str(r.orderId)||!str(deliveryId)||!str(r.instruction)||r.deliveryKey!==JSON.stringify([worldKey,r.orderId,'delivery'])||!Number.isSafeInteger(r.issuedDay)||r.issuedDay>population.day||!Number.isFinite(profile?.baseKmH)||profile.baseKmH<=0)return fail('invalid-dispatch');
   const command={request:{worldKey,orderId:r.orderId,issuerId:r.issuerId,recipientId:r.recipientId,unitId:r.unitId,instruction:r.instruction,issuedDay:r.issuedDay,deliveryKey:r.deliveryKey},courierId,deliveryId,profile:clone(profile)};
   const prior=state.deliveries.get(r.orderId);
   if(prior)return JSON.stringify(prior.command)===JSON.stringify(command)?{ok:true,replayed:true}:fail('delivery-id-conflict');
   if(![courierId,r.issuerId,r.recipientId].every(alive))return fail('person-not-alive');
   if([...state.deliveries.values()].some(d=>d.deliveryId===deliveryId||(d.courierId===courierId&&d.status!=='arrived')))return fail('courier-or-delivery-in-use');
   if(typeof authorize!=='function'||authorize(clone(command))!==true)return fail('not-authorized');
   const from=state.positions.get(courierId),sender=state.positions.get(r.issuerId),target=state.positions.get(r.recipientId);
   if(!point(from)||!point(target)||!equal(from,sender))return fail('position-unavailable');
   if(typeof knowsTarget!=='function'||knowsTarget(courierId,r.recipientId)!==true)return fail('target-unknown');
   const route=geography.route(from,target,options(profile,courierId));if(route.status!=='ok')return fail('route-'+route.status);
   const edgeHours=[];for(let i=1;i<route.path.length;i++)edgeHours.push(geography.route(route.path[i-1],route.path[i],options(profile,courierId)).hours);
   if(edgeHours.some(h=>!Number.isFinite(h)||h<=0))return fail('invalid-route');
   const d={worldKey,orderId:r.orderId,issuerId:r.issuerId,recipientId:r.recipientId,courierId,deliveryId,status:'in-transit',dispatchedDay:population.day,lastAdvancedDay:population.day,lastTravelHour:state.travelClockHours,dispatchedTravelHour:state.travelClockHours,path:route.path,edgeHours,legIndex:0,legElapsedHours:0,command};
   state.deliveries.set(r.orderId,clone(d));return {ok:true,replayed:false};
  });},
  advance(input){return run(()=>{
   const c={operationId:input?.operationId,deliveryId:input?.deliveryId,travelHours:input?.travelHours};
   if(!str(c.operationId)||!str(c.deliveryId)||!Number.isFinite(c.travelHours)||c.travelHours<=0)return fail('invalid-movement');
   const old=state.movementReceipts.get(c.operationId);if(old)return JSON.stringify(old.command)===JSON.stringify(c)?{ok:true,replayed:true}:fail('operation-id-conflict');
   const original=[...state.deliveries.values()].find(d=>d.deliveryId===c.deliveryId);if(!original)return fail('unknown-delivery');
   if(!alive(original.courierId)||!alive(original.recipientId))return fail('person-not-alive');
   if(population.day<original.lastAdvancedDay)return fail('world-clock-reversed');
   if(original.status==='arrived')return {ok:true,changed:false};
   const available=state.travelClockHours-original.lastTravelHour;
   if(available<=0||c.travelHours>available+Math.max(1,state.travelClockHours)*Number.EPSILON*4)return fail('travel-budget-unavailable');
   const d=clone(original);let hours=Math.min(c.travelHours,available);d.lastTravelHour+=hours;
   while(d.legIndex<d.edgeHours.length&&hours>0){
    const edge=geography.route(d.path[d.legIndex],d.path[d.legIndex+1],options(d.command.profile,d.courierId));
    if(edge.status!=='ok'||edge.path.length!==2)return fail('route-interrupted');
    const left=d.edgeHours[d.legIndex]-d.legElapsedHours;
    if(hours>=left){hours-=left;d.legIndex++;d.legElapsedHours=0;}else{d.legElapsedHours+=hours;hours=0;}
   }
   const pos=positionAt(d);d.lastAdvancedDay=population.day;
   if(d.legIndex===d.edgeHours.length){
    if(equal(pos,state.positions.get(d.recipientId))){d.status='arrived';d.receivedDay=population.day;}
    else d.status='interrupted';
   }else d.status='in-transit';
   state.positions.set(d.courierId,clone(pos));state.deliveries.set(d.orderId,d);state.movementReceipts.set(c.operationId,{command:c,day:population.day,fromTravelHour:original.lastTravelHour,throughTravelHour:d.lastTravelHour});return {ok:true,replayed:false,status:d.status};
  });},
  readDelivery(r){const d=state.deliveries.get(r.orderId);if(!d||r.worldKey!==worldKey||r.recipientId!==d.recipientId)return null;return {...clone(d),status:d.status==='interrupted'?'in-transit':d.status};}
 };
}

return {validateCourierState,createCourierRuntime};})();
mods['src/economy/food-transfer.mjs']=(()=>{
/** Local, world-owned food movement: community food is total kg, fresh/dried are components.
 * Cargo belongs to an existing person, is stored in the world's transport facet, and is not new population.
 * No transport over distance, consumption, capacity, access rights or resources are conjured here.
 */
const clone=x=>structuredClone(x),label=x=>typeof x==='string'&&x.trim().length>0;
const num=x=>Number.isFinite(x)&&x>=0;
const fail=code=>({ok:false,code});
function command(c,worldKey){
 const endpoint=e=>e&&['community','cargo'].includes(e.kind)&&Number.isSafeInteger(e.id)&&e.id>=0;
 if(c?.worldKey!==worldKey||!label(c.operationId)||!Number.isSafeInteger(c.actorId)||c.actorId<0||!endpoint(c.from)||!endpoint(c.to)||!['fresh','dried','durable'].includes(c.foodKind)||!Number.isFinite(c.kg)||c.kg<=0)throw new TypeError('invalid food command');
 return {worldKey,operationId:c.operationId,actorId:c.actorId,from:{kind:c.from.kind,id:c.from.id},to:{kind:c.to.kind,id:c.to.id},foodKind:c.foodKind,kg:c.kg};
}
function amounts(v){return {food:v.food,fresh:v.fresh??0,dried:v.dried??0};}
function writableInventory(v){
 const prototype=Object.getPrototypeOf(v);if(prototype!==Object.prototype&&prototype!==null)return false;
 return ['food','fresh','dried'].every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?d.writable===true:Object.isExtensible(v);});
}
function inventoryValid(v){const a=amounts(v);return Object.values(a).every(num)&&a.food>=a.fresh+a.dried;}
function endpoint(world,e){return e.kind==='community'?world.people.groups.find(g=>g.id===e.id):world.transport.cargo.get(e.id);}
function validateFoodState({worldKey,people,transport,economy}){
 try{
  const exists=id=>Number.isSafeInteger(id)&&id>=0&&id<people.npc.n;
  if(economy.worldKey!==worldKey||economy.version!==1||!(economy.receipts instanceof Map)||!(transport.cargo instanceof Map)||!(transport.positions instanceof Map))return false;
  const owners=new Set(),groups=new Set();
  for(const g of people.groups){if(groups.has(g.id)||owners.has(g)||!inventoryValid(g))return false;groups.add(g.id);owners.add(g);}
  for(const [id,c]of transport.cargo){if(!exists(id)||owners.has(c)||!inventoryValid(c)||!num(c.capacityKg)||c.food>c.capacityKg)return false;owners.add(c);}
  for(const [id,r]of economy.receipts){
   const c=command(r.command,worldKey);
   if(id!==c.operationId||!exists(c.actorId)||!endpoint({people,transport},c.from)||!endpoint({people,transport},c.to)||!Number.isSafeInteger(r.day)||r.day<0||r.day>people.npc.day)return false;
  }
  return true;
 }catch{return false;}
}
function createFoodTransfer({worldKey,people,transport,economy,authorize}={}){
 const world={people,transport};if(!validateFoodState({worldKey,people,transport,economy}))throw new TypeError('invalid canonical food state');
 const population=people.npc;let busy=false;
 function location(e){return e.kind==='community'?endpoint(world,e):transport.positions.get(e.id);}
 const same=(a,b)=>a&&b&&Number.isFinite(a.x)&&Number.isFinite(a.y)&&a.x===b.x&&a.y===b.y;
 return {
  transfer(input){
   if(busy)return fail('food-busy');if(people.npc!==population)return fail('world-reference-changed');busy=true;
   try{
    let c;try{c=command(input,worldKey);}catch{return fail('invalid-food-command');}
    const old=economy.receipts.get(c.operationId);if(old)return JSON.stringify(old.command)===JSON.stringify(c)?{ok:true,replayed:true,day:old.day}:fail('operation-id-conflict');
    if(!validateFoodState({worldKey,people,transport,economy}))return fail('invalid-food-state');
    if(c.actorId>=population.n||!population.alive(c.actorId))return fail('actor-not-alive');
    if(typeof authorize!=='function'||authorize(clone(c))!==true)return fail('not-authorized');
    if(people.npc!==population||!population.alive(c.actorId))return fail('world-reference-changed');
    const from=endpoint(world,c.from),to=endpoint(world,c.to);if(!from||!to||from===to)return fail('invalid-inventory');
    if(!same(location(c.from),location(c.to))||!same(transport.positions.get(c.actorId),location(c.from)))return fail('not-co-located');
    const a=amounts(from),b=amounts(to),kind=c.foodKind;
    const available=kind==='durable'?a.food-a.fresh-a.dried:a[kind];
    if(available<c.kg)return fail('insufficient-food');
    if(c.to.kind==='cargo'&&b.food+c.kg>to.capacityKg)return fail('capacity-exceeded');
    a.food-=c.kg;b.food+=c.kg;if(kind!=='durable'){a[kind]-=c.kg;b[kind]+=c.kg;}
    if(!inventoryValid(a)||!inventoryValid(b))return fail('invalid-food-result');
    if(!writableInventory(from)||!writableInventory(to))return fail('inventory-readonly');
    // Plain writable canonical fields plus one native-Map receipt, without external callbacks.
    Object.assign(from,a);Object.assign(to,b);Map.prototype.set.call(economy.receipts,c.operationId,{command:c,day:population.day});
    return {ok:true,replayed:false,day:population.day};
   }catch{return fail('food-port-unavailable');}finally{busy=false;}
  },
  readReceipt(id){const r=economy.receipts.get(id);return r?clone(r):null;}
 };
}

return {validateFoodState,createFoodTransfer};})();
mods['src/transport/geography-adapter.mjs']=(()=>{
/**
 * World of History: read-only geographic adapter for the existing generator.
 * Works with window.__geo.world (world.elev/type/biome/water).
 * This is a local land-route prototype; not a population/economy integration.
 * Coefficients below are experimental and NOT approved gameplay rules.
 */
const BIOME_SPEED = Object.freeze({
  2: 0.55, 3: 0.75, 4: 0.70, 6: 0.80, 7: 0.65,
  8: 0.72, 10: 0.75, 11: 0.55, 12: 0.55, 13: 0.35,
  14: 0.78, 15: 0.65,
});
const DIRECTIONS = Object.freeze([
  [1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1],
]);
function assertPosition(p, w, h) {
  if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) {
    throw new RangeError('Position must be an in-bounds integer {x, y}');
  }
}
function heapPush(q, item) {
  q.push(item); let i = q.length-1;
  while (i) {
    const p=(i-1)>>1; if (q[p].f <= item.f) break;
    q[i]=q[p]; i=p;
  }
  q[i]=item;
}
function heapPop(q) {
  const result=q[0], tail=q.pop();
  if (q.length) {
    let i=0;
    while (i*2+1 < q.length) {
      let child=i*2+1;
      if (child+1<q.length && q[child+1].f<q[child].f) child++;
      if (q[child].f>=tail.f) break;
      q[i]=q[child]; i=child;
    }
    q[i]=tail;
  }
  return result;
}
function createGeographyAdapter(world, { width=3000, height=3000, kmPerBlock=3.33 } = {}) {
  if (!world || !Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || !Number.isFinite(kmPerBlock) || kmPerBlock<=0) throw new TypeError('Invalid world dimensions');
  const n=width*height;
  for (const k of ['elev','type','biome','water']) {
    if (!world[k] || world[k].length!==n) throw new TypeError(`Expected ${k} with ${n} cells`);
  }
  const ix=(x,y)=>y*width+x;
  const inBounds=(x,y)=>x>=0 && y>=0 && x<width && y<height;
  // 0=none, 1=river, 2=lake in the current generator. Bridge/ford edges
  // will need explicit data before river cells can be traversed.
  const traversable=(x,y)=>inBounds(x,y) && world.type[ix(x,y)]!==0 && world.water[ix(x,y)]===0;
  function sample(x,y) {
    assertPosition({x,y},width,height);
    const i=ix(x,y);
    return {x,y,index:i,elevationM:world.elev[i],land:world.type[i]!==0,water:world.water[i],biome:world.biome[i],traversable:traversable(x,y)};
  }
  function route(start,finish,{knows,baseKmH=5,maxSlopeDeg=Infinity,maxExpanded=30000}={}) {
    assertPosition(start,width,height); assertPosition(finish,width,height);
    if (typeof knows!=='function') throw new TypeError('A per-actor knows(x, y) function is required; do not use omniscient terrain knowledge');
    if (!Number.isFinite(baseKmH) || baseKmH<=0 || !(maxSlopeDeg>0) || !Number.isInteger(maxExpanded) || maxExpanded<1) throw new RangeError('Invalid travel profile or search budget');
    if (!knows(start.x,start.y) || !knows(finish.x,finish.y)) return {status:'unknown'};
    if (!traversable(start.x,start.y) || !traversable(finish.x,finish.y)) return {status:'blocked'};
    const source=ix(start.x,start.y), target=ix(finish.x,finish.y);
    const g=new Map([[source,0]]), prev=new Map(), open=[];
    const heuristic=(x,y)=>Math.hypot(finish.x-x,finish.y-y)*kmPerBlock/(baseKmH*1.125);
    heapPush(open,{i:source,g:0,f:heuristic(start.x,start.y)});
    let expanded=0;
    while (open.length) {
      const curr=heapPop(open);
      if (curr.g!==g.get(curr.i)) continue;
      if (curr.i===target) {
        const indices=[target];
        while (indices[indices.length-1]!==source) indices.push(prev.get(indices[indices.length-1]));
        indices.reverse();
        const path=indices.map(i=>({x:i%width,y:Math.floor(i/width)}));
        const distanceKm=path.slice(1).reduce((s,p,k)=>s+kmPerBlock*Math.hypot(p.x-path[k].x,p.y-path[k].y),0);
        return {status:'ok',path,hours:curr.g,distanceKm,expanded};
      }
      if (++expanded>maxExpanded) return {status:'budget-exceeded',expanded};
      const x=curr.i%width,y=Math.floor(curr.i/width),elev=world.elev[curr.i];
      for (const [dx,dy] of DIRECTIONS) {
        const nx=x+dx,ny=y+dy;
        if (!traversable(nx,ny) || !knows(nx,ny)) continue;
        // A diagonal must not cut through the corners of blocked/unknown cells.
        if (dx && dy && (!traversable(x+dx,y) || !traversable(x,y+dy) || !knows(x+dx,y) || !knows(x,y+dy))) continue;
        const j=ix(nx,ny),length=kmPerBlock*Math.hypot(dx,dy);
        const slope=Math.atan2(world.elev[j]-elev,length*1000)*180/Math.PI;
        if (Math.abs(slope)>maxSlopeDeg) continue;
        const slopeFactor=slope>=0 ? Math.exp(-0.065*slope) : Math.max(0.15, Math.min(1.125, 1.125-0.035*(Math.abs(slope)-5)));
        const biomeFactor=BIOME_SPEED[world.biome[j]]??1;
        const time=length/(baseKmH*slopeFactor*biomeFactor);
        const ng=curr.g+time;
        if (ng<(g.get(j)??Infinity)) {
          g.set(j,ng); prev.set(j,curr.i);
          heapPush(open,{i:j,g:ng,f:ng+heuristic(nx,ny)});
        }
      }
    }
    return {status:'unreachable',expanded};
  }
  return Object.freeze({width,height,kmPerBlock,sample,route});
}

return {createGeographyAdapter};})();
mods['src/integration/main-military.mjs']=(()=>{const {createAssignmentLedger}=mods['src/politics-military/assignment-ledger.mjs'];const {createOrderLedger}=mods['src/politics-military/order-ledger.mjs'];const {createCourierRuntime,validateCourierState}=mods['src/transport/courier-state.mjs'];const {createFoodTransfer,validateFoodState}=mods['src/economy/food-transfer.mjs'];const {createGeographyAdapter}=mods['src/transport/geography-adapter.mjs'];





const copy=x=>structuredClone(x),same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
function encode(x){if(x instanceof Map)return {__wohMap:[...x].map(([k,v])=>[encode(k),encode(v)])};if(x instanceof Set)return {__wohSet:[...x].map(encode)};if(Array.isArray(x))return x.map(encode);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,encode(v)]));return x;}
function decode(x){
 if(x&&typeof x==='object'){
  if(Object.hasOwn(x,'__wohMap')){if(!Array.isArray(x.__wohMap))throw Error('invalid map');const m=new Map();for(const e of x.__wohMap){if(!Array.isArray(e)||e.length!==2||!['string','number'].includes(typeof e[0])||m.has(e[0]))throw Error('duplicate/invalid map key');m.set(e[0],decode(e[1]));}return m;}
  if(Object.hasOwn(x,'__wohSet')){const a=x.__wohSet;if(!Array.isArray(a)||new Set(a).size!==a.length)throw Error('invalid set');return new Set(a.map(decode));}
  if(Array.isArray(x))return x.map(decode);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,decode(v)]));
 }return x;
}
function createMainMilitary({people,People,getTerrain,worldKey,day,snapshot,developerEnabled=()=>false,onEvent=()=>{},authorize}={}){
 if(!people?.npc||!worldKey||!Number.isSafeInteger(day)||people.npc.day!==day)throw new TypeError('main population/clock mismatch');
 if(snapshot&&(snapshot.version!==1||snapshot.worldKey!==worldKey||snapshot.day!==day))throw new TypeError('invalid main military snapshot');
 let s=snapshot?decode(snapshot.state):{version:1,worldKey,day,testAuthority:false,units:new Map(),knownCells:new Set(),knownRecipients:new Set(),
  transport:{version:1,worldKey,travelClockHours:day*24,positions:new Map(),deliveries:new Map(),cargo:new Map(),movementReceipts:new Map()},economy:{version:1,worldKey,receipts:new Map()},actions:new Map(),
  life:{members:new Set(),homes:new Map(),period:new Map(),nutrition:new Map(),away:new Set(),consumption:new Map(),emitted:0}};
 const p=people.npc,exists=id=>Number.isSafeInteger(id)&&id>=0&&id<p.n;
 function permitted(c){return typeof authorize==='function'?authorize(c)===true:s.testAuthority&&developerEnabled()===true&&s.units.get(c.unitId)?.commanderId===(c.actorId??c.issuerId);}
 function known(c,x,y){return s.knownCells.has(x+','+y);}
 function geometry(){const w=getTerrain();if(!w)return null;return createGeographyAdapter(w,{width:w.stats.width,height:w.stats.height,kmPerBlock:w.stats.kmPerBlock||3.33});}
 function couriers(){return createCourierRuntime({worldKey,people,state:s.transport,geography:geometry(),knows:known,knowsTarget:(a,b)=>s.knownRecipients.has(a+','+b),authorize:()=>s.testAuthority&&developerEnabled()===true});}
 function food(){return createFoodTransfer({worldKey,people,transport:s.transport,economy:s.economy,authorize:()=>s.testAuthority&&developerEnabled()===true});}
 const assignments=createAssignmentLedger({worldKey,people,resolveUnit:id=>s.units.get(id),authorize:permitted},snapshot?.assignments);
 const orders=createOrderLedger({worldKey,people,assignments,resolveUnit:id=>s.units.get(id),authorize:permitted,
  readDelivery:r=>{const d=s.transport.deliveries.get(r.orderId);return d?{...d,status:d.status==='interrupted'?'in-transit':d.status}:null;},
  interpret:r=>s.testAuthority&&developerEnabled()===true?{status:'understood',instruction:r.instruction}:null,
  assessExecution:r=>s.testAuthority&&developerEnabled()===true?{status:'ready'}:null,readExecution:r=>s.actions.get(r.executionKey)},snapshot?.orders);
 function validate(){
  if(s.version!==1||s.worldKey!==worldKey||s.day!==p.day||!(s.units instanceof Map)||!(s.knownCells instanceof Set)||!(s.knownRecipients instanceof Set)||!(s.actions instanceof Map))return false;
  const terrain=getTerrain();if(terrain)for(const pos of s.transport.positions.values())if(pos.x<0||pos.y<0||pos.x>=terrain.stats.width||pos.y>=terrain.stats.height)return false;
  if(s.transport.travelClockHours!==s.day*24)return false;
  if(!validateCourierState({worldKey,people,state:s.transport})||!validateFoodState({worldKey,people,transport:s.transport,economy:s.economy}))return false;
  for(const [id,u]of s.units)if(u.id!==id||!exists(u.commanderId))return false;
  for(const name of ['members','away']){if(!(s.life[name] instanceof Set))return false;for(const id of s.life[name])if(!exists(id))return false;}
  for(const name of ['homes','period','nutrition','consumption'])if(!(s.life[name] instanceof Map))return false;
  for(const [id,r]of s.life.period)if(!exists(id)||!Number.isSafeInteger(r.awayDays)||r.awayDays<0||r.awayDays>30)return false;
  for(const [id,r]of s.life.nutrition)if(!exists(id)||![r.needed,r.ate,r.ratio].every(Number.isFinite)||r.needed<0||r.ate<0||r.ate>r.needed||r.ratio<0||r.ratio>1)return false;
  for(const r of s.life.consumption.values())if(!exists(r.personId)||!Number.isSafeInteger(r.day)||r.day<0||r.day>s.day||![r.needed,r.ate].every(Number.isFinite)||r.needed<0||r.ate<0||r.ate>r.needed)return false;
  const events=orders.events();if(!Number.isSafeInteger(s.life.emitted)||s.life.emitted<0||s.life.emitted>events.length)return false;
  for(const id of new Set(events.map(e=>e.orderId))){const o=orders.get(id),d=s.transport.deliveries.get(id);
   if(o.deliveryId&&(!d||d.deliveryId!==o.deliveryId||d.recipientId!==o.recipientId||d.dispatchedDay!==o.dispatchedDay))return false;
   if(o.receivedDay!==undefined&&(d.status!=='arrived'||d.receivedDay!==o.receivedDay))return false;
   if(o.stage==='completed'){const r=s.actions.get(o.executionKey);if(!r||r.status!=='completed'||r.orderId!==id||r.recipientId!==o.recipientId||r.unitId!==o.unitId||r.executionKey!==o.executionKey||r.completedDay!==o.completedDay)return false;}
  }
  return true;
 }
 if(!validate())throw new TypeError('invalid main military state');
 // Read-only population ports; all state belongs to the same world save extension.
 people.serviceAvailability=s.life.period;people.serviceNutrition=s.life.nutrition;p.unavailableForHomeWork=s.life.away;
 function flush(){const events=orders.events();while(s.life.emitted<events.length){const index=s.life.emitted,e=events[index];onEvent({...e,eventKey:JSON.stringify([worldKey,index])});s.life.emitted++;}}
 function eat(id,at){
  const key=JSON.stringify([worldKey,'ration',at,id]);if(s.life.consumption.has(key))return;
  const needed=People.peopleDailyFoodNeed(people,id,at),cargo=s.transport.cargo.get(id);let left=needed;
  if(cargo){let fresh=cargo.fresh,dried=cargo.dried,durable=Math.max(0,cargo.food-fresh-dried);const take=v=>{const n=Math.min(v,left);left-=n;return v-n;};fresh=take(fresh);durable=take(durable);dried=take(dried);cargo.fresh=fresh;cargo.dried=dried;cargo.food=fresh+durable+dried;}
  const ate=needed-left;s.life.consumption.set(key,{personId:id,day:at,needed,ate});const n=s.life.nutrition.get(id)||{needed:0,ate:0,ratio:1};n.needed+=needed;n.ate+=ate;n.ratio=n.needed>0?Math.min(1,n.ate/n.needed):1;s.life.nutrition.set(id,n);
 }
 return {
  worldKey,
  populationChecksum(){return p.checksum();},
  physicalPersons(){return [...s.life.members];},
  physicalPosition(id){return s.life.members.has(id)?copy(s.transport.positions.get(id)):null;},
  day(at){
   if(at===s.day)return;if(at!==s.day+1||p.day!==at)throw new TypeError('main military day mismatch');
   s.transport.travelClockHours=at*24;
   for(const id of s.life.members){if(!p.alive(id))continue;
    const active=[...s.transport.deliveries.values()].filter(d=>d.courierId===id&&d.status!=='arrived');
    const away=active.length>0||!same(s.transport.positions.get(id),s.life.homes.get(id));
    if(away){s.life.away.add(id);const r=s.life.period.get(id)||{awayDays:0};r.awayDays++;s.life.period.set(id,r);eat(id,at);}else{s.life.away.delete(id);s.life.nutrition.delete(id);}
    for(const d of active){const h=d.command.profile.travelHoursPerDay;if(Number.isFinite(h)&&h>0&&h<=24)couriers().advance({operationId:JSON.stringify([worldKey,'move',at,d.deliveryId]),deliveryId:d.deliveryId,travelHours:h});}
   }
   for(const id of new Set(orders.events().map(e=>e.orderId))){
    for(let k=0;k<6;k++){const r=orders.step(id);if(!r.ok||!r.changed)break;}
   }
   for(const r of orders.executionRequests())if(!s.actions.has(r.executionKey)&&permitted({...r,actorId:r.issuerId})){
    // Developer fixture: acknowledge a delivered instruction in the actual unit's world state.
    if(s.testAuthority&&developerEnabled()===true){const u=s.units.get(r.unitId);u.lastExecutedOrder={orderId:r.orderId,recipientId:r.recipientId,day:at};s.actions.set(r.executionKey,{worldKey,orderId:r.orderId,executionKey:r.executionKey,recipientId:r.recipientId,unitId:r.unitId,status:'completed',completedDay:at});orders.step(r.orderId);}
   }
   s.day=at;flush();
  },
  afterMonth(){s.life.period.clear();for(const n of s.life.nutrition.values()){n.needed=0;n.ate=0;}People.peStats(people);},
  save(){if(!validate())throw new TypeError('main military save validation failed');return {version:1,worldKey,day:s.day,state:encode(s),assignments:assignments.save(),orders:orders.save()};},
  audit(){const records=[...s.life.consumption.values()];return {day:s.day,population:p.n,living:p.livingCount(),foodConsumedKg:records.reduce((a,r)=>a+r.ate,0),foodNeededKg:records.reduce((a,r)=>a+r.needed,0),away:[...s.life.away],deliveries:copy([...s.transport.deliveries.values()]),orders:[...new Set(orders.events().map(e=>e.orderId))].map(id=>orders.get(id)),units:copy([...s.units.values()])};},
  installDeveloperMission(c){
   if(developerEnabled()!==true)return {ok:false,code:'developer-only'};
   if(![c.issuerId,c.recipientId,c.courierId].every(id=>exists(id)&&p.alive(id))||!Number.isFinite(c.profile?.travelHoursPerDay)||c.profile.travelHoursPerDay<=0||c.profile.travelHoursPerDay>24||!Number.isFinite(c.capacityKg)||c.capacityKg<0||s.units.has(c.unitId))return {ok:false,code:'invalid-fixture'};
   // Validate the complete developer operation before touching canonical inventories/assignments.
   try{
    if((typeof c.unitId!=='string'&&!Number.isSafeInteger(c.unitId))||s.transport.cargo.has(c.courierId)||assignments.assignments().some(a=>a.personId===c.recipientId)||people.player?.id===c.courierId)return {ok:false,code:'fixture-owner-already-used-or-unconnected'};
    if(!Array.isArray(c.positions)||!Array.isArray(c.knownCells)||!['fresh','dried','durable'].includes(c.foodKind)||!Number.isFinite(c.loadKg)||c.loadKg<0||c.loadKg>c.capacityKg)return {ok:false,code:'invalid-fixture'};
    const positions=new Map(c.positions);if(positions.size!==c.positions.length)return {ok:false,code:'duplicate-position'};
    for(const [id,pos]of positions){if(!exists(id)||!Number.isFinite(pos?.x)||!Number.isFinite(pos?.y)||(s.transport.positions.has(id)&&!same(pos,s.transport.positions.get(id))))return {ok:false,code:'invalid-position'};}
    const g=people.groups.find(g=>g.id===c.groupId),from=positions.get(c.courierId),target=positions.get(c.recipientId);
    if(!g||!same(from,positions.get(c.issuerId))||!same(from,g)||!target)return {ok:false,code:'not-co-located'};
    for(const k of ['food','fresh','dried']){const d=Object.getOwnPropertyDescriptor(g,k);if(d?d.writable!==true:!Object.isExtensible(g))return {ok:false,code:'readonly-inventory'};}
    const available=c.foodKind==='durable'?g.food-(g.fresh||0)-(g.dried||0):g[c.foodKind]||0;if(available<c.loadKg)return {ok:false,code:'insufficient-food'};
    const knownCells=new Set(c.knownCells.map(p=>p[0]+','+p[1])),route=geometry().route(from,target,{...c.profile,knows:(x,y)=>knownCells.has(x+','+y)});if(route.status!=='ok')return {ok:false,code:'route-'+route.status};
   }catch{return {ok:false,code:'invalid-fixture'};}
   s.testAuthority=true;s.units.set(c.unitId,{id:c.unitId,commanderId:c.issuerId,source:'developer-fixture'});
   for(const [id,pos]of c.positions)s.transport.positions.set(id,copy(pos));for(const [x,y]of c.knownCells)s.knownCells.add(x+','+y);s.knownRecipients.add(c.courierId+','+c.recipientId);
   s.transport.cargo.set(c.courierId,{food:0,fresh:0,dried:0,capacityKg:c.capacityKg});
   const a=assignments.execute({action:'assign',operationId:JSON.stringify([worldKey,c.unitId,'assign']),actorId:c.issuerId,unitId:c.unitId,personIds:[c.recipientId]});if(!a.ok)return a;
   if(c.loadKg>0){const r=food().transfer({worldKey,operationId:JSON.stringify([worldKey,c.unitId,'rations']),actorId:c.issuerId,from:{kind:'community',id:c.groupId},to:{kind:'cargo',id:c.courierId},foodKind:c.foodKind,kg:c.loadKg});if(!r.ok)return r;}
   const orderId=JSON.stringify([worldKey,c.unitId,'instruction']);const issued=orders.issue({orderId,issuerId:c.issuerId,recipientId:c.recipientId,unitId:c.unitId,instruction:'連絡を届け、配置を確認する'});if(!issued.ok)return issued;
   const request=orders.deliveryRequests().find(r=>r.orderId===orderId),r=couriers().dispatch({request,courierId:c.courierId,deliveryId:JSON.stringify([worldKey,c.unitId,'courier']),profile:c.profile});
   if(r.ok){s.life.members.add(c.courierId);s.life.homes.set(c.courierId,copy(s.transport.positions.get(c.courierId)));s.life.away.add(c.courierId);orders.step(orderId);flush();}return r;
  }
 };
}

return {createMainMilitary};})();
mods['src/integration/main-save.mjs']=(()=>{const {createMainMilitary}=mods['src/integration/main-military.mjs'];

function newWorldKey(){const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);return 'world-'+[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');}
function sealMainSave(st,controller){
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
function prepareMainSave(input,{People,getTerrain,developerEnabled,onEvent,terrainSize,simulationSize}={}){
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

return {newWorldKey,sealMainSave,prepareMainSave};})();
window.WohMainMilitary={...mods['src/integration/main-military.mjs'],...mods['src/integration/main-save.mjs']};})();
