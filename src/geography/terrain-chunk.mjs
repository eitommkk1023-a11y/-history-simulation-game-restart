/** Fixed-resolution metric terrain snapshot. No renderer or physics engine dependency. */
export function createTerrainChunk(terrain,{tileX,tileY,sizeM=64,segments=32}={}) {
  if (!terrain || typeof terrain.sampleBase!=='function') throw new TypeError('Expected world terrain');
  if (!Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY) || tileX<0 || tileY<0 ||
      !Number.isFinite(sizeM) || sizeM<=0 || !Number.isInteger(segments) || segments<1 || segments>128)
    throw new RangeError('Invalid chunk address, size or segment count');
  const xM=tileX*sizeM,yM=tileY*sizeM;
  if (!Number.isFinite(xM) || !Number.isFinite(yM)) throw new RangeError('Chunk origin overflow');
  if (xM>=terrain.widthM || yM>=terrain.heightM) return null;
  const widthM=Math.min(sizeM,terrain.widthM-xM),heightM=Math.min(sizeM,terrain.heightM-yM);
  const originM=Object.freeze({xM,yM,elevationM:terrain.sampleBase(xM,yM).baseElevationM});
  const edge=segments+1,positions=new Float32Array(edge*edge*3),normals=new Float32Array(edge*edge*3);
  for(let y=0;y<=segments;y++)for(let x=0;x<=segments;x++) {
    const lx=widthM*x/segments,ly=heightM*y/segments;
    const p=terrain.sampleBase(Math.min(terrain.widthM,xM+lx),Math.min(terrain.heightM,yM+ly));
    const o=(y*edge+x)*3;
    positions.set([lx,p.baseElevationM-originM.elevationM,ly],o);
    normals.set([p.normal.x,p.normal.y,p.normal.z],o);
  }
  const indices=new Uint16Array(segments*segments*6);
  let k=0;
  for(let y=0;y<segments;y++)for(let x=0;x<segments;x++) {
    const a=y*edge+x,b=a+1,c=a+edge,d=c+1;
    indices.set([a,c,b,b,c,d],k);k+=6;
  }
  // Search the actual Float32 vertex positions also used by the renderer.
  const xAt=i=>positions[i*3],yAt=i=>positions[i*edge*3+2];
  function interval(value,at) {
    let lo=0,hi=segments;
    while(lo+1<hi) {const mid=(lo+hi)>>1;if(at(mid)<=value)lo=mid;else hi=mid;}
    return Math.min(lo,segments-1);
  }
  function sampleGround(pxM,pyM) {
    if (!Number.isFinite(pxM) || !Number.isFinite(pyM)) throw new RangeError('Contact point must be finite');
    if(pxM<xM || pyM<yM || pxM>xM+widthM || pyM>yM+heightM)return null;
    const lx=Math.min(xAt(segments),pxM-xM),ly=Math.min(yAt(segments),pyM-yM);
    const ix=interval(lx,xAt),iy=interval(ly,yAt);
    const sx=xAt(ix+1)-xAt(ix),sy=yAt(iy+1)-yAt(iy);
    const u=(lx-xAt(ix))/sx,v=(ly-yAt(iy))/sy;
    const a=(iy*edge+ix)*3+1,b=a+3,c=a+edge*3,d=c+3;
    const ha=positions[a],hb=positions[b],hc=positions[c],hd=positions[d];
    const second=u+v>1;
    const h=second ? hd+(hc-hd)*(1-u)+(hb-hd)*(1-v) : ha+(hb-ha)*u+(hc-ha)*v;
    const dx=second ? (hd-hc)/sx : (hb-ha)/sx;
    const dy=second ? (hd-hb)/sy : (hc-ha)/sy;
    const n=Math.hypot(dx,1,dy);
    return {elevationM:originM.elevationM+h,normal:{x:-dx/n,y:1/n,z:-dy/n},
      slopeDegrees:Math.atan(Math.hypot(dx,dy))*180/Math.PI,
      triangleIndex:(iy*segments+ix)*2+(second?1:0)};
  }
  return Object.freeze({tileX,tileY,sizeM,segments,widthM,heightM,originM,positions,normals,indices,sampleGround});
}
