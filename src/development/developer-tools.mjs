/** Bundled only into explicitly requested development builds. Not an authorization system. */
export function developerStep(p,input,dt,terrain,multiplier){
 const length=Math.max(1,Math.hypot(input.x,input.y)),distance=(input.sprint?4:1.5)*multiplier*Math.min(.05,Math.max(0,dt||0));
 const dx=(input.x*Math.cos(input.yaw)+input.y*Math.sin(input.yaw))/length*distance,dy=(-input.x*Math.sin(input.yaw)+input.y*Math.cos(input.yaw))/length*distance;
 const xM=Math.max(.3,Math.min(terrain.widthM-.3,p.xM+dx)),yM=Math.max(.3,Math.min(terrain.heightM-.3,p.yM+dy));
 return {xM,yM,elevationM:terrain.sampleBase(xM,yM).baseElevationM,blocked:xM===p.xM&&yM===p.yM};
}
export function installDeveloperTools(){
 const button=document.createElement('button');button.id='devMenu';button.textContent='開発者';document.getElementById('toolbar').appendChild(button);
 const panel=document.createElement('section');panel.id='developerPanel';panel.hidden=true;panel.innerHTML='<b>開発者機能</b><p>高速移動は地形・水域の制限を無視します。</p><div id="devSpeeds"></div><button id="devRestore">通常操作に戻す</button><p>高速移動中は、開始前の通常位置を保存します。</p>';
 const badge=document.createElement('div');badge.id='devBadge';badge.hidden=true;
 const style=document.createElement('style');style.textContent='#developerPanel{position:fixed;z-index:120;top:90px;left:150px;max-width:min(290px,calc(100vw - 310px));max-height:calc(100dvh - 100px);overflow:auto;padding:12px;background:#12283fee;border:1px solid #8badcb;border-radius:12px;color:white;font:14px system-ui}#developerPanel p{margin:8px 0}#developerPanel button{min-width:48px;min-height:44px;margin:3px;padding:6px;background:#294e70;border:1px solid #8badcb;border-radius:6px;color:white}#developerPanel button.on{background:#a96916}#devBadge{position:fixed;bottom:8px;left:40%;z-index:30;background:#8a500ddd;color:white;padding:6px;pointer-events:none}.integration-ui-hidden #developerPanel{display:none!important}';document.head.appendChild(style);document.body.append(panel,badge);
 let multiplier=1,safe=null;
 const get=()=>globalThis.__chunkPreview;
 function valid(){const v=get(),p=v?.markerPoint;if(!p)return false;const g=v.groundAt(p.xM,p.yM);return !!g&&g.slopeDegrees<=40&&g.waterDepthM<=.6;}
 function choose(value){
  const v=get();if(!v?.state)return;
  if(multiplier===1&&value>1)safe=globalThis.__wohPlayerSave();
  multiplier=value;globalThis.__wohNative.debugFastActive=value>1;
  if(value===1){if(!valid()&&safe)v.placeMarker(safe.xM,safe.yM);safe=null;window.dispatchEvent(new Event('blur'));}
  panel.hidden=true;badge.hidden=value===1;badge.textContent='開発移動 ×'+value;
  for(const b of panel.querySelectorAll('[data-speed]'))b.classList.toggle('on',Number(b.dataset.speed)===value);
 }
 for(const value of [1,10,100,1000]){const b=document.createElement('button');b.dataset.speed=value;b.textContent='×'+value;b.addEventListener('pointerdown',e=>{e.preventDefault();choose(value);});b.onclick=e=>{if(e.detail===0)choose(value);};panel.querySelector('#devSpeeds').appendChild(b);}
 button.addEventListener('pointerdown',e=>{e.preventDefault();panel.hidden=!panel.hidden;});button.addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();panel.hidden=!panel.hidden;}});
 panel.querySelector('#devRestore').addEventListener('pointerdown',e=>{e.preventDefault();choose(1);});panel.querySelector('#devRestore').addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space'){e.preventDefault();choose(1);}});
 globalThis.__wohDev={get multiplier(){return multiplier;},step(p,input,dt,terrain){return multiplier>1?developerStep(p,input,dt,terrain,multiplier):null;},savedPlayer(){return multiplier>1?safe:null;}};
 window.addEventListener('woh-world-ready',()=>{multiplier=1;safe=null;globalThis.__wohNative.debugFastActive=false;badge.hidden=true;for(const b of panel.querySelectorAll('[data-speed]'))b.classList.toggle('on',Number(b.dataset.speed)===1);});
}
