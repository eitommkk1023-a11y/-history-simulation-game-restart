import {HORSE_BONES} from './motion.mjs';
/** Original meter-scale geometry. X lateral, Y up, +Z forward. No downloaded model. */
export function buildHorseModel(lod=0){
 const vertices=[],indices=[],skins=[],normals=[],bone=name=>HORSE_BONES.findIndex(b=>b.name===name),low=lod===2,mid=lod===1,sides=low?4:mid?6:12;
 const add=(p,skin,region)=>{const i=vertices.length/3;vertices.push(...p);let w=Array.isArray(skin)?skin:[skin,skin,1];if(w[2]===0)w=[w[1],w[1],1];skins.push(w[0],w[1],w[2],region);return i;};
 function loft(rings,S,region=0,skin=0,caps=true){if(low)caps=false;const start=vertices.length/3;
  for(let j=0;j<rings.length;j++){const r=rings[j],a=rings[Math.max(0,j-1)],b=rings[Math.min(rings.length-1,j+1)],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dy,dz)||1,ny=dz/len,nz=-dy/len,sk=typeof skin==='function'?skin(j/(rings.length-1)):skin;
   for(let k=0;k<S;k++){const angle=k/S*Math.PI*2;add([r[0]+r[3]*Math.cos(angle),r[1]+ny*r[4]*Math.sin(angle),r[2]+nz*r[4]*Math.sin(angle)],sk,region);}
  }
  for(let j=0;j<rings.length-1;j++)for(let k=0;k<S;k++){const a=start+j*S+k,b=start+j*S+(k+1)%S,c=a+S,d=b+S;indices.push(a,b,c,b,d,c);}
  if(caps)for(const [j,reverse]of [[0,true],[rings.length-1,false]]){const r=rings[j],center=add(r.slice(0,3),typeof skin==='function'?skin(j/(rings.length-1)):skin,region);for(let k=0;k<S;k++){const a=start+j*S+k,b=start+j*S+(k+1)%S;indices.push(center,reverse?b:a,reverse?a:b);}}
 }
 function ellipsoid(p,r,region,sk,S=8,R=4){const rings=[];for(let j=0;j<=R;j++){const a=-Math.PI/2+(j+.05)/(R+.1)*Math.PI;rings.push([p[0],p[1],p[2]+r[2]*Math.sin(a),r[0]*Math.cos(a),r[1]*Math.cos(a)]);}loft(rings,S,region,sk);}
 function strap(points,r,region,sk,S=4){loft(points.map(p=>[...p,r,r]),S,region,sk);}
 // Broad chest and rounded haunches, a slimmer barrel, and a raised wither.
 let torso=[[0,1.19,-1.10,.17,.25],[0,1.20,-.97,.34,.35],[0,1.18,-.70,.39,.39],[0,1.12,-.30,.37,.36],[0,1.13,.16,.34,.35],[0,1.22,.54,.32,.37],[0,1.18,.82,.23,.30]];
 if(low)torso=[torso[0],torso[2],torso[4],torso[6]];
 loft(torso,sides,0,0);
 const neck=[[0,1.25,.63,.25,.34],[0,1.45,.73,.22,.31],[0,1.69,.81,.18,.26],[0,1.91,.96,.13,.18],[0,2.01,1.09,.11,.13]];
 loft(low?[neck[0],neck[2],neck[4]]:neck,low?4:mid?6:12,0,t=>[0,1,Math.max(0,1-t*1.7)]);
 const head=[[0,2.00,1.04,.12,.15],[0,1.97,1.19,.155,.18],[0,1.82,1.40,.12,.14],[0,1.65,1.61,.125,.105],[0,1.59,1.75,.14,.095]];
 loft(low?[head[0],head[2],head[4]]:head,low?4:mid?6:12,0,t=>[1,2,Math.max(0,1-t*3)]);
 // Muzzle, eyes and narrow pointed ears carry the horse silhouette at close range.
 if(!low){ellipsoid([0,1.59,1.74],[.141,.090,.055],4,2,mid?4:12,mid?2:3);for(const x of [-.147,.147]){ellipsoid([x,1.982,1.185],[.024,.027,.033],3,2,mid?4:8,mid?2:3);if(!mid)ellipsoid([x*.78,1.626,1.735],[.020,.016,.026],3,2,6,3);}}
 for(const x of [-.105,.105]){const ear=[[x,2.073,1.025,.049,.048],[x*1.09,2.22,1.03,.033,.025],[x*1.12,2.28,1.075,.006,.005]];loft(low?[ear[0],ear[2]]:ear,low?3:5,0,2);}
 // Narrow mane following the back of the neck, plus a long tapered tail.
 const mane=[[0,1.39,.40,.025,.045],[0,1.69,.55,.027,.055],[0,1.94,.78,.025,.045],[0,2.07,.99,.016,.025]];loft(low?[mane[0],mane[3]]:mane,low?3:5,1,t=>[0,1,1-t]);
 const tail=[[0,1.40,-1.055,.06,.055],[0,1.21,-1.25,.075,.065],[0,.78,-1.43,.08,.065],[0,.38,-1.43,.035,.03]];loft(low?[tail[0],tail[2],tail[3]]:tail,low?3:6,1,3);
 for(const name of ['LF','RF','LH','RH']){const chain=HORSE_BONES.filter(b=>b.leg===name),legIndex=['LF','RF','LH','RH'].indexOf(name),legRegion=9+legIndex;
  if(low){const pts=[chain[0].p,chain[name.endsWith('F')?2:1].p,chain[3].end],jointIndices=[bone(name+'0'),bone(name+(name.endsWith('F')?'2':'1')),bone(name+'3')];for(let j=0;j<2;j++){const p=pts[j],q=pts[j+1];loft([[...p,j===0?.11:.045,j===0?.12:.045],[...q,.035,.035]],3,j===1?legRegion:0,t=>[jointIndices[j],jointIndices[j+1],1-t]);}}
  else for(let k=0;k<4;k++){const b=chain[k],p=b.p,q=b.end,top=k===0?(name.endsWith('F')?.13:.185):k===1?.078:k===2?.045:.052,bottom=k===0?.085:k===1?.052:k===2?.037:.065,rs=[];for(let j=0;j<(mid?2:3);j++){const t=j/(mid?1:2);rs.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,p[2]+(q[2]-p[2])*t,top+(bottom-top)*t,(top+(bottom-top)*t)*.9]);}loft(rs,mid?4:8,k>=2?legRegion:0,bone(b.name));}
  const foot=chain[3].end;const hoof=[[foot[0],.035,foot[2]+.025,.075,.115],[foot[0],.095,foot[2],.068,.09],[foot[0],.15,foot[2]-.02,.05,.065]];loft(low?[hoof[0],hoof[2]]:hoof,low?3:mid?6:8,2,bone(name+'3'));
 }
 // Saddle blanket and leather seat. All horses share one material/mesh per LOD.
 if(!low)loft([[0,1.46,-.46,.28,.07],[0,1.54,-.26,.34,.05],[0,1.56,.12,.32,.045],[0,1.46,.34,.24,.05]],mid?4:8,5,0);
 loft([[0,1.62,-.28,.20,.055],[0,1.59,-.08,.18,.045],[0,1.65,.16,.15,.07]],low?4:mid?4:8,6,0);
 if(!low){for(const x of [-.35,.35]){strap([[x,1.5,-.07],[x*1.1,1.18,-.02],[x*1.05,.98,.05]],.013,6,0);strap([[x*1.05,.98,.05],[x*1.05,.91,.13],[x*1.05,.91,.22],[x*1.05,.98,.24]],.012,7,0);strap([[x*.40,1.64,1.65],[x*.62,1.51,.98],[x*.52,1.70,.25]],.008,6,t=>[2,0,1-t]);}
  // A slim face stripe is colored white only for identities with a blaze.
  loft([[0,2.139,1.28,.035,.009],[0,1.95,1.48,.032,.009],[0,1.75,1.67,.03,.008]],4,8,2);
 }
 for(let i=0;i<vertices.length;i++)normals[i]=0;
 for(let k=0;k<indices.length;k+=3){const a=indices[k]*3,b=indices[k+1]*3,c=indices[k+2]*3,ux=vertices[b]-vertices[a],uy=vertices[b+1]-vertices[a+1],uz=vertices[b+2]-vertices[a+2],vx=vertices[c]-vertices[a],vy=vertices[c+1]-vertices[a+1],vz=vertices[c+2]-vertices[a+2],n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];for(const q of [a,b,c])for(let j=0;j<3;j++)normals[q+j]+=n[j];}
 for(let i=0;i<normals.length;i+=3){const len=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;for(let j=0;j<3;j++)normals[i+j]/=len;}
 return {lod,positions:vertices,normals,skin:skins,indices,triangles:indices.length/3,vertices:vertices.length/3};
}
