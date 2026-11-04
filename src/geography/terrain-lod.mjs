/** Two-dimensional quadtree selection; near colliders remain in chunk-window. */
export function selectTerrainLOD(terrain,xM,yM){
 const cx=Math.floor(xM/64),cy=Math.floor(yM/64),px=(cx+.5)*64,py=(cy+.5)*64,result=[];
 function visit(x,y,size){
  if(x>=terrain.widthM||y>=terrain.heightM)return;
  const distance=Math.hypot(Math.max(x-px,0,px-x-size),Math.max(y-py,0,py-y-size));
  if(distance>8192)return;
  const overlapsNear=x<(cx+2)*64&&x+size>(cx-1)*64&&y<(cy+2)*64&&y+size>(cy-1)*64;
  if(size>64&&(overlapsNear||distance<size)){
   const half=size/2;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)visit(x+dx*half,y+dy*half,half);
  }else if(!(size===64&&overlapsNear))result.push({tileX:x/size,tileY:y/size,sizeM:size,segments:size>=2048?16:8,key:x+','+y+','+size});
 }
 for(let y=Math.max(0,Math.floor((py-8192)/2048));y<=Math.floor((py+8192)/2048);y++)for(let x=Math.max(0,Math.floor((px-8192)/2048));x<=Math.floor((px+8192)/2048);x++)visit(x*2048,y*2048,2048);
 // Match each side to the union of the adjacent interior grids. Near colliders
 // contribute their real 2m grid, while distant boundaries stay coarse.
 const near=[];for(let y=Math.max(0,cy-1);y<=cy+1;y++)for(let x=Math.max(0,cx-1);x<=cx+1;x++)if(x*64<terrain.widthM&&y*64<terrain.heightM)near.push({tileX:x,tileY:y,sizeM:64,segments:32});
 const boxes=[...result,...near].map(q=>({...q,x:q.tileX*q.sizeM,z:q.tileY*q.sizeM,x1:Math.min(terrain.widthM,(q.tileX+1)*q.sizeM),z1:Math.min(terrain.heightM,(q.tileY+1)*q.sizeM)}));
 for(let i=0;i<result.length;i++){
  const a=boxes[i],cuts={west:[],east:[],north:[],south:[]};
  const base=(b,axis)=>Array.from({length:b.segments+1},(_,k)=>b[axis]+(b[axis+'1']-b[axis])*k/b.segments);
  for(const side of ['west','east'])cuts[side].push(...base(a,'z'));
  for(const side of ['north','south'])cuts[side].push(...base(a,'x'));
  for(const b of boxes){
   if(b===a)continue;
   if(Math.min(a.z1,b.z1)>Math.max(a.z,b.z)){
    if(a.x===b.x1)cuts.west.push(...base(b,'z').filter(v=>v>=a.z&&v<=a.z1));
    if(a.x1===b.x)cuts.east.push(...base(b,'z').filter(v=>v>=a.z&&v<=a.z1));
   }
   if(Math.min(a.x1,b.x1)>Math.max(a.x,b.x)){
    if(a.z===b.z1)cuts.north.push(...base(b,'x').filter(v=>v>=a.x&&v<=a.x1));
    if(a.z1===b.z)cuts.south.push(...base(b,'x').filter(v=>v>=a.x&&v<=a.x1));
   }
  }
  for(const side of Object.keys(cuts)){const origin=side==='west'||side==='east'?a.z:a.x;cuts[side]=[...new Set(cuts[side].map(v=>Number((v-origin).toFixed(6))))].sort((a,b)=>a-b);}
  result[i].edgeCuts=cuts;result[i].key+=':'+Object.values(cuts).map(v=>v.join('/')).join('|');
 }
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
