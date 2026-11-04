import {sampleRockSurface} from '../rocks/world-rocks.mjs';
import {createDetailedTerrain} from '../geography/terrain-detail.mjs';
import {createWorldTerrain} from '../geography/world-terrain.mjs';

// Meter-based playable surface; source geography and save coordinates are unchanged.
export const PLAYABLE_HORIZONTAL_SCALE=0.01;
export const PLAYABLE_SURFACE_VERSION='meter-detail-v1';
export function playableElevationMeters(sourceM){return 1000*Math.tanh(sourceM/3000);}
export function createPlayableTerrain(world,seed=globalThis.__wohNative?.seed??'0'){
 const base=createWorldTerrain(world,{metersPerCell:(world.geology?.kmPerBlock??3.33)*1000*PLAYABLE_HORIZONTAL_SCALE,elevationTransform:playableElevationMeters});
 const enriched=world.rocks?{...base,sampleBase(xM,yM){return {...base.sampleBase(xM,yM),...sampleRockSurface(world,xM/base.metersPerCell,yM/base.metersPerCell)};}}:base;
 return createDetailedTerrain(enriched,world,seed);
}
export function playerFromSource(p){
 return p?{...p,xM:p.xM*PLAYABLE_HORIZONTAL_SCALE,yM:p.yM*PLAYABLE_HORIZONTAL_SCALE}:null;
}
export function playerToSource(p){
 return p?{...p,xM:p.xM/PLAYABLE_HORIZONTAL_SCALE,yM:p.yM/PLAYABLE_HORIZONTAL_SCALE}:null;
}

const overviewTerrainCache=new WeakMap();
export function playableOverviewHeight(world,gridX,gridY){
 const seed=globalThis.__wohNative?.seed??'0',revision=globalThis.__wohNative?.revision??0;let saved=overviewTerrainCache.get(world);
 if(!saved||saved.seed!==seed||saved.revision!==revision){saved={seed,revision,terrain:createPlayableTerrain(world,seed)};overviewTerrainCache.set(world,saved);}const t=saved.terrain;
 const point=t.gridToMeters(Math.max(0,Math.min(t.width-1,gridX)),Math.max(0,Math.min(t.height-1,gridY)));
 const p=t.sampleBase(point.xM,point.yM),height=p.waterSurfaceElevationM===null?p.baseElevationM:Math.max(p.baseElevationM,p.waterSurfaceElevationM);
 // Convert physical meters to the native overview's horizontal units, without height exaggeration.
 return height*t.width/t.widthM;
}
