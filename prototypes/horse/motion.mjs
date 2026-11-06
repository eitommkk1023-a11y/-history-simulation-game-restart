const TAU=Math.PI*2,wrap=v=>((v%1)+1)%1,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const HORSE_GAITS=Object.freeze({idle:{duty:1,span:0,lift:0,stride:1},walk:{duty:.68,span:.42,lift:.13,stride:.84/.68},trot:{duty:.42,span:.57,lift:.25,stride:1.14/.42},canter:{duty:.32,span:.68,lift:.37,stride:1.36/.32}});
export function horseGait(phase,mode='idle'){
 const g=HORSE_GAITS[mode]??HORSE_GAITS.idle,offset=mode==='walk'?{LH:0,LF:.25,RH:.5,RF:.75}:mode==='trot'?{LH:0,RF:0,RH:.5,LF:.5}:{RH:0,LH:.23,RF:.23,LF:.48},feet={};
 for(const name of ['LF','RF','LH','RH']){const u=wrap(phase-offset[name]),stance=mode==='idle'||u<g.duty,t=stance?u/g.duty:(u-g.duty)/(1-g.duty),s=t*t*(3-2*t);feet[name]={stance,z:mode==='idle'?0:stance?g.span*(1-2*t):-g.span+2*g.span*s,lift:stance?0:g.lift*Math.sin(Math.PI*t)**1.3,roll:stance?-.10*Math.max(0,(t-.65)/.35):.2*Math.sin(Math.PI*t)};}
 return {feet,stride:g.stride,flight:Object.values(feet).every(f=>!f.stance)};
}
const bones=[{name:'body',parent:-1,p:[0,1.15,0],end:[0,1.5,0]},{name:'neck',parent:0,p:[0,1.25,.68],end:[0,1.93,1.05]},{name:'head',parent:1,p:[0,1.96,1.08],end:[0,1.56,1.69]},{name:'tail',parent:0,p:[0,1.39,-1.02],end:[0,.70,-1.37]}];
for(const [name,x]of [['LF',-.27],['RF',.27],['LH',-.29],['RH',.29]]){const front=name.endsWith('F'),pts=front?[[x,1.25,.58],[x,.91,.36],[x,.56,.63],[x,.20,.64],[x,.075,.73]]:[[x,1.31,-.78],[x,.86,-.44],[x,.53,-.90],[x,.20,-.76],[x,.075,-.65]];for(let k=0;k<4;k++)bones.push({name:name+k,parent:k?bones.length-1:0,p:pts[k],end:pts[k+1],leg:name,segment:k});}
export const HORSE_BONES=Object.freeze(bones);
function matrix(angle,p,rest){const c=Math.cos(angle),s=Math.sin(angle);return [1,0,0,p[0]-rest[0],0,c,-s,p[1]-c*rest[1]+s*rest[2],0,s,c,p[2]-s*rest[1]-c*rest[2]];}
function transform(m,p){return [m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3],m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7],m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]];}
function knee(a,b,L1,L2,sign){const dy=b[1]-a[1],dz=b[2]-a[2],d=clamp(Math.hypot(dy,dz),.01,L1+L2-.00001),uy=dy/Math.max(.0001,Math.hypot(dy,dz)),uz=dz/Math.max(.0001,Math.hypot(dy,dz)),along=(L1*L1-L2*L2+d*d)/(2*d),perp=Math.sqrt(Math.max(0,L1*L1-along*along));return [a[0],a[1]+uy*along-uz*perp*sign,a[2]+uz*along+uy*perp*sign];}
export function horsePose(phase,mode='idle',ground={}){
 const gait=horseGait(phase,mode),bob=mode==='idle'?.003*Math.sin(phase*TAU):mode==='walk'?.008*Math.sin(phase*TAU*2):mode==='trot'?-.055+.025*Math.cos(phase*TAU*2):-.10+.075*Math.sin(phase*TAU),pitch=mode==='canter'?.045*Math.sin(phase*TAU):mode==='trot'?.01*Math.sin(phase*TAU*2):0,root=matrix(pitch,[0,1.15+bob,0],[0,1.15,0]),matrices=new Float32Array(bones.length*12),joints={},feet={};matrices.set(root,0);
 matrices.set(matrix(pitch+(mode==='idle'?.018*Math.sin(phase*TAU):.04*Math.sin(phase*TAU)),transform(root,bones[1].p),bones[1].p),12);
 matrices.set(matrix(pitch+(mode==='canter'?.05*Math.sin(phase*TAU):.012*Math.sin(phase*TAU)),transform(root,bones[2].p),bones[2].p),24);
 matrices.set(matrix(pitch+.07*Math.sin(phase*TAU),transform(root,bones[3].p),bones[3].p),36);
 for(const name of ['LF','RF','LH','RH']){const chain=bones.filter(b=>b.leg===name),front=name.endsWith('F'),f=gait.feet[name],hip=transform(root,chain[0].p),groundY=ground[name]??0,hoof=[hip[0],.075+f.lift+groundY,chain[3].end[2]+f.z],fetlock=[hip[0],hoof[1]+.125,hoof[2]-.09];let middle,upper;
  if(front){const lean=clamp(-f.z*.35+f.lift*.65,-.27,.27);middle=[hip[0],fetlock[1]+Math.sqrt(.37*.37-lean*lean),fetlock[2]+lean];upper=knee(hip,middle,.40,.46,1);}else{const lean=clamp(-.14-f.z*.16-f.lift*.30,-.29,.05);middle=[hip[0],fetlock[1]+Math.sqrt(.36*.36-lean*lean),fetlock[2]+lean];upper=knee(hip,middle,.55,.57,-1);}
  const points=[hip,upper,middle,fetlock,hoof];joints[name]=points;feet[name]={...f,position:hoof};for(let k=0;k<4;k++){const bone=chain[k],restA=bone.p,restB=bone.end,a=points[k],b=points[k+1],angle=Math.atan2(b[2]-a[2],b[1]-a[1])-Math.atan2(restB[2]-restA[2],restB[1]-restA[1]);matrices.set(matrix(angle,a,restA),bones.indexOf(bone)*12);}
 }
 return {matrices,feet,joints,bob,pitch};
}
