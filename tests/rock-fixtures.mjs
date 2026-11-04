export function rockFixture(kind='contact',n=32){
 const N=n*n,fill=v=>new Float64Array(N).fill(v),input={name:kind,width:n,height:n,cellSizeM:40,seed:1729,elevation:fill(0),land:new Uint8Array(N).fill(1),precipitationMPerYear:fill(1.2),temperatureC:fill(14),fracture:fill(.35),weathering:fill(.2),initialSoilM:fill(0),formation:new Uint8Array(N).fill(4),layerScaleM:fill(4),dipDegrees:fill(0),dipDirectionDegrees:fill(0),foldAmplitudeM:fill(0),faultThrowM:fill(0),stormFactor:fill(3),ageMyr:fill(20),targetRockId:9};
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;input.elevation[i]=120+(n-1-y)*4+Math.abs(x-(n-1)/2)*2+3*Math.sin(x*.5);}
 if(kind==='contact'||kind==='fractures'){
  input.layerCount=3;input.layerRockIds=new Uint8Array(N*3);input.layerThicknessM=new Float32Array(N*3);
  for(let i=0;i<N;i++){input.layerRockIds.set([kind==='contact'?(i%n<n/2?0:11):0,9,0],i*3);input.layerThicknessM.set([25,50,5000],i*3);if(kind==='fractures')input.fracture[i]=i%n<n/2?.05:.85;}
  input.targetRockId=0;
 }else if(kind==='alternating'){input.formation.fill(4);input.layerScaleM.fill(2);input.dipDegrees.fill(8);input.targetRockId=9;}
 else if(kind==='limestone'){input.layerCount=3;input.layerRockIds=new Uint8Array(N*3);input.layerThicknessM=new Float32Array(N*3);for(let i=0;i<N;i++){input.layerRockIds.set([12,13,0],i*3);input.layerThicknessM.set([100,50,5000],i*3);input.fracture[i]=.7;input.precipitationMPerYear[i]=i%n<n/2?.08:1.5;}input.targetRockId=12;}
 return input;
}
