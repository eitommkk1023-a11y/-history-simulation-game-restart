import {HORSE_GAITS} from '../horse/motion.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
export function horseTargetSpeed07(mode,identity,{cart=false}={}){
 return mode==='reverse'?-.8:mode==='walk'?110/60:mode==='trot'?(cart?14/3.6:220/60):mode==='canter'?27/3.6:mode==='gallop'?identity.stats.speed:0;
}
// Speed increases the radius quadratically: lateral acceleration stays bounded.
export function horseTurnRadius(speed,identity,{cart=false}={}){
 const agility=clamp(identity.stats.agility,.6,1.4),v=Math.abs(speed);
 return (cart?5.5:1.8)/agility+v*v/(cart?1.6:3.0);
}
export function freshButtonRide(){return {gear:0,mode:'idle',steer:0,brake:1,brakeStage:0,startAxis:0};}
export function stepButtonRide(state,input={}){
 let gear=clamp(state.gear,-1,input.maxGear??4);const speed=input.speed??0;
 if(input.command==='up')gear=gear<0?(speed<-.04?0:1):Math.min(input.maxGear??4,gear+1);
 if(input.command==='down')gear=gear<0?0:Math.max(0,gear-1);
 if(input.command==='stop'||input.stop)gear=0;
 if(input.command==='reverse')gear=gear<0||Math.abs(speed)>.08?0:-1;
 const y=clamp(input.y??0,-1,1),previousAxis=state.startAxis??0;
 const startAxis=y>.45?1:y<-.45?-1:Math.abs(y)<.28?0:previousAxis;
 const startEdge=startAxis!==0&&startAxis!==previousAxis;
 if(!input.command&&!input.stop&&gear===0&&Math.abs(speed)<.08&&startEdge)gear=startAxis;
 const x=clamp(input.x??0,-1,1);
 return {gear,mode:gear<0?'reverse':['idle','walk','trot','canter','gallop'][gear],steer:Math.abs(x)<.12?0:Math.sign(x)*(Math.abs(x)-.12)/.88,brake:gear===0?1:0,brakeStage:0,startAxis};
}
export function stepHorse07(state,input,dt,terrain){
 const s={...state};if(!Number.isFinite(dt)||dt<=0)return s;dt=Math.min(.1,dt);
 const stats=s.identity.stats,effort=clamp(input.forward??0,0,1),desiredMode=input.mode??'trot';
 s.fatigued=desiredMode==='gallop'&&s.stamina<8;
 const max=horseTargetSpeed07(s.fatigued?'canter':desiredMode,s.identity,{cart:input.cart}),brake=clamp(input.brake??0,0,1),requested=effort*max,compatible=s.speed*requested<0?0:requested,target=brake>0&&Math.abs(compatible)>Math.abs(s.speed)?s.speed:compatible;
 const accel=Math.abs(target)>Math.abs(s.speed)?stats.acceleration:stats.acceleration*1.7+brake*5;
 s.speed+=clamp(target-s.speed,-accel*dt,accel*dt);if(Math.abs(s.speed)<.008)s.speed=0;
 const delta=angle((input.heading??s.yaw)-s.yaw),turn=Math.abs(s.speed)/horseTurnRadius(s.speed,s.identity,{cart:input.cart});
 if(effort>.02||Math.abs(s.speed)>.1){if(Number.isFinite(input.steer))s.yaw-=clamp(input.steer,-1,1)*turn*dt*(s.speed<0?-1:1);else s.yaw+=clamp(delta,-turn*dt,turn*dt);}
 const move=s.speed*dt,steps=Math.max(1,Math.ceil(Math.abs(move)/.18));s.blocked=false;let travelled=0;
 for(let k=0;k<steps;k++){
  const dx=Math.sin(s.yaw)*move/steps,dz=Math.cos(s.yaw)*move/steps,x=s.x+dx,z=s.z+dz,y=terrain.height(x,z),a=terrain.height(x+.55,z),b=terrain.height(x-.55,z),c=terrain.height(x,z+.8),d=terrain.height(x,z-.8),slope=Math.hypot((a-b)/1.1,(c-d)/1.6);
  if(!Number.isFinite(y)||slope>Math.tan(Math.PI*25/180)||Math.abs(y-s.y)>Math.abs(move)/steps*.6+.04||terrain.blocked(x,z,.48)){s.blocked=true;s.speed=0;break;}
  travelled+=Math.hypot(dx,dz);s.x=x;s.z=z;s.y=y;
 }
 // Hysteresis avoids rapid pose switching around a gait's speed boundary.
 const limits=[.04,2.5,4.6,8.3],modes=['idle','walk','trot','canter','gallop'];let index=0;
 while(index<limits.length&&Math.abs(s.speed)>=limits[index])index++;
 const old=modes.indexOf(state.mode);
 if(index<old&&old>1&&Math.abs(s.speed)>limits[old-1]-.3)index=old;
 s.mode=modes[index];s.phase+=s.mode==='idle'?dt*.28:Math.sign(s.speed)*travelled/HORSE_GAITS[s.mode].stride/s.identity.scale;s.distance+=travelled;
 s.stamina=clamp(s.stamina+(desiredMode==='gallop'&&s.mode==='gallop'?-4.5:s.mode==='canter'?.8:s.mode==='trot'?1.2:s.mode==='walk'?3.2:8)*dt,0,stats.endurance);
 return s;
}
