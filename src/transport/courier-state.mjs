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
export function validateCourierState({worldKey,people,state}){
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
export function createCourierRuntime({worldKey,people,state,geography,knows,knowsTarget,authorize}={}){
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
