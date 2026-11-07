function createShipNavigation(layout){
 const radius=.23,eps=.025;
 const grid=new Map(),cellSize=3;
 for(const b of layout.obstacles||[]){
  for(let x=Math.floor((b.x-b.w/2-radius)/cellSize);x<=Math.floor((b.x+b.w/2+radius)/cellSize);x++)for(let z=Math.floor((b.z-b.d/2-radius)/cellSize);z<=Math.floor((b.z+b.d/2+radius)/cellSize);z++){const k=x+','+z;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(b);}
 }
 const near=(x,z)=>grid.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize))||[];
 function floorAt(f,x,z){
  const a=f.samples;if(z<a[0][0]||z>a[a.length-1][0])return null;
  let low=0,high=a.length-1;while(high-low>1){const m=(low+high)>>1;if(a[m][0]<z)low=m;else high=m;}const p=a[low],q=a[high];
  const t=(z-p[0])/(q[0]-p[0]),w=p[1]+(q[1]-p[1])*t,y=p[2]+(q[2]-p[2])*t;
  if(Math.abs(x)>w-radius)return null;
  if((f.holes||[]).some(h=>Math.abs(x-h.x)<h.w/2&&Math.abs(z-h.z)<h.d/2))return null;
  return {y:y+(f.camber||0)*(1-Math.abs(x)/w),id:f.id};
 }
 function surfaces(x,z){
  const a=[];for(const f of layout.floors){const s=floorAt(f,x,z);if(s)a.push(s);}
  for(const r of layout.ramps){const t=(z-r.z0)/(r.z1-r.z0);if(t>=0&&t<=1&&Math.abs(x-r.x)<=r.w/2-radius+.02)a.push({y:r.y0+(r.y1-r.y0)*Math.min(1,Math.ceil(t*(r.steps||12))/(r.steps||12)),id:r.id||'stairs'});}
  return a;
 }
 function ceiling(p){let c=Infinity;for(const s of surfaces(p.x,p.z))if(s.y>p.y+.22)c=Math.min(c,s.y-.10);for(const b of near(p.x,p.z)){const bottom=b.y-b.h/2;if(bottom>p.y+.4&&Math.abs(p.x-b.x)<b.w/2+radius&&Math.abs(p.z-b.z)<b.d/2+radius)c=Math.min(c,bottom);}return c;}
 function blocked(p,h){return near(p.x,p.z).some(b=>{
  if(p.y+h<=b.y-b.h/2+eps||p.y>=b.y+b.h/2-.04)return false;
  const dx=Math.max(0,Math.abs(p.x-b.x)-b.w/2),dz=Math.max(0,Math.abs(p.z-b.z)-b.d/2);
  return dx*dx+dz*dz<radius*radius;
 });}
 function support(x,z,y){return surfaces(x,z).filter(s=>s.y-y<=.28&&s.y-y>=-.40).sort((a,b)=>b.y-a.y)[0]||null;}
 function candidate(p,dx,dz,h){const x=p.x+dx,z=p.z+dz,s=support(x,z,p.y);if(!s)return null;const q={x,y:s.y,z,surface:s.id};return blocked(q,h)||ceiling(q)<q.y+h-.02?null:q;}
 function move(pos,dx,dz,height=1.7){
  if(![pos.x,pos.y,pos.z,dx,dz,height].every(Number.isFinite))return {...pos,blocked:true};
  const n=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.065));dx/=n;dz/=n;let p={...pos},hit=false;
  for(let i=0;i<n;i++){let q=candidate(p,dx,dz,height);if(!q){hit=true;const alternatives=[candidate(p,dx,0,height),candidate(p,0,dz,height)];
    const probe={x:p.x+dx,y:p.y,z:p.z+dz};
    for(const b of near(probe.x,probe.z)){
     if(p.y+height<=b.y-b.h/2+eps||p.y>=b.y+b.h/2-.04)continue;
     const cx=Math.max(b.x-b.w/2,Math.min(b.x+b.w/2,probe.x)),cz=Math.max(b.z-b.d/2,Math.min(b.z+b.d/2,probe.z));
     let nx=probe.x-cx,nz=probe.z-cz;const length=Math.hypot(nx,nz);if(length<1e-8||length>=radius)continue;
     nx/=length;nz/=length;const inward=dx*nx+dz*nz;if(inward<0)alternatives.push(candidate(p,dx-nx*inward,dz-nz*inward,height));
    }
    q=alternatives.filter(Boolean).sort((a,b)=>((b.x-p.x)*dx+(b.z-p.z)*dz)-((a.x-p.x)*dx+(a.z-p.z)*dz))[0]||null;}if(q)p=q;else break;}
  return {...p,blocked:hit};
 }
 return {surfaces,floorAt,support,blocked,ceiling,move,radius};
}

/* Extracted from World of History main d653859d273e5252350ad9247f38f28b38388c9f; adapted to ship surfaces. */
const tau=Math.PI*2;
const wrap=x=>((x%1)+1)%1;
const smooth=x=>x*x*(3-2*x);
function humanGait(phase,mode){
 const run=mode==='run',crouch=mode==='crouch-walk';
 const duty=run?.38:crouch?.68:.60,span=run?.40:crouch?.18:.35;
 const feet=[0,.5].map(offset=>{
  const u=wrap(phase+offset),stance=u<duty,t=stance?u/duty:(u-duty)/(1-duty);
  return {stance,z:stance?span*(1-2*t):-span+2*span*smooth(t),
   lift:stance?0:(run?.29:crouch?.06:.09)*Math.pow(Math.sin(Math.PI*t),1.3),
   toe:stance?(t>.65?-.28*smooth((t-.65)/.35):.12*(1-smooth(Math.min(1,t/.2)))):0};
 });
 const support=feet.filter(f=>f.stance);
 const hip=crouch?.59:support.length?Math.min(...support.map(f=>Math.sqrt(.83*.83-f.z*f.z)))+.035:
   .89+.015*Math.sin(tau*wrap(phase)*2);
 return {feet,hip,cyclesPerMeter:duty/(2*span),flight:support.length===0};
}
function solveHumanLeg(z,down){
 const radius=Math.min(.8399,Math.max(.01,Math.hypot(z,down))),knee=2*Math.acos(radius/.84);
 return {hip:Math.atan2(-z,down)-knee/2,knee};
}
function createGameAvatar(THREE){
const marker=new THREE.Group();
const markerMaterial=new THREE.MeshLambertMaterial({color:0xe5b348});
const hips=new THREE.Group();hips.name='pelvis';marker.add(hips);
function bodyPart(parent,geometry,x,y,z,material=markerMaterial){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
const jointMaterial=new THREE.MeshLambertMaterial({color:0xc58b35});
function joint(parent,name,x,y,z=0,radius=.055){
  const pivot=new THREE.Group();pivot.name=name;pivot.position.set(x,y,z);parent.add(pivot);
  bodyPart(pivot,new THREE.SphereGeometry(radius,10,8),0,0,0,jointMaterial);return pivot;
}
function cylinder(parent,length,topRadius,bottomRadius,x=0,y=-length/2,z=0){
  return bodyPart(parent,new THREE.CylinderGeometry(topRadius,bottomRadius,length,12),x,y,z);
}
const torso=joint(hips,'waist',0,0,0,.1);
cylinder(torso,.44,.19,.14,0,.23);
const neck=joint(torso,'neck',0,.48,0,.065);cylinder(neck,.08,.06,.06,0,.04);
bodyPart(neck,new THREE.SphereGeometry(.15,16,12),0,.17,0);
// A small nose makes the facing direction visible.
bodyPart(neck,new THREE.SphereGeometry(.035,8,6),0,.17,.145);
const legs=[],knees=[],ankles=[],arms=[],elbows=[],wrists=[];
for(const [side,x]of [['left',-.13],['right',.13]]){
  const hip=joint(hips,side+'Hip',x,0,0,.08);cylinder(hip,.42,.075,.06);
  const knee=joint(hip,side+'Knee',0,-.42,0,.065);cylinder(knee,.42,.06,.045);
  const ankle=joint(knee,side+'Ankle',0,-.42,0,.045);
  const foot=cylinder(ankle,.22,.035,.035,0,0,.065);foot.rotation.x=Math.PI/2;
  legs.push(hip);knees.push(knee);ankles.push(ankle);
  const shoulder=joint(torso,side+'Shoulder',x<0?-.25:.25,.43,0,.065);cylinder(shoulder,.28,.055,.045);
  const elbow=joint(shoulder,side+'Elbow',0,-.28,0,.05);cylinder(elbow,.24,.045,.035);
  const wrist=joint(elbow,side+'Wrist',0,-.24,0,.038);cylinder(wrist,.1,.035,.03);
  arms.push(shoulder);elbows.push(elbow);wrists.push(wrist);
}

let crouched=false,gaitPhase=0,gaitDistance=0,motionMode="idle",landing=0;
let wasMoving=false,sprintOn=false,jumpHeight=0,jumpVelocity=0;
const state={};let markerPoint=null,groundAt=()=>null;
function animatePlayer(dt){
 const airborne=jumpHeight>0||jumpVelocity!==0,step=Math.min(dt,.05);
 motionMode=airborne?(wasMoving?'run-jump':'jump'):
  crouched?(wasMoving?'crouch-walk':'crouch'):wasMoving?(sprintOn?'run':'walk'):'idle';
 const ease=(a,b)=>a+(b-a)*(dt>0?1-Math.exp(-18*step):1);
 const mode=crouched?'crouch-walk':sprintOn?'run':'walk';
 if(wasMoving&&!airborne)gaitPhase+=gaitDistance*humanGait(gaitPhase,mode).cyclesPerMeter;
 gaitDistance=0;landing=Math.max(0,landing-step*4);
 const gait=humanGait(gaitPhase,mode),groundHip=crouched?.59:wasMoving?gait.hip:.875;
 hips.position.y=ease(hips.position.y,(airborne?.86:groundHip)-.07*landing);
 for(let i=0;i<2;i++){
  const foot=gait.feet[i];let z=wasMoving?foot.z:0,lift=wasMoving?foot.lift:0,delta=0;
  if(state&&markerPoint&&!airborne){
    const side=i===0?-.13:.13,theta=marker.rotation.y;
    const g=groundAt(markerPoint.xM+side*Math.cos(theta)+z*Math.sin(theta),markerPoint.yM-side*Math.sin(theta)+z*Math.cos(theta));
    if(g)delta=Math.max(-.12,Math.min(.12,g.elevationM-markerPoint.elevationM));
  }
  const pose=solveHumanLeg(z,hips.position.y-.035-lift-delta);
  legs[i].rotation.x=airborne?ease(legs[i].rotation.x,-.35+(i?.18:0)):pose.hip;
  knees[i].rotation.x=airborne?ease(knees[i].rotation.x,.8):pose.knee;
  const swing=wasMoving?Math.cos((gaitPhase+i*.5)*Math.PI*2)*(sprintOn?.8:.55):0;
  arms[i].rotation.x=ease(arms[i].rotation.x,airborne?-.65:swing+(crouched?-.25:0));
  elbows[i].rotation.x=ease(elbows[i].rotation.x,airborne?-.9:wasMoving&&!crouched?(sprintOn?-1.5:-1.15):crouched?-.75:-.25);
  wrists[i].rotation.x=ease(wrists[i].rotation.x,-.05);
  ankles[i].rotation.x=ease(ankles[i].rotation.x,airborne?.15:-(legs[i].rotation.x+knees[i].rotation.x)+(wasMoving?foot.toe:0));
 }
 torso.rotation.x=ease(torso.rotation.x,crouched?.35:wasMoving?(sprintOn?.24:.12):0);
 torso.rotation.y=ease(torso.rotation.y,wasMoving?Math.sin(gaitPhase*Math.PI*2)*.065:0);
}
return {group:marker,update(dt,v){markerPoint=v.groundPos||null;groundAt=v.groundAt||(()=>null);crouched=v.crouch;wasMoving=v.moving;sprintOn=v.run;jumpHeight=v.air||0;jumpVelocity=0;gaitDistance=v.distance||0;animatePlayer(dt);},get mode(){return motionMode;}};
}

function installShipWalk(env){
 const {THREE,scene,camera,renderer,state,layout}=env;
 const nav=createShipNavigation(layout),avatar=createGameAvatar(THREE);scene.add(avatar.group);avatar.group.visible=false;
 let interiorPromise=null;let priorSails=true;let active=false,ready=false,interior=null,first=false,yaw=0,pitch=.18,air=0,vy=0,sprint=false,crouch=false,moving=false;
 let pos={x:0,y:3.2,z:5},stickId=null,lookId=null,lookLast=null;const input={x:0,y:0},keys=new Set();
 const floorNames={upper:'上部砲列甲板',lower:'下部砲列甲板',quarter:'船尾楼甲板',fore:'船首楼甲板',poop:'最上部船尾甲板',orlop:'オルロップ',hold:'船倉',head:'船首の張り出し'};
 const style=document.createElement('style');style.textContent=`
 #walkbar{position:fixed;left:max(10px,env(safe-area-inset-left));right:110px;top:max(10px,env(safe-area-inset-top));display:none;gap:6px;z-index:6;max-width:610px}#walkbar select{width:min(280px,40vw);flex:1;min-width:0;font-size:13px}#walkbar button{font-size:13px;padding:5px 8px;white-space:nowrap;flex:none}#walkStatus{position:fixed;top:62px;left:12px;font-size:12px;background:#142833d9;color:#eee;padding:6px 9px;border-radius:6px;pointer-events:none;z-index:5;display:none}#joystick{display:none;position:fixed;left:max(16px,env(safe-area-inset-left));bottom:max(16px,env(safe-area-inset-bottom));width:112px;height:112px;border:2px solid #d1ddd9aa;border-radius:50%;background:#14253699;padding:0;z-index:7;touch-action:none;place-items:center}#stick{width:44px;height:44px;background:#d7e2dbbb;border-radius:50%;pointer-events:none}#actions{display:none;position:fixed;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));gap:8px;z-index:7}#actions button{width:64px;min-height:56px;font-size:12px;padding:4px;touch-action:none}#actions .active{box-shadow:0 0 14px #e7be58;background:#b99345;color:#17252a}.walking #walkbar{display:flex}.walking #joystick{display:grid}.walking #actions{display:flex}.walking #walkStatus{display:block}.walking #brand{display:none}.walking #panel{top:66px;max-height:calc(100dvh - 210px)}
 `;document.head.append(style);
 const bar=document.createElement('div');bar.id='walkbar';bar.innerHTML='<select id="walkRoom" aria-label="船内の区画"></select><button id="walkView">一人称</button><button id="walkExit">外観へ</button>';document.body.append(bar);
 const status=document.createElement('div');status.id='walkStatus';document.body.append(status);
 const joystick=document.createElement('button');joystick.id='joystick';joystick.setAttribute('aria-label','移動スティック');joystick.innerHTML='<span id="stick"></span>';document.body.append(joystick);
 const actions=document.createElement('div');actions.id='actions';actions.innerHTML='<button id="sprint" aria-pressed="false">ダッシュ</button><button id="jump">ジャンプ</button><button id="crouch" aria-pressed="false">しゃがむ</button>';document.body.append(actions);
 const enter=document.createElement('button');enter.id='walkEnter';enter.textContent='船内を歩く';enter.style.width='100%';enter.style.marginTop='8px';document.querySelector('#panel .sub').insertAdjacentElement('afterend',enter);
 const select=document.getElementById('walkRoom');select.innerHTML='<option value="deck">甲板・中央</option>'+layout.rooms.map(r=>`<option value="${r.id}">${floorNames[r.floor]}：${r.name}</option>`).join('');
 const sprintButton=document.getElementById('sprint'),crouchButton=document.getElementById('crouch');
 function setSprint(v){sprint=!!v&&!crouch;sprintButton.classList.toggle('active',sprint);sprintButton.setAttribute('aria-pressed',String(sprint));}
 function reset(){input.x=input.y=0;keys.clear();stickId=lookId=null;lookLast=null;document.getElementById('stick').style.transform='';setSprint(false);}
 function sync(){
  if(!ready)return;const show=state.lod===0&&!state.section;interior.visible=show;
  const ship=env.getShip();if(ship){const decks=ship.getObjectByName('decks');if(decks)for(const o of decks.children)o.visible=show?false:state.section?['lower_gundeck','upper_gundeck'].includes(o.name):true;}
  if(active){env.hideReference();env.hideSea();}
 }
 async function loadInterior(){if(ready)return;if(interiorPromise)return interiorPromise;interiorPromise=(async()=>{const b=Uint8Array.from(atob(env.interiorAsset),c=>c.charCodeAt(0));const g=await new Promise((resolve,reject)=>new THREE.GLTFLoader().parse(b.buffer,'',resolve,reject));interior=g.scene;scene.add(interior);ready=true;sync();})().catch(e=>{interiorPromise=null;throw e;});return interiorPromise;}

 async function enterRoom(id='deck'){
  await loadInterior();if(state.lod!==0)await env.loadLOD(0);
  if(!active)priorSails=state.sails;state.sails=false;document.getElementById('sails').classList.remove('active');state.section=false;state.profile=false;state.auto=false;env.apply();active=true;for(const e of document.querySelectorAll('#panel select,#panel button'))e.disabled=true;reset();air=vy=0;crouch=false;crouchButton.classList.remove('active');
  const room=layout.rooms.find(r=>r.id===id);if(room)pos={...room.spawn};else {const f=layout.floors.find(f=>f.id==='upper');pos={x:0,z:5,y:nav.floorAt(f,0,5).y};}
  select.value=room?room.id:'deck';yaw=room?Math.PI:0;pitch=.15;
  document.body.classList.add('walking');document.getElementById('panel').classList.add('hidden');document.getElementById('toggle').textContent='UIを表示';sync();updateCamera();
 }
 function exit(){active=false;for(const e of document.querySelectorAll('#panel select,#panel button'))e.disabled=false;state.sails=priorSails;document.getElementById('sails').classList.toggle('active',state.sails);reset();avatar.group.visible=false;document.body.classList.remove('walking');document.getElementById('panel').classList.remove('hidden');document.getElementById('toggle').textContent='UIを隠す';state.water=true;env.apply();camera.fov=42;camera.near=.07;camera.updateProjectionMatrix();env.resetView();}
 function toggleCrouch(){if(air>.01)return;const h=nav.ceiling(pos)-pos.y;if(crouch&&h<1.72)return;crouch=!crouch;setSprint(false);crouchButton.classList.toggle('active',crouch);crouchButton.setAttribute('aria-pressed',String(crouch));}
 function jump(){if(air===0&&!crouch&&nav.ceiling(pos)-pos.y>1.76)vy=4.4;}
 for(const [id,fn]of [['sprint',()=>setSprint(!sprint)],['jump',jump],['crouch',toggleCrouch]]){
  const b=document.getElementById(id);b.addEventListener('pointerdown',e=>{e.preventDefault();fn();});b.addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();e.stopPropagation();if(!e.repeat)fn();}});
 }
 function moveStick(e){const r=joystick.getBoundingClientRect(),dx=e.clientX-r.x-r.width/2,dy=e.clientY-r.y-r.height/2,s=Math.max(38,Math.hypot(dx,dy));input.x=dx/s;input.y=dy/s;document.getElementById('stick').style.transform=`translate(${input.x*32}px,${input.y*32}px)`;}
 joystick.addEventListener('pointerdown',e=>{if(stickId!==null)return;e.preventDefault();stickId=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e);});
 joystick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,e=>{if(e.pointerId!==stickId)return;stickId=null;input.x=input.y=0;document.getElementById('stick').style.transform='';});
 const canvas=renderer.domElement;
 canvas.addEventListener('pointerdown',e=>{if(!active)return;e.stopImmediatePropagation();if(lookId!==null)return;lookId=e.pointerId;lookLast={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);},true);
 canvas.addEventListener('pointermove',e=>{if(!active)return;e.stopImmediatePropagation();if(e.pointerId!==lookId||!lookLast)return;yaw-=(e.clientX-lookLast.x)*.006;pitch=Math.max(-1.15,Math.min(1.15,pitch+(e.clientY-lookLast.y)*.005));lookLast={x:e.clientX,y:e.clientY};},true);
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(active)e.stopImmediatePropagation();if(e.pointerId===lookId){lookId=null;lookLast=null;}},true);
 canvas.addEventListener('wheel',e=>{if(active){e.preventDefault();e.stopImmediatePropagation();}}, {capture:true,passive:false});
 const movement=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyC']);
 addEventListener('keydown',e=>{if(!active||!movement.has(e.code)||e.target.tagName==='SELECT')return;e.preventDefault();if(e.code==='KeyC'){if(!e.repeat)toggleCrouch();}else if(e.code==='Space'){if(!e.repeat)jump();}else if(e.code.startsWith('Shift')){if(!e.repeat)setSprint(!sprint);}else keys.add(e.code);});
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',reset);document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 enter.onclick=()=>enterRoom().catch(env.fail);select.onchange=e=>enterRoom(e.target.value).catch(env.fail);document.getElementById('walkExit').onclick=exit;
 document.getElementById('walkView').onclick=e=>{first=!first;e.target.textContent=first?'三人称':'一人称';updateCamera();};
 const ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0);let cameraDistance=3;
 function updateCamera(){
  if(!active)return;const eye=crouch?1.20:1.57;const target=new THREE.Vector3(pos.x,pos.y+air+(first?eye:1.18),pos.z);
  if(first){camera.position.copy(target);camera.lookAt(target.clone().add(new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch))));cameraDistance=0;}
  else{
   const offset=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
   scene.updateMatrixWorld(true);const meshes=[];
   function collect(root){if(!root)return;root.traverse(o=>{if(!o.isMesh)return;let q=o;while(q){if(!q.visible||q.name==='collision_proxies')return;q=q.parent;}meshes.push(o);});}
   collect(env.getShip());collect(interior);ray.set(target,offset);ray.far=3.1;
   const hit=ray.intersectObjects(meshes,false)[0];cameraDistance=hit?Math.max(.12,Math.min(3,hit.distance-.18)):3;
   camera.position.copy(target).addScaledVector(offset,cameraDistance);camera.lookAt(target);
  }
  camera.fov=first?65:55;camera.near=.045;camera.updateProjectionMatrix();avatar.group.visible=!first&&cameraDistance>.65;
 }
 function step(dt,override){
  if(!active)return;dt=Math.max(0,Math.min(.1,dt));const ix=override?.x??input.x+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),iy=override?.y??input.y+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);
  const magnitude=Math.hypot(ix,iy),norm=Math.max(1,magnitude),speed=crouch?.65:sprint?4:1.5;
  const dx=(ix*Math.cos(yaw)+iy*Math.sin(yaw))/norm*speed*dt,dz=(-ix*Math.sin(yaw)+iy*Math.cos(yaw))/norm*speed*dt;
  const old=pos;pos=nav.move(pos,dx,dz,crouch?1.35:1.7);const dist=Math.hypot(pos.x-old.x,pos.z-old.z);moving=dist>1e-5;
  if(!magnitude)setSprint(false);if(moving)avatar.group.rotation.y=Math.atan2(pos.x-old.x,pos.z-old.z);
  if(vy||air){vy-=9.8*dt;air=Math.max(0,air+vy*dt);const max=Math.max(0,nav.ceiling(pos)-pos.y-(crouch?1.35:1.7)-.03);if(air>max){air=max;vy=Math.min(vy,0);}if(air===0)vy=0;}
  avatar.group.position.set(pos.x,pos.y+air,pos.z);avatar.update(dt,{moving,run:sprint,crouch,air,distance:dist,groundPos:{xM:pos.x,yM:pos.z,elevationM:pos.y},groundAt:(x,z)=>{const q=nav.support(x,z,pos.y);return q?{elevationM:q.y}:null;}});
  const room=layout.rooms.find(r=>r.floor===pos.surface&&pos.x>=r.x0&&pos.x<=r.x1&&pos.z>=r.z0&&pos.z<=r.z1);
  status.textContent=(room?room.name:floorNames[pos.surface]||'階段')+' · '+(crouch?'しゃがみ':sprint?'走行':moving?'歩行':'停止')+' · '+(dt?dist/dt*3.6:0).toFixed(1)+' km/h';updateCamera();
 }
 return {get active(){return active;},get ready(){return ready;},get pos(){return {...pos};},get interior(){return interior;},get first(){return first;},get input(){return {...input};},get cameraDistance(){return cameraDistance;},get mode(){return avatar.mode;},nav,layout,avatar,prepare:loadInterior,enterRoom,exit,step,sync,setSprint,toggleCrouch,jump,reset};
}
