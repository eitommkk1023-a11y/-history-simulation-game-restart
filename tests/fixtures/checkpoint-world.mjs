import Npc from '../../npc/npc-core.js';
import People from '../../npc/people-core.js';
import {createMilitaryCheckpointParticipant} from '../../src/politics-military/military-checkpoint.mjs';
export const worldKey='checkpoint-test-world';
export const order={orderId:'o1',issuerId:0,recipientId:2,unitId:'a',instruction:'配属を解除する'};
export function peopleFixture(){
 const npc=new Npc.Population(321,2);for(let i=0;i<6;i++)npc.addFounder(1,25);
 const haz=Object.fromEntries(['starv','cold','dis','hungerDis','fert'].map(k=>[k,new Float32Array(66).fill(['hungerDis','fert'].includes(k)?1:0)]));
 return {npc,version:1,nextGroupId:2,nextEthId:2,rngState:123,playerEth:1,ethnicities:[{id:1,adultAge:18}],
  groups:[{id:1,alive:true,x:0,y:0,born:0,died:{natural:0,disease:0,starvation:0,cold:0},food:120,fresh:20,dried:30,c6:[],layout:{version:2,plaza:{kind:'open'},axis:{a:0,k:0},log:[],nTarget:0,items:[{id:100004,state:'ok',rec:{builtDay:0,edits:[]},cond:[1,1,1,1,1,1]}]}}],contacts:[],ties:{},languages:[],haz};
}
export function fixtureWorld(){return {clock:{day:0},people:peopleFixture(),units:new Map([['a',{id:'a'}]]),
 transport:{positions:new Map([[0,{x:0,y:0}],[1,{x:1,y:0}],[2,{x:2,y:0}]]),deliveries:new Map(),cargo:new Map()},economy:{receipts:new Map()},actions:{receipts:new Map()},
 history:{list:[{id:1,type:'existing-event'}],nextId:2},otherExistingExtension:{kept:true}};}
export const resolveUnit=(id,w)=>w.units.get(id);
const integration=createMilitaryCheckpointParticipant({worldKey,resolveUnit,authorizeAssignment:()=>true,orderPorts:world=>({authorize:()=>true,
 readDelivery:r=>world.transport.deliveries.get(r.orderId),interpret:()=>({status:'understood',instruction:order.instruction}),assessExecution:()=>({status:'ready'}),readExecution:r=>world.actions.receipts.get(r.executionKey)})});
export const bindMilitary=integration.bind;
export function rootFixture(){const world=fixtureWorld();const military=bindMilitary(world);
 military.assignments.execute({action:'assign',operationId:'initial',actorId:0,unitId:'a',personIds:[2]});return {world,military};}
export const worldPart={id:'world',version:1,dependsOn:[],save:root=>({...root.world,people:People.peopleSave(root.world.people)}),restore:sv=>({...sv,people:People.peopleLoad(sv.people)})};
export const militaryPart=integration.participant;
export function validRoot(root){
 const w=root.world,p=w.people.npc,m=root.military;if(w.clock.day!==p.day) return false;
 const groupIds=new Set();for(const g of w.people.groups){if(groupIds.has(g.id)||![g.food,g.fresh,g.dried].every(v=>Number.isFinite(v)&&v>=0)||g.food<g.fresh+g.dried)return false;groupIds.add(g.id);}
 for(const d of w.transport.deliveries.values()){
  if(!Number.isInteger(d.courierId)||d.courierId<0||d.courierId>=p.n||!w.transport.positions.has(d.courierId))return false;
 }
 for(const e of m.orders.events()){
  const o=m.orders.get(e.orderId),d=w.transport.deliveries.get(e.orderId);
  if(['dispatched','received','lost'].includes(e.stage)&&(!d||d.deliveryId!==o.deliveryId))return false;
  if(e.stage==='received'&&d.status!=='arrived')return false;
  if(e.stage==='completed'&&!w.actions.receipts.has(o.executionKey))return false;
 }
 return true;
}
export function inFlight(root){const w=root.world;root.military.orders.issue(order);
 w.transport.deliveries.set(order.orderId,{worldKey,orderId:order.orderId,recipientId:2,courierId:1,deliveryId:'d1',status:'in-transit',dispatchedDay:0,progress:0.5});root.military.orders.step(order.orderId);}
