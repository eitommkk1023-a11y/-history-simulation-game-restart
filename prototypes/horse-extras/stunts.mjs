const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function stepStationaryTurn(state,steer,dt,{cart=false}={}){
 const s={...state,turnClip:null};
 if(cart||Math.abs(s.speed)>.04||Math.abs(steer)<.12||!(dt>0))return s;
 const delta=-clamp(steer,-1,1)*(.98*(s.identity?.stats.agility??1))*Math.min(dt,.1);
 s.yaw+=delta;s.turnPhase=(s.turnPhase??0)+Math.abs(delta)/(Math.PI/2);
 s.turnClip=delta>0?'turn_l':'turn_r';return s;
}

export function startHorseFall(horse){
 return {kind:'fall',elapsed:0,x:horse.x,y:horse.y,z:horse.z,yaw:horse.yaw,speed:horse.speed};
}

export function stepHorseFall(state,dt,terrain){
 if(state.kind==='dead'||!(dt>0))return state;
 const s={...state},duration=Math.min(dt,.1,1.5-s.elapsed),steps=Math.max(1,Math.ceil(duration*120)),h=duration/steps;
 for(let i=0;i<steps;i++){
  const distance=s.speed*(1-Math.exp(-3.8*h))/3.8;
  const x=s.x+Math.sin(s.yaw)*distance,z=s.z+Math.cos(s.yaw)*distance,y=terrain.height(x,z);
  if(!Number.isFinite(y)||Math.abs(y-s.y)>Math.abs(distance)*.65+.04||terrain.blocked(x,z,.7))s.speed=0;
  else{s.x=x;s.z=z;s.y=y;s.speed*=Math.exp(-3.8*h);}
 }
 s.elapsed+=duration;if(s.elapsed>=1.5-1e-8){s.kind='dead';s.speed=0;}
 return s;
}

export function launchRider({x,y,z,yaw,speed,scale=1}){
 const sign=speed<0?-1:1,forward=speed+sign*1.6,side=-1.1;
 return {x,y,z,yaw,scale,vx:Math.sin(yaw)*forward+Math.cos(yaw)*side,vz:Math.cos(yaw)*forward-Math.sin(yaw)*side,vy:3.4,
  elapsed:0,groundT:0,grounded:false,done:false,pitch:0,roll:0};
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
   const gettingUp=clamp((s.groundT-.75)/.6,0,1);s.pitch=Math.PI/2*(1-gettingUp);s.roll=0;
   if(s.groundT>=1.35){s.done=true;s.vx=s.vz=s.vy=0;break;}
  }else{
   s.y+=s.vy*h-9.81*h*h/2;s.vy-=9.81*h;
   s.pitch=Math.min(1.48,s.elapsed*1.8);s.roll=.18*Math.sin(s.elapsed*5);
   const support=(.20+.72*Math.abs(Math.cos(s.pitch)*Math.cos(s.roll)))*s.scale;
   if(s.vy<0&&s.y<=ground+support){s.grounded=true;s.vy=0;s.y=ground+.24;s.pitch=Math.PI/2;s.roll=0;}
  }
 }
 return s;
}

export function poseThrownRider(THREE,rider,state,terrain,bounds){
 const root=rider.root,hips=rider.hips,up=state.grounded?clamp((state.groundT-.75)/.6,0,1):0;
 root.position.set(state.x,state.y,state.z);root.rotation.set(0,state.yaw,0);root.rotateY(0);root.rotateX(state.pitch);root.rotateZ(state.roll);root.scale.setScalar(state.scale);
 hips.position.set(0,0,0);hips.quaternion.identity();hips.children[0].rotation.x=.12*(1-up);
 const spread=(1-up)*Math.min(1,state.elapsed/.10);
 for(const leg of rider.legs){leg.thigh.position.x=leg.sign*.105;leg.thigh.rotation.set(-.35*spread,0,leg.sign*.15*spread);leg.shin.rotation.set(.8*spread,0,0);}
 for(const arm of rider.arms){arm.arm.rotation.set(-.70*spread,0,-arm.sign*.65*spread);arm.forearm.rotation.set(-.30*spread,0,0);}
 root.updateMatrixWorld(true);bounds.setFromObject(root);
 const ground=terrain.height(state.x,state.z),adjust=ground+.025-bounds.min.y;
 if(state.grounded||adjust>0){root.position.y+=adjust;root.updateMatrixWorld(true);}
 return root.position.y;
}
