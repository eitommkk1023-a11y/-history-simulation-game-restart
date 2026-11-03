/** Read-only overview extracted from the baseline generator's renderer.
 * Original palette, height averaging, lake flattening and camera projection retained.
 * The baseline HTML and world arrays are never modified. */
export function createLegacyOverview(world,renderer,terrain){
 const THREE=globalThis.THREE,W=terrain.width,H=terrain.height,MESH_RES=256,LAND_SCALE=.006,SEA_SCALE=.0015;
 const lakeId=world.lakeId||null,lakeLevels=world.lakeLevels||[];
const COLOR_STOPS = [
  [-5000, [10, 32, 72]], [-2500, [16, 52, 104]], [-800, [26, 82, 142]], [-150, [38, 100, 158]], [-1, [56, 124, 176]],
  [0, [96, 150, 78]], [100, [122, 170, 88]], [200, [150, 180, 98]],
  [400, [190, 186, 112]], [600, [176, 150, 96]],
  [1000, [156, 124, 82]], [1500, [136, 108, 76]],
  [2200, [120, 100, 84]], [3000, [132, 124, 118]],
  [4000, [196, 194, 192]], [5500, [248, 248, 250]],
];
const LUT_MIN = -5000, LUT_MAX = 7000, LUT_N = 2048;
const LUT = new Uint8Array(LUT_N * 3);
(function buildLut() {
  for (let k = 0; k < LUT_N; k++) {
    const e = LUT_MIN + (LUT_MAX - LUT_MIN) * k / (LUT_N - 1);
    let a = COLOR_STOPS[0], b = COLOR_STOPS[COLOR_STOPS.length - 1];
    if (e <= a[0]) b = a; else if (e >= b[0]) a = b;
    else for (let s = 0; s < COLOR_STOPS.length - 1; s++) {
      if (e >= COLOR_STOPS[s][0] && e <= COLOR_STOPS[s + 1][0]) { a = COLOR_STOPS[s]; b = COLOR_STOPS[s + 1]; break; }
    }
    const t = a === b ? 0 : (e - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c++) LUT[k * 3 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * t);
  }
})();
function lutIndex(e) {
  const k = Math.round((e - LUT_MIN) / (LUT_MAX - LUT_MIN) * (LUT_N - 1));
  return k < 0 ? 0 : (k >= LUT_N ? LUT_N - 1 : k);
}
const LEGEND = [
  ['深海', -3000], ['浅海', -100], ['平原 (0〜200m)', 100], ['丘陵 (200〜600m)', 400],
  ['高地 (600〜1500m)', 1100], ['山地 (1500〜3000m)', 2200], ['高山 (3000m〜)', 4500],
];
// 植生の色（衛星写真に近い自然な色）
const BIOME_COLORS = [
  null,               // 0 海（標高の色を使う）
  [214, 226, 234],    // 1 海氷
  [238, 242, 246],    // 2 氷雪
  [150, 150, 122],    // 3 ツンドラ
  [62, 92, 66],       // 4 針葉樹林
  [160, 166, 108],    // 5 草原（ステップ）
  [82, 122, 60],      // 6 温帯林
  [48, 100, 62],      // 7 温帯雨林
  [224, 198, 146],    // 8 砂漠
  [184, 158, 78],     // 9 サバンナ
  [112, 140, 60],     // 10 熱帯季節林
  [40, 96, 44],       // 11 熱帯雨林
  [128, 120, 110],    // 12 高山
  [70, 112, 92],      // 13 湿地
  [236, 234, 226],    // 14 塩の平原
  [230, 190, 120],    // 15 大砂丘
  [70, 196, 200],     // 16 サンゴ礁（海）
];
const SALT_LAKE_RGB = [120, 176, 186];   // 塩湖（浅く塩分が多い）
const LAKE_RGB = [54, 106, 160], RIVER_RGB = [60, 116, 172], SAND_RGB = [216, 202, 160], ROCK_RGB = [116, 108, 98];

function heightAt(elev, fx, fy) {
  // 表示用の高さ：周辺を平均してエイリアシングを抑える
  const step = W / MESH_RES;
  const r = Math.max(1, Math.floor(step / 2));
  const cx = Math.round(fx), cy = Math.round(fy);
  let sum = 0, n = 0;
  for (let y = cy - r; y <= cy + r; y++) {
    if (y < 0 || y >= H) continue;
    for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || x >= W) continue;
      const i = y * W + x;
      // 湖は水面の高さで表示する（湖面が平らになる）
      const L = lakeId ? lakeId[i] : 0;
      sum += L ? Math.max(elev[i], lakeLevels[L]) : elev[i]; n++;
    }
  }
  const e = sum / n;
  return e >= 0 ? e * LAND_SCALE : e * SEA_SCALE;
}
function buildTexture(elev, biome, mode) {
  const data = new Uint8Array(W * H * 4);
  const useBiome = mode === 'biome' && biome;
  const type = world.type, water = world.water;
  const geo = world.geology, useGeo = (mode === 'plate' || mode === 'geology') && geo;
  const GS = geo ? geo.gridStep : 8, GW = geo ? geo.gridW : 1, GH = geo ? geo.gridH : 1;
  const hotR2 = 18 * 18;
  const cc = world.climate && world.climate.cell, useClimate = (mode === 'climate' || mode === 'deer') && cc;
  const faTier = mode === 'deer' && world.fauna ? world.fauna.species.deer.tier : null;
  // 海岸の判定：2ブロック以内に海があるか
  const nearSea = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= W) continue;
        if (!type[yy * W + xx]) return true;
      }
    }
    return false;
  };
  const lx = -0.55, ly = -0.45, lz = 0.70; // 陰影用の光の向き
  const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const e = elev[i];
      const k = lutIndex(e) * 3;
      let r = LUT[k], g = LUT[k + 1], b = LUT[k + 2];
      if (useBiome) {
        const bi = biome[i];
        if (bi === 1) {
          // 海氷：海の色に白を重ねる
          r = r * 0.15 + 214 * 0.85; g = g * 0.15 + 226 * 0.85; b = b * 0.15 + 234 * 0.85;
        } else if (bi === 16) {
          // サンゴ礁：浅い海が明るい青緑に見える
          const c = BIOME_COLORS[16];
          r += (c[0] - r) * 0.6; g += (c[1] - g) * 0.6; b += (c[2] - b) * 0.6;
        } else if (bi > 1) {
          const c = BIOME_COLORS[bi];
          r = c[0]; g = c[1]; b = c[2];
          // 大砂丘：風下に並ぶ砂丘の縞
          if (bi === 15) { const st = 0.88 + 0.12 * Math.sin((x * 0.8 + y * 0.45) + 1.5 * Math.sin(y * 0.11 + x * 0.03)); r *= st; g *= st; b *= st; }
          // 標高が高い所は岩肌の色に寄せる
          if (bi !== 2 && e > 1800) {
            const t = 0.6 * Math.min(1, (e - 1800) / 1400);
            r += (120 - r) * t; g += (112 - g) * t; b += (104 - b) * t;
          }
        }
      }
      if (mode === 'res') {
        const rc = resColor(x, y, i, type[i] > 0, [r, g, b]);
        if (rc) { r = rc[0]; g = rc[1]; b = rc[2]; }
      }
      if (useClimate && type[i]) {
        // 気候格子（8ブロック四方）の境目が四角く見えないよう、参照位置を少しずらして境界をぼかす
        let hsh = Math.imul(x * 73856093 ^ y * 19349663, 0x27d4eb2d); hsh ^= hsh >>> 15;
        const sx = Math.min(cc.gridW - 1, Math.max(0, ((x + ((hsh & 7) - 3.5)) / cc.gridStep) | 0));
        const sy = Math.min(cc.gridH - 1, Math.max(0, ((y + (((hsh >>> 3) & 7) - 3.5)) / cc.gridStep) | 0));
        const c = faTier ? FAUNA_TIER_RGB[faTier[sy * cc.gridW + sx]] : KOPPEN_LEGEND[cc.zone[sy * cc.gridW + sx]][1];
        r = c[0]; g = c[1]; b = c[2];
      }
      if (useGeo) {
        const gi = Math.min(GH - 1, (y / GS) | 0) * GW + Math.min(GW - 1, (x / GS) | 0);
        let c;
        if (mode === 'plate') {
          c = PLATE_COLORS[geo.plate[gi] % PLATE_COLORS.length];
          const bt = geo.boundaryType[gi];
          if (bt) c = BOUNDARY_RGB[bt];
        } else {
          const cr = geo.crust[gi];
          if (cr === 0) {
            const t = Math.min(1, geo.age[gi] / 150);
            c = [GEO_RGB.young[0] + (GEO_RGB.old[0] - GEO_RGB.young[0]) * t, GEO_RGB.young[1] + (GEO_RGB.old[1] - GEO_RGB.young[1]) * t,
              GEO_RGB.young[2] + (GEO_RGB.old[2] - GEO_RGB.young[2]) * t];
          } else c = cr === 1 ? GEO_RGB.craton : cr === 2 ? GEO_RGB.orogen : GEO_RGB.rift;
          const cause = geo.cause[gi];
          if (cause === 2) c = GEO_RGB.trench;
          else if (cause === 8) c = GEO_RGB.fault;
          else if (geo.volcanism[gi] > 500) c = [c[0] * 0.4 + GEO_RGB.volc[0] * 0.6, c[1] * 0.4 + GEO_RGB.volc[1] * 0.6, c[2] * 0.4 + GEO_RGB.volc[2] * 0.6];
        }
        // 海は暗く、陸は明るく（海岸線が分かるように）
        const k2 = type[i] ? 1 : 0.62;
        r = c[0] * k2; g = c[1] * k2; b = c[2] * k2;
        for (const h of geo.hotspots) {
          const dx = x - h.x, dy = y - h.y, d2 = dx * dx + dy * dy;
          if (d2 < hotR2 && d2 > hotR2 * 0.45) { r = HOTSPOT_RGB[0]; g = HOTSPOT_RGB[1]; b = HOTSPOT_RGB[2]; }
        }
      }
      let shade = 1;
      const wt = water ? water[i] : 0;
      if (type[i] && !wt) {
        const ex1 = elev[y * W + Math.min(W - 1, x + 1)], ex0 = elev[y * W + Math.max(0, x - 1)];
        const ey1 = elev[Math.min(H - 1, y + 1) * W + x], ey0 = elev[Math.max(0, y - 1) * W + x];
        const gx = (Math.max(ex1, 0) - Math.max(ex0, 0)) / 1500, gy = (Math.max(ey1, 0) - Math.max(ey0, 0)) / 1500;
        const nl = Math.sqrt(gx * gx + gy * gy + 1);
        const d = (-gx * lx - gy * ly + lz) / (nl * ll);
        shade = 0.62 + 0.5 * Math.max(0, d);
        // 海岸：なだらかな低地は砂浜、急斜面は岩場
        if (e < 120 && nearSea(x, y)) {
          const slope = Math.sqrt(gx * gx + gy * gy) * 1500 / 2;   // 1ブロックあたりの高低差(m)
          const bi = biome ? biome[i] : 0;
          if (slope < 6 && e < 25 && bi !== 2 && bi !== 3) {
            r += (SAND_RGB[0] - r) * 0.7; g += (SAND_RGB[1] - g) * 0.7; b += (SAND_RGB[2] - b) * 0.7;
          } else if (slope > 18) {
            r += (ROCK_RGB[0] - r) * 0.55; g += (ROCK_RGB[1] - g) * 0.55; b += (ROCK_RGB[2] - b) * 0.55;
          }
        }
      } else if (wt) {
        const c = wt === 2 ? (world.lakeSalt && world.lakeSalt[world.lakeId[i]] ? SALT_LAKE_RGB : LAKE_RGB) : RIVER_RGB;
        r = c[0]; g = c[1]; b = c[2];
      }
      // テクスチャの行0は奥（-Z）側にならないよう上下を反転して格納
      const o = ((H - 1 - y) * W + x) * 4;
      data[o] = Math.min(255, r * shade);
      data[o + 1] = Math.min(255, g * shade);
      data[o + 2] = Math.min(255, b * shade);
      data[o + 3] = 255;
    }
  }
  if (mode !== 'plate') paintVolcanoes(data, elev);
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  if (renderer.capabilities.isWebGL2) {
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  } else {
    tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  }
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  // GPUへ転送した後は元データ（3000×3000×4バイト）を解放してメモリを節約する
  tex.onUpdate = () => { tex.image.data = null; tex.onUpdate = null; };
  return tex;
}
const VOLC_ROCK_RGB = [72, 64, 62], CRATER_RGB = [38, 30, 30], CRATER_HOT_RGB = [235, 92, 40];
function paintVolcanoes(data, elev) {
  if (!world.volcanoes) return;
  for (const v of world.volcanoes) {
    const R = v.radius, x0 = Math.max(0, Math.floor(v.x - R)), x1 = Math.min(W - 1, Math.ceil(v.x + R));
    const y0 = Math.max(0, Math.floor(v.y - R)), y1 = Math.min(H - 1, Math.ceil(v.y + R));
    const rockR = v.kind === 1 ? 0.35 : 0.24, craterR = v.kind === 1 ? 0.1 : 0.06;   // 成層火山は半径にすそ野を含む
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (elev[y * W + x] <= 0) continue;
      const d = Math.sqrt((x - v.x) * (x - v.x) + (y - v.y) * (y - v.y)) / R;
      if (d >= rockR) continue;
      const o = ((H - 1 - y) * W + x) * 4;
      let c, t;
      if (d < craterR) { c = v.active && d < craterR * 0.6 ? CRATER_HOT_RGB : CRATER_RGB; t = 0.9; }
      else { c = VOLC_ROCK_RGB; t = 0.65 * Math.min(1, 2 - 2 * d / rockR); }
      for (let k = 0; k < 3; k++) data[o + k] += (c[k] - data[o + k]) * t;
    }
  }
}


 const scene=new THREE.Scene();scene.background=new THREE.Color(0x0a121d);scene.fog=new THREE.Fog(0x0a121d,5400,12600);
 scene.add(new THREE.AmbientLight(0xffffff,.62));const sun=new THREE.DirectionalLight(0xffffff,.55);sun.position.set(-1800,2700,-1200);scene.add(sun);
 const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,3,18000);
 const geometry=new THREE.PlaneGeometry(W,H,MESH_RES,MESH_RES);geometry.rotateX(-Math.PI/2);
 const positions=geometry.attributes.position;
 for(let i=0;i<positions.count;i++){const x=(positions.getX(i)+W/2)*(W-1)/W,y=(positions.getZ(i)+H/2)*(H-1)/H;positions.setY(i,heightAt(world.elev,x,y));}
 geometry.computeVertexNormals();
 const texture=buildTexture(world.elev,world.biome,'biome'),material=new THREE.MeshLambertMaterial({map:texture});
 const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
 const marker=new THREE.Mesh(new THREE.SphereGeometry(Math.max(.7,W*.002),10,8),new THREE.MeshBasicMaterial({color:0xffd350,depthTest:false}));marker.renderOrder=3;scene.add(marker);
 const cam={tx:0,tz:H*.06,dist:Math.max(60,Math.max(W,H)*1.15),yaw:0,pitch:.95};
 function update(){
  cam.dist=Math.max(60,Math.min(6600,cam.dist));cam.pitch=Math.max(.18,Math.min(1.52,cam.pitch));cam.tx=Math.max(-W/2,Math.min(W/2,cam.tx));cam.tz=Math.max(-H/2,Math.min(H/2,cam.tz));
  camera.position.set(cam.tx+cam.dist*Math.cos(cam.pitch)*Math.sin(cam.yaw),cam.dist*Math.sin(cam.pitch),cam.tz+cam.dist*Math.cos(cam.pitch)*Math.cos(cam.yaw));camera.lookAt(cam.tx,0,cam.tz);
 }
 function player(p){if(!p)return;const q=terrain.metersToOverview(p.xM,p.yM),grid=terrain.metersToGrid(p.xM,p.yM);marker.position.set(q.x,heightAt(world.elev,grid.x,grid.y)+2,q.z);}
 function dispose(){geometry.dispose();texture.dispose();material.dispose();marker.geometry.dispose();marker.material.dispose();}
 update();return {scene,camera,cam,mesh,update,player,dispose,world};
}
