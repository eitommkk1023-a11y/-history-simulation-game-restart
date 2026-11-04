import {ROCKS,effectiveRockProperties,rockClamp} from './catalog.mjs';
import {createStratigraphy,exposedRockId,removeRockThickness} from './layers.mjs';
/** Priority-flood routes depressions to open coast/domain outlets. No uphill bed incision. */
export function rockFlowRouting(z,land,W,H,dx){
 const N=W*H,receiver=new Int32Array(N).fill(-1),filled=new Float64Array(N),seen=new Uint8Array(N),heapId=new Int32Array(N),heapKey=new Float64Array(N);let size=0;
 const push=(id,key)=>{let p=size++;while(p){const q=(p-1)>>1;if(heapKey[q]<key||(heapKey[q]===key&&heapId[q]<id))break;heapId[p]=heapId[q];heapKey[p]=heapKey[q];p=q;}heapId[p]=id;heapKey[p]=key;};
 const pop=()=>{const out=heapId[0],id=heapId[--size],key=heapKey[size];if(size){let p=0;while(p*2+1<size){let q=p*2+1;if(q+1<size&&(heapKey[q+1]<heapKey[q]||(heapKey[q+1]===heapKey[q]&&heapId[q+1]<heapId[q])))q++;if(key<heapKey[q]||(key===heapKey[q]&&id<heapId[q]))break;heapId[p]=heapId[q];heapKey[p]=heapKey[q];p=q;}heapId[p]=id;heapKey[p]=key;}return out;};
 for(let i=0;i<N;i++)if(!land[i]){seen[i]=1;filled[i]=z[i];}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!land[i])continue;let outlet=x===0||y===0||x===W-1||y===H-1;
  if(!outlet)for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)if(!land[(y+yy)*W+x+xx])outlet=true;
  if(outlet){seen[i]=1;receiver[i]=-2;filled[i]=Math.max(0,z[i]);push(i,filled[i]);}
 }
 while(size){const i=pop(),x=i%W,y=Math.floor(i/W);for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){if(!xx&&!yy)continue;const X=x+xx,Y=y+yy;if(X<0||Y<0||X>=W||Y>=H)continue;const j=Y*W+X;if(seen[j])continue;seen[j]=1;receiver[j]=i;filled[j]=Math.max(z[j],filled[i]);push(j,filled[j]);}}
 // Prefer a true downhill direction where available; retain the acyclic flood parent on flats.
 const slope=new Float64Array(N),direction=new Float64Array(N);
 for(let i=0;i<N;i++)if(land[i]){if(receiver[i]===-2){slope[i]=Math.max(0,z[i]/dx);continue;}const x=i%W,y=Math.floor(i/W);let best=0,q=receiver[i];for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){if(!xx&&!yy)continue;const X=x+xx,Y=y+yy;if(X<0||Y<0||X>=W||Y>=H)continue;const j=Y*W+X;if(!land[j])continue;const s=(filled[i]-filled[j])/(dx*Math.hypot(xx,yy));if(s>best+1e-14){best=s;q=j;}}
  receiver[i]=q;if(q>=0){const xx=q%W-x,yy=Math.floor(q/W)-y;slope[i]=Math.max(0,(z[i]-z[q])/(dx*Math.hypot(xx,yy)));direction[i]=Math.atan2(yy,xx);}else slope[i]=Math.max(0,z[i]/dx);
 }
 const indegree=new Uint8Array(N),queue=new Int32Array(N);let head=0,tail=0;for(let i=0;i<N;i++)if(receiver[i]>=0)indegree[receiver[i]]++;for(let i=0;i<N;i++)if(land[i]&&!indegree[i])queue[tail++]=i;
 while(head<tail){const i=queue[head++],q=receiver[i];if(q>=0&&!--indegree[q])queue[tail++]=q;}
 let count=0;for(let i=0;i<N;i++)if(land[i])count++;if(tail!==count)throw new Error('Cyclic or disconnected rock drainage');
 return {receiver,filled,slope,direction,order:queue.subarray(0,tail)};
}
const rockSum=a=>a.reduce((s,v)=>s+v,0);
export function evolveRockTerrain(input,options={}){
 const W=input.width,H=input.height,N=W*H,dx=input.cellSizeM,A=dx*dx,years=options.years??200000,steps=options.steps??32,dt=years/steps,intervention=options.intervention??{},rhoSoil=1600;
 if(!Number.isInteger(W)||!Number.isInteger(H)||W<2||H<2||input.elevation.length!==N||!(dx>0)||!(years>0)||!Number.isInteger(steps)||steps<1)throw new RangeError('Invalid rock calculation domain');
 for(const z of input.elevation)if(!Number.isFinite(z))throw new RangeError('Nonfinite initial elevation');
 const start=performance.now(),layers=createStratigraphy(input,intervention),remaining=Float64Array.from(layers.initialThicknessM),top=new Uint8Array(N),bed=new Float64Array(N),soil=new Float64Array(N),z=Float64Array.from(input.elevation),gw=new Float64Array(N),flow=new Float64Array(N),baseflow=new Float64Array(N),incoming=new Float64Array(N),solute=new Float64Array(N),erodedDepth=new Float64Array(N),erodedMask=new Uint32Array(N),exposed=new Uint8Array(N),resistance=new Float32Array(N),permeability=new Float32Array(N),stability=new Float32Array(N),weathering=new Float32Array(N),moisture=new Float32Array(N);
 const metrics={years,steps,cellSizeM:dx,mechanicalBedKgByRock:Array(24).fill(0),weatheredKgByRock:Array(24).fill(0),dissolvedKgByRock:Array(24).fill(0),removedDepthByRock:Array(24).fill(0),erosionEventHistogram:Array.from({length:24},()=>Array(32).fill(0)),initialRockAreaM2:Array(24).fill(0),exposedRockAreaM2:Array(24).fill(0),bedrockAreaM2:Array(24).fill(0),soilInitialKg:0,soilFinalKg:0,solidExportedKg:0,dissolvedExportedKg:0,dissolvedStoredKg:0,infiltrationM3:0,surfaceRunoffM3:0,baseflowM3:0,liquidInputM3:0,waterExportedM3:0,groundwaterInitialM3:0,groundwaterFinalM3:0,sedimentDepositedKg:0,sedimentTransportedKg:0,numericallyLimitedCells:0,mechanicalActiveCells:0};
 for(let i=0;i<N;i++){const s=input.land[i]?Math.min(Math.max(0,z[i]),input.initialSoilM?.[i]??.5):0;soil[i]=s*A*rhoSoil;bed[i]=z[i]-s;gw[i]=input.initialGroundwaterM?.[i]??0;metrics.soilInitialKg+=soil[i];metrics.groundwaterInitialM3+=gw[i]*A;if(input.land[i])metrics.initialRockAreaM2[layers.rockIds[i*layers.count]]+=A;}
 for(let i=0;i<N;i++)exposed[i]=layers.rockIds[i*layers.count];
 let route;
 const conditions=i=>({fracture:input.fracture?.[i]??.3,weathering:input.weathering?.[i]??.2,moisture:rockClamp((input.precipitationMPerYear[i]/1.5)+gw[i]/20,0,1),temperatureC:input.temperatureC[i],sample:input.intactQuality?.[i]??.5});
 function props(i){return effectiveRockProperties(exposedRockId(layers,remaining,top,i),conditions(i),intervention);}
 function remove(i,requested,p,kind){const id=exposedRockId(layers,remaining,top,i),depth=removeRockThickness(layers,remaining,top,i,Math.min(requested,Math.max(0,bed[i]))),mass=depth*A*p.densityKgM3;
  bed[i]-=depth;erodedDepth[i]+=depth;erodedMask[i]|=1<<id;metrics.removedDepthByRock[id]+=depth;if(depth>0)metrics.erosionEventHistogram[id][rockClamp(Math.floor(Math.log2(depth+1e-8)+16),0,31)]++;
  if(kind==='weather')metrics.weatheredKgByRock[id]+=mass;else if(kind==='dissolved')metrics.dissolvedKgByRock[id]+=mass;else metrics.mechanicalBedKgByRock[id]+=mass;return mass;
 }
 for(let step=0;step<steps;step++){
  route=rockFlowRouting(z,input.land,W,H,dx);flow.fill(0);baseflow.fill(0);incoming.fill(0);solute.fill(0);
  for(let i=0;i<N;i++)if(input.land[i]){
   let p=props(i),id=exposedRockId(layers,remaining,top,i);const temp=input.temperatureC[i],P=Math.max(0,input.precipitationMPerYear[i])*rockClamp((temp+8)/15,.05,1),evap=Math.min(.65*P,Math.max(0,temp+5)*.008),R=Math.max(0,P-evap),I=R>0?R*(-Math.expm1(-p.hydraulicConductivityMPerYear/Math.max(1e-12,R))):0;
   const cap=p.porosity*20,drain=.05+p.hydraulicConductivityMPerYear/20,old=gw[i],storage=rockClamp(old*Math.exp(-drain*dt)+I/drain*(-Math.expm1(-drain*dt)),0,cap),B=Math.max(0,I-(storage-old)/dt);gw[i]=storage;flow[i]=(R-I)*A;baseflow[i]=B*A;
   metrics.infiltrationM3+=I*A*dt;metrics.surfaceRunoffM3+=(R-I)*A*dt;metrics.baseflowM3+=B*A*dt;metrics.liquidInputM3+=R*A*dt;
   let cover=soil[i]/(A*rhoSoil),angle=Math.atan(route.slope[i]),failureDepth=20,normal=p.densityKgM3*9.81*failureDepth*Math.cos(angle)**2,pore=1000*9.81*Math.min(failureDepth,storage/Math.max(.001,p.porosity)),alignment=Math.max(0,Math.cos(route.direction[i]-layers.directionRadians[i]));
   const anisotropy=intervention.uniform?.15:ROCKS[id].joints.style==='fissile'||ROCKS[id].joints.style==='foliated'||ROCKS[id].joints.style==='cleavage'?.6:ROCKS[id].joints.style==='bedded'?.35:.1;
   const friction=p.frictionDegrees*Math.PI/180*(1-anisotropy*alignment*Math.sin(layers.dipRadians[i])),drive=p.densityKgM3*9.81*failureDepth*Math.sin(angle)*Math.cos(angle);
   const fs=drive>1e-6?(p.cohesionPa+Math.max(0,normal-pore)*Math.tan(friction))/drive:100;
   stability[i]=Math.min(100,fs);const failure=Math.max(0,1-fs)*.0002*dt;
   const weatherDepth=(p.weatheringMPerYear*dt+failure)*Math.exp(-cover/.7);soil[i]+=remove(i,weatherDepth,p,'weather');
   if(exposedRockId(layers,remaining,top,i)!==id){p=props(i);id=exposedRockId(layers,remaining,top,i);}cover=soil[i]/(A*rhoSoil);
   const contact=I+B*.1,capacity=contact*A*dt*p.solubilityKgM3,kinetic=p.dissolutionKineticMPerYear*dt*contact/(contact+.1)*Math.exp(-cover/2),chemicalDepth=Math.min(kinetic,capacity/(A*p.densityKgM3));
   solute[i]+=remove(i,chemicalDepth,p,'dissolved');
   resistance[i]=p.erosionResistance;permeability[i]=p.permeabilityM2;weathering[i]=input.weathering?.[i]??.2;moisture[i]=conditions(i).moisture;
  }
  for(const i of route.order){
   let p=props(i);const q=route.receiver[i],slope=route.slope[i],erosiveQ=flow[i]*(input.stormFactor?.[i]??3)+baseflow[i],capacity=(flow[i]+baseflow[i])*dt*(slope>0?.03+3*slope:0),supply=incoming[i];
   let transported=supply;
   if(transported>capacity){const deposit=transported-capacity;soil[i]+=deposit;metrics.sedimentDepositedKg+=deposit;transported=capacity;}
   else{const pickup=Math.min(soil[i],capacity-transported);soil[i]-=pickup;transported+=pickup;
    const cover=soil[i]/(A*rhoSoil),strength=Math.max(.05,Math.sqrt(p.ucsMPa*p.tensileMPa)/Math.sqrt(80*8)),structure=1+(intervention.uniform?.15:ROCKS[exposedRockId(layers,remaining,top,i)].joints.style==='bedded'?.35:.15)*Math.max(0,Math.cos(route.direction[i]-layers.directionRadians[i]))*Math.sin(layers.dipRadians[i]);
    const rate=.00035*Math.sqrt(Math.max(0,erosiveQ/A))*slope*structure/(p.erosionResistance*strength)*Math.exp(-cover/.5);
    const relief=q>=0?Math.max(0,z[i]-z[q]):Math.max(0,z[i]),available=Math.max(0,capacity-transported)/(A*p.densityKgM3),depth=Math.min(rate*dt,.4*relief,available);
    if(rate>0){metrics.mechanicalActiveCells++;if(rate*dt>.4*relief)metrics.numericallyLimitedCells++;}
    transported+=remove(i,depth,p,'mechanical');
   }
   metrics.sedimentTransportedKg+=transported;
   if(q>=0){incoming[q]+=transported;solute[q]+=solute[i];flow[q]+=flow[i];baseflow[q]+=baseflow[i];}else{metrics.solidExportedKg+=transported;metrics.dissolvedExportedKg+=solute[i];metrics.waterExportedM3+=(flow[i]+baseflow[i])*dt;}
  }
  for(let i=0;i<N;i++)if(input.land[i]){z[i]=bed[i]+soil[i]/(A*rhoSoil);if(!Number.isFinite(z[i])||z[i]<-1e-6)throw new Error('Unstable rock elevation');}
  options.progress?.(step+1,steps);
 }
 const slopeValues=[],deltaValues=[],valleys=[],widths=[],catchment=new Float64Array(N).fill(1);route=rockFlowRouting(z,input.land,W,H,dx);for(const i of route.order){const q=route.receiver[i];if(q>=0)catchment[q]+=catchment[i];}
 let channels=0,landCount=0,exposureChanges=0,soilArea=0;
 const soilDepthM=new Float32Array(N),waterTableDepthM=new Float32Array(N),exposure=new Float32Array(N),uniqueEroded=Array(24).fill(0);
 for(let i=0;i<N;i++)if(input.land[i]){
  const id=exposedRockId(layers,remaining,top,i);exposed[i]=id;landCount++;soilDepthM[i]=soil[i]/(A*rhoSoil);waterTableDepthM[i]=Math.max(0,20-gw[i]/Math.max(.001,props(i).porosity));const X=i%W,Y=Math.floor(i/W),x0=Math.max(0,X-1),x1=Math.min(W-1,X+1),y0=Math.max(0,Y-1),y1=Math.min(H-1,Y+1),localGradient=Math.hypot((z[Y*W+x1]-z[Y*W+x0])/((x1-x0)*dx),(z[y1*W+X]-z[y0*W+X])/((y1-y0)*dx)),slope=Math.atan(localGradient)*180/Math.PI;slopeValues.push(slope);deltaValues.push(z[i]-input.elevation[i]);exposure[i]=rockClamp(1-soilDepthM[i]/1.5,0,1);const finalProps=props(i);resistance[i]=finalProps.erosionResistance;permeability[i]=finalProps.permeabilityM2;metrics.bedrockAreaM2[id]+=A;if(exposure[i]>.5)metrics.exposedRockAreaM2[id]+=A;else soilArea+=A;
  if(id!==layers.rockIds[i*layers.count])exposureChanges++;for(let r=0;r<24;r++)if(erodedMask[i]&(1<<r))uniqueEroded[r]++;
  if(catchment[i]>=8&&(flow[i]+baseflow[i])>0){channels++;const x=i%W,y=Math.floor(i/W),q=route.receiver[i],rx=q>=0?q%W-x:0,ry=q>=0?Math.floor(q/W)-y:1,px=-Math.sign(ry),py=Math.sign(rx);let left=z[i],right=z[i];const banks=[[],[]];
   for(const [side,sign] of [[0,-1],[1,1]])for(let k=1;k<=4;k++){const X=x+px*k*sign,Y=y+py*k*sign;if(X<0||Y<0||X>=W||Y>=H)break;const zz=z[Y*W+X];if(side===0)left=Math.max(left,zz);else right=Math.max(right,zz);banks[side].push({z:zz,d:k*dx*Math.hypot(px,py)});}
   const depth=Math.max(0,(left+right)/2-z[i]),threshold=z[i]+depth*.5;valleys.push(depth);widths.push(banks.reduce((sum,bank)=>sum+(bank.find(p=>p.z>=threshold)?.d??bank.at(-1)?.d??0),0));
  }
  metrics.soilFinalKg+=soil[i];metrics.groundwaterFinalM3+=gw[i]*A;
 }
 const bedRemoved=rockSum(metrics.weatheredKgByRock)+rockSum(metrics.mechanicalBedKgByRock)+rockSum(metrics.dissolvedKgByRock),massIn=metrics.soilInitialKg+bedRemoved,massOut=metrics.soilFinalKg+metrics.solidExportedKg+metrics.dissolvedExportedKg;
 metrics.bedrockRemovedKg=bedRemoved;metrics.dissolvedKg=rockSum(metrics.dissolvedKgByRock);metrics.mechanicalBedKg=rockSum(metrics.mechanicalBedKgByRock);metrics.weatheredKg=rockSum(metrics.weatheredKgByRock);metrics.massErrorKg=massIn-massOut;metrics.massRelativeError=metrics.massErrorKg/Math.max(1,massIn);
 metrics.waterErrorM3=metrics.liquidInputM3+metrics.groundwaterInitialM3-metrics.waterExportedM3-metrics.groundwaterFinalM3;metrics.waterRelativeError=metrics.waterErrorM3/Math.max(1,metrics.liquidInputM3);
 slopeValues.sort((a,b)=>a-b);metrics.meanSlopeDegrees=rockSum(slopeValues)/Math.max(1,landCount);metrics.p90SlopeDegrees=slopeValues[Math.floor((slopeValues.length-1)*.9)]??0;metrics.steepAreaFraction=slopeValues.filter(s=>s>=35).length/Math.max(1,landCount);metrics.meanElevationChangeM=rockSum(deltaValues)/Math.max(1,landCount);metrics.maxAbsElevationChangeM=deltaValues.reduce((m,v)=>Math.max(m,Math.abs(v)),0);metrics.valleyMeanDepthM=rockSum(valleys)/Math.max(1,valleys.length);metrics.valleyMeanWidthM=rockSum(widths)/Math.max(1,widths.length);metrics.channelDensityPerM=channels*dx/Math.max(A,landCount*A);metrics.exposureChangedFraction=exposureChanges/Math.max(1,landCount);metrics.rockMeanErosionDepthM=metrics.removedDepthByRock.map((v,i)=>v/Math.max(1,uniqueEroded[i]));metrics.soilCoveredAreaM2=soilArea;metrics.elapsedMs=performance.now()-start;
 return {width:W,height:H,cellSizeM:dx,initialElevation:Float64Array.from(input.elevation),elevation:z,bedrockElevation:bed,soilDepthM,waterTableDepthM,layers,remainingThicknessM:remaining,topLayer:top,exposedRockId:exposed,resistance,permeability,stability,weathering,moisture,exposure,erodedDepthM:erodedDepth,flowReceiver:route.receiver,surfaceDischargeM3PerYear:flow,baseDischargeM3PerYear:baseflow,metrics};
}
