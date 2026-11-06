import {meshBuilder} from './mesh-utils.mjs';
import {CART_ANCHORS,localToWorld} from './cart-model.mjs';

// All points are relative to the seated pelvis; the same 1.7m human proportions
// are folded at the hip/knee, rather than shrinking a standing model.
export function buildCartPassenger(lod=0){
 const b=meshBuilder(),sides=lod===0?6:4;
 if(lod===2){b.box([0,.22,0],[.36,.45,.20],0,0);b.box([0,.61,0],[.21,.24,.20],0,1);}
 else{
  b.beam([0,.02,0],[0,.43,0],.16,0,0,sides);
  b.beam([0,.48,0],[0,.69,0],.115,0,1,sides);
  b.beam([0,.67,-.015],[0,.74,-.015],.12,0,2,sides);
  for(const sign of [-1,1]){
   b.beam([sign*.10,0,0],[sign*.13,-.025,.34],.067,0,3,sides);
   b.beam([sign*.13,-.025,.34],[sign*.13,-.40,.34],.049,0,3,sides);
   b.box([sign*.13,-.43,.39],[.11,.10,.22],0,2);
   b.beam([sign*.18,.36,0],[sign*.21,.13,.13],.045,0,0,sides);
   b.beam([sign*.21,.13,.13],[sign*.12,.12,.34],.035,0,0,sides);
   if(lod===0)b.box([sign*.12,.12,.35],[.07,.07,.10],0,1);
  }
 }
 return {lod,...b.finish()};
}

export function cartOccupants(cart,{driver=false,passengers=0}={}){
 const seats=driver?[0]:[];
 for(let i=0;i<Math.max(0,Math.min(2,Math.floor(passengers)));i++)seats.push(i+1);
 return seats.map(seat=>({seat,position:localToWorld(cart,CART_ANCHORS.seats[seat].position),yaw:(cart.yaw??0)+CART_ANCHORS.seats[seat].yaw}));
}

export function createCartPassengers(THREE,scene,asset,capacity=3000){
 const colors=[0x526d77,0xc29779,0x352c25,0x44433e].map(c=>new THREE.Color(c)),dummy=new THREE.Object3D();
 const entries=asset.passenger.lods.map(l=>{
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(l.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(l.normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(l.parts.flatMap((v,i)=>i%2?colors[v].toArray():[]),3));geometry.setIndex(l.indices);
  const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true}),capacity);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);return mesh;
 });
 const metrics={submitted:0,drawCalls:0,triangles:0};
 function update(rows,camera){
  const counts=[0,0,0];let total=0;
  for(const cart of rows){
   const d=camera?Math.hypot(camera.position.x-cart.x,camera.position.y-(cart.y??0),camera.position.z-cart.z):0,lod=d<45?0:d<130?1:2;
   for(const person of cartOccupants(cart,cart)){
    if(++total>capacity)throw Error('Cart passenger capacity exceeded');
    dummy.position.fromArray(person.position);dummy.rotation.set(0,person.yaw,0);dummy.scale.setScalar(1);dummy.updateMatrix();entries[lod].setMatrixAt(counts[lod]++,dummy.matrix);
   }
  }
  for(let i=0;i<3;i++){entries[i].count=counts[i];entries[i].instanceMatrix.needsUpdate=true;}
  Object.assign(metrics,{submitted:total,drawCalls:counts.filter(Boolean).length,triangles:counts.reduce((sum,n,i)=>sum+n*asset.passenger.lods[i].triangles,0)});
 }
 return {update,entries,metrics};
}
