import {createWorldTerrain} from '../src/geography/world-terrain.mjs';
import {createTerrainChunk} from '../src/geography/terrain-chunk.mjs';

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
function part(geometry,x,y,z){const m=new THREE.Mesh(geometry,markerMaterial);m.position.set(x,y,z);marker.add(m);}
part(new THREE.SphereGeometry(.17,12,8),0,1.53,0);
part(new THREE.BoxGeometry(.45,.65,.24),0,1.05,0);
part(new THREE.BoxGeometry(.16,.7,.18),-.13,.35,0);
part(new THREE.BoxGeometry(.16,.7,.18),.13,.35,0);
scene.add(marker);
let state=null,worker=null,requestId=0,yaw=.7,pitch=.4;
let markerPoint=null;
function draw(){renderer.render(scene,camera);}
function updateCamera(){
  const r=Number(document.getElementById('distance').value),target=marker.position.clone();target.y+=1;
  camera.position.set(target.x+r*Math.cos(pitch)*Math.sin(yaw),target.y+r*Math.sin(pitch),target.z+r*Math.cos(pitch)*Math.cos(yaw));
  camera.lookAt(target);draw();
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();updateCamera();}
function clearTerrain(){
  if(state)for(const {mesh}of state.entries){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
  state=null;marker.visible=false;
}
function groundAt(xM,yM){
  if(!state)return null;
  for(const {chunk}of state.entries){const p=chunk.sampleGround(xM,yM);if(p)return p;}
  return null;
}
function placeMarker(xM,yM){
  const p=groundAt(xM,yM);if(!p)return;
  markerPoint={xM,yM};
  const q=state.terrain.toLocal(xM,yM,p.elevationM,state.origin);
  marker.position.set(q.x,q.y,q.z);marker.visible=true;
  status.textContent=`${state.label}｜標高 ${p.elevationM.toFixed(2)}m・斜面 ${p.slopeDegrees.toFixed(1)}°｜${state.entries.length}チャンク`;
  updateCamera();
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
  state={terrain,origin,entries,label};scene.updateMatrixWorld(true);placeMarker(point.xM,point.yM);
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
  if(matchMedia('(orientation: landscape) and (max-height: 500px)').matches)document.getElementById('settings').open=false;
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
let drag=null;
renderer.domElement.addEventListener('pointerdown',e=>{
  if(drag)return;renderer.domElement.setPointerCapture(e.pointerId);
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};
});
renderer.domElement.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  yaw-=(e.clientX-drag.x)*.006;pitch=Math.max(.15,Math.min(1.4,pitch+(e.clientY-drag.y)*.005));
  drag.x=e.clientX;drag.y=e.clientY;updateCamera();
});
renderer.domElement.addEventListener('pointerup',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const tap=Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6;drag=null;
  if(!tap||!state)return;
  const r=renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);
  const hit=raycaster.intersectObjects(state.entries.map(e=>e.mesh))[0];
  if(hit)placeMarker(hit.point.x+state.origin.xM,hit.point.z+state.origin.yM);
});
for(const event of ['pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,()=>{drag=null;});
document.getElementById('fixture').onclick=showFixture;
generateButton.onclick=generateWorld;
document.getElementById('distance').oninput=updateCamera;
document.getElementById('wire').onchange=e=>{
  if(state)for(const {mesh}of state.entries){mesh.material.wireframe=e.target.checked;}draw();
};
window.addEventListener('resize',resize);
window.visualViewport?.addEventListener('resize',resize);
// The preview's diagnostic state supports inspection of the rendered ground surface.
globalThis.__chunkPreview={get state(){return state;},get markerPoint(){return markerPoint;},groundAt,placeMarker};
resize();showFixture();
