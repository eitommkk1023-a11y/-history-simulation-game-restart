'use strict';
// 建築のプロシージャル生成（描画に依存しない）。環境（気候・資源・植生）と民族の建築伝統から、建物の「設計データ」を作る。
// - 建築伝統（genome）：民族の系統（祖先の民族）ごとに決まる好み。分裂した民族は親の伝統を受け継ぎ、少しだけ変える。
// - 地域の環境：材料・屋根・基礎・大きさは、気候・資源・植生で変わる（同じ伝統でも、土地が違えば見た目が変わる）。
// - 建物は、平面形・壁・屋根・基礎・入口・窓・装飾・寸法を、構造として別々に持つ。完成モデルは持たない。
// 乱数は整数ハッシュだけ（Seed を固定すれば同じ結果）。単位はメートル（プレイヤーの身長 1.7m と同じ縮尺）。
(function (root) {
const Npc = typeof require !== 'undefined' ? require('./npc-core.js') : root.WohNpc;
const { mix } = Npc;
const rnd = (a, b, c, d = 0) => mix(a, b, c, 5150 + d) / 4294967296;
const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const lerp = (a, b, t) => a + (b - a) * t;

const WALL_MATS = ['timber', 'stone', 'adobe', 'mud', 'turf', 'reed', 'brick', 'hide'];   // 木・石・日干しレンガ・土（泥と枝）・芝土・葦や草・焼成レンガ・皮張り
const ROOF_MATS = ['thatch', 'shingle', 'turf', 'mud', 'slab'];            // 草葺き・木の板（樹皮）・芝・土（平屋根）・石板
const PLANS = ['round', 'rect', 'poly'];
const ROOFS = ['gable', 'hip', 'cone', 'flat'];
// ---- 建築技法（民族・集団が「知っている」建て方）。nodes：その技術（民族の技術の層）のどれかを持てば自分で身につく。なければ、交流（他の集団から学ぶ）で身につく。
// BASE：誰もが持つ素朴な技法（道具や材料に頼らない）
const TECHS = {
  wattle: { jp: '編み壁（枝と泥）', cat: 'wall' }, thatch: { jp: '草葺き', cat: 'roof' }, turf: { jp: '芝土の壁・屋根', cat: 'wall' }, mudwall: { jp: '練り土の壁', cat: 'wall' }, hide: { jp: '皮張りの覆い', cat: 'wall' },
  pit: { jp: '竪穴（床を掘り下げる）', cat: 'form' }, stilts: { jp: '高床', cat: 'form' }, drystone: { jp: '乾式の石積み', cat: 'wall' }, porch: { jp: '深い庇', cat: 'form' },
  log: { jp: '丸太組み', cat: 'wall', nodes: ['dugout'] }, plank: { jp: '割り板・板張り', cat: 'wall', nodes: ['copper', 'bronze', 'iron'] }, adobe: { jp: '日干しレンガ', cat: 'wall', nodes: ['pottery'] },
  fired: { jp: '焼成レンガ', cat: 'wall', nodes: ['kiln'] }, masonry: { jp: '切石積み・漆喰', cat: 'wall', nodes: ['bronze', 'iron'] }, longhouse: { jp: '大型の長い家', cat: 'form', nodes: ['chiefdom'] },
};
const TECH_IDS = Object.keys(TECHS), BASE_TECHS = TECH_IDS.filter(k => !TECHS[k].nodes);

// ---- 環境：ブロック座標（bx, by）の、建築に関わる自然条件（0〜1、気温は℃、降水は mm/年）
function envAt(world, bx, by) {
  const W = (world.stats && world.stats.width) || Math.round(Math.sqrt(world.type.length)), H = world.type.length / W;
  bx = Math.max(0, Math.min(W - 1, Math.round(bx))); by = Math.max(0, Math.min(H - 1, Math.round(by)));
  const R = world.resources.grid, gx = Math.min(R.w - 1, (bx / R.step) | 0), gy = Math.min(R.h - 1, (by / R.step) | 0), gi = gy * R.w + gx;
  const cc = world.climate.cell, step = cc.gridStep || 8, cw = cc.w || cc.gridW, ch = cc.h || cc.gridH, c = Math.min(ch - 1, (by / step) | 0) * cw + Math.min(cw - 1, (bx / step) | 0);
  const fe = world.fauna.env, f = (a) => (a ? a[c] : 0) / 255;
  let precip = 0; if (cc.pAnnual) precip = cc.pAnnual[c]; else if (cc.precip) { const n = cc.n || cw * ch; for (let m = 0; m < 12; m++) precip += cc.precip[m * n + c]; }
  return { tempC: cc.tAnnual[c] / 10, precip, wood: R.wood[gi] / 255, stone: R.stone[gi] / 255, clay: R.clay[gi] / 255, fertile: R.fertility[gi] / 255,
    forest: f(fe.forest) + f(fe.evergreen) * 0.5, grass: f(fe.grass), desert: f(fe.desert), tundra: f(fe.tundra) + f(fe.ice), wetland: f(fe.wetland), rugged: f(fe.rugged), elev: world.elev[by * W + bx] };
}

// ---- 建築伝統の「遺伝子」：系統（祖先の民族）ごとに決まる好み。民族ごとに少しだけ変える
function genome(seed, rootEth, eth) {
  const r = (k) => rnd(seed, rootEth, k), j = (k) => (rnd(seed, eth || rootEth, 100 + k) - 0.5) * 0.25;   // 民族ごとの小さな違い
  const norm = (v) => { const s = v.reduce((a, b) => a + b, 0) || 1; return v.map(x => x / s); };
  return {
    root: rootEth,
    plan: norm([0.2 + r(1), 0.3 + r(2), 0.1 + r(3) * 0.6].map((x, k) => Math.max(0.05, x + j(k)))),          // 円形・長方形・多角形の好み
    roof: norm([0.3 + r(4), 0.15 + r(5) * 0.8, 0.15 + r(6), 0.05 + r(7) * 0.5].map((x, k) => Math.max(0.03, x + j(4 + k)))),   // 切妻・寄棟・円錐・平
    mat: Array.from({ length: WALL_MATS.length }, (_, k) => 0.75 + r(10 + k) * 0.6),                        // 材料の好み（係数）
    door: ['sun', 'water', 'center', 'east'][Math.floor(r(20) * 4)],                                          // 入口の向きの傾向
    ornament: Math.floor(r(21) * 5), hue: r(22), size: 0.85 + r(23) * 0.3 + j(9) * 0.5, windows: r(24), trimWidth: 0.1 + r(25) * 0.15,
  };
}
const pick = (w, u) => { let s = 0; for (let k = 0; k < w.length; k++) s += w[k]; let x = u * s; for (let k = 0; k < w.length; k++) { x -= w[k]; if (x <= 0) return k; } return w.length - 1; };

// ---- 地域の建築伝統：遺伝子＋環境＋建築技術（0〜1）＋民族の文化（外婚性など）から、その土地の建て方を決める
// env：envAt の結果。tech：建築技術。ethColor：民族の色（装飾に使う）
function tradition(seed, gen, env, tech, ethColor, know) {
  const K = (id) => !know || know[id] !== undefined;   // know：{技法: 身につけた日}。省略すると全て知っている
  const dry = clamp01((900 - env.precip) / 700), wet = clamp01((env.precip - 1300) / 1500), cold = clamp01((4 - env.tempC) / 14), hot = clamp01((env.tempC - 20) / 10), grassy = clamp01(env.grass + env.wetland * 0.6);
  const gate = [K('wattle'), K('drystone'), K('adobe'), K('mudwall'), K('turf'), K('thatch'), K('fired'), K('hide')];
  const sc = [   // 材料ごとの、手に入りやすさと適性（知らない技法の材料は選べない）
    (env.wood * 1.0 + env.forest * 0.55) * (1 - cold * 0.3),                                   // 木
    env.stone * (0.55 + 0.6 * (1 - env.wood)) * (0.4 + tech * 0.9),                              // 石（技術が高いほど）
    env.clay * (0.2 + dry * 0.9) * clamp01(tech * 1.6 - 0.25),                                    // 日干しレンガ（乾燥地・技術）
    env.clay * 0.55 + (1 - tech) * 0.25 * (1 - env.wood * 0.5),                                  // 土（泥と枝）
    cold * (0.4 + env.tundra * 0.8) * (1 - env.wood * 0.5),                                       // 芝土
    grassy * (0.5 + (1 - tech) * 0.4) * (1 - env.stone * 0.4),                                    // 葦・草
    env.clay * (0.15 + dry * 0.5 + wet * 0.2) * clamp01(tech * 1.5 - 0.45) * (env.wood < 0.5 ? 1.2 : 0.7),   // 焼成レンガ（粘土と高い技術）
    (1 - tech) * 0.5 * (env.tundra + grassy * 0.4 + dry * 0.3) * (env.wood < 0.4 ? 1 : 0.3),       // 皮張り（移動する暮らしの覆い）
  ].map((x, k) => gate[k] ? Math.max(0.01, x * (gen.mat[k] || 1)) : 0);
  if (sc.every(x => x === 0)) sc[0] = 0.01;
  const wallIdx = pick(sc.map(x => x * x), rnd(seed, gen.root, 40 + Math.floor(env.wood * 7) * 3 + Math.floor(env.stone * 5)));
  const wallMat = WALL_MATS[wallIdx];
  // 屋根の材料：雨・雪が多ければ傾斜のある草葺き・板、乾燥地なら土の平屋根、寒冷地は芝
  const rs = [grassy * 0.8 + env.forest * 0.3 + (1 - dry) * 0.3, env.wood * (0.2 + tech * 0.9) * (K('plank') || K('log') ? 1 : 0), cold * 0.9 * (1 - env.wood * 0.4) * (K('turf') ? 1 : 0), dry * 0.9 * (wallMat === 'adobe' || wallMat === 'mud' || wallMat === 'brick' ? 1.3 : 0.5) * (K('mudwall') ? 1 : 0), env.stone * clamp01(tech - 0.5) * 1.2 * (K('masonry') ? 1 : 0)].map((x, k) => k === 0 ? Math.max(0.02, x) : x);
  const roofMat = ROOF_MATS[pick(rs.map(x => x * x), rnd(seed, gen.root, 41))];
  // 平面形：円形（草・土・芝の家、技術が低いほど）、長方形（木・日干しレンガ・石、技術が高いほど）、多角形（その中間）
  const roundish = (wallMat === 'reed' || wallMat === 'mud' || wallMat === 'turf' || wallMat === 'hide' ? 1.5 : 0.7) * (1.4 - tech * 0.8), rectish = (wallMat === 'timber' || wallMat === 'adobe' || wallMat === 'stone' || wallMat === 'brick' ? 1.5 : 0.7) * (0.6 + tech * 0.9);
  const pw = [gen.plan[0] * roundish, gen.plan[1] * rectish, gen.plan[2] * (0.6 + (1 - Math.abs(tech - 0.4)) * 0.6)];
  // 屋根の形：平屋根は乾燥地の土・石の家、円形・多角形は円錐、長方形は切妻か寄棟（風や海が強ければ寄棟）
  const flatness = dry * (wallMat === 'adobe' || wallMat === 'mud' || wallMat === 'stone' || wallMat === 'brick' ? 1.2 : 0.3) * (roofMat === 'mud' || roofMat === 'slab' ? 1.2 : 0.4);
  const rf = [gen.roof[0] * (1 - flatness), gen.roof[1] * (1 - flatness) * (1 + wet * 0.3), gen.roof[2] * (1 - flatness), gen.roof[3] * (0.2 + flatness * 3)];
  // 傾斜：雨・雪が多いほど急。寒冷地は雪が落ちる急な屋根
  const pitch = lerp(22, 52, clamp01(wet * 0.7 + cold * 0.6 + (roofMat === 'thatch' ? 0.35 : 0) - dry * 0.6)) * (roofMat === 'mud' ? 0.3 : 1);
  const accent = ethColor ? ethColor.map(x => x / 255) : [0.6, 0.4, 0.3];
  return {
    root: gen.root, wallMat, roofMat, planW: pw, roofW: rf, pitch, door: gen.door, ornament: gen.ornament, trimWidth: gen.trimWidth, windows: gen.windows * (dry > 0.5 ? 0.4 : 1) * (cold > 0.5 ? 0.5 : 1),
    stilts: clamp01(wet * 0.5 + env.wetland * 0.9 - (cold > 0.4 ? 0.5 : 0)) * (K('stilts') ? 1 : 0),      // 水辺・多雨の地で、高床にする傾向
    sunken: clamp01(cold * 0.9 * (wallMat === 'turf' ? 1.2 : 0.6)) * (K('pit') ? 1 : 0.15),                  // 寒冷地で、床を地面より下げる傾向
    sizeK: gen.size * lerp(0.8, 1.2, tech), tech, accent, hue: gen.hue, env: { tempC: env.tempC, precip: env.precip },
    // 壁の工法：材料ごとに、知っている工法から選ぶ（木＝編み壁・丸太組み・板張り、石＝乾式・切石積み）
    methods: { timber: [['wattle', K('wattle') ? Math.max(0.1, 1.1 - tech) : 0], ['log', K('log') ? 0.6 + env.wood * 0.4 : 0], ['plank', K('plank') ? 0.2 + tech * 0.9 : 0]], stone: [['drystone', K('drystone') ? 1 : 0], ['masonry', K('masonry') ? 0.3 + tech : 0]] },
    longhouse: K('longhouse') ? 1 : 0, porch: K('porch') ? clamp01(wet * 0.6 + hot * 0.7 + (1 - cold) * 0.15) : 0,
    know: know || null, src: { seed, gen, env, color: ethColor || null },
  };
}

// ---- 地域差：同じ民族でも、地域（近い集団どうしのまとまり）ごとに好みが少しずつ違う。regionKey が同じなら同じ癖
function regional(gen, seed, regionKey, k) {
  if (!k) return gen; const j = (i) => (rnd(seed, regionKey, 300 + i) - 0.5) * 2 * k, jit = (a, o) => a.map((x, i) => Math.max(0.03, x * (1 + j(o + i))));
  const g = Object.assign({}, gen, { plan: jit(gen.plan, 0), roof: jit(gen.roof, 10), mat: gen.mat.map((x, i) => Math.max(0.2, x * (1 + j(20 + i)))), size: gen.size * (1 + j(40) * 0.5), windows: clamp01(gen.windows + j(41) * 0.5), hue: (gen.hue + j(42) * 0.2 + 1) % 1 });
  if (rnd(seed, regionKey, 350) < k * 1.2) g.door = ['sun', 'water', 'center', 'east'][Math.floor(rnd(seed, regionKey, 351) * 4)];
  if (rnd(seed, regionKey, 352) < k * 1.0) g.ornament = Math.floor(rnd(seed, regionKey, 353) * 5);
  return g;
}
// ---- 交流による様式の変化：他の民族の遺伝子（好み）を、重み w だけ混ぜる。w が大きいほど、相手の様式に近づく
function blend(gen, other, w, seed, key) {
  if (!w) return gen; const mixA = (a, b) => a.map((x, i) => x * (1 - w) + (b[i] === undefined ? x : b[i]) * w);
  const g = Object.assign({}, gen, { plan: mixA(gen.plan, other.plan), roof: mixA(gen.roof, other.roof), mat: mixA(gen.mat, other.mat), size: gen.size * (1 - w) + other.size * w, windows: gen.windows * (1 - w) + other.windows * w, trimWidth: gen.trimWidth * (1 - w) + other.trimWidth * w });
  if (rnd(seed, key, 360) < w) g.door = other.door; if (rnd(seed, key, 361) < w) g.ornament = other.ornament; return g;
}
// ---- 建築年代：建てた日（開始より前は負）に知らなかった技法は使えず、技術も今より低い。同じ集落でも、古い建物ほど素朴な作りになる
const eraCache = new WeakMap();
function tradAt(trad, day, now) {
  now = now || 0; if (!trad || !trad.src || day >= now) return trad;   // 今の建物は、今の伝統そのまま
  const yrs = (now - day) / 360, tech = Math.max(0.05, trad.tech - Math.min(0.3, yrs * 0.0025)); let know = null;
  if (trad.know) { know = {}; for (const k of Object.keys(trad.know)) if (trad.know[k] <= day) know[k] = trad.know[k]; }
  const key = Math.round(tech * 100) + ':' + (know ? Object.keys(know).sort().join(',') : '*'); let m = eraCache.get(trad); if (!m) { m = new Map(); eraCache.set(trad, m); }
  if (m.has(key)) return m.get(key);
  const t = tradition(trad.src.seed, trad.src.gen, trad.src.env, tech, trad.src.color, know); m.set(key, t); return t;
}
// ---- 建物の設計：用途（dwelling 住居／storehouse 倉庫／workshop 作業場／hall 集会所／rack 干し場）と、世帯の大きさ（人数）から、構造のデータを作る
// key：その建物を一意に決める数（集落のID・世帯のIDなど）。同じ key なら同じ設計
function designBuilding(seed, trad, role, key, members, age) {
  const u = (k) => rnd(seed, key, k);
  const big = role === 'hall' ? 1.7 : role === 'storehouse' ? 0.75 : role === 'workshop' ? 0.9 : role === 'rack' ? 0.8 : 1;
  const longH = trad.longhouse && role === 'dwelling' && members >= 5 && u(17) < 0.5;   // 大きな世帯は、長い家を建てる（その技法を知っているとき）
  const area = (7 + Math.min(members, 8) * 2.6) * trad.sizeK * big * (0.85 + u(1) * 0.3) * (longH ? 1.25 : 1);   // 床面積（㎡）：世帯の人数に応じる
  // 平面形
  const planKind = role === 'rack' ? 'rect' : PLANS[pick(trad.planW, u(2))];
  let plan;
  if (planKind === 'round') { const d = Math.sqrt(area / Math.PI) * 2; plan = { kind: 'round', w: d, d }; }
  else if (planKind === 'poly') { const sides = u(3) < 0.5 ? 6 : 8, Rr = Math.sqrt(2 * area / (sides * Math.sin(2 * Math.PI / sides))); plan = { kind: 'poly', sides, w: 2 * Rr, d: 2 * Rr }; }
  else { const ratio = role === 'rack' ? 3.2 : longH ? lerp(2.6, 3.8, u(4)) : lerp(1.0, 1.9, u(4) * (0.4 + trad.tech * 0.6)); let w = Math.sqrt(area / ratio), d = w * ratio; if (role === 'rack') { w = Math.max(1.8, w); d = Math.max(w * 2.6, d); } plan = { kind: 'rect', w, d }; }
  // 壁の高さ：技術と材料で
  const wallH = (role === 'storehouse' ? 1.5 : role === 'rack' ? 2.2 : 1.7) + trad.tech * 0.7 + u(5) * 0.3 + (trad.wallMat === 'stone' ? 0.2 : 0) - (trad.sunken > 0.5 ? 0.4 : 0);
  // 屋根
  let roofKind = plan.kind === 'rect' ? ROOFS[pick([trad.roofW[0], trad.roofW[1], 0.0001, trad.roofW[3]], u(6))] : (trad.roofW[3] > trad.roofW[2] * 1.5 ? 'flat' : 'cone');
  if (trad.roofMat === 'mud') roofKind = 'flat';   // 土の屋根は平らに
  if (role === 'rack') roofKind = 'gable';
  const pitch = Math.max(role === 'rack' ? 28 : 18, trad.pitch * (0.85 + u(7) * 0.3)), span = Math.min(plan.w, plan.kind === 'rect' ? plan.d : plan.w);
  const roofH = roofKind === 'flat' ? 0.25 : Math.min(4.6, Math.tan(pitch * Math.PI / 180) * (roofKind === 'gable' ? plan.w : span) / 2 * (roofKind === 'cone' ? 1.0 : 1));   // 屋根の高さは4.6mまで
  const overhang = roofKind === 'flat' ? 0.1 : trad.roofMat === 'thatch' ? 0.5 + u(8) * 0.3 : 0.3 + u(8) * 0.2;
  // 入口：向きは建物の局所の角度（ラジアン、0＝+z 方向、建物の正面の傾向）。実際の向きは配置で決める
  const doorW = 0.8 + u(9) * 0.25, doorH = Math.min(wallH - 0.1, 1.7 + u(10) * 0.2);
  const windows = role === 'dwelling' || role === 'hall' ? Math.round(trad.windows * (1 + (plan.kind === 'rect' ? 1 : 0.5) + u(11) * 1.5 + (role === 'hall' ? 2 : 0))) : 0;
  const ornament = (role === 'dwelling' || role === 'hall') && roofKind !== 'flat' && trad.ornament > 0 && u(12) < (role === 'hall' ? 1 : 0.35 + trad.tech * 0.4) ? trad.ornament : 0;
  // 工法・庇・形式
  const mset = trad.methods && trad.methods[trad.wallMat]; let method = trad.wallMat;
  if (mset) { const adv = role === 'hall' || role === 'storehouse' ? 1.4 : 1; const w = mset.map(([m, x], i) => x * (i > 0 ? adv : 1)); method = mset[pick(w.some(x => x > 0) ? w : [1], u(16))][0]; }
  else if (trad.wallMat === 'adobe') method = 'adobe'; else if (trad.wallMat === 'brick') method = 'fired';
  const porch = role === 'dwelling' && plan.kind === 'rect' && trad.porch > 0.25 && u(18) < trad.porch;
  const overhangF = porch ? Math.max(overhang, 1.1) : overhang;
  const sunk = trad.sunken > 0.5, stilt = role === 'storehouse' ? 1 : trad.stilts;
  const form = role !== 'dwelling' ? role : trad.wallMat === 'hide' ? 'tent' : sunk && roofKind !== 'flat' ? 'pithouse' : stilt > 0.5 ? 'stilthouse' : longH && plan.kind === 'rect' ? 'longhouse' : plan.kind === 'round' ? 'roundhouse' : plan.kind === 'poly' ? 'polyhouse' : roofKind === 'flat' ? 'blockhouse' : 'hut';
  return {
    form, porch, role, key, plan, wallH, roof: { kind: roofKind, pitch, h: roofH, overhang: overhangF, mat: trad.roofMat }, wall: { mat: trad.wallMat, method },
    door: { w: doorW, h: doorH, localAngle: 0 }, windows, ornament, trim: ornament === 3 || (trad.trimWidth > 0.2 && u(13) < 0.5), trimHue: (trad.hue + u(14) * 0.08) % 1,
    stilts: role === 'storehouse' ? 1 : trad.stilts, sunken: trad.sunken, members, age: age || 0,
    tint: 0.9 + u(15) * 0.2,   // 材料の色のむら
  };
}

// ---- 材料の色（建物の部品の色）。経年で少し暗く、くすませる
const MAT_COLOR = { timber: [0.50, 0.36, 0.23], stone: [0.55, 0.54, 0.52], adobe: [0.74, 0.57, 0.38], mud: [0.45, 0.34, 0.25], turf: [0.30, 0.38, 0.20], reed: [0.72, 0.63, 0.38],
  thatch: [0.70, 0.60, 0.33], shingle: [0.42, 0.31, 0.21], slab: [0.46, 0.46, 0.45], brick: [0.60, 0.30, 0.20], hide: [0.58, 0.50, 0.40], found: [0.50, 0.49, 0.47], dark: [0.10, 0.08, 0.07] };
function matColor(name, tint, age) { const c = MAT_COLOR[name] || [0.5, 0.5, 0.5], w = Math.min(0.35, (age || 0) / 400 * 0.35), g = 0.5; return c.map(x => Math.max(0, Math.min(1, (x * (1 - w) + g * w * 0.8) * (tint || 1)))); }

const api = { WALL_MATS, ROOF_MATS, PLANS, ROOFS, TECHS, TECH_IDS, BASE_TECHS, envAt, genome, regional, blend, tradition, tradAt, designBuilding, matColor, MAT_COLOR };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohArch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
