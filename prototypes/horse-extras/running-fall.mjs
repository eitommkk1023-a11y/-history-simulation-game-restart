import {horsePose,HORSE_BONES} from '../horse/motion.mjs';
import {sampleExtraPose,resolveHorseVisual,deformedHorseBounds} from './motion.mjs';
import {point34,multiply34,pivot34,align34,quaternion34} from './rig-math.mjs';
const clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>{v=clamp(v);return v*v*(3-2*v);},mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),sub=(a,b)=>a.map((v,i)=>v-b[i]),length=v=>Math.hypot(...v),normalize=(v,L=1)=>{const d=length(v)||1;return v.map(x=>x*L/d);};
const chains=['LF','RF','LH','RH'].map(name=>HORSE_BONES.map((b,i)=>({...b,index:i})).filter(b=>b.leg===name));
const dead=sampleExtraPose(0,'dead'),cache=new WeakMap();
function matrixAt(p,index){return Array.from(p.matrices.subarray(index*12,index*12+12));}
function inverse(m){const r=[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0];const t=point34(r,[-m[3],-m[7],-m[11]]);r[3]=t[0];r[7]=t[1];r[11]=t[2];return r;}
function rigidMix(a,b,t){
 const qa=quaternion34(a),qb=quaternion34(b);if(qa.reduce((s,v,i)=>s+v*qb[i],0)<0)for(let i=0;i<4;i++)qb[i]*=-1;
 const [x,y,z,w]=normalize(mix(qa,qb,t)),m=[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),0,2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),0,2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y),0];
 m[3]=a[3]+(b[3]-a[3])*t;m[7]=a[7]+(b[7]-a[7])*t;m[11]=a[11]+(b[11]-a[11])*t;return m;
}
function knee(a,b,L1,L2,sign,plane){
 const v=sub(b,a),d=Math.max(.00001,Math.min(length(v),L1+L2-.000001)),u=normalize(v),along=(L1*L1-L2*L2+d*d)/(2*d),perp=Math.sqrt(Math.max(0,L1*L1-along*along));
 let bend=[plane[1]*u[2]-plane[2]*u[1],plane[2]*u[0]-plane[0]*u[2],plane[0]*u[1]-plane[1]*u[0]];if(length(bend)<.001)bend=[0,0,1];bend=normalize(bend);
 return a.map((x,i)=>x+u[i]*along+bend[i]*perp*sign);
}
function putLeg(m,chain,points){for(let k=0;k<4;k++)m.set(align34(chain[k].p,chain[k].end,points[k],points[k+1]),chain[k].index*12);}
function keyPose(sink,pitch,roll,frontAngle,hindAngle,ground={}){
 const root=multiply34(pivot34('z',roll,[0,.5,0],[roll? .12:0,0,0]),pivot34('x',pitch,[0,1.15,0],[0,-sink,0])),m=new Float32Array(240);m.set(root);
 const neck=multiply34(root,pivot34('x',.08,HORSE_BONES[1].p));m.set(neck,12);m.set(multiply34(neck,pivot34('x',.05,HORSE_BONES[2].p)),24);m.set(root,36);
 const plane=[root[0],root[4],root[8]];
 for(const chain of chains){const front=chain[0].leg.endsWith('F'),hip=point34(root,chain[0].p),hoof=[chain[3].end[0],.075+(ground[chain[0].leg]??0),front?(sink>.6?1.55:1.45):-.55],last=sub(chain[3].p,chain[3].end),fetlock=hoof.map((v,i)=>v+last[i]),L=length(sub(chain[2].end,chain[2].p)),angle=front?frontAngle:hindAngle,middle=[fetlock[0],fetlock[1]+L*Math.cos(angle),fetlock[2]-L*Math.sin(angle)],upper=knee(hip,middle,length(sub(chain[0].end,chain[0].p)),length(sub(chain[1].end,chain[1].p)),front?1:-1,plane);putLeg(m,chain,[hip,upper,middle,fetlock,hoof]);}
 return {matrices:m};
}
function blendPose(a,b,t){
 const m=new Float32Array(240),root=rigidMix(matrixAt(a,0),matrixAt(b,0),t);m.set(root);
 for(let i=1;i<4;i++){const parent=HORSE_BONES[i].parent,pa=matrixAt(a,parent),pb=matrixAt(b,parent),ra=multiply34(inverse(pa),matrixAt(a,i)),rb=multiply34(inverse(pb),matrixAt(b,i));m.set(multiply34(Array.from(m.subarray(parent*12,parent*12+12)),rigidMix(ra,rb,t)),i*12);}
 const plane=[root[0],root[4],root[8]];
 for(const chain of chains){const j=chain[3].index,k=chain[2].index,ha=point34(matrixAt(a,j),chain[3].end),hb=point34(matrixAt(b,j),chain[3].end),hoof=mix(ha,hb,t),fa=point34(matrixAt(a,j),chain[3].p),fb=point34(matrixAt(b,j),chain[3].p),last=normalize(mix(sub(fa,ha),sub(fb,hb),t),length(sub(chain[3].p,chain[3].end))),fetlock=hoof.map((v,i)=>v+last[i]),ma=point34(matrixAt(a,k),chain[2].p),mb=point34(matrixAt(b,k),chain[2].p),lower=normalize(mix(sub(ma,fa),sub(mb,fb),t),length(sub(chain[2].p,chain[2].end))),middle=fetlock.map((v,i)=>v+lower[i]),hip=point34(root,chain[0].p),upper=knee(hip,middle,length(sub(chain[0].end,chain[0].p)),length(sub(chain[1].end,chain[1].p)),chain[0].leg.endsWith('F')?1:-1,plane);putLeg(m,chain,[hip,upper,middle,fetlock,hoof]);}
 return {matrices:m};
}
export function sampleRunningFallPose(elapsed,{speed=0,mode='idle',phase=0,sourceMatrices}={},ground={}){
 if(Math.abs(speed)<2.5)return sampleExtraPose(clamp(elapsed/1.5),'fall',ground);
 const source=sourceMatrices??horsePose(phase,mode,ground).matrices;
 if(elapsed<=0)return {matrices:new Float32Array(source),clip:'running_fall'};
 if(elapsed>=1.5)return {...dead,matrices:new Float32Array(dead.matrices)};
 const power=.45+.55*ease((Math.abs(speed)-2.5)/6),signature=[power,...['LF','RF','LH','RH'].map(k=>ground[k]??0)].join(',');let entry=cache.get(source);
 if(!entry||entry.signature!==signature){entry={signature,source:{matrices:source},buckle:keyPose(.52*power,.34*power,0,1.2,.45,ground),impact:keyPose(.76*power,.17*power,-.14*power,1.43,1.2,ground)};cache.set(source,entry);}
 let pose;if(elapsed<.28)pose=blendPose(entry.source,entry.buckle,ease(elapsed/.28));else if(elapsed<.6)pose=blendPose(entry.buckle,entry.impact,ease((elapsed-.28)/.32));else pose=blendPose(entry.impact,dead,ease((elapsed-.6)/.9));
 if(elapsed>1){const w=ease((elapsed-1)/.5);for(let i=0;i<20;i++)pose.matrices.set(rigidMix(matrixAt(pose,i),matrixAt(dead,i),w),i*12);}
 const bounds=deformedHorseBounds(pose.matrices),raise=Math.max(0,-.012-bounds.min[1]);if(raise){for(let i=0;i<20;i++)pose.matrices[i*12+7]+=raise;bounds.min[1]+=raise;bounds.max[1]+=raise;}
 return {...pose,clip:'running_fall',bounds,stage:elapsed<.28?'buckle':elapsed<.6?'impact':'settle'};
}
export function sampleStuntHorsePose(state,ground={}){
 const visual=state.action??(state.state||state.turn?resolveHorseVisual({speed:state.speed,phase:state.phase,state:state.state,stateT:state.stateT,turn:state.turn}):{clip:state.mode,phase:state.phase});
 if(visual.clip==='running_fall')return sampleRunningFallPose(visual.elapsed,{speed:visual.sourceSpeed,mode:visual.sourceMode,phase:visual.sourcePhase,sourceMatrices:visual.sourceMatrices},ground);
 return sampleExtraPose(visual.phase,visual.clip,ground);
}
