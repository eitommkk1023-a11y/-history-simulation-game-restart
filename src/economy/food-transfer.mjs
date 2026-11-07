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
export function validateFoodState({worldKey,people,transport,economy}){
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
export function createFoodTransfer({worldKey,people,transport,economy,authorize}={}){
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
