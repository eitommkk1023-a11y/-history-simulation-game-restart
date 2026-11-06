import {humanGait,solveHumanLeg} from '../../src/player/human-gait.mjs';
export function createHorseRider(THREE,scene){
 const root=new THREE.Group(),hips=new THREE.Group();root.add(hips);scene.add(root);
 const cloth=new THREE.MeshLambertMaterial({color:0x5d747b}),pants=new THREE.MeshLambertMaterial({color:0x3e4144}),skin=new THREE.MeshLambertMaterial({color:0xb88e70}),leather=new THREE.MeshLambertMaterial({color:0x362c24}),hair=new THREE.MeshLambertMaterial({color:0x302921});
 function sphere(parent,r,mat,x,y,z,sx=1,sy=1,sz=1){const m=new THREE.Mesh(new THREE.SphereGeometry(r,10,7),mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;}
 function cylinder(parent,a,b,len,mat,y=0){const m=new THREE.Mesh(new THREE.CylinderGeometry(a,b,len,10),mat);m.position.y=y;parent.add(m);return m;}
 const chest=new THREE.Group();hips.add(chest);cylinder(chest,.19,.145,.43,cloth,.23);sphere(chest,.17,cloth,0,.05,0,1,.6,.65);cylinder(chest,.065,.07,.10,skin,.49);sphere(chest,.12,skin,0,.64,.015,.8,1.18,.93);sphere(chest,.122,hair,0,.69,-.016,.83,.80,.94);
 const legs=[],arms=[];
 for(const sign of [-1,1]){const thigh=new THREE.Group();thigh.position.set(sign*.105,0,0);hips.add(thigh);cylinder(thigh,.079,.058,.39,pants,-.195);sphere(thigh,.060,pants,0,-.39,0);const shin=new THREE.Group();shin.position.y=-.39;thigh.add(shin);cylinder(shin,.057,.046,.39,pants,-.195);const boot=new THREE.Mesh(new THREE.BoxGeometry(.11,.12,.25),leather);boot.position.set(0,-.40,.065);shin.add(boot);legs.push({thigh,shin,sign});
  const arm=new THREE.Group();arm.position.set(sign*.21,.40,0);chest.add(arm);cylinder(arm,.056,.043,.27,cloth,-.135);const forearm=new THREE.Group();forearm.position.y=-.27;arm.add(forearm);cylinder(forearm,.044,.033,.25,cloth,-.125);sphere(forearm,.045,skin,0,-.27,0);arms.push({arm,forearm,sign});
 }
 function update(foot,horse,mounted,pose){
  root.position.set(mounted?horse.x:foot.x,mounted?horse.y:foot.y,mounted?horse.z:foot.z);root.rotation.y=mounted?horse.yaw:foot.yaw;root.scale.setScalar(mounted?horse.identity.scale:1);
  if(mounted){hips.position.y=1.67+(pose?.bob??0)+(horse.mode==='gallop'?.035:0);chest.rotation.x=horse.mode==='gallop'?.26:horse.speed>5?.13:.02;for(const l of legs){l.thigh.position.x=l.sign*.19;l.thigh.rotation.set(-.95,0,l.sign*.70);l.shin.rotation.set(1.28,0,-l.sign*.45);}for(const a of arms){a.arm.rotation.set(-1.35,0,-a.sign*.10);a.forearm.rotation.x=1.02;}}
  else{const moving=foot.speed>.03,g=humanGait(foot.phase,'walk');hips.position.y=moving?g.hip:.865;chest.rotation.x=.015;legs.forEach((l,i)=>{const f=moving?g.feet[i]:{z:0,lift:0},k=solveHumanLeg(f.z,hips.position.y-.04-f.lift);l.thigh.position.x=l.sign*.105;l.thigh.rotation.set(k.hip,0,0);l.shin.rotation.set(k.knee,0,0);});arms.forEach((a,i)=>{a.arm.rotation.set(moving?Math.sin(foot.phase*Math.PI*2+i*Math.PI)*.28:.04,0,-a.sign*.08);a.forearm.rotation.x=-.12;});}
 }
 return {root,hips,legs,arms,update};
}
