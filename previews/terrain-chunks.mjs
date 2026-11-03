import {createTerrainWorkQueue} from '../src/geography/terrain-work-queue.mjs';
import {createWorldTerrain} from '../src/geography/world-terrain.mjs';
import {selectTerrainLOD,skirtGeometry} from '../src/geography/terrain-lod.mjs';
import {createChunkWindow} from '../src/geography/chunk-window.mjs';
import {createTerrainChunk} from '../src/geography/terrain-chunk.mjs';
import {humanGait,solveHumanLeg} from '../src/player/human-gait.mjs';
import {stepTerrainWalker} from '../src/player/terrain-walker.mjs';

const THREE=globalThis.THREE;
if(!THREE)throw new Error('描画ライブラリを読み込めませんでした。通信を確認してください。');
const status=document.getElementById('status'),generateButton=document.getElementById('generate');
document.getElementById('settings').open=!matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0xa8c8dc);scene.fog=new THREE.Fog(0xa8c8dc,1300,2100);
scene.add(new THREE.HemisphereLight(0xd8efff,0x4b5930,.9));
const light=new THREE.DirectionalLight(0xffffff,.8);light.position.set(-20,50,-10);scene.add(light);
const camera=new THREE.PerspectiveCamera(55,1,.1,3000);
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
let crouched=false,gaitPhase=0,gaitDistance=0,motionMode='idle',landing=0;
function animatePlayer(dt){
 const airborne=jumpHeight>0||jumpVelocity!==0,step=Math.min(dt,.05);
 motionMode=airborne?(wasMoving?(sprintOn?'run-jump':'walk-jump'):'jump'):
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
  const swing=wasMoving?Math.cos((gaitPhase+i*.5)*Math.PI*2)*(sprintOn?.65:.30):0;
  arms[i].rotation.x=ease(arms[i].rotation.x,airborne?-.65:swing+(crouched?-.25:0));
  elbows[i].rotation.x=ease(elbows[i].rotation.x,airborne?-.9:sprintOn&&wasMoving?-1.35:crouched?-.75:-.25);
  wrists[i].rotation.x=ease(wrists[i].rotation.x,-.05);
  ankles[i].rotation.x=ease(ankles[i].rotation.x,airborne?.15:-(legs[i].rotation.x+knees[i].rotation.x)+(wasMoving?foot.toe:0));
 }
 torso.rotation.x=ease(torso.rotation.x,crouched?.35:wasMoving?(sprintOn?.16:.04):0);
 torso.rotation.y=ease(torso.rotation.y,wasMoving?Math.sin(gaitPhase*Math.PI*2)*.065:0);
}
scene.add(marker);
let state=null,worker=null,requestId=0,yaw=.7,pitch=.4;
let markerPoint=null,overview=false;
let jumpHeight=0,jumpVelocity=0;
const overviewView={yaw:.7,pitch:1.35,target:new THREE.Vector3()};
function draw(){renderer.render(scene,camera);}
function updateCamera(){
  const r=overview?Number(document.getElementById('distance').value):4,target=overview?overviewView.target.clone():marker.position.clone();if(!overview)target.y+=1.2;
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
  if(state){state.clearing=true;state.window.clear();state.work.clear();for(const entry of state.fallback.values())releaseMesh(entry);}
  state=null;marker.visible=false;
}
function groundAt(xM,yM){
  if(!state)return null;
  for(const {chunk}of state.entries){const p=chunk.sampleGround(xM,yM);if(p)return p;}
  return null;
}
function placeMarker(xM,yM,render=true){
  if(!state||xM<0||yM<0||xM>state.terrain.widthM||yM>state.terrain.heightM)return;
  refreshChunks(xM,yM);
  const p=groundAt(xM,yM);if(!p)return;
  markerPoint={xM,yM,elevationM:p.elevationM};
  const q=state.terrain.toLocal(xM,yM,p.elevationM,state.origin);
  marker.position.set(q.x,q.y+jumpHeight,q.z);marker.visible=true;
  status.textContent=`${state.label}｜標高 ${p.elevationM.toFixed(2)}m・斜面 ${p.slopeDegrees.toFixed(1)}°｜${state.entries.length}近景・${state.far.size}遠景チャンク`;
  if(render)updateCamera();
}
function releaseMesh({mesh}){scene.remove(mesh);mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();});mesh.material.dispose();}
function makeTerrainMesh(chunk,far=false){
 const skirt=skirtGeometry(chunk),count=chunk.positions.length/3,positions=new Float32Array(chunk.positions.length+skirt.positions.length);
 positions.set(chunk.positions);positions.set(skirt.positions,chunk.positions.length);
 const indices=new Uint16Array(chunk.indices.length+skirt.indices.length);indices.set(chunk.indices);indices.set(skirt.indices.map(i=>i+count),chunk.indices.length);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
 // Preserve consistent terrain normals; skirts have their own vertices.
 geometry.attributes.normal.array.set(chunk.normals);
 const material=new THREE.MeshLambertMaterial({color:0x72945b,side:THREE.DoubleSide,wireframe:document.getElementById('wire').checked});
  const hole={value:new THREE.Vector4(0,0,0,0)};
 if(far){material.onBeforeCompile=shader=>{
   shader.uniforms.nearHole=hole;
   shader.vertexShader='varying vec2 terrainXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n terrainXZ=position.xz;');
   shader.fragmentShader='uniform vec4 nearHole; varying vec2 terrainXZ;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n if(terrainXZ.x>=nearHole.x&&terrainXZ.x<nearHole.z&&terrainXZ.y>=nearHole.y&&terrainXZ.y<nearHole.w)discard;');
  };material.customProgramCacheKey=()=> 'terrain-near-hole-v1';}
 const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);return {chunk,mesh,hole};
}
function sampleDisplayed(entry,x,y){
 const {chunk,mesh}=entry,p=chunk.sampleGround(x,y);if(!p)return null;
 const indices=chunk.indices,positions=mesh.geometry.attributes.position.array,offset=p.triangleIndex*3;
 const a=indices[offset]*3,b=indices[offset+1]*3,c=indices[offset+2]*3;
 const px=x-chunk.originM.xM,py=y-chunk.originM.yM;
 const denominator=(positions[b+2]-positions[c+2])*(positions[a]-positions[c])+(positions[c]-positions[b])*(positions[a+2]-positions[c+2]);
 const u=((positions[b+2]-positions[c+2])*(px-positions[c])+(positions[c]-positions[b])*(py-positions[c+2]))/denominator;
 const v=((positions[c+2]-positions[a+2])*(px-positions[c])+(positions[a]-positions[c])*(py-positions[c+2]))/denominator;
 return chunk.originM.elevationM+u*positions[a+1]+v*positions[b+1]+(1-u-v)*positions[c+1];
}
function prepareMorph(entry,sources){
 const {chunk,mesh}=entry,target=mesh.geometry.attributes.position.array.slice(),from=target.slice();
 for(let i=0;i<from.length;i+=3){
  const x=chunk.originM.xM+target[i],y=chunk.originM.yM+target[i+2];let previous=null;
  for(const source of sources){previous=sampleDisplayed(source,x,y);if(previous!==null)break;}
  if(previous!==null){const surface=chunk.sampleGround(x,y).elevationM;from[i+1]+=previous-surface;}
 }
 mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox.clone();
 mesh.geometry.attributes.position.array.set(from);mesh.geometry.computeBoundingBox();mesh.geometry.boundingBox.union(bounds);mesh.geometry.boundingSphere=new THREE.Sphere();mesh.geometry.boundingBox.getBoundingSphere(mesh.geometry.boundingSphere);
 entry.morph={from,target,elapsed:0};mesh.visible=false;
}
function positionTerrain(entry){const q=state.terrain.toLocal(entry.chunk.originM.xM,entry.chunk.originM.yM,entry.chunk.originM.elevationM,state.origin);entry.mesh.position.set(q.x,q.y,q.z);}
function setNearHole(entry){
 const c=state.nearCenter,x=entry.chunk.originM.xM,y=entry.chunk.originM.yM;
 entry.hole.value.set((c.x-1)*64-x,(c.y-1)*64-y,(c.x+2)*64-x,(c.y+2)*64-y);
}
function refreshChunks(xM,yM){
 const previousNear=[...state.entries,...state.fallback.values()];
 state.window.update(xM,yM);
 for(const e of state.entries){const key=e.chunk.tileX+','+e.chunk.tileY;if(state.fallback.has(key)){releaseMesh(state.fallback.get(key));state.fallback.delete(key);}}
 const cx=Math.floor(xM/64),cy=Math.floor(yM/64),lodKey=cx+','+cy;
 state.nearCenter={x:cx,y:cy};
 if(state.lodKey!==lodKey){
  state.morphSources=[...previousNear,...state.entries,...state.far.values()];
  const plan=selectTerrainLOD(state.terrain,xM,yM);
  plan.sort((a,b)=>Math.hypot((a.tileX+.5)*a.sizeM-xM,(a.tileY+.5)*a.sizeM-yM)-Math.hypot((b.tileX+.5)*b.sizeM-xM,(b.tileY+.5)*b.sizeM-yM));
  state.work.request(plan);state.lodKey=lodKey;
 }
 for(const entry of state.far.values())setNearHole(entry);
 const old=state.origin;
 if(Math.hypot(xM-old.xM,yM-old.yM)>512){
  const origin={xM:Math.floor(xM/64)*64,yM:Math.floor(yM/64)*64,elevationM:state.terrain.sampleBase(xM,yM).baseElevationM};
  overviewView.target.x-=origin.xM-old.xM;overviewView.target.z-=origin.yM-old.yM;overviewView.target.y-=origin.elevationM-old.elevationM;
  state.origin=origin;
 }
 for(const {chunk,mesh}of [...state.entries,...state.far.values(),...state.fallback.values()]){const q=state.terrain.toLocal(chunk.originM.xM,chunk.originM.yM,chunk.originM.elevationM,state.origin);mesh.position.set(q.x,q.y,q.z);}
 scene.updateMatrixWorld(true);
}
function showWorld(world,point,label){
  clearTerrain();
  const terrain=createWorldTerrain(world),p=terrain.sampleBase(point.xM,point.yM);
  const origin={...point,elevationM:p.baseElevationM};
  const window=createChunkWindow(terrain,(tx,ty)=>{
    const chunk=createTerrainChunk(terrain,{tileX:tx,tileY:ty});if(!chunk)return null;
    return makeTerrainMesh(chunk);
  },entry=>{if(state&&!state.clearing){const key=entry.chunk.tileX+','+entry.chunk.tileY;if(state.fallback.has(key))releaseMesh(state.fallback.get(key));state.fallback.set(key,entry);}else releaseMesh(entry);});
  state={terrain,origin,window,far:new Map(),fallback:new Map(),clearing:false,lodKey:'',nearCenter:{x:0,y:0},settle:.6,drawDirty:false,morphSources:[],lastJobs:0,get entries(){return window.entries;},label};
  state.work=createTerrainWorkQueue({build:q=>{
   const entry=makeTerrainMesh(createTerrainChunk(terrain,q),true);prepareMorph(entry,state.morphSources);positionTerrain(entry);setNearHole(entry);return entry;
  },release:releaseMesh,commit:(next)=>{
   state.drawDirty=true;state.far=next;for(const entry of next.values()){entry.mesh.visible=true;positionTerrain(entry);setNearHole(entry);}
   for(const entry of state.fallback.values())releaseMesh(entry);state.fallback.clear();state.morphSources=[];
  }});
  if(overview)overviewView.target.set(0,1.2,0);
  placeMarker(point.xM,point.yM);
  if(matchMedia('(orientation: landscape) and (max-height: 500px)').matches)document.getElementById('settings').open=false;
}
function cancelGeneration(){requestId++;if(worker){worker.terminate();worker=null;}generateButton.disabled=false;}
function showFixture(){
  cancelGeneration();
  const width=129,height=129,n=width*height;
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
function toggleCrouch(){if(overview||jumpHeight>0||jumpVelocity!==0)return;crouched=!crouched;state.settle=.6;setSprint(false);crouchButton.classList.toggle('active',crouched);crouchButton.setAttribute('aria-pressed',String(crouched));}
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
      if(wasMoving){gaitDistance+=Math.hypot(dx,dy);{const target=Math.atan2(dx,dy),delta=Math.atan2(Math.sin(target-marker.rotation.y),Math.cos(target-marker.rotation.y));marker.rotation.y+=delta*(1-Math.exp(-18*Math.min(dt,.05)));}placeMarker(next.xM,next.yM,false);}
      document.getElementById('movementNotice').textContent=next.blocked?'ここから先は範囲外、または急な地形です':'';
    }else{if(wasMoving)setSprint(false);wasMoving=false;document.getElementById('movementNotice').textContent='';}
  }
  if(state&&markerPoint&&!overview&&!document.hidden&&(jumpVelocity!==0||jumpHeight>0)){
    const step=Math.min(dt,.05);jumpHeight+=jumpVelocity*step-4.905*step*step;jumpVelocity-=9.81*step;
    if(jumpHeight<=0){jumpHeight=0;jumpVelocity=0;landing=1;}
    marker.position.y=markerPoint.elevationM-state.origin.elevationM+jumpHeight;
  }
  if(state&&!document.hidden){
    state.lastJobs=state.work.tick(3,2);let terrainChanged=state.drawDirty;state.drawDirty=false;
    for(const entry of state.far.values())if(entry.morph){
      terrainChanged=true;
      const m=entry.morph;m.elapsed+=Math.min(dt,.05);const t=Math.min(1,m.elapsed/.35),blend=t*t*(3-2*t),positions=entry.mesh.geometry.attributes.position;
      for(let i=1;i<m.target.length;i+=3)positions.array[i]=m.from[i]+(m.target[i]-m.from[i])*blend;
      positions.needsUpdate=true;if(t===1)entry.morph=null;
    }
    if(wasMoving||jumpHeight>0||jumpVelocity!==0)state.settle=.6;
    const animate=!overview&&state.settle>0;state.settle=Math.max(0,state.settle-Math.min(dt,.05));
    if(animate)animatePlayer(dt);
    if(animate||terrainChanged)updateCamera();
  }
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
  if(state)for(const {mesh}of [...state.entries,...state.far.values()]){mesh.material.wireframe=e.target.checked;}draw();
};
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
// The preview's diagnostic state supports inspection of the rendered ground surface.
globalThis.__chunkPreview={get character(){return marker;},get camera(){return camera;},get motion(){return {mode:motionMode,leg:legs[0].rotation.x,hip:hips.position.y};},get air(){return {height:jumpHeight,velocity:jumpVelocity};},get view(){return {overview,yaw,pitch,target:overviewView.target.toArray()};},get state(){return state;},get markerPoint(){return markerPoint;},groundAt,placeMarker};
animatePlayer(0);resize();showFixture();
