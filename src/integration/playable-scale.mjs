import {createWorldTerrain} from '../geography/world-terrain.mjs';

// Meter-based playable surface; source geography and save coordinates are unchanged.
export const PLAYABLE_HORIZONTAL_SCALE=0.01;
export const PLAYABLE_SURFACE_VERSION='meter-mountains-v1';
export function playableElevationMeters(sourceM){return 1000*Math.tanh(sourceM/3000);}
export function createPlayableTerrain(world){
 return createWorldTerrain(world,{metersPerCell:(world.geology?.kmPerBlock??3.33)*1000*PLAYABLE_HORIZONTAL_SCALE,elevationTransform:playableElevationMeters});
}
export function playerFromSource(p){
 return p?{...p,xM:p.xM*PLAYABLE_HORIZONTAL_SCALE,yM:p.yM*PLAYABLE_HORIZONTAL_SCALE}:null;
}
export function playerToSource(p){
 return p?{...p,xM:p.xM/PLAYABLE_HORIZONTAL_SCALE,yM:p.yM/PLAYABLE_HORIZONTAL_SCALE}:null;
}

const overviewTerrainCache=new WeakMap();
export function playableOverviewHeight(world,gridX,gridY){
 let t=overviewTerrainCache.get(world);if(!t){t=createPlayableTerrain(world);overviewTerrainCache.set(world,t);}
 const point=t.gridToMeters(Math.max(0,Math.min(t.width-1,gridX)),Math.max(0,Math.min(t.height-1,gridY)));
 const p=t.sampleBase(point.xM,point.yM),height=p.waterSurfaceElevationM===null?p.baseElevationM:Math.max(p.baseElevationM,p.waterSurfaceElevationM);
 // Convert physical meters to the native overview's horizontal units, without height exaggeration.
 return height*t.width/t.widthM;
}
