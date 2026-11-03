/** Render cache only. The world's geography arrays are never owned or freed here. */
export function createChunkWindow(terrain,create,release){
 const cache=new Map();let center='';
 return {get entries(){return [...cache.values()];},
 update(xM,yM){
  const cx=Math.floor(xM/64),cy=Math.floor(yM/64),key=cx+','+cy;if(key===center)return;center=key;
  const wanted=new Set();
  // Center first, then adjacent tiles: at least one tile of lookahead in every direction.
  const addresses=[];for(let y=Math.max(0,cy-1);y<=cy+1;y++)for(let x=Math.max(0,cx-1);x<=cx+1;x++)if(x*64<terrain.widthM&&y*64<terrain.heightM)addresses.push([x,y]);
  addresses.sort((a,b)=>Math.hypot(a[0]-cx,a[1]-cy)-Math.hypot(b[0]-cx,b[1]-cy));
  for(const [x,y]of addresses){const id=x+','+y;wanted.add(id);if(!cache.has(id))cache.set(id,create(x,y));}
  for(const [id,entry]of cache)if(!wanted.has(id)){release(entry);cache.delete(id);}
 },clear(){for(const entry of cache.values())release(entry);cache.clear();center='';}};
}
