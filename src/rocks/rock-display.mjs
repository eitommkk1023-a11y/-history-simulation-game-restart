import {ROCKS,rockClamp} from './catalog.mjs';
// Explicit muted colors, grouped by origin; shared by GPU pixels and the visible key.
export const ROCK_DIAGNOSTIC_COLORS=Object.freeze([
 [200,178,173],[142,147,147],[83,94,101],[64,75,86],[163,138,133],[186,142,133],[179,164,127],[50,50,59],
 [153,132,101],[196,163,111],[128,118,96],[96,107,105],[214,203,176],[183,179,156],[153,126,119],[225,216,202],[198,181,168],
 [139,136,155],[121,139,121],[101,121,133],[155,159,147],[216,210,211],[182,160,160],[90,125,110],
].map(Object.freeze));
export const ROCK_PALETTE_WIDTH=72+3*256;
export const ROCK_DISPLAY_TITLES=Object.freeze({rock:'岩石24種',rockResistance:'侵食耐性',rockPermeability:'透水性',rockStability:'斜面安定性'});
export function rockDiagnosticRGB(id){return ROCK_DIAGNOSTIC_COLORS[id];}
export function rockDisplayValue(mode,rock){if(mode==='rockResistance')return rockClamp(Math.log(Math.max(.2,rock.erosionResistance)/.2)/Math.log(20),0,1);if(mode==='rockPermeability')return rockClamp((Math.log10(Math.max(1e-25,rock.permeabilityM2))+23)/12,0,1);return rockClamp(rock.slopeStability/3,0,1);}
export function rockRampRGB(mode,q){const t=rockClamp(q,0,255)/255;if(mode==='rockStability')return q<85?[177,106,78]:q<128?[197,165,103]:[102,135,115];const a=mode==='rockResistance'?[229,216,188]:[229,222,199],b=mode==='rockResistance'?[100,77,57]:[54,103,132];return a.map((v,k)=>Math.round(v+(b[k]-v)*t));}
const displaySwatch=rgb=>'<span class="rock-key-swatch" style="background:rgb('+rgb.join(',')+')"></span>';
const displayRow=(rgb,name)=>'<div class="rock-key-row">'+displaySwatch(rgb)+'<span>'+name+'</span></div>';
export function rockLegendContent(mode,available=true){
 if(!ROCK_DISPLAY_TITLES[mode])return '';
 if(!available)return '<h3>岩石情報なし</h3><p>旧世代の世界です。岩石情報は新しく生成した世界で確認できます。</p>';
 let content='<h3>'+ROCK_DISPLAY_TITLES[mode]+'の色の説明</h3>';
 if(mode==='rock'){
  content+='<p>陸地の地表直下の岩石を色分けしています。表土の下も含みます。海・湖・河川は元の水域色で表示します。</p>';
  for(const [family,label]of [['igneous','火成岩'],['sedimentary','堆積岩'],['metamorphic','変成岩など']])content+='<h4>'+label+'</h4><div class="rock-key-grid">'+ROCKS.filter(r=>r.family===family).map(r=>displayRow(rockDiagnosticRGB(r.id),r.name)).join('')+'</div>';
 }else if(mode==='rockStability'){
  content+='<p>斜面安全率（単位なし）。地質モデルが計算した、斜面の崩れにくさの目安です。</p>'+displayRow(rockRampRGB(mode,0),'1未満：不安定')+displayRow(rockRampRGB(mode,85),'1〜1.5未満：余裕が少ない')+displayRow(rockRampRGB(mode,128),'1.5以上：比較的安定')+'<p class="rock-key-note">生成時の地域値です。プレイヤーが歩行できる坂の判定とは別です。</p>';
 }else{
  const resistance=mode==='rockResistance',ticks=resistance?[.2,.5,1,2,4]:[1e-23,1e-20,1e-17,1e-14,1e-11],labels=resistance?['0.2','0.5','1','2','4']:['10⁻²³','10⁻²⁰','10⁻¹⁷','10⁻¹⁴','10⁻¹¹'];
  content+='<p>'+(resistance?'侵食耐性（相対値・単位なし）。濃い茶色ほど、同じ水流・勾配の条件で岩盤が削られにくくなります。':'実効透水性 κ（m²）。濃い青色ほど、岩盤の中を水が通りやすくなります。')+'</p><div class="rock-key-scale">';
  for(let i=0;i<ticks.length;i++){const value=resistance?{erosionResistance:ticks[i]}:{permeabilityM2:ticks[i]},q=Math.round(rockDisplayValue(mode,value)*255);content+='<div>'+displaySwatch(rockRampRGB(mode,q))+'<span>'+labels[i]+'</span></div>';}
  content+='</div><p class="rock-key-note">低い ← '+(resistance?'侵食への耐性':'透水性（m²）')+' → 高い</p><p>'+(resistance?'実際の侵食量は岩盤の強度や流量、表土にも左右されます。':'表面の川の水量を表す色ではありません。割れ目・風化を含む地域の実効値です。')+'</p>';
 }
 return content+'<p class="rock-key-note">海・湖・河川には岩石や数値の色を重ねません。</p>';
}
/** Accessible left-side key: opened by selecting a geological view, separate from collapsed native info. */
export function installRockLegend(bridge){
 const style=document.createElement('style');style.textContent=`#rockLegendPanel{position:fixed;box-sizing:border-box;z-index:125;left:calc(148px + env(safe-area-inset-left));top:calc(54px + env(safe-area-inset-top));width:min(360px,calc(100vw - 164px));max-height:calc(100dvh - 194px - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow:auto;touch-action:pan-y;padding:12px;background:#192b38fa;border:1px solid #8b9b9f;border-radius:9px;box-shadow:0 4px 14px #0005;color:#f4f0e7;font:13px/1.55 system-ui}#rockLegendPanel[hidden],.integration-ui-hidden #rockLegendPanel,.integration-ui-hidden #rockLegendButton,#rockLegendButton[hidden]{display:none!important}#rockLegendPanel h3{margin:0 44px 8px 0;font-size:15px}#rockLegendPanel h4{margin:12px 0 5px;color:#d7cbbb;font-size:13px}#rockLegendPanel p{margin:7px 0}#rockLegendClose{position:sticky;float:right;top:0;min-width:44px;min-height:44px;border:1px solid #8b9b9f;border-radius:6px;background:#314754;color:white;font:22px system-ui;touch-action:manipulation}#rockLegendButton{width:100%;min-height:44px;margin:0 0 6px;padding:8px;border:1px solid #8b9b9f;border-radius:6px;background:#314754;color:#f4f0e7;font:13px system-ui;touch-action:manipulation}.rock-key-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px}.rock-key-row{display:flex;align-items:center;gap:8px;min-height:24px}.rock-key-swatch{display:inline-block;box-sizing:border-box;width:24px;height:15px;border:1px solid #ffffff6b;border-radius:3px;flex-shrink:0}.rock-key-scale{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-top:12px}.rock-key-scale>div{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:12px}.rock-key-scale .rock-key-swatch{width:100%;height:20px}.rock-key-note{color:#cccdc6;font-size:12px}#rockLegendPoint{padding:7px 0 0;border-top:1px solid #8b9b9f66;font-size:12px}`;
 document.head.appendChild(style);
 const panel=document.createElement('section');panel.id='rockLegendPanel';panel.hidden=true;panel.className='scrollable';panel.setAttribute('role','region');panel.setAttribute('aria-label','地質表示の色の説明');panel.innerHTML='<button id="rockLegendClose" aria-label="色の説明を閉じる">×</button><div id="rockLegendContent"></div><p id="rockLegendPoint" aria-live="off"></p>';
 const button=document.createElement('button');button.id='rockLegendButton';button.hidden=true;button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','false');button.textContent='色の説明';
 const menu=document.getElementById('standardPane');(menu??document.body).prepend(button);document.body.append(panel);
 const close=()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');};
 function point(){if(panel.hidden||document.body.classList.contains('integration-ui-hidden'))return;const view=globalThis.__chunkPreview,s=view?.state?.terrain,p=view?.markerPoint;if(!s||!p)return;const geo=globalThis.__wohRocks?.sample(p.xM/s.metersPerCell,p.yM/s.metersPerCell);if(!geo)return;const title=bridge.overview?'プレイヤーの位置':'現在地',r=geo.erosionResistance,k=geo.permeabilityM2,fs=geo.slopeStability;const mode=bridge.viewMode,value=mode==='rockResistance'?' ／ 侵食耐性 '+r.toFixed(2):mode==='rockPermeability'?' ／ κ '+k.toExponential(1)+' m²':mode==='rockStability'?' ／ 安全率 '+fs.toFixed(2):'';panel.querySelector('#rockLegendPoint').textContent=title+'：'+geo.rockName+value;}
 function changed(mode=bridge.viewMode,open=true){const active=!!ROCK_DISPLAY_TITLES[mode];button.hidden=!active;if(!active){close();return;}button.textContent='色の説明：'+ROCK_DISPLAY_TITLES[mode];panel.querySelector('#rockLegendContent').innerHTML=rockLegendContent(mode,!!bridge.world?.rocks);if(open){panel.hidden=false;panel.scrollTop=0;button.setAttribute('aria-expanded','true');}point();}
 button.onclick=()=>{if(panel.hidden)changed();else close();};panel.querySelector('#rockLegendClose').onclick=close;
 document.addEventListener('keydown',e=>{if(e.code==='Escape')close();});document.addEventListener('woh-display-changed',e=>changed(e.detail.mode));window.addEventListener('woh-world-ready',()=>changed(bridge.viewMode,false));setInterval(point,500);changed(bridge.viewMode,false);
 return {changed,close};
}
