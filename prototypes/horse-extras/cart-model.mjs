import {meshBuilder} from './mesh-utils.mjs';
export const CART_WHEELS=Object.freeze([[-.77,.48,.90],[.77,.48,.90],[-.77,.48,-.90],[.77,.48,-.90]]);
export const CART_ANCHORS=Object.freeze({hitch:[0,.94,2.4],horseHitch:[0,.94,-1.25],team:[[-.6,0,0],[.6,0,0]],single:[[0,0,0]],wheelRadius:.48,seats:[{name:'driver',position:[0,1.52,1.04],yaw:0},{name:'passenger_l',position:[-.38,1.52,-.65],yaw:0},{name:'passenger_r',position:[.38,1.52,-.65],yaw:0}]});
export function buildCartModel(lod=0){const b=meshBuilder();b.box([0,.98,0],[1.42,.14,2.8]);
 if(lod<2){for(const x of [-.68,.68])b.box([x,1.32,0],[.09,.62,2.8]);for(const z of [-1.36,1.36])b.box([0,1.30,z],[1.4,.58,.09]);for(const z of [-.9,.9])b.box([0,.48,z],[1.65,.13,.13],0,1);if(lod===0)for(const x of [-.68,.68])for(const z of [-1.35,1.35])b.box([x,1.34,z],[.11,.76,.11]);}
 for(const x of [-.4,.4])b.beam([x,.91,1.15],[x*.5,.94,2.4],.045,0,0,lod===2?3:4);
 if(lod<2)b.beam([-.9,.94,2.4],[.9,.94,2.4],.035,0,0,4);else{b.tri([-.9,.91,2.4],[.9,.91,2.4],[-.9,.97,2.4],0,0);b.tri([.9,.91,2.4],[.9,.97,2.4],[-.9,.97,2.4],0,0);}
 for(let i=0;i<4;i++){const p=CART_WHEELS[i],part=i+1;if(lod===2){const a=[p[0],0,p[2]-.48],c=[p[0],.96,p[2]+.48],d=[p[0],0,p[2]+.48],e=[p[0],.96,p[2]-.48];b.tri(a,e,c,part,1);b.tri(a,c,d,part,1);}else{b.beam([p[0]-.09,p[1],p[2]],[p[0]+.09,p[1],p[2]],.48,part,1,lod===0?8:5);if(lod===0){b.box(p,[.2,.76,.065],part,2);b.box(p,[.2,.065,.76],part,2);}}}
 if(lod===2)b.box([0,1.30,0],[1.15,.55,2.25],5,4);
 else{for(const z of [-.65,.65]){b.box([0,1.29,z],[1.12,.53,1.05],5,4);if(lod===0){b.box([0,1.56,z],[1.14,.035,1.07],5,0);for(const x of [-.5,.5])b.box([x,1.29,z],[.035,.56,1.07],5,0);for(let k=0;k<6;k++){const a=k/6*Math.PI*2,c=(k+1)/6*Math.PI*2,p=[-.028,1.28+.347*Math.cos(a),z+.347*Math.sin(a)],q=[.028,p[1],p[2]],r=[-.028,1.28+.347*Math.cos(c),z+.347*Math.sin(c)],t=[.028,r[1],r[2]];b.tri(p,q,r,6,0);b.tri(q,t,r,6,0);}}b.beam([-.55,1.28,z],[.55,1.28,z],.34,6,3,lod===0?8:5);}}

 // Seats are shared by cargo and passenger variants. Keep the open end clear.
 if(lod<2){b.box([0,1.46,1.04],[1.30,.10,.42],0,0);b.box([0,1.46,-.65],[1.30,.10,.42],0,0);if(lod===0)b.box([0,1.62,-.91],[1.30,.16,.055],0,0);}
 // Optional canvas is an opaque, double-sided arch: no end caps across the entrance.
 const n=lod===0?8:lod===1?6:4,zs=lod===0?[-1.39,-.70,0,.70,1.39]:[-1.39,1.39],point=(a,z,r=1)=>[.75*Math.cos(a)*r,1.66+1.04*Math.sin(a)*r,z];
 for(let j=0;j<zs.length-1;j++)for(let k=0;k<n;k++){const a=k/n*Math.PI,c=(k+1)/n*Math.PI,p=point(a,zs[j]),q=point(c,zs[j]),r=point(a,zs[j+1]),t=point(c,zs[j+1]);b.tri(p,r,q,7,5);b.tri(q,r,t,7,5);}
 if(lod===0)for(const z of [-1.39,0,1.39])for(let k=0;k<n;k++){const a=k/n*Math.PI,c=(k+1)/n*Math.PI,p=point(a,z-.012,1.006),q=point(c,z-.012,1.006),r=point(a,z+.012,1.006),t=point(c,z+.012,1.006);b.tri(p,r,q,7,6);b.tri(q,r,t,7,6);}
 const model=b.finish(),canopyTriangles=model.parts.filter((p,i)=>i%2===0&&p===7).length/3;
 return {lod,...model,baseTriangles:model.triangles-canopyTriangles,canopyTriangles};}

export function buildHarnessModel(lod=0){const b=meshBuilder(),n=lod===0?10:6;if(lod===2){for(let i=0;i<4;i++){const a=i/4*Math.PI*2,c=(i+1)/4*Math.PI*2,p=[.28*Math.cos(a),1.39+.34*Math.sin(a),.70],q=[.28*Math.cos(c),1.39+.34*Math.sin(c),.70],r=[p[0]*.88,1.39+(p[1]-1.39)*.88,.70],s=[q[0]*.88,1.39+(q[1]-1.39)*.88,.70];b.tri(p,q,r,1,13);b.tri(q,s,r,1,13);}for(const x of [-.30,.30]){b.tri([x-.015,1.15,.7],[x+.015,1.15,.7],[x-.015,.94,-1.25],0,14);b.tri([x+.015,1.15,.7],[x+.015,.94,-1.25],[x-.015,.94,-1.25],0,14);}}else{for(let i=0;i<n;i++){const a=i/n*Math.PI*2,c=(i+1)/n*Math.PI*2;b.beam([.28*Math.cos(a),1.39+.34*Math.sin(a),.70],[.28*Math.cos(c),1.39+.34*Math.sin(c),.70],.035,1,13,4);}for(const x of [-.30,.30])b.beam([x,1.15,.70],[x,.94,-1.25],.015,0,14,3);}const g=b.finish(),skin=[];for(let i=0;i<g.vertices;i++){const bone=g.parts[i*2]===1?1:0;skin.push(bone,bone,1,g.parts[i*2+1]);}return {...g,lod,skin};}
export function freshCart(){return {x:0,y:0,z:-3.65,yaw:0,distance:0,frontSteer:0};}
export function stepCart(previous,horse,terrain){const hitch=localToWorld(horse,CART_ANCHORS.horseHitch),rear=localToWorld(previous,[0,0,-.9]),dx=hitch[0]-rear[0],dz=hitch[2]-rear[2],yaw=Math.hypot(dx,dz)>.001?Math.atan2(dx,dz):previous.yaw,x=hitch[0]-Math.sin(yaw)*2.4,z=hitch[2]-Math.cos(yaw)*2.4,y=terrain.height(x,z),distance=previous.distance+(x-previous.x)*Math.sin(yaw)+(z-previous.z)*Math.cos(yaw);return {x,y,z,yaw,distance,frontSteer:Math.max(-.5,Math.min(.5,Math.atan2(Math.sin(horse.yaw-yaw),Math.cos(horse.yaw-yaw))))};}
export function localToWorld(body,p){return [body.x+p[0]*Math.cos(body.yaw)+p[2]*Math.sin(body.yaw),(body.y??0)+p[1],body.z+p[2]*Math.cos(body.yaw)-p[0]*Math.sin(body.yaw)];}
