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
 return {bind,participant:{id:'military',version:1,dependsOn:['world'],
  save:root=>({assignments:root.military.assignments.save(),orders:root.military.orders.save()}),
  restore:(snapshot,staged)=>bind(staged.world,snapshot)}};
}
