const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function stepStationaryTurn(state,steer,dt,{cart=false}={}){
 const s={...state,turnClip:null};
 if(cart||Math.abs(s.speed)>.04||Math.abs(steer)<.12||!(dt>0))return s;
 const delta=-clamp(steer,-1,1)*(.98*(s.identity?.stats.agility??1))*Math.min(dt,.1);
 s.yaw+=delta;s.turnPhase=(s.turnPhase??0)+Math.abs(delta)/(Math.PI/2);
 s.turnClip=delta>0?'turn_l':'turn_r';return s;
}

export function startHorseFall(horse){
 return {kind:'fall',elapsed:0,x:horse.x,y:horse.y,z:horse.z,yaw:horse.yaw,speed:horse.speed,startSpeed:horse.speed,startMode:horse.mode??'idle',startPhase:horse.phase??0,running:Math.abs(horse.speed)>=2.5};
}

export function stepHorseFall(state,dt,terrain){
 if(state.kind==='dead'||!(dt>0))return state;
 const s={...state},duration=Math.min(dt,.1,1.5-s.elapsed),steps=Math.max(1,Math.ceil(duration*120)),h=duration/steps;
 for(let i=0;i<steps;i++){
  const elapsed=s.elapsed+i*h,drag=s.running?(elapsed<.18?.8:elapsed<.55?2.1:5):3.8;
  const distance=s.speed*(1-Math.exp(-drag*h))/drag;
  const x=s.x+Math.sin(s.yaw)*distance,z=s.z+Math.cos(s.yaw)*distance,y=terrain.height(x,z);
  if(!Number.isFinite(y)||Math.abs(y-s.y)>Math.abs(distance)*.65+.04||terrain.blocked(x,z,.7))s.speed=0;
  else{s.x=x;s.z=z;s.y=y;s.speed*=Math.exp(-drag*h);}
 }
 s.elapsed+=duration;if(s.elapsed>=1.5-1e-8){s.kind='dead';s.speed=0;}
 return s;
}

export function launchRider({x,y,z,yaw,speed,scale=1,fallSide=1,initialRoll=-.12}){
 // The current fall clip rolls toward local+X. Carry only a little momentum,
 // with no launch upwards; the body slips down that same side.
 const side=Math.sign(fallSide)||1,forward=clamp(speed*.15,-1.1,1.1),lateral=side*2.0;
 return {x,y,z,yaw,scale,vx:Math.sin(yaw)*forward+Math.cos(yaw)*lateral,vz:Math.cos(yaw)*forward-Math.sin(yaw)*lateral,vy:-.2,
  elapsed:0,groundT:0,grounded:false,done:false,pitch:0,roll:initialRoll,startRoll:initialRoll,fallSide:side};
}

export function stepRiderFlight(state,dt,terrain){
 if(state.done||!(dt>0))return state;
 const s={...state},duration=Math.min(dt,.1),speed=Math.hypot(s.vx,s.vz),steps=Math.max(1,Math.ceil(duration*120),Math.ceil(speed*duration/.12)),h=duration/steps;
 for(let i=0;i<steps;i++){
  s.elapsed+=h;
  const x=s.x+s.vx*h,z=s.z+s.vz*h,y=terrain.height(x,z);
  if(!Number.isFinite(y)||terrain.blocked(x,z,.25)){s.vx=0;s.vz=0;}
  else{s.x=x;s.z=z;}
  const ground=terrain.height(s.x,s.z);
  if(s.grounded){
   s.groundT+=h;s.vx*=Math.exp(-10*h);s.vz*=Math.exp(-10*h);s.y=ground+.24;
   const gettingUp=clamp((s.groundT-.75)/.6,0,1);s.pitch=.08*(1-gettingUp);s.roll=-s.fallSide*Math.PI/2*(1-gettingUp);
   if(s.groundT>=1.35){s.done=true;s.vx=s.vz=s.vy=0;break;}
  }else{
   s.y+=s.vy*h-9.81*h*h/2;s.vy-=9.81*h;
   const t=clamp(s.elapsed/.6,0,1),ease=t*t*(3-2*t);s.pitch=.08*ease;s.roll=s.startRoll+(-s.fallSide*1.4-s.startRoll)*ease;
   const support=(.20+.72*Math.abs(Math.cos(s.pitch)*Math.cos(s.roll)))*s.scale;
   if(s.vy<0&&s.y<=ground+support){s.grounded=true;s.vy=0;s.y=ground+.24;s.pitch=.08;s.roll=-s.fallSide*Math.PI/2;}
  }
 }
 return s;
}

export function poseThrownRider(THREE,rider,state,terrain,bounds){
 const root=rider.root,hips=rider.hips,up=state.grounded?clamp((state.groundT-.75)/.6,0,1):0;
 root.position.set(state.x,state.y,state.z);root.rotation.set(0,state.yaw,0);root.rotateX(state.pitch);root.rotateZ(state.roll);root.scale.setScalar(state.scale);
 hips.position.set(0,0,0);hips.quaternion.identity();hips.children[0].rotation.x=.12*(1-up);
 const enter=Math.min(1,state.elapsed/.24),hold=1-up;
 for(const leg of rider.legs){leg.thigh.position.x=leg.sign*.105;leg.thigh.rotation.set((-.65+.4*enter)*hold,0,leg.sign*.10*hold);leg.shin.rotation.set((.95-.5*enter)*hold,0,0);}
 for(const arm of rider.arms){arm.arm.rotation.set((-.85+.55*enter)*hold,0,-arm.sign*.15*hold);arm.forearm.rotation.set(.65*hold,0,0);}
 root.updateMatrixWorld(true);bounds.setFromObject(root);
 const ground=terrain.height(state.x,state.z),adjust=ground+.025-bounds.min.y;
 if(state.grounded||adjust>0){root.position.y+=adjust;root.updateMatrixWorld(true);}
 return root.position.y;
}
