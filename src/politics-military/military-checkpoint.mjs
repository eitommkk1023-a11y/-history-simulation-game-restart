import {createAssignmentLedger} from './assignment-ledger.mjs';
import {createOrderLedger} from './order-ledger.mjs';
/** Registers an ID-only military extension of a world-owned checkpoint.
 * The world participant owns people, units, economy, transport, buildings and their codecs.
 * orderPorts(world) must bind to that specific candidate's canonical delivery/action stores.
 */
export function createMilitaryCheckpointParticipant({worldKey,resolveUnit,authorizeAssignment,orderPorts}={}){
 if(typeof resolveUnit!=='function'||typeof orderPorts!=='function')throw new TypeError('canonical world ports required');
 function bind(world,snapshot){
  if(snapshot!=null&&(!snapshot.assignments||!snapshot.orders))throw new TypeError('incomplete military checkpoint');
  const assignments=createAssignmentLedger({worldKey,people:world.people,resolveUnit:id=>resolveUnit(id,world),authorize:c=>typeof authorizeAssignment==='function'&&authorizeAssignment(c,world)===true},snapshot?.assignments);
  const ports=orderPorts(world);
  if(!ports||typeof ports!=='object'||typeof ports.then==='function')throw new TypeError('synchronous candidate order ports required');
  const orders=createOrderLedger({...ports,worldKey,people:world.people,assignments,resolveUnit:id=>resolveUnit(id,world)},snapshot?.orders);
  return {assignments,orders};
 }
 function validate(root){
  try{
   const world=root.world,m=root.military,ports=orderPorts(world);
   if(!m.assignments.isBoundTo(worldKey,world.people))return false;
   const orderIds=new Set(m.orders.events().map(e=>e.orderId));
   for(const id of orderIds){
    const o=m.orders.get(id),request={...o,worldKey};
    if(o.deliveryId){
     const d=ports.readDelivery?.(request);
     if(!d||d.worldKey!==worldKey||d.orderId!==o.orderId||d.recipientId!==o.recipientId||d.deliveryId!==o.deliveryId||d.dispatchedDay!==o.dispatchedDay)return false;
     if(o.stage==='lost'&&(d.status!=='lost'||d.lostDay!==o.lostDay))return false;
     if(o.receivedDay!==undefined&&(d.status!=='arrived'||d.receivedDay!==o.receivedDay))return false;
    }
    if(o.executionKey){
     const r=ports.readExecution?.(request),required=['completed','blocked'].includes(o.stage);
     if(required&&!r)return false;
     if(r&&!['completed','blocked'].includes(r.status))return false;
     if(r?.status==='completed'&&(!Number.isSafeInteger(r.completedDay)||r.completedDay<o.requestedDay||r.completedDay>world.people.npc.day))return false;
     if(r?.status==='blocked'&&(typeof r.reason!=='string'||!r.reason.trim()))return false;
     if(r&&(r.worldKey!==worldKey||r.orderId!==o.orderId||r.recipientId!==o.recipientId||r.unitId!==o.unitId||r.executionKey!==o.executionKey))return false;
     if(o.stage==='completed'&&(r.status!=='completed'||r.completedDay!==o.completedDay))return false;
     if(o.stage==='blocked'&&r.status!=='blocked')return false;
    }
   }
   return true;
  }catch{return false;}
 }
 return {bind,validate,participant:{id:'military',version:1,dependsOn:['world'],
  save:root=>({assignments:root.military.assignments.save(),orders:root.military.orders.save()}),
  restore:(snapshot,staged)=>bind(staged.world,snapshot)}};
}
