import {createWorldTerrain} from '../geography/world-terrain.mjs';

// Uniform gameplay scale preserves the original terrain slopes. Source
// geography and native overview/save coordinates retain their original units.
export const PLAYABLE_HORIZONTAL_SCALE=0.01;
export function createPlayableTerrain(world){
 return createWorldTerrain(world,{metersPerCell:(world.geology?.kmPerBlock??3.33)*1000*PLAYABLE_HORIZONTAL_SCALE,elevationScale:PLAYABLE_HORIZONTAL_SCALE});
}
export function playerFromSource(p){
 return p?{...p,xM:p.xM*PLAYABLE_HORIZONTAL_SCALE,yM:p.yM*PLAYABLE_HORIZONTAL_SCALE}:null;
}
export function playerToSource(p){
 return p?{...p,xM:p.xM/PLAYABLE_HORIZONTAL_SCALE,yM:p.yM/PLAYABLE_HORIZONTAL_SCALE}:null;
}
