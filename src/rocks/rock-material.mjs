import {ROCKS,rockClamp} from './catalog.mjs';
import {sampleRockSurface,rockColumnAt} from './world-rocks.mjs';
export const ROCK_VIEW_MODES=['rock','rockResistance','rockPermeability','rockStability'];
export function rockDiagnosticRGB(id){return [(id*67+53)%192+32,(id*107+29)%192+32,(id*139+11)%192+32];}
export function rockDisplayValue(mode,rock){if(mode==='rockResistance')return rockClamp(Math.log2(Math.max(.05,rock.erosionResistance))/6+.5,0,1);if(mode==='rockPermeability')return rockClamp((Math.log10(Math.max(1e-25,rock.permeabilityM2))+23)/12,0,1);return rockClamp(rock.slopeStability/3,0,1);}
/** Shared coarse exposure atlas, nearest IDs in all cameras. Two RGBA8 textures, no per-chunk copies. */
export function installRockMaterials(THREE,bridge){
 const U={rockAtlas:{value:null},rockCondition:{value:null},rockPalette:{value:null},rockSize:{value:new THREE.Vector2(1,1)},rockSource:{value:new THREE.Vector2(1,1)},rockEnabled:{value:0},rockMode:{get value(){return bridge.viewMode==='biome'?0:ROCK_VIEW_MODES.indexOf(bridge.viewMode)+1||-1;}},rockDebugIds:{value:0}};
 let current=null,allocatedBytes=0;
 function texture(bytes,w,h){const t=new THREE.DataTexture(bytes,w,h,THREE.RGBAFormat);t.magFilter=t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;t.flipY=false;t.needsUpdate=true;return t;}
 const palette=new Uint8Array(72*4);for(const r of ROCKS){palette.set([...r.color,r.pattern*24],r.id*4);palette.set([...rockDiagnosticRGB(r.id),255],(r.id+24)*4);const m=r.minerals;palette.set([m.quartz??0,m.feldspar??0,(m.mica??0)+(m.clay??0),(m.pyroxene??0)+(m.olivine??0)+(m.magnetite??0)+(m.ironOxide??0)].map(v=>Math.round(rockClamp(v,0,1)*255)),(r.id+48)*4);}U.rockPalette.value=texture(palette,72,1);
 function sync(){const world=bridge.world;if(world===current)return;for(const key of ['rockAtlas','rockCondition'])U[key].value?.dispose();current=world;const s=world?.rocks;U.rockEnabled.value=s?1:0;allocatedBytes=0;
  const N=s?s.width*s.height:1,a=new Uint8Array(N*4),b=new Uint8Array(N*4);
  if(s){for(let i=0;i<N;i++){const id=s.exposedRockId[i],p={erosionResistance:s.resistance[i],permeabilityM2:s.permeability[i],slopeStability:s.stability[i]};a.set([id,Math.round(s.exposure[i]*255),Math.round(s.weathering[i]*255),Math.round(s.moisture[i]*255)],i*4);b.set([Math.round(rockDisplayValue('rockResistance',p)*255),Math.round(rockDisplayValue('rockPermeability',p)*255),Math.round(rockDisplayValue('rockStability',p)*255),Math.round((s.layers.dipRadians[i]/(Math.PI/2))*255)],i*4);}U.rockSize.value.set(s.width,s.height);U.rockSource.value.set((s.sourceWidth-1)/s.gridStep,(s.sourceHeight-1)/s.gridStep);allocatedBytes=a.byteLength+b.byteLength;}
  U.rockAtlas.value=texture(a,s?.width??1,s?.height??1);U.rockCondition.value=texture(b,s?.width??1,s?.height??1);
 }
 sync();
 function patch(material,metric=true){sync();const previous=material.onBeforeCompile,priorKey=material.customProgramCacheKey?.()??'';material.customProgramCacheKey=()=>String(priorKey)+'rock-surface-v1';material.onBeforeCompile=sh=>{
   previous?.(sh);Object.assign(sh.uniforms,U);const hp=new THREE.Vector2();sh.uniforms.rockHeightParams={get value(){return hp.set(metric?1:((bridge.world?.stats.width??3000)-1)*33.3/(bridge.world?.stats.width??3000),metric?(globalThis.__chunkPreview?.state?.origin.elevationM??0):0);}};
   sh.vertexShader='varying vec3 rockN;varying float rockHeight;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nrockN=normal;rockHeight=(modelMatrix*vec4(position,1.0)).y;');
   sh.fragmentShader=`uniform sampler2D rockAtlas,rockCondition,rockPalette;uniform vec2 rockSize,rockSource,rockHeightParams;uniform float rockEnabled,rockMode,rockDebugIds;varying vec3 rockN;varying float rockHeight;
#define rockUV vUv
float rockNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);vec4 n=fract(sin(vec4(dot(i,vec2(127.1,311.7)),dot(i+vec2(1,0),vec2(127.1,311.7)),dot(i+vec2(0,1),vec2(127.1,311.7)),dot(i+vec2(1,1),vec2(127.1,311.7))))*43758.5453);return mix(mix(n.x,n.y,f.x),mix(n.z,n.w,f.x),f.y);}
`+sh.fragmentShader;
   sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
vec2 rg=clamp(vec2(rockUV.x,1.0-rockUV.y),0.0,1.0);vec2 ra=(min(floor(rg*rockSource),rockSize-1.0)+0.5)/rockSize;vec4 rd=texture2D(rockAtlas,ra),rc=texture2D(rockCondition,ra);float rid=floor(rd.r*255.0+0.5);vec4 rp=texture2D(rockPalette,vec2((rid+0.5)/72.0,0.5));
if(rockEnabled>0.5&&rockMode==0.0){
 vec2 p=rg*99900.0;float height=rockHeight*rockHeightParams.x+rockHeightParams.y,flatness=abs(normalize(rockN).y);vec2 grainPlane=mix(vec2(p.x+p.y*.3,height),p,flatness);float grain=rockNoise(grainPlane*2.0),broad=rockNoise(grainPlane*.07),pattern=floor(rp.a*255.0/24.0+0.5),bands=sin(height*.8+sin(p.x*.04)*3.0+rc.a*p.x*.6);float surface=0.85+0.20*grain;
 if(pattern<0.5)surface+=step(.8,grain)*.22-step(grain,.16)*.18;
 else if(pattern<1.5)surface*=.82+.18*smoothstep(.03,.12,abs(sin(p.x*.7)*sin(p.y*.61)));
 else if(pattern<2.5)surface*=.88+.12*step(.2,grain);
 else if(pattern<3.5)surface*=.78+.13*broad;
 else if(pattern<5.5)surface*=.82+.18*smoothstep(-.8,.2,bands);
 else if(pattern<6.5)surface*=.8+.2*smoothstep(.15,.5,broad);
 else if(pattern<8.5)surface*=.9+.1*step(.65,grain);
 else surface*=.78+.26*sin(height*.9+3.0*sin(p.x*.08));
 vec4 minerals=texture2D(rockPalette,vec2((rid+48.5)/72.0,.5));vec3 col=rp.rgb*surface;col+=minerals.r*.05*step(.75,grain)+minerals.g*vec3(.035,.015,.01)*step(.6,grain);col*=1.0-minerals.b*.12*step(grain,.3);col=mix(col,col*vec3(1.12,.94,.78),rd.b*(.08+.3*minerals.a));col*=1.0-rd.a*.22;
 float slope=1.0-abs(normalize(rockN).y),exposure=rd.g*smoothstep(.015,.2,slope)+rd.g*.45;diffuseColor.rgb=mix(diffuseColor.rgb,col,clamp(exposure,0.0,1.0));
}`);
   sh.fragmentShader=sh.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
if(rockEnabled>0.5&&rockDebugIds>0.5){gl_FragColor=vec4(rid/255.0,0.0,0.0,1.0);}
else if(rockEnabled>0.5&&rockMode>0.5){vec3 dc;if(rockMode<1.5)dc=texture2D(rockPalette,vec2((rid+24.5)/72.0,.5)).rgb;else{float v=rockMode<2.5?rc.r:rockMode<3.5?rc.g:rc.b;dc=mix(vec3(.75,.18,.10),vec3(.1,.75,.9),v);}gl_FragColor=vec4(dc,1.0);}`);
  };return material;
 }
 function legend(mode){if(!bridge.world?.rocks)return '<b>岩石情報なし</b><p>旧世代の記録です。新しい世界で岩石を生成します。</p>';if(mode==='rock')return '<b>露出層の岩石（表土の下も含む）</b><div class="cols">'+ROCKS.map(r=>'<div class="item"><span class="sw" style="background:rgb('+rockDiagnosticRGB(r.id).join(',')+')"></span>'+r.name+'</div>').join('')+'</div>';return '<b>'+({rockResistance:'侵食耐性：対数尺度',rockPermeability:'実効透水係数 κ (m²)：10⁻²³〜10⁻¹¹',rockStability:'斜面安全率：0〜3（3以上は同色）'}[mode])+'</b><p><span style="color:#bf2e19">低 ← </span><span style="color:#19bfe5"> → 高</span></p>';}
 globalThis.__wohApplyRockMaterial=material=>patch(material,false);globalThis.__wohRockLegend=legend;
 globalThis.__wohRocks={sample:(x,y)=>sampleRockSurface(bridge.world,x,y),column:(x,y)=>rockColumnAt(bridge.world,x,y),sync,get bytes(){return allocatedBytes;},get uniforms(){return U;},catalog:ROCKS};window.addEventListener('woh-world-ready',sync);
 return {patch,sync};
}
