/**
 * Read-only metric adapter for the existing geography generator.
 * Grid indices are sample nodes, not cell centers. xM points east, yM south.
 * sampleBase describes the coarse bilinear field, NOT a rendered collider.
 * No generator, detail noise, traversal policy, renderer or save is changed.
 */
const finite = (name, value) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
};
const mix = (a,b,t) => a + (b-a)*t;

export function createWorldTerrain(world, options = {}) {
  if (!world || typeof world !== 'object') throw new TypeError('Expected a generated world');
  const width = options.width ?? world.stats?.width ?? 3000;
  const height = options.height ?? world.stats?.height ?? 3000;
  const metersPerCell = options.metersPerCell ?? (world.geology?.kmPerBlock ?? 3.33)*1000;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 2 ||
      !Number.isSafeInteger(width*height)) throw new RangeError('Expected grid dimensions >= 2');
  if (!(finite('metersPerCell',metersPerCell) > 0)) throw new RangeError('metersPerCell must be positive');
  for (const name of ['elev','type','biome','water']) {
    if (!ArrayBuffer.isView(world[name]) || world[name].length !== width*height)
      throw new TypeError(`Expected world.${name} with ${width*height} entries`);
  }
  if (world.lakeId != null && (!ArrayBuffer.isView(world.lakeId) || world.lakeId.length !== width*height))
    throw new TypeError('Invalid world.lakeId');
  const widthM=finite('widthM',(width-1)*metersPerCell);
  const heightM=finite('heightM',(height-1)*metersPerCell);
  function metricPoint(xM,yM) {
    finite('xM',xM); finite('yM',yM);
    if (xM<0 || yM<0 || xM>widthM || yM>heightM) throw new RangeError('Out-of-world metric position');
  }
  function gridToMeters(x,y) {
    finite('grid x',x); finite('grid y',y);
    if (x<0 || y<0 || x>width-1 || y>height-1) throw new RangeError('Out-of-world grid position');
    return {xM:x*metersPerCell,yM:y*metersPerCell};
  }
  function metersToGrid(xM,yM) {
    metricPoint(xM,yM);
    return {x:xM/metersPerCell,y:yM/metersPerCell};
  }
  function metersToOverview(xM,yM) {
    const p=metersToGrid(xM,yM);
    // Matches the legacy toWorldX/toWorldZ functions, including edge positions.
    return {x:p.x*width/(width-1)-width/2,z:p.y*height/(height-1)-height/2};
  }
  function overviewToMeters(x,z) {
    finite('overview x',x); finite('overview z',z);
    if (x < -width/2 || x > width/2 || z < -height/2 || z > height/2)
      throw new RangeError('Out-of-world overview position');
    return gridToMeters((x+width/2)*(width-1)/width,(z+height/2)*(height-1)/height);
  }
  function checkOrigin(origin) {
    if (!origin || typeof origin !== 'object') throw new TypeError('Expected a local origin');
    finite('origin.xM',origin.xM); finite('origin.yM',origin.yM);
    finite('origin.elevationM',origin.elevationM);
  }
  function toLocal(xM,yM,elevationM,origin) {
    metricPoint(xM,yM); finite('elevationM',elevationM); checkOrigin(origin);
    return {x:xM-origin.xM,y:elevationM-origin.elevationM,z:yM-origin.yM};
  }
  function fromLocal(x,y,z,origin) {
    finite('local x',x); finite('local y',y); finite('local z',z); checkOrigin(origin);
    const xM=x+origin.xM,yM=z+origin.yM,elevationM=y+origin.elevationM;
    metricPoint(xM,yM); finite('elevationM',elevationM);
    return {xM,yM,elevationM};
  }
  function sampleBase(xM,yM) {
    const p=metersToGrid(xM,yM);
    // The last node belongs to the last interval: preserve the edge slope.
    const x0=Math.min(width-2,Math.floor(p.x)),y0=Math.min(height-2,Math.floor(p.y));
    const u=p.x-x0,v=p.y-y0;
    const a=finite('elevation',world.elev[y0*width+x0]);
    const b=finite('elevation',world.elev[y0*width+x0+1]);
    const c=finite('elevation',world.elev[(y0+1)*width+x0]);
    const d=finite('elevation',world.elev[(y0+1)*width+x0+1]);
    const baseElevationM=mix(mix(a,b,u),mix(c,d,u),v);
    const dx=mix(b-a,d-c,v)/metersPerCell,dy=mix(c-a,d-b,u)/metersPerCell;
    const length=Math.hypot(dx,1,dy);
    const x=Math.round(p.x),y=Math.round(p.y),index=y*width+x;
    const land=world.type[index]!==0,water=world.water[index];
    const lake=world.lakeId?.[index] ?? 0;
    const level=water===2 && lake>0 ? world.lakeLevels?.[lake] : undefined;
    const waterSurfaceElevationM=!land ? 0 : Number.isFinite(level) ? level : null;
    return {xM,yM,baseElevationM,normal:{x:-dx/length,y:1/length,z:-dy/length},
      slopeDegrees:Math.atan(Math.hypot(dx,dy))*180/Math.PI,
      source:{x,y,index},land,water,biome:world.biome[index],waterSurfaceElevationM};
  }
  return Object.freeze({coordinateVersion:'woh-grid-nodes-v1',width,height,metersPerCell,widthM,heightM,
    gridToMeters,metersToGrid,metersToOverview,overviewToMeters,toLocal,fromLocal,sampleBase});
}
