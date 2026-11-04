/** Known sea/lake levels only; geography and saved data are read-only. */
export function createWaterSurface(terrain,world){
 const toMeters=terrain.elevationToMeters??(e=>e*(terrain.elevationScale??1));
 function nodeLevel(x,y){
  const i=y*terrain.width+x,id=world.lakeId?.[i];
  if(world.type[i]===0)return {surfaceM:0,kind:'sea'};
  if(world.water[i]===2&&id>0&&Number.isFinite(world.lakeLevels?.[id]))return {surfaceM:toMeters(world.lakeLevels[id]),kind:'lake'};
  if(world.water[i])return null;
  // Extend only the local water candidate footprint. Terrain depth still defines the shore.
  const candidates=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const gx=x+dx,gy=y+dy;if(gx<0||gy<0||gx>=terrain.width||gy>=terrain.height)continue;
   const k=gy*terrain.width+gx,lake=world.lakeId?.[k];
   if(world.type[k]===0)candidates.push({surfaceM:0,kind:'sea'});
   else if(world.water[k]===2&&lake>0&&Number.isFinite(world.lakeLevels?.[lake]))candidates.push({surfaceM:toMeters(world.lakeLevels[lake]),kind:'lake'});
  }
  if(!candidates.length||candidates.some(p=>p.surfaceM!==candidates[0].surfaceM||p.kind!==candidates[0].kind))return null;
  return candidates[0];
 }
 function sample(x,y,elevation){
  if(x<0||y<0||x>terrain.widthM||y>terrain.heightM)return null;
  const p=terrain.sampleBase(x,y),water=nodeLevel(p.source.x,p.source.y);
  if(!water)return null;return {...water,depthM:Math.max(0,water.surfaceM-elevation)};
 }
 function patches(x,y,radius=2800){
  const s=terrain.metersPerCell,minX=Math.max(0,x-radius),maxX=Math.min(terrain.widthM,x+radius),minY=Math.max(0,y-radius),maxY=Math.min(terrain.heightM,y+radius),out=[];
  for(let gy=Math.max(0,Math.floor(minY/s-.5));gy<=Math.min(terrain.height-1,Math.ceil(maxY/s+.5));gy++)for(let gx=Math.max(0,Math.floor(minX/s-.5));gx<=Math.min(terrain.width-1,Math.ceil(maxX/s+.5));gx++){
   const water=nodeLevel(gx,gy);if(!water)continue;const level=water.surfaceM;
   const x0=Math.max(minX,(gx-.5)*s),x1=Math.min(maxX,(gx+.5)*s),y0=Math.max(minY,(gy-.5)*s),y1=Math.min(maxY,(gy+.5)*s);
   if(x1>x0&&y1>y0)out.push({x0,x1,y0,y1,surfaceM:level,kind:water.kind});
  }return out;
 }
 return {sample,patches};
}
