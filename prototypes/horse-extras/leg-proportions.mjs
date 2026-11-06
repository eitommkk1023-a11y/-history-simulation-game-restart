import {HORSE_BONES} from '../horse/motion.mjs';
const clamp=v=>Math.max(0,Math.min(1,v));

/** A geometry-only study. Bone axes, skinning, topology and all non-leg parts stay fixed. */
export function makeHorseLegVariant(source){
 const positions=source.positions.slice(),normals=Array(positions.length).fill(0);
 for(let i=0;i<source.vertices;i++){
  const bone=HORSE_BONES[source.skin[i*4]],region=source.skin[i*4+3];
  if(!bone.leg||region===2||bone.segment===3)continue;
  const axis=bone.end.map((v,k)=>v-bone.p[k]),length=Math.hypot(...axis),u=axis.map(v=>v/length),p=source.positions.slice(i*3,i*3+3),along=p.reduce((s,v,k)=>s+(v-bone.p[k])*u[k],0),t=clamp(along/length);
  let factor=1;
  if(bone.segment===0)factor=(bone.leg.endsWith('F')?1.18:1.20)*(1-t)+1.10*t;
  else if(bone.segment===1)factor=1.10+.10*t*t;
  else if(bone.segment===2)factor=1+.38*Math.exp(-Math.pow(t/.18,2));
  for(let k=0;k<3;k++){const center=bone.p[k]+u[k]*along;positions[i*3+k]=center+(p[k]-center)*factor;}
 }
 for(let k=0;k<source.indices.length;k+=3){const a=source.indices[k]*3,b=source.indices[k+1]*3,c=source.indices[k+2]*3,ux=positions[b]-positions[a],uy=positions[b+1]-positions[a+1],uz=positions[b+2]-positions[a+2],vx=positions[c]-positions[a],vy=positions[c+1]-positions[a+1],vz=positions[c+2]-positions[a+2],n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];for(const v of [a,b,c])for(let j=0;j<3;j++)normals[v+j]+=n[j];}
 for(let i=0;i<normals.length;i+=3){const n=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;for(let j=0;j<3;j++)normals[i+j]/=n;}
 return {...source,positions,normals,skin:source.skin.slice(),indices:source.indices.slice()};
}

export function skinnedLegBounds(geometry,matrices){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<geometry.vertices;i++){
  const x=geometry.positions[i*3],y=geometry.positions[i*3+1],z=geometry.positions[i*3+2],a=geometry.skin[i*4]*12,b=geometry.skin[i*4+1]*12,w=geometry.skin[i*4+2];
  for(let k=0;k<3;k++){const j=k*4,v=(matrices[a+j]*x+matrices[a+j+1]*y+matrices[a+j+2]*z+matrices[a+j+3])*w+(matrices[b+j]*x+matrices[b+j+1]*y+matrices[b+j+2]*z+matrices[b+j+3])*(1-w);min[k]=Math.min(min[k],v);max[k]=Math.max(max[k],v);}
 }
 return {min,max};
}

/** Apply after motion blending so the comparison mesh cannot sink during transitions. */
export function fitLegStudyPose(pose,geometry){
 const bounds=skinnedLegBounds(geometry,pose.matrices),raise=Math.max(0,-.012-bounds.min[1]);
 if(raise){for(let i=0;i<pose.matrices.length/12;i++)pose.matrices[i*12+7]+=raise;bounds.min[1]+=raise;bounds.max[1]+=raise;pose.bob=(pose.bob??0)+raise;}
 pose.bounds=bounds;return pose;
}
