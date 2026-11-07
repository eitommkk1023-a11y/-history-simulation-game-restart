import {createAssignmentLedger} from '../politics-military/assignment-ledger.mjs';
import {createOrderLedger} from '../politics-military/order-ledger.mjs';
import {createCourierRuntime,validateCourierState} from '../transport/courier-state.mjs';
import {createFoodTransfer,validateFoodState} from '../economy/food-transfer.mjs';
import {createGeographyAdapter} from '../transport/geography-adapter.mjs';
const copy=x=>structuredClone(x),same=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
function encode(x){if(x instanceof Map)return {__wohMap:[...x].map(([k,v])=>[encode(k),encode(v)])};if(x instanceof Set)return {__wohSet:[...x].map(encode)};if(Array.isArray(x))return x.map(encode);if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,encode(v)]));return x;}
function decode(x){
 if(x&&typeof x==='object'){
  if(Object.hasOwn(x,'__wohMap')){if(!Array.isArray(x.__wohMap))throw Error('invalid map');const m=new Map();for(const e of x.__wohMap){if(!Array.isArray(e)||e.length!==2||!['string','number'].includes(typeof e[0])||m.has(e[0]))throw Error('duplicate/invalid map key');m.set(e[0],decode(e[1]));}return m;}
  if(Object.hasOwn(x,'__wohSet')){const a=x.__wohSet;if(!Array.isArray(a)||new Set(a).size!==a.length)throw Error('invalid set');return new Set(a.map(decode));}
  if(Array.isArray(x))return x.map(decode);return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,decode(v)]));
 }return x;
}
export function createMainMilitary({people,People,getTerrain,worldKey,day,snapshot,developerEnabled=()=>false,onEvent=()=>{},authorize}={}){
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
