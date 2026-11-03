import {createWorldTerrain} from '../src/geography/world-terrain.mjs';
import {createTerrainChunk} from '../src/geography/terrain-chunk.mjs';
import {stepTerrainWalker} from '../src/player/terrain-walker.mjs';

const THREE=globalThis.THREE;
if(!THREE)throw new Error('描画ライブラリを読み込めませんでした。通信を確認してください。');
const status=document.getElementById('status'),generateButton=document.getElementById('generate');
document.getElementById('settings').open=!matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0xa8c8dc);
scene.add(new THREE.HemisphereLight(0xd8efff,0x4b5930,.9));
const light=new THREE.DirectionalLight(0xffffff,.8);light.position.set(-20,50,-10);scene.add(light);
const camera=new THREE.PerspectiveCamera(55,1,.1,1200);
const raycaster=new THREE.Raycaster();
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
cylinder(torso,.52,.2,.14,0,.3);
const neck=joint(torso,'neck',0,.61,0,.065);cylinder(neck,.08,.06,.06,0,.04);
bodyPart(neck,new THREE.SphereGeometry(.17,16,12),0,.19,0);
// A small nose makes the facing direction visible.
bodyPart(neck,new THREE.SphereGeometry(.045,8,6),0,.19,.16);
const legs=[],knees=[],ankles=[],arms=[],elbows=[],wrists=[];
for(const [side,x]of [['left',-.13],['right',.13]]){
  const hip=joint(hips,side+'Hip',x,0,0,.08);cylinder(hip,.35,.075,.06);
  const knee=joint(hip,side+'Knee',0,-.35,0,.065);cylinder(knee,.35,.06,.045);
  const ankle=joint(knee,side+'Ankle',0,-.35,0,.045);
  const foot=cylinder(ankle,.22,.035,.035,0,0,.065);foot.rotation.x=Math.PI/2;
  legs.push(hip);knees.push(knee);ankles.push(ankle);
  const shoulder=joint(torso,side+'Shoulder',x<0?-.25:.25,.52,0,.065);cylinder(shoulder,.28,.055,.045);
  const elbow=joint(shoulder,side+'Elbow',0,-.28,0,.05);cylinder(elbow,.24,.045,.035);
  const wrist=joint(elbow,side+'Wrist',0,-.24,0,.038);cylinder(wrist,.1,.035,.03);
  arms.push(shoulder);elbows.push(elbow);wrists.push(wrist);
}
let crouched=false,gaitPhase=0,motionMode='idle';
function animatePlayer(dt){
  const airborne=jumpHeight>0||jumpVelocity!==0;
  motionMode=airborne?(wasMoving?(sprintOn?'run-jump':'walk-jump'):'jump'):
    crouched?(wasMoving?'crouch-walk':'crouch'):wasMoving?(sprintOn?'run':'walk'):'idle';
  const blend=dt>0?1-Math.exp(-16*Math.min(dt,.05)):1;
  const ease=(current,target)=>current+(target-current)*blend;
  if(wasMoving&&!airborne)gaitPhase+=Math.min(dt,.05)*(crouched?5:sprintOn?13:8);
  const stride=wasMoving?Math.sin(gaitPhase)*(crouched?.22:sprintOn?.75:.42):0;
  for(let i=0;i<2;i++){
    const wave=i===0?stride:-stride;
    legs[i].rotation.x=ease(legs[i].rotation.x,airborne?-.45+(i?.15:0):(crouched?-.85:0)+wave);
    knees[i].rotation.x=ease(knees[i].rotation.x,airborne?.9:crouched?1.5:Math.max(0,-wave)*.9);
    arms[i].rotation.x=ease(arms[i].rotation.x,airborne?-1.1:-wave*.9+(crouched?-.45:0));
    elbows[i].rotation.x=ease(elbows[i].rotation.x,airborne?-1:crouched?-.7:sprintOn&&wasMoving?-1.3:-.18);
    wrists[i].rotation.x=ease(wrists[i].rotation.x,airborne?-.15:0);
    // Counter-rotate the ankle so the cylindrical foot stays level.
    ankles[i].rotation.x=airborne?.1:-(legs[i].rotation.x+knees[i].rotation.x);
  }
  hips.position.y=airborne?.735:Math.max(...legs.map((leg,i)=>.35*Math.cos(leg.rotation.x)+.35*Math.cos(leg.rotation.x+knees[i].rotation.x)))+.035;
  torso.rotation.x=ease(torso.rotation.x,crouched?.3:sprintOn&&wasMoving?.12:0);
}
scene.add(marker);
let state=null,worker=null,requestId=0,yaw=.7,pitch=.4;
let markerPoint=null,overview=false;
let jumpHeight=0,jumpVelocity=0;
const overviewView={yaw:.7,pitch:1.35,target:new THREE.Vector3()};
function draw(){renderer.render(scene,camera);}
function updateCamera(){
  const r=overview?Number(document.getElementById('distance').value):12,target=overview?overviewView.target.clone():marker.position.clone();if(!overview)target.y+=1.2;
  const angle=overview?overviewView.pitch:pitch,viewYaw=overview?overviewView.yaw:yaw;
  const offset=new THREE.Vector3(r*Math.cos(angle)*Math.sin(viewYaw),r*Math.sin(angle),r*Math.cos(angle)*Math.cos(viewYaw));
  // Pull in along the viewing segment when terrain obscures the player.
  if(state){
    scene.updateMatrixWorld(true);
    raycaster.set(target,offset.clone().normalize());raycaster.far=r+.4;
    const hit=raycaster.intersectObjects(state.entries.map(e=>e.mesh))[0];
    if(hit)offset.setLength(Math.max(.5,hit.distance-.4));
    raycaster.far=Infinity;
  }
  camera.position.copy(target).add(offset);
  if(state){const ground=groundAt(camera.position.x+state.origin.xM,camera.position.z+state.origin.yM);
    if(ground)camera.position.y=Math.max(camera.position.y,ground.elevationM-state.origin.elevationM+.4);}
  camera.lookAt(target);draw();
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();updateCamera();}
function clearTerrain(){
  resetInput();crouched=false;crouchButton.classList.remove('active');crouchButton.setAttribute('aria-pressed','false');markerPoint=null;jumpHeight=0;jumpVelocity=0;
  if(state)for(const {mesh}of state.entries){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  state=null;marker.visible=false;
}
function groundAt(xM,yM){
  if(!state)return null;
  for(const {chunk}of state.entries){const p=chunk.sampleGround(xM,yM);if(p)return p;}
  return null;
}
function placeMarker(xM,yM,render=true){
  const p=groundAt(xM,yM);if(!p)return;
  markerPoint={xM,yM,elevationM:p.elevationM};
  const q=state.terrain.toLocal(xM,yM,p.elevationM,state.origin);
  marker.position.set(q.x,q.y+jumpHeight,q.z);marker.visible=true;
  status.textContent=`${state.label}｜標高 ${p.elevationM.toFixed(2)}m・斜面 ${p.slopeDegrees.toFixed(1)}°｜${state.entries.length}チャンク`;
  if(render)updateCamera();
}
function showWorld(world,point,label){
  clearTerrain();
  const terrain=createWorldTerrain(world),p=terrain.sampleBase(point.xM,point.yM);
  const origin={...point,elevationM:p.baseElevationM},entries=[];
  const cx=Math.floor(point.xM/64),cy=Math.floor(point.yM/64);
  for(let ty=Math.max(0,cy-1);ty<=cy+1;ty++)for(let tx=Math.max(0,cx-1);tx<=cx+1;tx++){
    const chunk=createTerrainChunk(terrain,{tileX:tx,tileY:ty});if(!chunk)continue;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(chunk.positions,3));
    geometry.setAttribute('normal',new THREE.BufferAttribute(chunk.normals,3));
    geometry.setIndex(new THREE.BufferAttribute(chunk.indices,1));
    const material=new THREE.MeshLambertMaterial({color:((tx+ty)%2)?0x789c5f:0x72945b,
      wireframe:document.getElementById('wire').checked});
    const mesh=new THREE.Mesh(geometry,material),o=terrain.toLocal(chunk.originM.xM,chunk.originM.yM,chunk.originM.elevationM,origin);
    mesh.position.set(o.x,o.y,o.z);scene.add(mesh);entries.push({chunk,mesh});
  }
  state={terrain,origin,entries,label};if(overview){overviewView.target.set(0,1.2,0);}scene.updateMatrixWorld(true);placeMarker(point.xM,point.yM);
  if(matchMedia('(orientation: landscape) and (max-height: 500px)').matches)document.getElementById('settings').open=false;
}
function cancelGeneration(){requestId++;if(worker){worker.terminate();worker=null;}generateButton.disabled=false;}
function showFixture(){
  cancelGeneration();
  const width=17,height=17,n=width*height;
  const world={stats:{width,height},geology:{kmPerBlock:.016},elev:new Float32Array(n),
    type:new Uint8Array(n).fill(1),water:new Uint8Array(n),biome:new Uint8Array(n).fill(4)};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)world.elev[y*width+x]=100+x*.4+y*.2+2*Math.sin(x*.7)*Math.cos(y*.6);
  showWorld(world,{xM:128,yM:128},'固定テスト地形');
}
function findDryPoint(terrain,world){
  const width=terrain.width,height=terrain.height;
  for(let y=4;y<height-4;y+=8)for(let x=4;x<width-4;x+=8){
    let dry=true;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const i=(y+dy)*width+x+dx;if(!world.type[i]||world.water[i])dry=false;
    }
    if(!dry)continue;
    const point=terrain.gridToMeters(x,y),p=terrain.sampleBase(point.xM,point.yM);
    if(p.baseElevationM>10 && p.baseElevationM<1800 && p.slopeDegrees<15)return point;
  }
  throw new Error('検証用の乾いた地点が見つかりません。別のSeedを試してください。');
}
async function generateWorld(){
  const seed=Number(document.getElementById('seed').value);
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff){status.textContent='Seedは0〜4294967295の整数を指定してください。';return;}
  document.getElementById('settings').open=true;
  cancelGeneration();const id=requestId;
  clearTerrain();draw();generateButton.disabled=true;status.textContent='既存世界を生成中…';
  let workerUrl=null;
  try{
    let source;
    const embedded=document.getElementById('embedded-geography');
    if(embedded){source=JSON.parse(embedded.textContent);}
    else{
      const response=await fetch('../自然地理生成器.html');if(!response.ok)throw new Error('基準HTMLを読み込めません');
      const doc=new DOMParser().parseFromString(await response.text(),'text/html');
      if(id!==requestId)return;
      source=['generator-src','fauna-src'].map(key=>{
        const node=doc.getElementById(key);if(!node)throw new Error('生成器の構成が変わっています');return node.textContent;
      }).join('\n');
    }
    workerUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    worker=new Worker(workerUrl);URL.revokeObjectURL(workerUrl);workerUrl=null;
    worker.onerror=e=>{if(id!==requestId)return;status.textContent='生成エラー: '+e.message;cancelGeneration();};
    worker.onmessage=({data:m})=>{
      if(id!==requestId||m.id!==id)return;
      if(m.kind==='progress'){status.textContent='既存世界を生成中… '+m.stage;return;}
      if(m.kind==='error'){status.textContent='生成エラー: '+m.message;cancelGeneration();return;}
      cancelGeneration();
      try{const terrain=createWorldTerrain(m);showWorld(m,findDryPoint(terrain,m),`既存世界 Seed ${seed}`);}
      catch(e){status.textContent='エラー: '+e.message;}
    };
    worker.postMessage({id,seed});
  }catch(e){if(id===requestId){status.textContent='エラー: '+e.message;cancelGeneration();}}
  finally{if(workerUrl)URL.revokeObjectURL(workerUrl);}
}
let drag=null,stickId=null,sprintOn=false,wasMoving=false;
const keys=new Set(),stickInput={x:0,y:0};
const joystick=document.getElementById('joystick'),stick=document.getElementById('stick'),sprint=document.getElementById('sprint');
function resetInput(){
  keys.clear();drag=null;stickId=null;setSprint(false);wasMoving=false;stickInput.x=stickInput.y=0;
  stick.style.transform='';sprint.classList.remove('active');
}
function moveStick(e){
  const box=joystick.getBoundingClientRect(),dx=e.clientX-box.x-box.width/2,dy=e.clientY-box.y-box.height/2;
  const scale=Math.max(38,Math.hypot(dx,dy));stickInput.x=dx/scale;stickInput.y=dy/scale;
  stick.style.transform=`translate(${stickInput.x*32}px,${stickInput.y*32}px)`;
}
joystick.addEventListener('pointerdown',e=>{if(stickId!==null)return;e.preventDefault();stickId=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e);});
joystick.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,e=>{
  if(e.pointerId!==stickId)return;stickId=null;stickInput.x=stickInput.y=0;stick.style.transform='';
});
function setSprint(value){
  if(value&&crouched){crouched=false;crouchButton.classList.remove('active');crouchButton.setAttribute('aria-pressed','false');}
  sprintOn=!overview&&value;sprint.classList.toggle('active',sprintOn);sprint.setAttribute('aria-pressed',String(sprintOn));
}
function pressAction(button,action){
  button.addEventListener('pointerdown',e=>{if(e.button>0)return;e.preventDefault();action();});
  button.addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();e.stopPropagation();if(!e.repeat)action();}});
}
pressAction(sprint,()=>setSprint(!sprintOn));
const jumpButton=document.getElementById('jump'),crouchButton=document.getElementById('crouch');
function toggleCrouch(){if(overview||jumpHeight>0||jumpVelocity!==0)return;crouched=!crouched;setSprint(false);crouchButton.classList.toggle('active',crouched);crouchButton.setAttribute('aria-pressed',String(crouched));}
pressAction(crouchButton,toggleCrouch);
function startJump(){if(!overview&&state&&!crouched&&jumpHeight===0&&jumpVelocity===0)jumpVelocity=5;}
pressAction(jumpButton,startJump);
document.getElementById('uiToggle').onclick=()=>{
  const hidden=document.body.classList.toggle('ui-hidden');resetInput();
  document.getElementById('uiToggle').textContent=hidden?'UIを表示':'UIを隠す';
  document.getElementById('uiToggle').setAttribute('aria-pressed',String(hidden));
};
const movementKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyC']);
window.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;
  if(movementKeys.has(e.code)){e.preventDefault();if(e.code==='KeyC'){if(!e.repeat)toggleCrouch();}else if(e.code==='Space'){if(!e.repeat)startJump();}else if(e.code.startsWith('Shift')&&!e.repeat)setSprint(!sprintOn);else keys.add(e.code);}});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',resetInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetInput();});
document.getElementById('viewMode').onclick=()=>{overview=!overview;resetInput();jumpHeight=0;jumpVelocity=0;if(markerPoint)marker.position.y=markerPoint.elevationM-state.origin.elevationM;if(overview){overviewView.target.copy(marker.position);overviewView.target.y+=1.2;}
  document.getElementById('overviewDistance').hidden=!overview;document.getElementById('actions').hidden=overview;joystick.setAttribute('aria-label',overview?'俯瞰カメラ移動':'移動スティック');document.getElementById('viewMode').textContent=overview?'三人称に戻る':'周辺を俯瞰';updateCamera();};
let lastTime=null;
function frame(time){
  const dt=lastTime===null?0:(time-lastTime)/1000;lastTime=time;
  if(state&&markerPoint&&!document.hidden){
    const x=stickInput.x+Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    const y=stickInput.y+Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    if(overview){
      if(Math.hypot(x,y)>.08){
        const scale=Math.min(dt,.05)*Number(document.getElementById('distance').value)*.4/Math.max(1,Math.hypot(x,y));
        overviewView.target.x+=(x*Math.cos(overviewView.yaw)+y*Math.sin(overviewView.yaw))*scale;
        overviewView.target.z+=(-x*Math.sin(overviewView.yaw)+y*Math.cos(overviewView.yaw))*scale;updateCamera();
      }
    }else if(Math.hypot(x,y)>.08){
      const next=stepTerrainWalker(markerPoint,{x,y,yaw,sprint:sprintOn,crouch:crouched},dt,groundAt);
      const dx=next.xM-markerPoint.xM,dy=next.yM-markerPoint.yM;
      wasMoving=Math.hypot(dx,dy)>0;if(!wasMoving)setSprint(false);
      if(wasMoving){marker.rotation.y=Math.atan2(dx,dy);placeMarker(next.xM,next.yM,false);}
      document.getElementById('movementNotice').textContent=next.blocked?'ここから先は範囲外、または急な地形です':'';
    }else{if(wasMoving)setSprint(false);wasMoving=false;document.getElementById('movementNotice').textContent='';}
  }
  if(state&&markerPoint&&!overview&&!document.hidden&&(jumpVelocity!==0||jumpHeight>0)){
    const step=Math.min(dt,.05);jumpHeight+=jumpVelocity*step-4.905*step*step;jumpVelocity-=9.81*step;
    if(jumpHeight<=0){jumpHeight=0;jumpVelocity=0;}
    marker.position.y=markerPoint.elevationM-state.origin.elevationM+jumpHeight;
  }
  if(state&&!document.hidden&&!overview){animatePlayer(dt);updateCamera();}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
renderer.domElement.addEventListener('pointerdown',e=>{
  if(drag||e.button>0||(e.pointerType==='touch'&&e.clientX<innerWidth/2))return;renderer.domElement.setPointerCapture(e.pointerId);
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  if(overview){overviewView.yaw-=(e.clientX-drag.x)*.006;overviewView.pitch=Math.max(.2,Math.min(1.5,overviewView.pitch+(e.clientY-drag.y)*.005));}
  else{yaw-=(e.clientX-drag.x)*.006;pitch=Math.max(.15,Math.min(1.4,pitch+(e.clientY-drag.y)*.005));}
  drag.x=e.clientX;drag.y=e.clientY;updateCamera();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,e=>{if(drag?.id===e.pointerId)drag=null;});
document.getElementById('fixture').onclick=showFixture;
generateButton.onclick=generateWorld;
document.getElementById('distance').oninput=updateCamera;
document.getElementById('wire').onchange=e=>{
  if(state)for(const {mesh}of state.entries){mesh.material.wireframe=e.target.checked;}draw();
};
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
// The preview's diagnostic state supports inspection of the rendered ground surface.
globalThis.__chunkPreview={get character(){return marker;},get motion(){return {mode:motionMode,leg:legs[0].rotation.x,hip:hips.position.y};},get air(){return {height:jumpHeight,velocity:jumpVelocity};},get view(){return {overview,yaw,pitch,target:overviewView.target.toArray()};},get state(){return state;},get markerPoint(){return markerPoint;},groundAt,placeMarker};
animatePlayer(0);resize();showFixture();
