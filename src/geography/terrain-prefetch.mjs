/** At most three CPU-only chunks ahead; active renderer/collider ownership is separate. */
export function createTerrainPrefetch(terrain,build,{sizeM=64}={}){
 const cache=new Map();let jobs=[],hits=0,builds=0;
 function request(xM,yM,dx,dy){
  const cx=Math.floor(xM/sizeM),cy=Math.floor(yM/sizeM),length=Math.hypot(dx,dy),wanted=[];
  if(length>0){const x=Math.abs(dx/length)>.35?Math.sign(dx):0,y=Math.abs(dy/length)>.35?Math.sign(dy):0;
   const addresses=x&&y?[[cx+2*x,cy+2*y],[cx+2*x,cy+y],[cx+x,cy+2*y]]:x?[[cx+2*x,cy],[cx+2*x,cy-1],[cx+2*x,cy+1]]:[[cx,cy+2*y],[cx-1,cy+2*y],[cx+1,cy+2*y]];
   for(const [tx,ty]of addresses)if(tx>=0&&ty>=0&&tx*sizeM<terrain.widthM&&ty*sizeM<terrain.heightM)wanted.push({x:tx,y:ty,key:tx+','+ty});
  }
  const keys=new Set(wanted.map(q=>q.key));for(const key of cache.keys())if(!keys.has(key))cache.delete(key);
  jobs=wanted.filter(q=>!cache.has(q.key));
 }
 return {request,tick(){const q=jobs.shift();if(!q)return 0;cache.set(q.key,build(q.x,q.y));builds++;return 1;},take(x,y){const key=x+','+y,p=cache.get(key);if(!p)return null;cache.delete(key);hits++;return p;},clear(){cache.clear();jobs=[];},get size(){return cache.size;},get pending(){return jobs.length;},get hits(){return hits;},get builds(){return builds;}};
}
