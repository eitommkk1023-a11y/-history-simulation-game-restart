import fs from 'node:fs';import {glbWriter} from './glb-writer.mjs';
const asset=JSON.parse(fs.readFileSync('assets/cart-source/wagon.render.json')),w=glbWriter(),g=w.gltf,colors=[[.25,.13,.06],[.045,.037,.025],[.43,.26,.12],[.55,.42,.16],[.35,.20,.09],[.78,.76,.67],[.52,.48,.38]],peopleColors=[[.29,.39,.44],[.64,.43,.30],[.036,.025,.018],[.058,.056,.048]];
for(const l of asset.lods){
 const nodes={};
 for(const part of [0,1,2,3,4,5,6,7]){
  const sub={positions:[],normals:[],indices:[],vertices:0},regions=[],center=part>=1&&part<=4?asset.wheels[part-1]:[0,0,0];
  for(let v=0;v<l.vertices;v++)if(l.parts[v*2]===part){sub.positions.push(...l.positions.slice(v*3,v*3+3).map((x,k)=>x-center[k]));sub.normals.push(...l.normals.slice(v*3,v*3+3));sub.indices.push(sub.vertices++);regions.push(l.parts[v*2+1]);}
  if(!sub.vertices)continue;
  const mesh=w.mesh(`Wagon_LOD${l.lod}_part${part}`,sub,i=>colors[regions[i]]),node=g.nodes.length;
  g.nodes.push({name:part>=1&&part<=4?'wheel_'+part:part===7?'canvas_canopy':'part_'+part,mesh,translation:center,extras:{part,wheelRadius:.48}});nodes[part]=node;
 }
 const people=asset.passenger.lods[l.lod],passengerMesh=w.mesh(`SeatedHuman_LOD${l.lod}`,people,i=>peopleColors[people.parts[i*2+1]]),occupants=asset.anchors.seats.map(seat=>{const node=g.nodes.length;g.nodes.push({name:seat.name,mesh:passengerMesh,translation:seat.position,extras:{part:8,seat:seat.name}});return node;});
 for(const cargo of [0,1,2])for(const canopy of [true,false]){
  const content=cargo===2?occupants:[nodes[l.lod===2?5:cargo===0?5:6]],sceneNodes=[0,1,2,3,4].map(p=>nodes[p]).concat(content,canopy?[nodes[7]]:[]).filter(v=>v!==undefined);
  g.scenes.push({name:`Wagon_LOD${l.lod}_${['crates','bales','passengers'][cargo]}_${canopy?'covered':'open'}`,nodes:sceneNodes});
 }
}
g.extras={anchors:asset.anchors,canopyPart:7,passengerPart:8,wheelRotation:'rotation.x = distanceMeters / 0.48; no bones'};console.log(JSON.stringify({cartGLBBytes:w.write('assets/cart-source/woh-wagon.glb')}));
