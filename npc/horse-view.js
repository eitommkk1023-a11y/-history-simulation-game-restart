/* World of History: 馬と荷馬車の描画（Codex 試作11のモジュールをまとめたもの。tools/build-horse-view.py で生成。編集しない）。ブラウザでは WohHorseView */
(function(root){const api={};
(()=>{const HORSE_COATS=Object.freeze([
 {name:'鹿毛',body:[.36,.19,.10],dark:[.075,.054,.040]},
 {name:'栗毛',body:[.53,.25,.11],dark:[.24,.10,.035]},
 {name:'青毛',body:[.075,.080,.085],dark:[.022,.026,.029]},
 {name:'芦毛',body:[.66,.67,.65],dark:[.23,.25,.25]},
 {name:'黒鹿毛',body:[.19,.13,.10],dark:[.045,.040,.036]},
 {name:'月毛',body:[.69,.53,.29],dark:[.74,.69,.53]},
 {name:'河原毛',body:[.59,.48,.29],dark:[.09,.075,.055]},
 {name:'濃い栗毛',body:[.34,.13,.075],dark:[.20,.073,.032]},
]);
function horseRandom(id,seed,channel){let h=(seed>>>0)^Math.imul(channel,1597334677);for(const c of String(id))h=Math.imul(h^c.charCodeAt(0),16777619);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}
function horseIdentity(id,seed=71031){const r=c=>horseRandom(id,seed,c),coatIndex=Math.floor(r(1)*HORSE_COATS.length),athletic=r(20),endurance=r(21);return {id:String(id),seed,coatIndex,coat:HORSE_COATS[coatIndex],blaze:r(2)>.57,socks:Math.floor(r(3)*16),scale:.96+r(4)*.08,stats:{speed:(60+athletic*10)/3.6,acceleration:1.25+r(22)*1.25,endurance:80+endurance*60,agility:.8+r(23)*.55},appearance:coatIndex+(r(2)>.57?8:0)+Math.floor(r(3)*16)*16};}

Object.assign(api,{HORSE_COATS,horseRandom,horseIdentity});})();
(()=>{const TAU=Math.PI*2,wrap=v=>((v%1)+1)%1,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const HORSE_GAITS=Object.freeze({idle:{duty:1,span:0,lift:0,stride:1},walk:{duty:.68,span:.42,lift:.13,stride:.84/.68},trot:{duty:.42,span:.57,lift:.25,stride:1.14/.42},canter:{duty:.32,span:.68,lift:.37,stride:1.36/.32},gallop:{duty:.22,span:.82,lift:.47,stride:1.64/.22}});
function horseGait(phase,mode='idle'){
 const g=HORSE_GAITS[mode]??HORSE_GAITS.idle,offset=mode==='walk'?{LH:0,LF:.25,RH:.5,RF:.75}:mode==='trot'?{LH:0,RF:0,RH:.5,LF:.5}:mode==='gallop'?{RH:0,LH:.10,RF:.29,LF:.40}:{RH:0,LH:.23,RF:.23,LF:.48},feet={};
 for(const name of ['LF','RF','LH','RH']){const u=wrap(phase-offset[name]),stance=mode==='idle'||u<g.duty,t=stance?u/g.duty:(u-g.duty)/(1-g.duty),s=t*t*(3-2*t);feet[name]={stance,z:mode==='idle'?0:stance?g.span*(1-2*t):-g.span+2*g.span*s,lift:stance?0:g.lift*Math.sin(Math.PI*t)**1.3,roll:stance?-.10*Math.max(0,(t-.65)/.35):.2*Math.sin(Math.PI*t)};}
 return {feet,stride:g.stride,flight:Object.values(feet).every(f=>!f.stance)};
}
const bones=[{name:'body',parent:-1,p:[0,1.15,0],end:[0,1.5,0]},{name:'neck',parent:0,p:[0,1.25,.68],end:[0,1.93,1.05]},{name:'head',parent:1,p:[0,1.96,1.08],end:[0,1.56,1.69]},{name:'tail',parent:0,p:[0,1.39,-1.02],end:[0,.70,-1.37]}];
for(const [name,x]of [['LF',-.27],['RF',.27],['LH',-.29],['RH',.29]]){const front=name.endsWith('F'),pts=front?[[x,1.25,.58],[x,.91,.36],[x,.56,.63],[x,.20,.64],[x,.075,.73]]:[[x,1.31,-.78],[x,.86,-.44],[x,.53,-.90],[x,.20,-.76],[x,.075,-.65]];for(let k=0;k<4;k++)bones.push({name:name+k,parent:k?bones.length-1:0,p:pts[k],end:pts[k+1],leg:name,segment:k});}
const HORSE_BONES=Object.freeze(bones);
function matrix(angle,p,rest){const c=Math.cos(angle),s=Math.sin(angle);return [1,0,0,p[0]-rest[0],0,c,-s,p[1]-c*rest[1]+s*rest[2],0,s,c,p[2]-s*rest[1]-c*rest[2]];}
function transform(m,p){return [m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3],m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7],m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]];}
function knee(a,b,L1,L2,sign){const dy=b[1]-a[1],dz=b[2]-a[2],d=clamp(Math.hypot(dy,dz),.01,L1+L2-.00001),uy=dy/Math.max(.0001,Math.hypot(dy,dz)),uz=dz/Math.max(.0001,Math.hypot(dy,dz)),along=(L1*L1-L2*L2+d*d)/(2*d),perp=Math.sqrt(Math.max(0,L1*L1-along*along));return [a[0],a[1]+uy*along-uz*perp*sign,a[2]+uz*along+uy*perp*sign];}
function horsePose(phase,mode='idle',ground={}){
 const gait=horseGait(phase,mode),bob=mode==='idle'?.003*Math.sin(phase*TAU):mode==='walk'?.008*Math.sin(phase*TAU*2):mode==='trot'?-.055+.025*Math.cos(phase*TAU*2):mode==='gallop'?-.10+.09*Math.sin(phase*TAU):-.10+.075*Math.sin(phase*TAU),pitch=mode==='gallop'?.025+.065*Math.sin(phase*TAU):mode==='canter'?.045*Math.sin(phase*TAU):mode==='trot'?.01*Math.sin(phase*TAU*2):0,root=matrix(pitch,[0,1.15+bob,0],[0,1.15,0]),matrices=new Float32Array(bones.length*12),joints={},feet={};matrices.set(root,0);
 const neckAngle=pitch+(mode==='idle'?.018*Math.sin(phase*TAU):mode==='gallop'?.10+.045*Math.sin(phase*TAU):.04*Math.sin(phase*TAU)),neck=matrix(neckAngle,transform(root,bones[1].p),bones[1].p);
 matrices.set(neck,12);
 matrices.set(matrix(neckAngle+(mode==='gallop'?.04*Math.sin(phase*TAU):mode==='canter'?.02*Math.sin(phase*TAU):0),transform(neck,bones[2].p),bones[2].p),24);
 matrices.set(matrix(pitch+(mode==='gallop'?.22:0)+.07*Math.sin(phase*TAU),transform(root,bones[3].p),bones[3].p),36);
 for(const name of ['LF','RF','LH','RH']){const chain=bones.filter(b=>b.leg===name),front=name.endsWith('F'),f=gait.feet[name],hip=transform(root,chain[0].p),groundY=ground[name]??0,hoof=[hip[0],.075+f.lift+groundY,chain[3].end[2]+f.z],fetlock=[hip[0],hoof[1]+.125,hoof[2]-.09];let middle,upper;
  if(front){const lean=clamp(-f.z*.35+f.lift*.65,-.27,.27);middle=[hip[0],fetlock[1]+Math.sqrt(.37*.37-lean*lean),fetlock[2]+lean];upper=knee(hip,middle,.40,.46,1);}else{const lean=clamp(-.14-f.z*.16-f.lift*.30,-.29,.05);middle=[hip[0],fetlock[1]+Math.sqrt(.36*.36-lean*lean),fetlock[2]+lean];upper=knee(hip,middle,.55,.57,-1);}
  const points=[hip,upper,middle,fetlock,hoof];joints[name]=points;feet[name]={...f,position:hoof};for(let k=0;k<4;k++){const bone=chain[k],restA=bone.p,restB=bone.end,a=points[k],b=points[k+1],angle=Math.atan2(b[2]-a[2],b[1]-a[1])-Math.atan2(restB[2]-restA[2],restB[1]-restA[1]);matrices.set(matrix(angle,a,restA),bones.indexOf(bone)*12);}
 }
 return {matrices,feet,joints,bob,pitch};
}

Object.assign(api,{HORSE_GAITS,horseGait,HORSE_BONES,horsePose});})();
(()=>{const {HORSE_BONES}=api;
/** Original meter-scale geometry. X lateral, Y up, +Z forward. No downloaded model. */
function buildHorseModel(lod=0){
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

Object.assign(api,{buildHorseModel});})();
(()=>{const {HORSE_GAITS}=api;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
function horseTargetSpeed(mode,identity){return mode==='reverse'?-.8:mode==='walk'?110/60:mode==='trot'?220/60:mode==='canter'?340/60:mode==='gallop'?identity.stats.speed:0;}
function freshHorseState(identity){return {identity,x:0,z:0,y:0,yaw:0,speed:0,phase:0,stamina:identity.stats.endurance,mode:'idle',blocked:false,distance:0,fatigued:false};}
function stepHorse(state,input,dt,terrain){
 const s={...state};if(!Number.isFinite(dt)||dt<=0)return s;dt=Math.min(.1,dt);
 const stats=s.identity.stats,effort=clamp(input.forward??0,0,1),desiredMode=input.mode??'trot';
 s.fatigued=desiredMode==='gallop'&&s.stamina<8;
 const max=horseTargetSpeed(s.fatigued?'canter':desiredMode,s.identity),brake=clamp(input.brake??0,0,1),requested=effort*max,compatible=s.speed*requested<0?0:requested,target=brake>0&&Math.abs(compatible)>Math.abs(s.speed)?s.speed:compatible;
 const accel=Math.abs(target)>Math.abs(s.speed)?stats.acceleration:stats.acceleration*1.7+brake*5;
 s.speed+=clamp(target-s.speed,-accel*dt,accel*dt);if(Math.abs(s.speed)<.008)s.speed=0;
 const delta=angle((input.heading??s.yaw)-s.yaw),turn=stats.agility*2.2/(1+Math.abs(s.speed)*.20);
 if(effort>.02||Math.abs(s.speed)>.1){if(Number.isFinite(input.steer))s.yaw-=clamp(input.steer,-1,1)*turn*dt*(s.speed<0?.45:1);else s.yaw+=clamp(delta,-turn*dt,turn*dt);}
 const move=s.speed*dt,steps=Math.max(1,Math.ceil(Math.abs(move)/.18));s.blocked=false;let travelled=0;
 for(let k=0;k<steps;k++){
  const dx=Math.sin(s.yaw)*move/steps,dz=Math.cos(s.yaw)*move/steps,x=s.x+dx,z=s.z+dz,y=terrain.height(x,z),a=terrain.height(x+.55,z),b=terrain.height(x-.55,z),c=terrain.height(x,z+.8),d=terrain.height(x,z-.8),slope=Math.hypot((a-b)/1.1,(c-d)/1.6);
  if(!Number.isFinite(y)||slope>Math.tan(Math.PI*25/180)||Math.abs(y-s.y)>Math.abs(move)/steps*.6+.04||terrain.blocked(x,z,.48)){s.blocked=true;s.speed=0;break;}
  travelled+=Math.hypot(dx,dz);s.x=x;s.z=z;s.y=y;
 }
 // Hysteresis avoids rapid pose switching around a gait's speed boundary.
 const limits=[.04,2.5,4.6,8.3],modes=['idle','walk','trot','canter','gallop'];let index=0;
 while(index<limits.length&&Math.abs(s.speed)>=limits[index])index++;
 const old=modes.indexOf(state.mode);
 if(index<old&&old>1&&Math.abs(s.speed)>limits[old-1]-.3)index=old;
 s.mode=modes[index];s.phase+=s.mode==='idle'?dt*.28:Math.sign(s.speed)*travelled/HORSE_GAITS[s.mode].stride/s.identity.scale;s.distance+=travelled;
 s.stamina=clamp(s.stamina+(s.mode==='gallop'?-4.5:s.mode==='canter'?-1.5:s.mode==='trot'?-.35:s.mode==='walk'?3.2:8)*dt,0,stats.endurance);
 return s;
}

Object.assign(api,{horseTargetSpeed,freshHorseState,stepHorse});})();
(()=>{const identity34=()=>[1,0,0,0,0,1,0,0,0,0,1,0];
function point34(m,p){return [0,1,2].map(r=>m[r*4]*p[0]+m[r*4+1]*p[1]+m[r*4+2]*p[2]+m[r*4+3]);}
function multiply34(a,b){const m=new Array(12);for(let r=0;r<3;r++){for(let c=0;c<3;c++)m[r*4+c]=a[r*4]*b[c]+a[r*4+1]*b[4+c]+a[r*4+2]*b[8+c];m[r*4+3]=a[r*4]*b[3]+a[r*4+1]*b[7]+a[r*4+2]*b[11]+a[r*4+3];}return m;}
function pivot34(axis,angle,p=[0,0,0],move=[0,0,0]){const c=Math.cos(angle),s=Math.sin(angle),m=axis==='x'?[1,0,0,0,0,c,-s,0,0,s,c,0]:axis==='y'?[c,0,s,0,0,1,0,0,-s,0,c,0]:[c,-s,0,0,s,c,0,0,0,0,1,0];const q=point34(m,p);for(let k=0;k<3;k++)m[k*4+3]=p[k]-q[k]+move[k];return m;}
function align34(a,b,p,q){const len=v=>Math.hypot(...v),sub=(u,v)=>u.map((x,i)=>x-v[i]),u=sub(b,a),v=sub(q,p),lu=len(u)||1,lv=len(v)||1;for(let i=0;i<3;i++){u[i]/=lu;v[i]/=lv;}const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],dot=Math.max(-1,Math.min(1,u.reduce((s,x,i)=>s+x*v[i],0))),w=Math.sqrt(Math.max(0,(1+dot)/2));let x=cross[0]/Math.max(.00001,2*w),y=cross[1]/Math.max(.00001,2*w),z=cross[2]/Math.max(.00001,2*w);if(w<.00001){x=1;y=z=0;}const m=[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0,2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0,2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0],r=point34(m,a);for(let i=0;i<3;i++)m[i*4+3]=p[i]-r[i];return m;}
function quaternion34(m){const tr=m[0]+m[5]+m[10];let q;if(tr>0){const s=Math.sqrt(tr+1)*2;q=[(m[9]-m[6])/s,(m[2]-m[8])/s,(m[4]-m[1])/s,s/4];}else if(m[0]>m[5]&&m[0]>m[10]){const s=Math.sqrt(1+m[0]-m[5]-m[10])*2;q=[s/4,(m[1]+m[4])/s,(m[2]+m[8])/s,(m[9]-m[6])/s];}else if(m[5]>m[10]){const s=Math.sqrt(1+m[5]-m[0]-m[10])*2;q=[(m[1]+m[4])/s,s/4,(m[6]+m[9])/s,(m[2]-m[8])/s];}else{const s=Math.sqrt(1+m[10]-m[0]-m[5])*2;q=[(m[2]+m[8])/s,(m[6]+m[9])/s,s/4,(m[4]-m[1])/s];}const n=Math.hypot(...q)||1;return q.map(v=>v/n);}

Object.assign(api,{identity34,point34,multiply34,pivot34,align34,quaternion34});})();
(()=>{const {horsePose,HORSE_BONES,HORSE_GAITS}=api;
const {buildHorseModel}=api;
const {point34,multiply34,pivot34,align34}=api;
const EXTRA_CLIPS=Object.freeze([{name:'rear',frames:24,duration:2,loop:false},{name:'fall',frames:24,duration:1.5,loop:false},{name:'dead',frames:1,duration:0,loop:false},{name:'turn_l',frames:24,duration:1.6,loop:true},{name:'turn_r',frames:24,duration:1.6,loop:true}]);
const model=buildHorseModel(0),clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v);},wrap=v=>((v%1)+1)%1;
function resolveHorseVisual({speed=0,state=0,stateT=0,phase=0,turn=0}={}){if(state===3||state===2&&stateT>=1.5)return {clip:'dead',phase:0};if(state===2)return {clip:'fall',phase:clamp(stateT/1.5)};if(state===1&&stateT<2)return {clip:'rear',phase:clamp(stateT/2)};if(state===1)return {clip:'idle',phase};if(turn)return {clip:turn<0?'turn_l':'turn_r',phase};const v=Math.abs(speed);return {clip:v<.04?'idle':v<2.5?'walk':v<4.6?'trot':v<8.3?'canter':'gallop',phase};}
function deformedHorseBounds(matrices){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let v=0;v<model.vertices;v++){const skin=model.skin.slice(v*4,v*4+3),p=model.positions.slice(v*3,v*3+3),a=point34(matrices.subarray(skin[0]*12,skin[0]*12+12),p),b=point34(matrices.subarray(skin[1]*12,skin[1]*12+12),p);for(let k=0;k<3;k++){const x=a[k]*skin[2]+b[k]*(1-skin[2]);min[k]=Math.min(min[k],x);max[k]=Math.max(max[k],x);}}return {min,max};}
function sampleExtraPose(phase,clip,ground={}){
 if(!EXTRA_CLIPS.some(c=>c.name===clip))return horsePose(phase,clip,ground);
 if(clip==='rear'&&(phase<=0||phase>=1))return horsePose(0,'idle');
 const p=horsePose(0,'idle'),m=p.matrices,fold=(frontOnly,weight)=>{for(let i=0;i<HORSE_BONES.length;i++){const b=HORSE_BONES[i];if(!b.leg||frontOnly&&!b.leg.endsWith('F'))continue;const offset=b.leg==='LF'||b.leg==='RH'?.25:.75,q=horsePose(offset,'trot').matrices;const a=m.subarray(i*12,i*12+12),z=q.subarray(i*12,i*12+12),aa=Math.atan2(a[9],a[5]),ab=Math.atan2(z[9],z[5]),angle=aa+Math.atan2(Math.sin(ab-aa),Math.cos(ab-aa))*weight,pa=point34(a,b.p),pb=point34(z,b.p);m.set(pivot34('x',angle,b.p,pa.map((v,k)=>v*(1-weight)+pb[k]*weight-b.p[k])),i*12);}};
 if(clip==='rear'){const t=clamp(phase),lift=t<.35?ease(t/.35):t<.6?1:1-ease((t-.6)/.4);fold(true,lift);const root=pivot34('x',-1.03*lift,[0,1.31,-.78]);for(let i=0;i<HORSE_BONES.length;i++)if(!HORSE_BONES[i].leg||HORSE_BONES[i].leg.endsWith('F'))m.set(multiply34(root,m.subarray(i*12,i*12+12)),i*12);}
 else if(clip==='fall'||clip==='dead'){const t=clip==='dead'?1:ease(phase);fold(false,t);const root=pivot34('z',-Math.PI/2*t,[0,1.15,0],[.42*t,-.66*t,0]);for(let i=0;i<HORSE_BONES.length;i++)m.set(multiply34(root,m.subarray(i*12,i*12+12)),i*12);}
 else{const sign=clip==='turn_l'?1:-1,offsets={LF:0,RF:.5,LH:.25,RH:.75};for(const name of Object.keys(offsets)){const chain=HORSE_BONES.filter(b=>b.leg===name),u=wrap(phase-offsets[name]),stance=u<.6,t=stance?u/.6:(u-.6)/.4,angle=sign*Math.PI*.15*(stance?1-2*t:-1+2*ease(t)),foot=chain[3].end,x=foot[0]*Math.cos(angle)+foot[2]*Math.sin(angle),z=foot[2]*Math.cos(angle)-foot[0]*Math.sin(angle),lift=stance?0:.13*Math.sin(Math.PI*t),points=p.joints[name].map((q,k)=>[q[0]+(x-foot[0])*k/4,q[1]+lift*k/4,q[2]+(z-foot[2])*k/4]);for(let k=0;k<4;k++){const b=chain[k];m.set(align34(b.p,b.end,points[k],points[k+1]),HORSE_BONES.indexOf(b)*12);}}}
 const bounds=deformedHorseBounds(m),raise=Math.max(0,-.012-bounds.min[1]);if(raise)for(let i=0;i<HORSE_BONES.length;i++)m[i*12+7]+=raise;
 p.bounds=deformedHorseBounds(m);p.saddle=point34(m.subarray(0,12),[0,1.67,0]);p.clip=clip;return p;
}
function horseSaddleMatrix(pose){const m=Array.from(pose.matrices.subarray(0,12)),p=point34(m,[0,1.67,0]);m[3]=p[0];m[7]=p[1];m[11]=p[2];return m;}
function packHorseFlags({state=0,stateT=0,rider=1,harness=0,turn=0}={}){const duration=state===1?2:state===2?1.5:1,progress=clamp(stateT/duration);return state+(rider?4:0)+(harness?8:0)+(turn<0?16:turn>0?32:0)+progress*.999;}
function unpackHorseFlags(value){const n=Math.floor(value),state=n%4;return {state,rider:Math.floor(n/4)%2,harness:Math.floor(n/8)%2,turn:Math.floor(n/16)===1?-1:Math.floor(n/16)===2?1:0,progress:Math.min(1,(value-n)/.999)};}

const bakedPoseCache=new WeakMap();
function sampleBakedHorsePose(asset,values={},elapsed=0){let data=bakedPoseCache.get(asset);if(!data){const bytes=Uint8Array.from(atob(asset.animation.data),c=>c.charCodeAt(0));data=new Float32Array(bytes.buffer);bakedPoseCache.set(asset,data);}const value={speed:0,phase:0,state:0,stateT:0,turn:0,...values},v=resolveHorseVisual({...value,stateT:value.stateT+elapsed});if(v.clip==='idle')v.phase=value.phase+elapsed*.28;else if(HORSE_GAITS[v.clip])v.phase=value.phase+elapsed*value.speed/HORSE_GAITS[v.clip].stride;else if(v.clip.startsWith('turn'))v.phase=value.phase+elapsed/1.6;
 function read(clip,phase){const info=asset.animation.clips.find(c=>c.name===clip),t=info.loop?wrap(phase):clamp(phase),f=t*(info.loop?info.frames:Math.max(0,info.frames-1)),a=Math.floor(f),b=info.loop?(a+1)%info.frames:Math.min(a+1,info.frames-1),w=f-a,m=new Float32Array(240);for(let i=0;i<240;i++)m[i]=data[(info.offset+a)*256+i]*(1-w)+data[(info.offset+b)*256+i]*w;return m;}
 let matrices=read(v.clip,v.phase);if(!value.state&&!value.turn){const speed=Math.abs(value.speed),edge=speed<1?.04:speed<3.5?2.5:speed<6.5?4.6:8.3,width=edge<.1?.04:.20;if(Math.abs(speed-edge)<width){const index=edge<.1?0:edge<3?1:edge<5?2:3,names=['idle','walk','trot','canter','gallop'],a=names[index],b=names[index+1],phase=c=>value.phase+elapsed*(c==='idle'?.28:value.speed/HORSE_GAITS[c].stride),ma=read(a,phase(a)),mb=read(b,phase(b)),t=clamp((speed-edge+width)/(width*2)),w=t*t*(3-2*t);for(let i=0;i<240;i++)matrices[i]=ma[i]*(1-w)+mb[i]*w;}}
 return {matrices,clip:v.clip,phase:v.phase};}

Object.assign(api,{EXTRA_CLIPS,resolveHorseVisual,deformedHorseBounds,sampleExtraPose,horseSaddleMatrix,packHorseFlags,unpackHorseFlags,sampleBakedHorsePose});})();
(()=>{const {sampleExtraPose,resolveHorseVisual,packHorseFlags}=api;
const {horseTargetSpeed}=api;
const {HORSE_COATS,horseIdentity}=api;const {horsePose,HORSE_GAITS,HORSE_BONES}=api;
function createBattleHorseRenderer(THREE,scene,renderer,asset,capacity=10000,poseSampler=null,poseAdjuster=null){
 const supportsPose=renderer.capabilities.maxVertexTextures>0&&(renderer.capabilities.isWebGL2||renderer.extensions.has('OES_texture_float'));
 const bytes=Uint8Array.from(atob(asset.animation.data),c=>c.charCodeAt(0)),baked=new Float32Array(bytes.buffer),live=new Float32Array(64*4);
 function texture(data,w,h,type){const t=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,type);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;}
 const bakedTex=supportsPose?texture(baked,64,asset.animation.height,THREE.FloatType):null,liveTex=supportsPose?texture(live,64,1,THREE.FloatType):null,palette=new Uint8Array(16*4),color=new THREE.Color();
 HORSE_COATS.forEach((c,i)=>{for(const [j,key]of [[0,'body'],[8,'dark']]){color.setRGB(...c[key]).convertSRGBToLinear();palette.set([color.r,color.g,color.b,1].map(v=>Math.round(v*255)),(j+i)*4);}});const coatTex=texture(palette,16,1,THREE.UnsignedByteType);
 const shared={uHorseTime:{value:0},uHorseMoving:{value:1},uHorseClip:{value:2},uHorsePalette:{value:coatTex},uHorseExternal:{value:0},uHorseElapsed:{value:0}};
 const geometries=asset.lods.map(l=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(l.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(l.normals,3));const packed=[];for(let i=0;i<l.vertices;i++)packed.push(l.skin[i*4]*32+l.skin[i*4+1],l.skin[i*4+3]+l.skin[i*4+2]*.999);g.setAttribute('uv',new THREE.Float32BufferAttribute(packed,2));g.setIndex(l.indices);g.computeBoundingSphere();return g;});
 const clipInfo=asset.animation.clips.map((c,i)=>`if(clip<${i+.5})return vec4(${c.offset.toFixed(1)},${c.frames.toFixed(1)},${c.duration.toFixed(3)},${c.loop?'1.0':'0.0'});`).join('');
 function material(primary,coarse=false){const m=new THREE.MeshLambertMaterial({color:0xffffff});m.customProgramCacheKey=()=>`horse-battle-v3-${primary}-${supportsPose}-${coarse}`;
  m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,shared,{uHorsePrimary:{value:primary?1:0},uHorsePose:{value:primary?liveTex:bakedTex},uHorseTexHeight:{value:primary?1:asset.animation.height}});
   sh.vertexShader=`attribute vec4 horseData;uniform float uHorseTime,uHorseMoving,uHorseClip,uHorsePrimary,uHorseTexHeight,uHorseExternal,uHorseElapsed;varying float vHorseRider,vHorseHarness;varying vec3 vHorseLook;varying float vHorseRegion,vHorseY;
${supportsPose?`uniform sampler2D uHorsePose;
vec4 horseClipInfo(float clip){${clipInfo}return vec4(0,48,3,1);}
mat4 horseMatrix(float bone,float clip,float phase){vec4 info=horseClipInfo(clip);float f=(info.w>.5?fract(phase):clamp(phase,0.0,1.0))*(info.w>.5?info.y:max(0.0,info.y-1.0)),a=uHorsePrimary>.5?0.0:info.x+floor(f),b=uHorsePrimary>.5?0.0:info.x+(info.w>.5?mod(floor(f)+1.0,info.y):min(floor(f)+1.0,info.y-1.0)),w=uHorsePrimary>.5?0.0:fract(f),x=bone*3.0;vec4 r0=mix(texture2D(uHorsePose,vec2((x+.5)/64.0,(a+.5)/uHorseTexHeight)),texture2D(uHorsePose,vec2((x+.5)/64.0,(b+.5)/uHorseTexHeight)),w),r1=mix(texture2D(uHorsePose,vec2((x+1.5)/64.0,(a+.5)/uHorseTexHeight)),texture2D(uHorsePose,vec2((x+1.5)/64.0,(b+.5)/uHorseTexHeight)),w),r2=mix(texture2D(uHorsePose,vec2((x+2.5)/64.0,(a+.5)/uHorseTexHeight)),texture2D(uHorsePose,vec2((x+2.5)/64.0,(b+.5)/uHorseTexHeight)),w);return mat4(vec4(r0.x,r1.x,r2.x,0),vec4(r0.y,r1.y,r2.y,0),vec4(r0.z,r1.z,r2.z,0),vec4(r0.w,r1.w,r2.w,1));}`:`mat4 horseMatrix(float bone,float clip,float phase){return mat4(1.0);}`}
`+sh.vertexShader;
   if(coarse||primary)for(const off of ['.5','1.5','2.5']){const a=`texture2D(uHorsePose,vec2((x+${off})/64.0,(a+.5)/uHorseTexHeight))`,b=`texture2D(uHorsePose,vec2((x+${off})/64.0,(b+.5)/uHorseTexHeight))`;sh.vertexShader=sh.vertexShader.replace(`mix(${a},${b},w)`,a);}
   sh.vertexShader=sh.vertexShader.replace('#include <beginnormal_vertex>',`vec4 horseSkin=vec4(floor(uv.x/32.0),mod(uv.x,32.0),fract(uv.y)/.999,floor(uv.y));if(horseSkin.z>.998)horseSkin.z=1.0;float flags=floor(horseData.w),state=mod(flags,4.0),progress=fract(horseData.w)/.999,turnState=floor(flags/16.0),speed=abs(horseData.y);vHorseRider=mod(floor(flags/4.0),2.0);vHorseHarness=mod(floor(flags/8.0),2.0);float clip=uHorseExternal>.5?(speed<.04?0.0:speed<2.5?1.0:speed<4.6?2.0:speed<8.3?3.0:4.0):(uHorseMoving>.5?uHorseClip:0.0),stride=clip<.5?1.0:clip<1.5?${HORSE_GAITS.walk.stride}:clip<2.5?${HORSE_GAITS.trot.stride}:clip<3.5?${HORSE_GAITS.canter.stride}:${HORSE_GAITS.gallop.stride};float elapsed=uHorseExternal>.5?uHorseElapsed:uHorseTime,phase=horseData.x+elapsed*(clip<.5?.28:horseData.y/stride);if(state>.5&&state<1.5){float t=progress+uHorseElapsed/2.0;if(t<1.0){clip=5.0;phase=clamp(t,0.0,1.0);}else{clip=0.0;phase=horseData.x+uHorseElapsed*.28;}}else if(state>1.5&&state<2.5){float t=progress+uHorseElapsed/1.5;clip=t>=1.0?7.0:6.0;phase=clamp(t,0.0,1.0);}else if(state>2.5){clip=7.0;phase=0.0;}else if(turnState>.5){clip=turnState<1.5?8.0:9.0;phase=horseData.x+uHorseElapsed/1.6;}if(uHorsePrimary>.5){clip=0.0;phase=horseData.x;}float otherClip=-1.0,blend=0.0,otherPhase=0.0;if(uHorseExternal>.5&&uHorsePrimary<.5&&state<.5&&turnState<.5){float edge=speed<1.0?.04:speed<3.5?2.5:speed<6.5?4.6:8.3,width=edge<.1?.04:.20;if(abs(speed-edge)<width){clip=edge<.1?0.0:edge<3.0?1.0:edge<5.0?2.0:3.0;otherClip=clip+1.0;blend=smoothstep(edge-width,edge+width,speed);float sa=clip<.5?1.0:clip<1.5?${HORSE_GAITS.walk.stride}:clip<2.5?${HORSE_GAITS.trot.stride}:${HORSE_GAITS.canter.stride},sb=otherClip<1.5?${HORSE_GAITS.walk.stride}:otherClip<2.5?${HORSE_GAITS.trot.stride}:otherClip<3.5?${HORSE_GAITS.canter.stride}:${HORSE_GAITS.gallop.stride};phase=horseData.x+elapsed*(clip<.5?.28:horseData.y/sa);otherPhase=horseData.x+elapsed*horseData.y/sb;}}mat4 hm=horseMatrix(horseSkin.x,clip,phase);if(blend>0.0)hm=hm*(1.0-blend)+horseMatrix(horseSkin.x,otherClip,otherPhase)*blend;if(horseSkin.z<.999){mat4 hm2=horseMatrix(horseSkin.y,clip,phase);if(blend>0.0)hm2=hm2*(1.0-blend)+horseMatrix(horseSkin.y,otherClip,otherPhase)*blend;hm=hm*horseSkin.z+hm2*(1.0-horseSkin.z);}vec3 horsePoint=(hm*vec4(position,1.0)).xyz;vec3 objectNormal=normalize(mat3(hm)*normal);float theta=uHorsePrimary>.5||uHorseMoving<.5||uHorseExternal>.5?0.0:uHorseTime*horseData.y/24.0;mat3 turn=mat3(cos(theta),0,-sin(theta),0,1,0,sin(theta),0,cos(theta));horsePoint=turn*horsePoint;objectNormal=turn*objectNormal;vHorseLook=vec3(mod(horseData.z,8.0),floor(mod(horseData.z,16.0)/8.0),floor(horseData.z/16.0));vHorseRegion=horseSkin.w;vHorseY=position.y;`);
   sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','vec3 transformed=horsePoint;if(uHorsePrimary<.5&&uHorseMoving>.5&&uHorseExternal<.5){transformed.x+=24.0*(1.0-cos(theta));transformed.z+=24.0*sin(theta);}');
   sh.fragmentShader='uniform sampler2D uHorsePalette;varying vec3 vHorseLook;varying float vHorseRegion,vHorseY,vHorseRider,vHorseHarness;\n'+sh.fragmentShader;
   sh.fragmentShader=sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec3 coat=texture2D(uHorsePalette,vec2((vHorseLook.x+.5)/16.0,.5)).rgb,dark=texture2D(uHorsePalette,vec2((vHorseLook.x+8.5)/16.0,.5)).rgb;float region=floor(vHorseRegion+.5);vec3 horseColor=coat;if(region>12.5&&vHorseHarness<.5)discard;if(region>4.5&&region<7.5&&vHorseRider<.5)discard;if(region>12.5)horseColor=vec3(.07,.035,.013);else if(region>.5&&region<1.5)horseColor=dark;else if(region<2.5&&region>1.5)horseColor=vec3(.018,.016,.014);else if(region<3.5&&region>2.5)horseColor=vec3(.002);else if(region<4.5&&region>3.5)horseColor=coat*.42;else if(region<5.5&&region>4.5)horseColor=vec3(.025,.055,.052);else if(region<6.5&&region>5.5)horseColor=vec3(.075,.038,.016);else if(region<7.5&&region>6.5)horseColor=vec3(.20,.20,.17);else if(region<8.5&&region>7.5)horseColor=vHorseLook.y>.5?vec3(.75,.72,.65):coat;else if(region>8.5){float bit=pow(2.0,region-9.0),sock=mod(floor(floor(vHorseLook.z+.5)/bit+.001),2.0);horseColor=sock>.5&&vHorseY<.43?vec3(.70,.68,.61):coat;}diffuseColor.rgb*=horseColor;`);
  };return m;
 }
 const mats=[material(false),material(false),material(false,true)],crowd=geometries.map((g,i)=>{const geo=g.clone(),data=new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4);geo.setAttribute('horseData',data);const mesh=new THREE.InstancedMesh(geo,mats[i],capacity);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);return {mesh,data};});
 const pgeo=geometries[0].clone(),pData=new THREE.InstancedBufferAttribute(new Float32Array(4),4);pgeo.setAttribute('horseData',pData);const primary=new THREE.InstancedMesh(pgeo,material(true),1);primary.frustumCulled=false;scene.add(primary);
 const harness=asset.attachments.harness.lods.map((l,i)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(l.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(l.normals,3));const packed=[];for(let i=0;i<l.vertices;i++)packed.push(l.skin[i*4]*32+l.skin[i*4+1],l.skin[i*4+3]+l.skin[i*4+2]*.999);g.setAttribute('uv',new THREE.Float32BufferAttribute(packed,2));g.setIndex(l.indices);const data=new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4);g.setAttribute('horseData',data);const mesh=new THREE.InstancedMesh(g,mats[i],capacity);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);return {mesh,data};});
 const hgeo=harness[0].mesh.geometry.clone(),hdata=new THREE.InstancedBufferAttribute(new Float32Array(4),4);hgeo.setAttribute('horseData',hdata);const primaryHarness=new THREE.InstancedMesh(hgeo,primary.material,1);primaryHarness.frustumCulled=false;primaryHarness.visible=false;scene.add(primaryHarness);
 const identities=Array.from({length:capacity},(_,i)=>horseIdentity('crowd-'+i,8103)),bases=new Float32Array(capacity*2),previousLOD=new Int8Array(capacity).fill(2),frustum=new THREE.Frustum(),pv=new THREE.Matrix4(),sphere=new THREE.Sphere(),dummy=new THREE.Object3D();let total=1,lastUpdate=-Infinity,placed=1,externalRows=null,uploadTime=0;
 const metrics={placed:1,submitted:1,culled:0,lods:[1,0,0],triangles:asset.lods[0].triangles,horseDrawCalls:1};
 function setCount(n){externalRows=null;shared.uHorseExternal.value=0;primary.visible=true;total=Math.max(1,Math.min(capacity,Math.floor(n)));const cols=Math.ceil(Math.sqrt((total-1)*1.6)),rows=Math.ceil((total-1)/Math.max(1,cols));for(let i=0;i<total-1;i++){bases[i*2]=(i%cols-(cols-1)/2)*4.2;bases[i*2+1]=30+Math.floor(i/cols)*5;}lastUpdate=-Infinity;placed=total;return {width:Math.max(20,cols*4.2),depth:Math.max(20,rows*5),centerZ:30+rows*2.5};}
 function setInstances(rows,{includePrimary=false,time=shared.uHorseTime.value}={}){if(rows.length>capacity-(includePrimary?1:0))throw Error('Horse capacity exceeded');externalRows=rows.map((r,i)=>{for(const key of ['x','y','z','yaw','speed','phase','state','stateT','coat','scale'])if(r[key]!==undefined&&!Number.isFinite(r[key]))throw Error('Invalid horse '+key);if(r.scale!==undefined&&r.scale<=0)throw Error('Invalid horse scale');if(r.state!==undefined&&![0,1,2,3].includes(r.state))throw Error('Invalid horse state');return {x:0,y:0,z:0,yaw:0,speed:0,phase:(i*.61803398875)%1,state:0,stateT:0,coat:i%8,rider:1,harness:0,scale:1,...r};});primary.visible=includePrimary;primaryHarness.visible=includePrimary&&primaryHarness.visible;shared.uHorseExternal.value=1;uploadTime=time;shared.uHorseElapsed.value=0;total=rows.length+(includePrimary?1:0);placed=total;lastUpdate=-Infinity;}
 let previousMode=null,transitionTime=1,transitionFrom=null,lastMatrices=null;
 function updatePrimary(s,groundOffsets={},dt=1/60){const visual=s.action??(s.state||s.turn?resolveHorseVisual({speed:s.speed,phase:s.phase,state:s.state,stateT:s.stateT,turn:s.turn}):{clip:s.mode,phase:s.phase});const pose=poseSampler?poseSampler(s,groundOffsets,dt):sampleExtraPose(visual.phase,visual.clip,groundOffsets);const poseKey=s.action?.clip??s.mode;if(lastMatrices&&previousMode!==poseKey){transitionTime=0;transitionFrom=lastMatrices.slice();}previousMode=poseKey;transitionTime+=dt;if(transitionFrom&&transitionTime<.16){const t=transitionTime/.16,w=t*t*(3-2*t);for(let i=0;i<pose.matrices.length;i++)pose.matrices[i]=transitionFrom[i]*(1-w)+pose.matrices[i]*w;}if(poseAdjuster)poseAdjuster(pose,s,groundOffsets);lastMatrices=pose.matrices.slice();live.fill(0);live.set(pose.matrices);if(liveTex)liveTex.needsUpdate=true;dummy.position.set(s.x,s.y+.012,s.z);dummy.rotation.set(0,s.yaw,0);dummy.scale.setScalar(s.identity.scale);dummy.updateMatrix();primary.setMatrixAt(0,dummy.matrix);primary.instanceMatrix.needsUpdate=true;const flags=packHorseFlags({rider:s.rider??1,harness:s.harness??0});pData.setXYZW(0,s.phase,s.speed,s.identity.appearance,flags);pData.needsUpdate=true;primaryHarness.visible=primary.visible&&!!s.harness;primaryHarness.setMatrixAt(0,dummy.matrix);primaryHarness.instanceMatrix.needsUpdate=true;hdata.setXYZW(0,s.phase,s.speed,s.identity.appearance,flags);hdata.needsUpdate=true;return pose;}
 function updateCrowd(camera,time,moving=true,mode='trot',force=false){shared.uHorseTime.value=time;shared.uHorseElapsed.value=Math.max(0,time-uploadTime);shared.uHorseMoving.value=moving?1:0;shared.uHorseClip.value=['idle','walk','trot','canter','gallop'].indexOf(mode);if(!force&&time-lastUpdate<.1)return;lastUpdate=time;camera.updateMatrixWorld();pv.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(pv);const counts=[0,0,0],hcounts=[0,0,0];let culled=0;const n=externalRows?externalRows.length:total-1;
 for(let i=0;i<n;i++){const row=externalRows?.[i],id=identities[i],scale=row?.scale??id.scale,speed=row?.speed??horseTargetSpeed(mode,id),t=row?0:moving?time*speed/24:0,x=row?.x??bases[i*2]+(moving?24*(1-Math.cos(t))*scale:0),z=row?.z??bases[i*2+1]+(moving?24*Math.sin(t)*scale:0),y=row?.y??0;sphere.center.set(x,y+1.7,z);sphere.radius=4.3*scale;if(!frustum.intersectsSphere(sphere)){culled++;continue;}const d=camera.position.distanceTo(sphere.center),old=previousLOD[i],lod=d<(old===0?48:40)?0:d<(old===1?150:135)?1:2;previousLOD[i]=lod;const j=counts[lod]++,entry=crowd[lod],flags=packHorseFlags(row??{rider:1}),appearance=row?Math.max(0,Math.min(7,Math.floor(row.coat)))+(row.blaze?8:0)+(row.socks??0)*16:id.appearance;dummy.position.set(row?x:bases[i*2],y+.012,row?z:bases[i*2+1]);dummy.rotation.set(0,row?.yaw??0,0);dummy.scale.setScalar(scale);dummy.updateMatrix();entry.mesh.setMatrixAt(j,dummy.matrix);entry.data.setXYZW(j,row?.phase??(i*.61803398875)%1,speed,appearance,flags);if(row?.harness){const h=harness[lod],k=hcounts[lod]++;h.mesh.setMatrixAt(k,dummy.matrix);h.data.setXYZW(k,row.phase,speed,appearance,flags);}}
 for(let l=0;l<3;l++){for(const [arr,c]of [[crowd,counts],[harness,hcounts]]){arr[l].mesh.count=c[l];arr[l].mesh.instanceMatrix.needsUpdate=true;arr[l].data.needsUpdate=true;}}
 const p=primary.visible?1:0,hp=primaryHarness.visible?1:0;Object.assign(metrics,{placed,submitted:p+counts.reduce((a,b)=>a+b,0),culled,lods:[counts[0]+p,counts[1],counts[2]],harness:hcounts.reduce((a,b)=>a+b,0)+hp,triangles:asset.lods[0].triangles*p+asset.attachments.harness.lods[0].triangles*hp+counts.reduce((v,c,i)=>v+c*asset.lods[i].triangles+hcounts[i]*asset.attachments.harness.lods[i].triangles,0),horseDrawCalls:p+hp+counts.filter(Boolean).length+hcounts.filter(Boolean).length});
 }

 function setHorseLods(lods){
  if(!Array.isArray(lods)||lods.length!==3)throw Error('Expected three horse LODs');
  for(let i=0;i<3;i++){const l=lods[i],base=asset.lods[i];if(l.positions.length!==base.positions.length||l.normals.length!==base.normals.length||l.indices.length!==base.indices.length||l.indices.some((v,j)=>v!==base.indices[j])||l.skin.length!==base.skin.length||l.skin.some((v,j)=>v!==base.skin[j]))throw Error('Horse comparison must preserve topology and skinning');}
  for(let i=0;i<3;i++)for(const geo of [geometries[i],crowd[i].mesh.geometry,...(i===0?[pgeo]:[])]){
   for(const name of ['position','normal']){const attr=geo.getAttribute(name);attr.array.set(lods[i][name==='position'?'positions':'normals']);attr.needsUpdate=true;}
   geo.computeBoundingSphere();
  }
 }

 return {setHorseLods,setCount,setInstances,updatePrimary,updateCrowd,primary,primaryHarness,crowd,harness,metrics,supportsPose,get gpuStaticBytes(){return baked.byteLength+live.byteLength+palette.byteLength+capacity*80*6;},dispose(){for(const e of harness){scene.remove(e.mesh);e.mesh.geometry.dispose();}scene.remove(primaryHarness);hgeo.dispose();for(const e of crowd){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}scene.remove(primary);pgeo.dispose();primary.material.dispose();bakedTex?.dispose();liveTex?.dispose();coatTex.dispose();}};
}

Object.assign(api,{createBattleHorseRenderer});})();
(()=>{function createCartRenderer(THREE,scene,asset,capacity=1000){
 const dummy=new THREE.Object3D(),colors=[[.25,.13,.06],[.045,.037,.025],[.43,.26,.12],[.55,.42,.16],[.35,.20,.09]],entries=asset.lods.map((l,lod)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(l.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(l.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(l.parts,2));g.setIndex(l.indices);const data=new THREE.InstancedBufferAttribute(new Float32Array(capacity*4),4);g.setAttribute('cartData',data);const material=new THREE.MeshLambertMaterial({color:0xffffff,side:THREE.DoubleSide});material.customProgramCacheKey=()=>`woh-covered-wagon-${lod}`;material.onBeforeCompile=s=>{s.vertexShader='attribute vec4 cartData;varying vec4 vCart;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>',`vec2 cartPart=uv;vec3 cartPoint=position;vec3 objectNormal=normal;float part=cartPart.x;if(part>.5&&part<4.5){vec3 center=vec3(mod(part,2.0)<.5?.77:-.77,.48,part<2.5?.9:-.9);float a=cartData.x/.48,c=cos(a),sn=sin(a);mat3 spin=mat3(1,0,0,0,c,sn,0,-sn,c);float b=part<2.5?cartData.z:0.0;mat3 steer=mat3(cos(b),0,-sin(b),0,1,0,sin(b),0,cos(b));cartPoint=center+steer*spin*(position-center);objectNormal=steer*spin*normal;}vCart=vec4(part,cartPart.y,cartData.y,cartData.w);`);s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','vec3 transformed=cartPoint;');s.fragmentShader='varying vec4 vCart;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>\nfloat part=floor(vCart.x+.5),region=floor(vCart.y+.5);if(part>6.5&&part<7.5&&vCart.w<.5)discard;if(part>4.5&&part<6.5&&vCart.z>1.5)discard;${lod===2?'':"if(part>4.5&&part<5.5&&vCart.z>.5)discard;if(part>5.5&&part<6.5&&vCart.z<.5)discard;"}vec3 color=vec3(.25,.13,.06);if(region>.5&&region<1.5)color=vec3(.045,.037,.025);else if(region<2.5&&region>1.5)color=vec3(.43,.26,.12);else if(region<3.5&&region>2.5)color=vec3(.55,.42,.16);else if(region>3.5)color=${lod===2?'vCart.z>.5?vec3(.55,.42,.16):vec3(.35,.20,.09)':'vec3(.35,.20,.09)'};if(region>4.5&&region<5.5)color=vec3(.78,.76,.67);else if(region>5.5)color=vec3(.52,.48,.38);diffuseColor.rgb*=color;`);};const mesh=new THREE.InstancedMesh(g,material,capacity);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);return {mesh,data};});
 const metrics={submitted:0,lods:[0,0,0],drawCalls:0,triangles:0};
 function update(rows,camera){if(rows.length>capacity)throw Error('Cart capacity exceeded');const counts=[0,0,0];for(const r of rows){const d=camera?Math.hypot(camera.position.x-r.x,camera.position.y-(r.y??0),camera.position.z-r.z):0,lod=d<45?0:d<130?1:2,j=counts[lod]++,e=entries[lod];dummy.position.set(r.x,r.y??0,r.z);dummy.rotation.set(0,r.yaw??0,0);dummy.scale.setScalar(r.scale??1);dummy.updateMatrix();e.mesh.setMatrixAt(j,dummy.matrix);e.data.setXYZW(j,r.distance??0,r.cargo??0,r.frontSteer??0,r.canopy===false||r.canopy===0?0:1);}for(let i=0;i<3;i++){entries[i].mesh.count=counts[i];entries[i].mesh.instanceMatrix.needsUpdate=true;entries[i].data.needsUpdate=true;}Object.assign(metrics,{submitted:rows.length,lods:counts,drawCalls:counts.filter(Boolean).length,triangles:counts.reduce((s,n,i)=>s+n*asset.lods[i].triangles,0)});}
 return {update,entries,metrics};
}

Object.assign(api,{createCartRenderer});})();
root.WohHorseView=api;})(typeof globalThis!=="undefined"?globalThis:this);
