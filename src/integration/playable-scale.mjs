import {createWorldTerrain} from '../geography/world-terrain.mjs';

// Horizontal gameplay distances only. The generator, elevation and native
// overview/save coordinate system retain their original units.
export const PLAYABLE_HORIZONTAL_SCALE=0.01;
export function createPlayableTerrain(world){
 return createWorldTerrain(world,{metersPerCell:(world.geology?.kmPerBlock??3.33)*1000*PLAYABLE_HORIZONTAL_SCALE});
}
export function playerFromSource(p){
 return p?{...p,xM:p.xM*PLAYABLE_HORIZONTAL_SCALE,yM:p.yM*PLAYABLE_HORIZONTAL_SCALE}:null;
}
export function playerToSource(p){
 return p?{...p,xM:p.xM/PLAYABLE_HORIZONTAL_SCALE,yM:p.yM/PLAYABLE_HORIZONTAL_SCALE}:null;
}
