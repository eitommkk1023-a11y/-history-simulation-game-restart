import {ROCKS,rockClamp} from './catalog.mjs';
export const ROCK_LAYER_COUNT=6;
export const ROCK_ASSEMBLAGES=Object.freeze([
 [0,17,1,22,2,23],[3,2,14,12,13,2],[4,6,5,7,1,0],[3,6,2,23,1,0],
 [8,9,10,11,9,0],[10,11,9,14,10,0],[12,13,14,9,12,0],[15,16,10,13,12,0],
 [19,20,18,17,22,0],[17,18,22,21,1,0],[21,22,18,17,13,0],[23,2,3,17,2,0],
 [5,6,7,0,1,17],[14,11,12,13,9,3],
]);
export function rockHash(seed,x,y,channel=0){let h=(seed>>>0)^Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(channel,1597334677);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
export function createStratigraphy(input,intervention={}){
 const n=input.width*input.height,L=input.layerCount??ROCK_LAYER_COUNT,ids=new Uint8Array(n*L),thickness=new Float32Array(n*L),dip=new Float32Array(n),direction=new Float32Array(n),ages=new Float32Array(n);
 for(let i=0;i<n;i++){
  dip[i]=(intervention.dipDegrees??input.dipDegrees?.[i]??0)*Math.PI/180;direction[i]=(intervention.dipDirectionDegrees??input.dipDirectionDegrees?.[i]??0)*Math.PI/180;ages[i]=input.ageMyr?.[i]??20;
  if(input.layerRockIds&&input.layerThicknessM){for(let k=0;k<L;k++){ids[i*L+k]=input.layerRockIds[i*L+k];thickness[i*L+k]=input.layerThicknessM[i*L+k];}continue;}
  const family=input.formation?.[i]??0,seq=ROCK_ASSEMBLAGES[family];if(!seq)throw new RangeError('Unknown formation');
  const scale=input.layerScaleM?.[i]??40,beds=[1,.55,1.4,.7,1.1].map(v=>v*scale),period=beds.reduce((a,b)=>a+b,0),x=i%input.width,y=Math.floor(i/input.width),cs=Math.max(.17,Math.cos(dip[i]));
  const structure=(x*Math.cos(direction[i])+y*Math.sin(direction[i]))*input.cellSizeM*Math.sin(dip[i])+(input.foldAmplitudeM?.[i]??0)*Math.sin((x+y)*Math.PI/12)+(input.faultThrowM?.[i]??0);
  const z=input.elevation[i]-(input.initialSoilM?.[i]??.5),coordinate=z*cs+structure+(input.layerDatumM?.[i]??0),phase=((coordinate%period)+period)%period;
  let lower=0,j=0;while(j<4&&phase>=lower+beds[j])lower+=beds[j++];
  for(let k=0;k<L;k++){const index=(j-k%5+5)%5;ids[i*L+k]=k===L-1?seq[5]:seq[index];thickness[i*L+k]=k===L-1?5000:k===0?Math.max(.001,(phase-lower)/cs):beds[index]/cs;}
 }
 return {count:L,rockIds:ids,initialThicknessM:thickness,dipRadians:dip,directionRadians:direction,ageMyr:ages};
}
export function exposedRockId(layers,remaining,top,i){return layers.rockIds[i*layers.count+top[i]];}
export function removeRockThickness(layers,remaining,top,i,depthM){
 const k=i*layers.count+top[i],removed=Math.min(Math.max(0,depthM),remaining[k]);remaining[k]=Math.max(0,remaining[k]-removed);
 if(remaining[k]===0&&top[i]<layers.count-1){remaining[k]=0;top[i]++;}return removed;
}
export function rockLayerColumn(layers,remaining,top,i){const out=[];for(let k=top[i];k<layers.count;k++)out.push({rockId:layers.rockIds[i*layers.count+k],name:ROCKS[layers.rockIds[i*layers.count+k]].name,thicknessM:remaining[i*layers.count+k],ageMyr:layers.ageMyr[i]+k*5,dipDegrees:layers.dipRadians[i]*180/Math.PI});return out;}
