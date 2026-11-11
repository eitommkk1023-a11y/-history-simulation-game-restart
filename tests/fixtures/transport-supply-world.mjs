import {rootFixture,worldKey,validRoot,worldPart,militaryPart} from './checkpoint-world.mjs';
import {createGeographyAdapter} from '../../src/transport/geography-adapter.mjs';
import {createCourierRuntime,validateCourierState} from '../../src/transport/courier-state.mjs';
import {createFoodTransfer,validateFoodState} from '../../src/economy/food-transfer.mjs';
import {createWorldCheckpoint} from '../../src/persistence/world-checkpoint.mjs';
export function makeRoot(){
 const root=rootFixture(),w=root.world;
 w.people.groups.push({...structuredClone(w.people.groups[0]),id:2,x:2,food:0,fresh:0,dried:0,layout:{version:2,plaza:{kind:'open'},axis:{a:0,k:0},nTarget:0,items:[],log:[]}});
 w.people.nextGroupId=3;w.people.npc.ensureGroups(3);
 w.transport={worldKey,version:1,travelClockHours:0,positions:new Map([[0,{x:0,y:0}],[1,{x:0,y:0}],[2,{x:2,y:0}]]),deliveries:new Map(),cargo:new Map([[1,{food:0,fresh:0,dried:0,capacityKg:15}]]),movementReceipts:new Map()};
 w.economy={worldKey,version:1,receipts:new Map()};
 w.geographyData={elev:new Float32Array(3),type:new Uint8Array(3).fill(1),biome:new Uint8Array(3).fill(5),water:new Uint8Array(3)};
 return root;
}
export function courier(root){const w=root.world;return createCourierRuntime({worldKey,people:w.people,state:w.transport,geography:createGeographyAdapter(w.geographyData,{width:3,height:1,kmPerBlock:1}),knows:()=>true,knowsTarget:()=>true,authorize:()=>true});}
export function food(root){const w=root.world;return createFoodTransfer({worldKey,people:w.people,transport:w.transport,economy:w.economy,authorize:()=>true});}
export function valid(root){const w=root.world;return validRoot(root)&&validateCourierState({worldKey,people:w.people,state:w.transport})&&validateFoodState({worldKey,people:w.people,transport:w.transport,economy:w.economy});}
export function storeFor(root){return createWorldCheckpoint({worldKey,world:root,participants:[worldPart,militaryPart],getDay:r=>r.world.clock.day,validate:valid});}
export const pickup={worldKey,operationId:'pickup',actorId:0,from:{kind:'community',id:1},to:{kind:'cargo',id:1},foodKind:'dried',kg:10};
export function start(root){
 const m=root.military;m.orders.issue({orderId:'supply',issuerId:0,recipientId:2,unitId:'a',instruction:'届いた食料10kgを集落在庫へ下ろす'});
 food(root).transfer(pickup);courier(root).dispatch({request:m.orders.deliveryRequests()[0],courierId:1,deliveryId:'supply-delivery',profile:{baseKmH:1}});
 m.orders.step('supply');root.world.transport.travelClockHours=0.4;courier(root).advance({operationId:'travel-1',deliveryId:'supply-delivery',travelHours:0.4});
}
export function arrive(root){root.world.transport.travelClockHours=2;courier(root).advance({operationId:'travel-2',deliveryId:'supply-delivery',travelHours:1.6});root.military.orders.step('supply');root.military.orders.step('supply');root.military.orders.step('supply');}
export function unload(root){const r=root.military.orders.executionRequests()[0];const c={worldKey,operationId:r.executionKey,actorId:r.recipientId,from:{kind:'cargo',id:1},to:{kind:'community',id:2},foodKind:'dried',kg:10};return {request:r,command:c,result:food(root).transfer(c)};}
