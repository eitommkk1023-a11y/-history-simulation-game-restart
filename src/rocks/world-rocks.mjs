import {ROCK_PROFILE,ROCKS,rockClamp,effectiveRockProperties} from './catalog.mjs';
import {evolveRockTerrain} from './evolution.mjs';
import {exposedRockId,removeRockThickness,rockLayerColumn} from './layers.mjs';
/** Extract coarse, physical source-world conditions; independent of the compressed game view. */
export function buildRockInput(seed,ter,tec,clim,W,H,step=8,kmPerBlock=3.33){
 const width=Math.ceil(W/step),height=Math.ceil(H/step),N=width*height,f=v=>new Float64Array(N).fill(v),input={seed:seed>>>0,width,height,cellSizeM:step*kmPerBlock*1000,elevation:f(0),land:new Uint8Array(N),precipitationMPerYear:f(0),temperatureC:f(0),fracture:f(0),weathering:f(0),formation:new Uint8Array(N),dipDegrees:f(0),dipDirectionDegrees:f(0),foldAmplitudeM:f(0),faultThrowM:f(0),layerScaleM:f(0),layerDatumM:f(0),ageMyr:f(0),stormFactor:f(1),initialSoilM:f(0)};
 const C=clim.data,cw=Math.ceil(W/8),ch=Math.ceil(H/8),get=(arr,i,fallback=0)=>arr?.[i]??fallback;
 for(let gy=0;gy<height;gy++)for(let gx=0;gx<width;gx++){
  const i=gy*width+gx,x0=gx*step,y0=gy*step;let all=0,landSum=0,count=0,landCount=0;
  for(let y=y0;y<Math.min(H,y0+step);y++)for(let x=x0;x<Math.min(W,x0+step);x++){const j=y*W+x,e=ter.elev[j];all+=e;count++;if(ter.type[j]){landSum+=e;landCount++;}}
  const land=landCount>=count*.5;input.land[i]=land?1:0;const z=land?landSum/Math.max(1,landCount):all/count;input.elevation[i]=z;
  const ci=Math.min(ch-1,Math.floor((y0+step/2)/8))*cw+Math.min(cw-1,Math.floor((x0+step/2)/8)),T=get(C.tAnnual,ci,140)/10,P=get(C.pAnnual,ci,800),cr=get(tec.crust,i),thick=get(tec.thick??tec.thickness,i,35),rho=get(tec.density,i,2.7),fault=get(tec.fault,i),volc=get(tec.volcHist??tec.volcanism,i),oro=get(tec.oro??tec.orogeny,i),cause=get(tec.cause,i),age=get(tec.age,i,20),basin=get(tec.basin,i),orogenAge=get(tec.oroAge??tec.orogenyAge,i,10);
  let family=0;
  if(!cr){family=z>-300&&T>16?6:age>80?13:1;}
  else if(volc>30||cause===3||cause===9){family=thick>42&&rho<2.8?12:cause===9||cr===3?3:2;}
  else if(cr===3||cause===7){family=volc>5?3:4;}
  else if((fault>3||cause===8)&&rho>2.82){family=11;}
  else if((oro>150||cause===4||cause===5)&&thick>40){family=cause===4&&rho<2.73&&z<2200?10:orogenAge>8&&z>2500?9:8;}
  else if(P<250&&z<1000&&(basin>50||cause===12||cause===6)){family=7;}
  else if(T>12&&z<800&&(cause===13||cause===6||age>400)){family=6;}
  else if(z<450||cause===12){family=5;}
  else if(z<1400){family=4;}
  else if(cr===1&&age>500){family=0;}
  else family=oro>60?8:0;
  input.formation[i]=family;input.precipitationMPerYear[i]=Math.max(0,P/1000);input.temperatureC[i]=T;input.fracture[i]=rockClamp(fault/(fault+5)+get(tec.brate??tec.boundaryRate,i)*.04,0,.95);input.weathering[i]=rockClamp(.1+P/6000+Math.max(0,T)/100+age/10000,0,.85);
  input.dipDegrees[i]=rockClamp((cr===2?12:2)+oro/(oro+500)*25+fault/(fault+4)*12,0,50);
  const plate=get(tec.plate,i),p=tec.plates?.[plate];input.dipDirectionDegrees[i]=p?Math.atan2(p.vy??.3,p.vx??1)*180/Math.PI:(gx+gy)*.3;
  input.foldAmplitudeM[i]=(oro/(oro+500))*20;input.faultThrowM[i]=fault/(fault+5)*30*Math.sin(gx*.2+gy*.17);input.layerScaleM[i]=family>=4&&family<=7?25:70;input.layerDatumM[i]=Math.sin(gx/30+seed*.00001)*20+Math.cos(gy/30)*20;input.ageMyr[i]=Math.max(1,Math.min(age,2000));
  input.initialSoilM[i]=land?rockClamp(1.5-z/6000+P/3000,.15,3):0;
  let monthlyMax=0;for(let m=0;m<12;m++)monthlyMax=Math.max(monthlyMax,get(C.precip,m*cw*ch+ci,P/12));input.stormFactor[i]=rockClamp(P>0?monthlyMax/(P/12):1,1,6);
 }
 return input;
}
export function rockBilinear(field,width,height,gx,gy){const x=rockClamp(gx,0,width-1),y=rockClamp(gy,0,height-1),ix=Math.min(width-2,Math.floor(x)),iy=Math.min(height-2,Math.floor(y)),u=x-ix,v=y-iy,i=iy*width+ix;return (field[i]*(1-u)+field[i+1]*u)*(1-v)+(field[i+width]*(1-u)+field[i+width+1]*u)*v;}
export function applyRockElevation(worldElev,type,W,H,state,step=8,kmPerBlock=3.33){
 const delta=Float64Array.from(state.elevation,(z,i)=>z-state.initialElevation[i]),area=(kmPerBlock*1000)**2;let requestedM3=0,appliedM3=0,clampedCells=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!type[i])continue;const change=rockBilinear(delta,state.width,state.height,(x+.5)/step-.5,(y+.5)/step-.5),old=worldElev[i],value=Math.max(.01,old+change);if(value!==old+change)clampedCells++;worldElev[i]=value;requestedM3+=change*area;appliedM3+=(worldElev[i]-old)*area;}
 state.metrics.resampling={requestedVolumeM3:requestedM3,appliedVolumeM3:appliedM3,clampedCells,volumeDifferenceM3:appliedM3-requestedM3};state.gridStep=step;state.sourceWidth=W;state.sourceHeight=H;state.kmPerBlock=kmPerBlock;state.version=ROCK_PROFILE;return state;
}
function rockMeanSurface(elev,type,W,H,step){const w=Math.ceil(W/step),h=Math.ceil(H/step),out=new Float64Array(w*h);for(let gy=0;gy<h;gy++)for(let gx=0;gx<w;gx++){let sum=0,n=0;for(let y=gy*step;y<Math.min(H,(gy+1)*step);y++)for(let x=gx*step;x<Math.min(W,(gx+1)*step);x++){const i=y*W+x;if(type[i]){sum+=elev[i];n++;}}out[gy*w+gx]=n?sum/n:NaN;}return out;}
export function generateRockWorld(seed,ter,tec,clim,W,H,report=()=>{}){
 const input=buildRockInput(seed,ter,tec,clim,W,H),state=evolveRockTerrain(input,{progress:(step,n)=>{if(step%8===0)report('岩石の侵食・堆積 '+step+'/'+n);}});applyRockElevation(ter.elev,ter.type,W,H,state);state.postRockSurface=rockMeanSurface(ter.elev,ter.type,W,H,state.gridStep);state.formation=input.formation;state.fracture=Float32Array.from(input.fracture);state.climateForcing={precipitationMPerYear:Float32Array.from(input.precipitationMPerYear),temperatureC:Float32Array.from(input.temperatureC)};return state;
}
/** Native river/lake/landmark cuts are a separate bookkeeping stage, never charged to rock erosion. */
export function finalizeRockSurface(state,elev,type,W,H){if(!state)return null;const surface=rockMeanSurface(elev,type,W,H,state.gridStep),A=state.cellSizeM**2;let nativeCutKg=0,nativeDepositM3=0;
 for(let i=0;i<surface.length;i++){
  if(!Number.isFinite(surface[i])||!Number.isFinite(state.postRockSurface[i]))continue;let delta=surface[i]-state.postRockSurface[i];
  if(delta>=0){state.soilDepthM[i]+=delta;nativeDepositM3+=delta*A;}else{let cut=-delta,soilCut=Math.min(cut,state.soilDepthM[i]);state.soilDepthM[i]-=soilCut;cut-=soilCut;
   while(cut>1e-9){const id=exposedRockId(state.layers,state.remainingThicknessM,state.topLayer,i),r=ROCKS[id],removed=removeRockThickness(state.layers,state.remainingThicknessM,state.topLayer,i,cut);if(!removed)break;cut-=removed;nativeCutKg+=removed*A*(r.densityKgM3[0]+r.densityKgM3[1])/2;}
  }
  state.exposedRockId[i]=exposedRockId(state.layers,state.remainingThicknessM,state.topLayer,i);state.exposure[i]=rockClamp(1-state.soilDepthM[i]/1.5,0,1);const p=effectiveRockProperties(state.exposedRockId[i],{fracture:state.fracture[i],weathering:state.weathering[i],moisture:state.moisture[i],temperatureC:state.climateForcing.temperatureC[i]});state.resistance[i]=p.erosionResistance;state.permeability[i]=p.permeabilityM2;
 }
 state.metrics.nativePostprocess={bedrockRemovedKg:nativeCutKg,depositedVolumeM3:nativeDepositM3};delete state.postRockSurface;return state;
}
export function sampleRockSurface(world,gridX,gridY){
 const s=world?.rocks;if(!s)return null;const x=Math.min(s.width-1,Math.max(0,Math.floor(gridX/s.gridStep))),y=Math.min(s.height-1,Math.max(0,Math.floor(gridY/s.gridStep))),i=y*s.width+x,id=s.exposedRockId[i];
 return {rockId:id,rockName:ROCKS[id].name,rockExposure:s.exposure[i],soilDepthM:s.soilDepthM[i],erosionResistance:s.resistance[i],permeabilityM2:s.permeability[i],slopeStability:s.stability[i],weathering:s.weathering[i],moisture:s.moisture[i],dipDegrees:s.layers.dipRadians[i]*180/Math.PI,dipDirectionRadians:s.layers.directionRadians[i],sourceGeologyIndex:i};
}
export function rockColumnAt(world,gridX,gridY){const p=sampleRockSurface(world,gridX,gridY);return p?rockLayerColumn(world.rocks.layers,world.rocks.remainingThicknessM,world.rocks.topLayer,p.sourceGeologyIndex):[];}
export function collectRockBuffers(value,seen=new Set()){if(!value||typeof value!=='object')return [];if(ArrayBuffer.isView(value)){if(!seen.has(value.buffer)){seen.add(value.buffer);return [value.buffer];}return [];}return Object.values(value).flatMap(v=>collectRockBuffers(v,seen));}
