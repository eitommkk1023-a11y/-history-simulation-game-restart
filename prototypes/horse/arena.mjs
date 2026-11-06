export function createHorseArena(THREE,scene){
 const obstacles=[{x:-12,z:15,r:1.0},{x:-15,z:25,r:1.3},{x:14,z:-15,r:.7},{x:18,z:-13,r:.9}];
 const extent=1100,segments=70,step=extent*2/segments;
 function rawHeight(x,z){const fade=Math.max(0,Math.min(1,(z+185)/25,( -35-z)/25));return fade*(x>80?Math.min(60,x-80)*.15:x< -80?Math.min(60,-80-x)*.65:0);}
 // Exact same two triangles per cell are used for rendering and height queries.
 function height(x,z){const fx=(x+extent)/step,fz=(z+extent)/step,ix=Math.floor(fx),iz=Math.floor(fz),u=fx-ix,v=fz-iz,x0=ix*step-extent,z0=iz*step-extent,a=rawHeight(x0,z0),b=rawHeight(x0+step,z0),c=rawHeight(x0,z0+step),d=rawHeight(x0+step,z0+step);return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);}
 function blocked(x,z,r=.4){return Math.abs(x)>1000||Math.abs(z)>1100||obstacles.some(o=>Math.hypot(x-o.x,z-o.z)<r+o.r);}
 const geo=new THREE.PlaneGeometry(2200,2200,segments,segments);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,rawHeight(pos.getX(i),pos.getZ(i)));geo.computeVertexNormals();const colors=new Float32Array(pos.count*3);for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i),n=.015*Math.sin(x*.17)*Math.cos(z*.14);colors.set([.23+n,.29+n,.16+n],i*3);}geo.setAttribute('color',new THREE.BufferAttribute(colors,3));scene.add(new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true})));
 const stone=new THREE.MeshLambertMaterial({color:0x74756e});for(const o of obstacles){const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(o.r,0),stone);rock.position.set(o.x,o.r*.7,o.z);rock.scale.y=.8;scene.add(rock);}
 const grid=new THREE.GridHelper(30,6,0x8c8c60,0x64714c);grid.position.y=.006;grid.material.transparent=true;grid.material.opacity=.25;scene.add(grid);
 // Low-cost visual ground contact. No thousands of real-time shadow passes.
 const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(0,0,0,.32)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);const tex=new THREE.CanvasTexture(c),shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.5,2.9),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.018;scene.add(shadow);
 const signMat=new THREE.MeshLambertMaterial({color:0x836945});for(const [x,z]of [[80,-100],[-80,-100]]){const p=new THREE.Mesh(new THREE.BoxGeometry(.22,2,.22),signMat);p.position.set(x,1,z);scene.add(p);}
 return {height,blocked,shadow,obstacles};
}
