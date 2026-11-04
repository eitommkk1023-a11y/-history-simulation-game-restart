/** One configurable type today; additional types can reuse placement and rendering. */
export const SHORT_GRASS=Object.freeze({id:'short-grass-v1',minHeightM:.2,maxHeightM:.35,spacingM:.7,radiusM:32,fadeStartM:16,fadeEndM:24,maxInstances:7000,maxSlopeDegrees:30});
const grassBiomes=Object.freeze({4:.4,5:.85,6:.6,7:.5,9:.45,10:.55,11:.35,13:.6});
export function grassDensityForBiome(biome){return grassBiomes[biome]??0;}
function grassSeed(seed){let h=2166136261;for(const c of String(seed))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function grassRandom(seed,x,y,channel){let h=seed^Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(channel,1597334677);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
/** Yields null for rejected cells so the renderer can budget work, including empty terrain. */
export function* grassCandidates(terrain,groundAt,centerX,centerY,seed,type=SHORT_GRASS){
 const spacing=type.spacingM,radius=type.radiusM,hash=grassSeed(seed),sample=terrain.sampleMacro??terrain.sampleBase;let count=0;
 for(let iy=Math.floor((centerY-radius)/spacing);iy<=Math.floor((centerY+radius)/spacing);iy++)for(let ix=Math.floor((centerX-radius)/spacing);ix<=Math.floor((centerX+radius)/spacing);ix++){
  const rnd=c=>grassRandom(hash,ix,iy,c),xM=(ix+.15+.7*rnd(1))*spacing,yM=(iy+.15+.7*rnd(2))*spacing;
  if(xM<0||yM<0||xM>terrain.widthM||yM>terrain.heightM||Math.hypot(xM-centerX,yM-centerY)>radius){yield null;continue;}
  const p=sample(xM,yM),density=grassDensityForBiome(p.biome);
  if(!density||rnd(3)>density||!p.land||p.water||p.baseElevationM<.25||p.slopeDegrees>type.maxSlopeDegrees){yield null;continue;}
  const g=groundAt(xM,yM);
  if(!g||g.slopeDegrees>type.maxSlopeDegrees||(g.waterDepthM??0)>0||(g.waterSurfaceM!=null&&g.elevationM<g.waterSurfaceM+.15)){yield null;continue;}
  yield {key:type.id+':'+ix+','+iy,xM,yM,elevationM:g.elevationM,heightM:type.minHeightM+(type.maxHeightM-type.minHeightM)*rnd(4),yaw:rnd(5)*Math.PI*2,widthScale:.8+.4*rnd(6),shade:.85+.15*rnd(7)};
  if(++count>=type.maxInstances)return;
 }
}
export function generateGrassPatch(terrain,groundAt,x,y,seed,type=SHORT_GRASS){return [...grassCandidates(terrain,groundAt,x,y,seed,type)].filter(Boolean);}
