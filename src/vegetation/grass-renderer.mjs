import {SHORT_GRASS,grassCandidates,grassDensityForBiome} from './grass-placement.mjs';
/** Four tapered blades, opaque geometry, no texture or per-frame wind simulation. */
export function createGrassRenderer(THREE,scene,terrain,groundAt,seed,type=SHORT_GRASS){
 const positions=[],colors=[],indices=[];
 for(let blade=0;blade<4;blade++){
  const angle=blade*Math.PI*.5,cs=Math.cos(angle),sn=Math.sin(angle),offset=positions.length/3;
  for(const [x,y,z]of [[-.045,0,0],[.045,0,0],[-.03,.5,.07],[.03,.5,.07],[0,1,.25]]){
   positions.push(x*cs+z*sn,y,-x*sn+z*cs);colors.push(.24+.3*y,.38+.38*y,.09+.17*y);
  }
  indices.push(offset,offset+1,offset+2,offset+1,offset+3,offset+2,offset+2,offset+3,offset+4);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const eye={value:new THREE.Vector2()},material=new THREE.MeshLambertMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{shader.uniforms.grassEye=eye;shader.vertexShader='uniform vec2 grassEye;\n'+shader.vertexShader.replace('#include <project_vertex>',`float grassFade=1.0-smoothstep(${type.fadeStartM.toFixed(1)},${type.fadeEndM.toFixed(1)},distance(instanceMatrix[3].xz,grassEye));\ntransformed*=grassFade;\n#include <project_vertex>`);};
 material.customProgramCacheKey=()=>type.id+'-distance-fade';
 function buffer(){const mesh=new THREE.InstancedMesh(geometry,material,type.maxInstances);mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(type.maxInstances*3).fill(1),3);mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);return {mesh,key:'',anchor:{xM:0,yM:0},samples:[]};}
 let active=buffer(),spare=buffer(),job=null,enabled=true,current=null,disposed=false;
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 function position(){if(!current)return;for(const b of [active,spare])b.mesh.position.set(b.anchor.xM-current.origin.xM,-current.origin.elevationM,b.anchor.yM-current.origin.yM);eye.value.set(current.xM-active.anchor.xM,current.yM-active.anchor.yM);}
 function update(xM,yM,origin,show=true){
  current={xM,yM,origin};enabled=show;
  if(!enabled){active.mesh.visible=false;spare.mesh.visible=false;job=null;position();return;}
  active.mesh.visible=active.mesh.count>0;position();const ax=Math.floor(xM/8)*8+4,ay=Math.floor(yM/8)*8+4,key=ax+','+ay;
  if(active.key===key){job=null;return;}
  if(job?.key===key)return;
  spare.mesh.visible=false;spare.mesh.count=0;spare.samples=[];spare.anchor={xM:ax,yM:ay};spare.key=key;
  job={key,iterator:grassCandidates(terrain,groundAt,ax,ay,seed,type),count:0};position();
 }
 function tick(budgetMs=1.5,maxCells=512){
  if(disposed||!enabled||!job)return false;const start=performance.now();
  for(let n=0;n<maxCells;n++){
   if(n>0&&n%16===0&&performance.now()-start>=budgetMs)return false;
   const next=job.iterator.next();
   if(next.done){spare.mesh.count=job.count;spare.mesh.instanceMatrix.needsUpdate=true;if(spare.mesh.instanceColor)spare.mesh.instanceColor.needsUpdate=true;active.mesh.visible=false;const old=active;active=spare;spare=old;active.mesh.visible=enabled&&active.mesh.count>0;job=null;position();return true;}
   const p=next.value;if(!p)continue;
   dummy.position.set(p.xM-spare.anchor.xM,p.elevationM-.025,p.yM-spare.anchor.yM);dummy.rotation.set(0,p.yaw,0);dummy.scale.set(p.widthScale,p.heightM,p.widthScale);dummy.updateMatrix();spare.mesh.setMatrixAt(job.count,dummy.matrix);color.setRGB(p.shade,p.shade,p.shade);spare.mesh.setColorAt(job.count,color);job.count++;
   if(spare.samples.length<32&&Math.hypot(p.xM-spare.anchor.xM,p.yM-spare.anchor.yM)<10)spare.samples.push(p);
  }
  return false;
 }
 return {update,tick,acceptsBiome:biome=>grassDensityForBiome(biome)>0,setEnabled(value){if(current)update(current.xM,current.yM,current.origin,value);},dispose(){disposed=true;job=null;for(const b of [active,spare]){scene.remove(b.mesh);b.mesh.dispose();}geometry.dispose();material.dispose();},get count(){return active.mesh.count;},get pending(){return !!job;},get visible(){return active.mesh.visible;},get samples(){return active.samples;},get maxInstances(){return type.maxInstances;},get meshes(){return [active.mesh,spare.mesh];}};
}
