/** Two-dimensional quadtree selection; near colliders remain in chunk-window. */
export function selectTerrainLOD(terrain,xM,yM){
 const cx=Math.floor(xM/64),cy=Math.floor(yM/64),px=(cx+.5)*64,py=(cy+.5)*64,result=[];
 function visit(x,y,size){
  if(x>=terrain.widthM||y>=terrain.heightM)return;
  const distance=Math.hypot(Math.max(x-px,0,px-x-size),Math.max(y-py,0,py-y-size));
  if(distance>2048)return;
  const overlapsNear=x<(cx+2)*64&&x+size>(cx-1)*64&&y<(cy+2)*64&&y+size>(cy-1)*64;
  if(size>64&&(overlapsNear||distance<size*1.15)){
   const half=size/2;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)visit(x+dx*half,y+dy*half,half);
  }else if(!(size===64&&overlapsNear))result.push({tileX:x/size,tileY:y/size,sizeM:size,segments:8,key:x+','+y+','+size});
 }
 for(let y=Math.max(0,Math.floor((py-2048)/512));y<=Math.floor((py+2048)/512);y++)for(let x=Math.max(0,Math.floor((px-2048)/512));x<=Math.floor((px+2048)/512);x++)visit(x*512,y*512,512);
 return result;
}
/** Downward skirts hide cracks between differently sampled edges, never used for contact. */
export function skirtGeometry(chunk){
 const n=chunk.segments,e=n+1,border=[];
 for(let i=0;i<n;i++)border.push(i);
 for(let i=0;i<n;i++)border.push(i*e+n);
 for(let i=n;i>0;i--)border.push(n*e+i);
 for(let i=n;i>0;i--)border.push(i*e);
 const positions=new Float32Array(border.length*6),indices=new Uint16Array(border.length*6),depth=Math.max(32,chunk.sizeM*4);
 border.forEach((v,i)=>{const p=chunk.positions.subarray(v*3,v*3+3);positions.set(p,i*6);positions.set([p[0],p[1]-depth,p[2]],i*6+3);const a=i*2,b=((i+1)%border.length)*2;indices.set([a,b,a+1,b,b+1,a+1],i*6);});
 return {positions,indices};
}
