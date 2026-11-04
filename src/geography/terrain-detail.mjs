/** Deterministic meter-scale relief; no global height grid or source writes. */
const detailSmooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const detailSmoothDerivative=t=>t<=0||t>=1?0:6*t*(1-t);
function detailSeedHash(seed){let h=2166136261;for(const c of String(seed))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function detailHash(seed,x,y){let h=seed^Math.imul(x,374761393)^Math.imul(y,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295*2-1;}
function detailNoise(x,y,spacing,seed){
 const qx=x/spacing,qy=y/spacing,ix=Math.floor(qx),iy=Math.floor(qy),u=qx-ix,v=qy-iy,a=detailHash(seed,ix,iy),b=detailHash(seed,ix+1,iy),c=detailHash(seed,ix,iy+1),d=detailHash(seed,ix+1,iy+1),sx=detailSmooth(u),sy=detailSmooth(v);
 return {h:a+(b-a)*sx+(c-a)*sy+(d-c-b+a)*sx*sy,dx:((b-a)+(d-c-b+a)*sy)*detailSmoothDerivative(u)/spacing,dy:((c-a)+(d-c-b+a)*sx)*detailSmoothDerivative(v)/spacing};
}
export function createDetailedTerrain(base,world,seed){
 const cache=new Map(),seedHash=detailSeedHash(seed),s=base.metersPerCell,W=base.width,H=base.height;
 function nodeWeight(x,y){
  const key=y*W+x,cached=cache.get(key);if(cached!==undefined)return cached;
  let distance=4;
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
   const d=Math.hypot(dx,dy);if(d>=distance)continue;const xx=x+dx,yy=y+dy;
   if(xx<0||yy<0||xx>=W||yy>=H||!world.type[yy*W+xx]||world.water[yy*W+xx])distance=d;
  }
  let weight=detailSmooth((distance-2)/2);
  if(weight){const h=(x,y)=>base.elevationToMeters(world.elev[Math.max(0,Math.min(H-1,y))*W+Math.max(0,Math.min(W-1,x))]);
   const slope=Math.hypot((h(x+1,y)-h(x-1,y))/(2*s),(h(x,y+1)-h(x,y-1))/(2*s));
   weight*=detailSmooth((Math.tan(Math.PI/6)-slope)/(Math.tan(Math.PI/6)-Math.tan(Math.PI/12)));
  }
  if(cache.size>=8192)cache.delete(cache.keys().next().value);cache.set(key,weight);return weight;
 }
 function sampleBase(xM,yM){
  const p=base.sampleBase(xM,yM),height=p.baseElevationM;
  if(!p.land||p.water||height<=0||height>=800)return {...p,detailElevationM:0};
  const gx=xM/s,gy=yM/s,x=Math.min(W-2,Math.floor(gx)),y=Math.min(H-2,Math.floor(gy)),u=gx-x,v=gy-y;
  const a=nodeWeight(x,y),b=nodeWeight(x+1,y),c=nodeWeight(x,y+1),d=nodeWeight(x+1,y+1),mixed=d-c-b+a;
  const weight=a+(b-a)*u+(c-a)*v+mixed*u*v,wx=((b-a)+mixed*v)/s,wy=((c-a)+mixed*u)/s;
  if(!weight)return {...p,detailElevationM:0};
  const lo=height/3,hi=(800-height)/300,g=detailSmooth(lo)*detailSmooth(hi),gh=detailSmoothDerivative(lo)/3*detailSmooth(hi)-detailSmooth(lo)*detailSmoothDerivative(hi)/300;
  const first=detailNoise(xM,yM,8,seedHash),second=detailNoise(xM,yM,24,seedHash^0x9e3779b9),noise=.65*first.h+.6*second.h,nx=.65*first.dx+.6*second.dx,ny=.65*first.dy+.6*second.dy;
  const bx=-p.normal.x/p.normal.y,by=-p.normal.z/p.normal.y,delta=g*weight*noise;
  const dx=bx+g*(wx*noise+weight*nx)+gh*bx*weight*noise,dy=by+g*(wy*noise+weight*ny)+gh*by*weight*noise,norm=Math.hypot(dx,1,dy);
  return {...p,baseElevationM:height+delta,detailElevationM:delta,normal:{x:-dx/norm,y:1/norm,z:-dy/norm},slopeDegrees:Math.atan(Math.hypot(dx,dy))*180/Math.PI};
 }
 return Object.freeze({...base,sampleBase,sampleMacro:base.sampleBase,get detailCacheSize(){return cache.size;}});
}
