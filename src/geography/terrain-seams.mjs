/** Dense shared boundaries, coarse interiors. No vertical skirts or overlapping faces. */
export function seamGeometry(terrain,chunk,edgeCuts){
 const positions=Array.from(chunk.positions),normals=Array.from(chunk.normals),indices=[],boundary=new Set();
 const n=chunk.segments,e=n+1;
 function add(x,z){
  x=Math.max(0,Math.min(chunk.widthM,x));z=Math.max(0,Math.min(chunk.heightM,z));
  const p=terrain.sampleBase(chunk.originM.xM+x,chunk.originM.yM+z),id=positions.length/3;
  positions.push(x,p.baseElevationM-chunk.originM.elevationM,z);normals.push(p.normal.x,p.normal.y,p.normal.z);
  if(x===0||z===0||x===chunk.widthM||z===chunk.heightM)boundary.add(id);return id;
 }

 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const a=y*e+x,b=a+1,c=a+e,d=c+1;
  if(x>0&&y>0&&x<n-1&&y<n-1){indices.push(a,c,b,b,c,d);continue;}
  const x0=chunk.positions[a*3],x1=chunk.positions[b*3],z0=chunk.positions[a*3+2],z1=chunk.positions[c*3+2];
  const corners=[[x0,z0],[x0,z1],[x1,z1],[x1,z0]],ring=[];
  for(let side=0;side<4;side++){
   const p=corners[side],q=corners[(side+1)%4];
   const edge=side===0&&x===0?'west':side===1&&y===n-1?'south':side===2&&x===n-1?'east':side===3&&y===0?'north':null;
   if(edge&&edgeCuts){
    const axis=side===0||side===2?1:0,start=p[axis],end=q[axis],lo=Math.min(start,end),hi=Math.max(start,end);
    const values=[start,...edgeCuts[edge].filter(v=>v>lo+.001&&v<hi-.001),end].sort((a,b)=>end>start?a-b:b-a);
    for(const v of values.slice(0,-1))ring.push(add(axis===0?v:p[0],axis===1?v:p[1]));
   }else{
    const steps=edge?Math.ceil(Math.hypot(q[0]-p[0],q[1]-p[1])/2):1;
    for(let k=0;k<steps;k++)ring.push(add(p[0]+(q[0]-p[0])*k/steps,p[1]+(q[1]-p[1])*k/steps));
   }
  }
  const center=add((x0+x1)/2,(z0+z1)/2);
  for(let i=0;i<ring.length;i++)indices.push(center,ring[i],ring[(i+1)%ring.length]);
 }
 return {positions:new Float32Array(positions),normals:new Float32Array(normals),indices:new Uint16Array(indices),boundary};
}
