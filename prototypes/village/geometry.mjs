// Original geometry in meters, palette matched to npc/arch-gen.js at the pinned main commit.
export const WALL_MATERIALS=['timber','stone','adobe','mud','turf','reed'];
export const ROOF_MATERIALS=['thatch','shingle','turf','mud','slab'];
export const ARCH_COLORS={timber:[.50,.36,.23],stone:[.55,.54,.52],adobe:[.74,.57,.38],mud:[.45,.34,.25],turf:[.30,.38,.20],reed:[.72,.63,.38],thatch:[.70,.60,.33],shingle:[.42,.31,.21],slab:[.46,.46,.45],found:[.50,.49,.47],dark:[.10,.08,.07]};
export function finite(v,name){if(!Number.isFinite(v))throw Error('Invalid '+name);return v;}
export function integer(v,min,max,name){if(!Number.isInteger(v)||v<min||v>max)throw Error('Invalid '+name);return v;}
export function range(v,min,max,name){finite(v,name);if(v<min||v>max)throw Error('Invalid '+name);return v;}
export function placement(r){return {x:finite(r.x??0,'x'),y:finite(r.y??0,'y'),z:finite(r.z??0,'z'),yaw:finite(r.yaw??0,'yaw')};}
export function meshBuilder(){const positions=[],normals=[],tags=[],indices=[];
 function tri(a,b,c,tag=[0,0,0]){const u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1,s=positions.length/3;for(const p of [a,b,c]){positions.push(...p);normals.push(...n.map(x=>x/l));tags.push(...tag);}indices.push(s,s+1,s+2);}
 function quad(a,b,c,d,tag){tri(a,b,c,tag);tri(a,c,d,tag);}
 function box(p,s,t){const v=Array.from({length:8},(_,i)=>p.map((x,k)=>x+s[k]*((i>>k&1)? .5:-.5)));for(const f of [[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(...f.map(i=>v[i]),t);}
 function cone(p,rx,rz,h,t,sides=8,top=.0){for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2,A=[p[0]+rx*Math.cos(a),p[1],p[2]+rz*Math.sin(a)],B=[p[0]+rx*Math.cos(b),p[1],p[2]+rz*Math.sin(b)],C=[p[0]+rx*top*Math.cos(b),p[1]+h,p[2]+rz*top*Math.sin(b)],D=[p[0]+rx*top*Math.cos(a),p[1]+h,p[2]+rz*top*Math.sin(a)];quad(A,B,C,D,t);tri([p[0],p[1],p[2]],B,A,t);if(top)tri([p[0],p[1]+h,p[2]],D,C,t);}}
 function ellipsoid(p,r,t,sides=8,rings=4){for(let j=0;j<rings;j++)for(let k=0;k<sides;k++){const pt=(jj,kk)=>{const a=-Math.PI/2+jj/rings*Math.PI,b=kk/sides*Math.PI*2;return [p[0]+r[0]*Math.cos(a)*Math.cos(b),p[1]+r[1]*Math.sin(a),p[2]+r[2]*Math.cos(a)*Math.sin(b)];};quad(pt(j,k),pt(j+1,k),pt(j+1,k+1),pt(j,k+1),t);}}
 function beam(a,b,r,t,sides=5){const d=b.map((x,i)=>x-a[i]),l=Math.hypot(...d)||1,u=Math.abs(d[1]/l)>.95?[1,0,0]:[d[2],0,-d[0]],ul=Math.hypot(...u)||1;for(let i=0;i<3;i++)u[i]/=ul;const v=[d[1]*u[2]-d[2]*u[1],d[2]*u[0]-d[0]*u[2],d[0]*u[1]-d[1]*u[0]].map(x=>x/l),pt=(p,k)=>p.map((x,i)=>x+r*(u[i]*Math.cos(k/sides*Math.PI*2)+v[i]*Math.sin(k/sides*Math.PI*2)));for(let k=0;k<sides;k++)quad(pt(a,k),pt(a,k+1),pt(b,k+1),pt(b,k),t);}
 return {tri,quad,box,cone,ellipsoid,beam,finish:()=>({positions,normals,tags,indices,vertices:positions.length/3,triangles:indices.length/3})};
}
export function bufferGeometry(THREE,m){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(m.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(m.normals,3));g.setAttribute('tag',new THREE.Float32BufferAttribute(m.tags,3));g.setIndex(m.indices);return g;}
export function instanceAttribute(THREE,g,name,size,capacity){const a=new THREE.InstancedBufferAttribute(new Float32Array(size*capacity),size);a.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,a);return a;}
const matrixCache=new WeakMap();
export function instanceMatrix(THREE,mesh,i,row,size=[1,1,1]){let c=matrixCache.get(THREE);if(!c){c={m:new THREE.Matrix4(),q:new THREE.Quaternion(),axis:new THREE.Vector3(0,1,0),p:new THREE.Vector3(),s:new THREE.Vector3()};matrixCache.set(THREE,c);}c.q.setFromAxisAngle(c.axis,row.yaw);c.m.compose(c.p.set(row.x,row.y,row.z),c.q,c.s.set(...size));mesh.setMatrixAt(i,c.m);}

export function disposeMeshes(scene,meshes){for(const m of meshes){scene.remove(m);m.geometry.dispose();m.material.dispose();}}
export const litFragment=`precision highp float;varying vec3 vNormal;varying vec3 vColor;void main(){float l=.52+.48*max(0.,dot(normalize(vNormal),normalize(vec3(-.4,.9,.35))));gl_FragColor=vec4(vColor*l,1.);}`;
