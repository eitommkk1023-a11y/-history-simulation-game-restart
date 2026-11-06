import {meshBuilder} from '../horse-extras/mesh-utils.mjs';
export const ARMOR_STYLES=['なし','布','小札','金属板'];
export function normalizeArmorKit(kit){if(!Array.isArray(kit)||kit.length!==3||kit.some(x=>!Number.isInteger(x)||x<0||x>3))throw Error('Invalid armor kit');return [...kit];}
/** Original meter-scale surfaces; head, neck, body. No historical nationality claim. */
export function buildHorseArmor(slot,style,lod=0){
 if(![0,1,2].includes(slot)||![1,2,3].includes(style)||![0,1,2].includes(lod))throw Error('Invalid armor piece');
 const b=meshBuilder(),region=20+slot*3+style-1,low=lod===2,mid=lod===1;
 const rows=low?1:slot===2?(style===3?2:mid?3:5):slot===1?(mid?2:4):2,cols=low?2:style===3?3:mid?6:10;
 function point(u,v,side){if(slot===0){const y=2.14-.47*v,z=1.17+.63*v,w=.105+.015*Math.sin(v*Math.PI);return [(u*2-1)*w,y+.025*Math.sin(u*Math.PI),z+.025];}
 if(slot===1){const y=1.30+.73*v,z=.65+.43*v,r=.29-.16*v,a=.20+u*2.05;return [side*r*Math.sin(a),y+.35*r*Math.cos(a),z-r*Math.cos(a)];}
 const z=-1.10+u*1.92,profile=[[-1.10,1.19,.17,.25],[-.97,1.20,.34,.35],[-.70,1.18,.39,.39],[-.30,1.12,.37,.36],[.16,1.13,.34,.35],[.54,1.22,.32,.37],[.82,1.18,.23,.30]];let j=0;while(j<profile.length-2&&z>profile[j+1][0])j++;const a0=profile[j],b0=profile[j+1],t=(z-a0[0])/(b0[0]-a0[0]),cy=a0[1]+(b0[1]-a0[1])*t,r=a0[2]+(b0[2]-a0[2])*t+.07+.09*Math.abs(2*u-1),ry=a0[3]+(b0[3]-a0[3])*t+.07,a=.66+v*1.75;return [side*r*Math.sin(a),cy+ry*Math.cos(a),z];}
 function triangle(a,c,d){const ux=c[0]-a[0],uy=c[1]-a[1],uz=c[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2],n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx],out=slot===0?[0,0,1]:slot===1?[a[0],0,-.2]:[a[0],a[1]-1.18,0];if(n.reduce((s,x,i)=>s+x*out[i],0)<0)[c,d]=[d,c];b.tri(a,c,d,slot===0?2:0,region);}
 function quad(p){triangle(p[0],p[1],p[2]);triangle(p[0],p[2],p[3]);}
 for(const side of slot===0?[1]:[-1,1])for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const inset=low||style===1?0:style===2?.055:.018,u0=(x+inset)/cols,u1=(x+1-inset)/cols,v0=(y+inset)/rows,v1=(y+1-inset)/rows;
  const p=[point(u0,v0,side),point(u1,v0,side),point(u1,v1,side),point(u0,v1,side)];
  if(low||style===1)quad(p);else{const center=p[0].map((_,i)=>p.reduce((s,q)=>s+q[i],0)/4),lift=style===2?.008:.018,inner=p.map(q=>q.map((c,i)=>center[i]+(c-center[i])*.88+(i===0&&slot!==0?Math.sign(q[0])*lift:i===2&&slot===0?lift:0)));quad(inner);for(let k=0;k<4;k++)quad([p[k],p[(k+1)%4],inner[(k+1)%4],inner[k]]);}
 }
 const m=b.finish(),skin=[];for(let i=0;i<m.vertices;i++){const y=m.positions[i*3+1];skin.push(slot===0?2:0,slot===1?1:slot===0?2:0,slot===1?Math.max(0,Math.min(1,(1.94-y)/.64)):1,region);}
 return {lod,positions:m.positions,normals:m.normals,indices:m.indices,skin,vertices:m.vertices,triangles:m.triangles};
}
export function attachHorseArmor(asset){const lods=asset.lods.map((base,lod)=>{const out={...base,positions:[...base.positions],normals:[...base.normals],skin:[...base.skin],indices:[...base.indices]};for(let slot=0;slot<3;slot++)for(let style=1;style<=3;style++){const a=buildHorseArmor(slot,style,lod),offset=out.positions.length/3;out.positions.push(...a.positions);out.normals.push(...a.normals);out.skin.push(...a.skin);out.indices.push(...a.indices.map(i=>i+offset));}out.vertices=out.positions.length/3;out.triangles=out.indices.length/3;return out;});return {...asset,lods};}
