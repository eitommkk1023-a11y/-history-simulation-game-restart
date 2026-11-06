import {HORSE_GAITS} from './motion.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
export function freshHorseState(identity){return {identity,x:0,z:0,y:0,yaw:0,speed:0,phase:0,stamina:identity.stats.endurance,mode:'idle',blocked:false,distance:0};}
export function stepHorse(state,input,dt,terrain){const s={...state};if(!Number.isFinite(dt)||dt<=0)return s;dt=Math.min(.1,dt);const stats=s.identity.stats,effort=clamp(input.forward??0,0,1),desiredMode=input.mode??'trot',max=desiredMode==='walk'?1.5:desiredMode==='trot'?stats.speed*.47:stats.speed,target=effort*max*(s.stamina<8&&desiredMode==='canter'?.45:1),accel=target>s.speed?stats.acceleration:stats.acceleration*1.7;s.speed+=clamp(target-s.speed,-accel*dt,accel*dt);if(s.speed<.008)s.speed=0;
 const delta=angle((input.heading??s.yaw)-s.yaw),turn=stats.agility*2.2/(1+s.speed*.28);if(effort>.02)s.yaw+=clamp(delta,-turn*dt,turn*dt);
 const move=s.speed*dt,steps=Math.max(1,Math.ceil(move/.18));s.blocked=false;let travelled=0;
 for(let k=0;k<steps;k++){const dx=Math.sin(s.yaw)*move/steps,dz=Math.cos(s.yaw)*move/steps,x=s.x+dx,z=s.z+dz,y=terrain.height(x,z),a=terrain.height(x+.55,z),b=terrain.height(x-.55,z),c=terrain.height(x,z+.8),d=terrain.height(x,z-.8),slope=Math.hypot((a-b)/1.1,(c-d)/1.6);if(!Number.isFinite(y)||slope>Math.tan(Math.PI*25/180)||Math.abs(y-s.y)>move/steps*.6+.04||terrain.blocked(x,z,.48)){s.blocked=true;s.speed=0;break;}travelled+=Math.hypot(dx,dz);s.x=x;s.z=z;s.y=y;}
 s.mode=s.speed<.04?'idle':s.speed<2.15?'walk':s.speed<5.6?'trot':'canter';s.phase+=s.mode==='idle'?dt*.28:travelled/(HORSE_GAITS[s.mode]?.stride??1)/s.identity.scale;s.distance+=travelled;
 s.stamina=clamp(s.stamina+(s.mode==='canter'?-5:s.mode==='trot'?-.35:s.mode==='walk'?3.2:8)*dt,0,stats.endurance);return s;
}
