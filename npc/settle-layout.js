'use strict';
// 集落の自動生成（描画に依存しない）：水場・傾斜・資源・既存の建物を見て、世帯ごとの住居と、倉庫・作業場・干し場・集会所を置き、道でつなぐ。
// - 集落の歴史（成立年代・衰退・防衛）から、建物の古さ・数・技術・防衛設備を決める（開始前の歴史は、一日ずつ計算しない）。
// - 世帯（household）と住居は、世帯IDで結びつく（layout.byHouse）。新しい世帯・消えた世帯・NPC による建設・改築・解体の要求は、syncLayout / applyRequests で反映する。
// - 座標は集落の中心からのメートル（x：東、z：南）。地形は呼び出し側が関数で渡す（描画の地形でも、テスト用の合成地形でもよい）。
// 乱数は整数ハッシュだけ。同じ入力（Seed・集団・世帯）なら同じ集落。
(function (root) {
const Npc = typeof require !== 'undefined' ? require('./npc-core.js') : root.WohNpc;
const Arch = typeof require !== 'undefined' ? require('./arch-gen.js') : root.WohArch;
const Mat = typeof require !== 'undefined' ? require('./materials.js') : root.WohMat;
const { mix } = Npc;
const rnd = (a, b, c, d = 0) => mix(a, b, c, 7701 + d) / 4294967296;
const YEAR = 360;

// ---- 集落の歴史：成立年代・状態・出来事・建築技術・防衛。level＝定住の段階（0野営地・1半定住・2村）、site＝暮らしやすさ（0〜1）、wetSite＝水辺か
function settleHistory(seed, gid, level, pop, site, opts) {
  const u = (k) => rnd(seed, gid, 100 + k), o = opts || {};
  const age = level === 2 ? 60 + u(1) * 420 : level === 1 ? 8 + u(1) * 70 : u(1) * 12;   // 成立してからの年数（0年の時点）
  const status = level === 0 ? 'seasonal' : age < 25 ? 'young' : (level === 2 && age > 120 && u(2) < 0.16) || pop < (level === 2 ? 55 : 30) ? 'declining' : 'established';
  const pool = ['flood', 'fire', 'famine', 'epidemic'].concat(o.neighbors ? ['raid'] : [], level === 2 ? ['expansion', 'expansion'] : []);
  const events = []; const n = level === 0 ? 0 : Math.min(4, Math.floor(age / 90) + (u(3) < 0.5 ? 1 : 0));
  for (let k = 0; k < n; k++) events.push({ year: -Math.round(u(10 + k) * age), type: pool[Math.floor(u(20 + k) * pool.length)] });
  events.sort((a, b) => a.year - b.year);
  const raided = events.some(e => e.type === 'raid');
  const tech = Math.max(0.1, Math.min(0.85, 0.15 + 0.45 * (1 - Math.exp(-age / 150)) + (u(4) - 0.35) * 0.3 + (o.cultureTech || 0)));   // 建築の技術（0〜1）
  const defense = level === 0 ? 0 : raided && age > 150 ? 2 : raided || (level === 2 && age > 250 && u(5) < 0.25) ? 1 : 0;   // 0なし 1柵 2頑丈な囲い
  return { foundedYear: -Math.round(age), age: Math.round(age), status, events, tech, defense, rebuildCycle: 30 + Math.round(u(6) * 30), level0: level };
}

// ---- 図形：丸（round）か長方形（rect、回転あり）。重なりの判定に使う
function shapeOf(b) { return b.plan.kind === 'rect' ? { x: b.x, z: b.z, rot: b.rot, hw: b.plan.w / 2 + (b.roof ? Math.min(0.3, b.roof.overhang * 0.5) : 0), hd: b.plan.d / 2, round: false } : { x: b.x, z: b.z, rot: 0, hw: b.plan.w / 2 + 0.3, hd: b.plan.w / 2 + 0.3, round: true }; }
function circleOBB(c, o, m) { const dx = c.x - o.x, dz = c.z - o.z, cs = Math.cos(o.rot), sn = Math.sin(o.rot), lx = dx * cs + dz * sn, lz = -dx * sn + dz * cs, qx = Math.max(-o.hw, Math.min(o.hw, lx)), qz = Math.max(-o.hd, Math.min(o.hd, lz)); return Math.hypot(lx - qx, lz - qz) < c.hw + m; }
function obbObb(a, b, m) {
  const ax = [[Math.cos(a.rot), -Math.sin(a.rot)], [Math.sin(a.rot), Math.cos(a.rot)]], bx = [[Math.cos(b.rot), -Math.sin(b.rot)], [Math.sin(b.rot), Math.cos(b.rot)]], d = [b.x - a.x, b.z - a.z];
  for (const axis of [ax[0], ax[1], bx[0], bx[1]]) { const ra = Math.abs(a.hw * (ax[0][0] * axis[0] + ax[0][1] * axis[1])) + Math.abs(a.hd * (ax[1][0] * axis[0] + ax[1][1] * axis[1])), rb = Math.abs(b.hw * (bx[0][0] * axis[0] + bx[0][1] * axis[1])) + Math.abs(b.hd * (bx[1][0] * axis[0] + bx[1][1] * axis[1])); if (Math.abs(d[0] * axis[0] + d[1] * axis[1]) > ra + rb + m) return false; }
  return true;
}
function overlaps(a, b, m) { if (a.round && b.round) return Math.hypot(a.x - b.x, a.z - b.z) < a.hw + b.hw + m; if (a.round) return circleOBB(a, b, m); if (b.round) return circleOBB(b, a, m); return obbObb(a, b, m); }

// ---- 配置の本体
const MAX_SLOPE = { dwelling: 26, hall: 14, storehouse: 22, workshop: 20, rack: 30 };
function newLayout(gid) { return { version: 2, log: [], gid, center: { x: 0, z: 0 }, items: [], paths: [], plaza: { r: 5, kind: 'open' }, axis: { a: 0, k: 0 }, nTarget: 0, byHouse: {}, fields: [], fence: [], queue: [], nextSeq: 1, history: null, resolved: false }; }
// ---- 履歴：集落全体の記録（log）と、建物ごとの記録（b.rec）。day は暦の絶対日（開始より前は負）。by は世界共通ID（世帯＝夫の人物ID）。
// synthetic：ゲーム開始前の歴史から作った推定（実際に起きた出来事ではない）。取得できない項目は入れない
const PURPOSE = { dwelling: '世帯の住まい', hall: '集会・祭祀', storehouse: '食料・道具の保管', workshop: '道具づくり', rack: '魚・肉の干し物' };
const LOG_CAP = 600;
function logEv(layout, day, type, b, extra) { const e = Object.assign({ day, type }, b ? { id: b.id, role: b.role, house: b.house } : {}, extra || {}); layout.log.push(e); if (layout.log.length > LOG_CAP) layout.log.splice(1, layout.log.length - LOG_CAP); return e; }
function mkRec(b, day, why, by, synthetic) { b.rec = { builtDay: day, why, by: by === undefined ? null : by, purpose: PURPOSE[b.role] || b.role, synthetic: !!synthetic, edits: [] }; return b.rec; }
// 古い保存（version 1・履歴なし）を今の形にそろえる。位置・形は変えない
function upgradeLayout(layout) {
  if (!layout) return layout; if (!layout.log) layout.log = []; if (!layout.plaza.kind) layout.plaza.kind = 'open'; if (!layout.axis) layout.axis = { a: 0, k: 0 }; if (layout.nTarget === undefined) layout.nTarget = layout.items.filter(i => i.role === 'dwelling').length;
  for (const b of layout.items) if (!b.rec) mkRec(b, Math.round((b.builtYear || 0) * YEAR), 'unknown', b.house >= 0 && b.house < 1e6 ? b.house : null, true);
  layout.version = 2; return layout;
}
// 地面：建物の足元の高さを数点で測る
function groundOf(terr, b) {
  const pts = [[0, 0]], hw = b.plan.w / 2, hd = (b.plan.kind === 'rect' ? b.plan.d : b.plan.w) / 2, cs = Math.cos(b.rot), sn = Math.sin(b.rot);
  const ring = b.plan.kind === 'rect' ? [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] : [0, 1, 2, 3, 4, 5, 6, 7].map(k => [Math.cos(k * Math.PI / 4) * hw, Math.sin(k * Math.PI / 4) * hw]);
  let mn = 1e9, mx = -1e9, sum = 0, n = 0, wet = 0;
  for (const [lx, lz] of pts.concat(ring)) { const x = b.x + lx * cs + lz * sn, z = b.z - lx * sn + lz * cs, h = terr.height(x, z); mn = Math.min(mn, h); mx = Math.max(mx, h); sum += h; n++; if (terr.water(x, z) > 0.05) wet++; }
  return { hMin: mn, hMax: mx, hMean: sum / n, wetCorners: wet };
}
// 基礎：傾斜・湿り・寒さで、土台・高床・床下げを決める（床の高さ floorY は、集落の中心の高さ 0 からの相対）
function decideFoundation(b, g, trad, terrWet) {
  const rel = g.hMax - g.hMin; let kind = 'shallow', floorY = g.hMean, foundH = 0.15;
  const wantStilts = b.role === 'storehouse' || b.role === 'rack' || (b.stilts > 0.5 && (terrWet || g.wetCorners > 0)) || g.wetCorners > 1;
  if (wantStilts) { kind = 'stilts'; floorY = g.hMax + (b.role === 'storehouse' ? 1.0 : 0.8); foundH = floorY - g.hMin; }
  else if (rel > 0.35 && rel <= 1.6) { kind = 'platform'; floorY = g.hMax + 0.15; foundH = floorY - g.hMin; }
  else if (rel > 1.6) { kind = 'terrace'; floorY = g.hMean + 0.2; foundH = floorY - g.hMin; }
  else if (b.sunken > 0.5 && rel < 0.5) { kind = 'sunken'; floorY = g.hMean - 0.5; foundH = 0.0; }
  else { floorY = g.hMean + 0.12; foundH = floorY - g.hMin + 0.05; }
  return { kind, floorY, foundH: Math.max(0.08, foundH) };
}
function doorDirection(trad, terr, b, layout) {
  const to = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }, c = layout.center;
  // 入口の向きは、伝統（水・太陽・東・中心）を基本に、水辺の向き・下り坂（水はけ）を混ぜる。中心を向くのは、広場のある村だけが強い
  const w = terr.nearestWater(b.x, b.z), wv = w && w.dist < 150 ? to(w.dx, w.dz) : null;
  const e = 2, gx = terr.height(b.x + e, b.z) - terr.height(b.x - e, b.z), gz = terr.height(b.x, b.z + e) - terr.height(b.x, b.z - e), gl = Math.hypot(gx, gz), down = gl > 0.1 ? [-gx / gl, -gz / gl] : null;
  let base, wc = 1; const core = to(c.x - b.x, c.z - b.z);
  if (trad.door === 'water' && wv) base = wv; else if (trad.door === 'sun') base = to(0, 1); else if (trad.door === 'east') base = to(1, 0);
  else { base = core; wc = layout.plaza.kind === 'open' ? 1 : 0.55; }
  let vx = base[0] * wc, vz = base[1] * wc;
  if (down) { vx += down[0] * 0.5; vz += down[1] * 0.5; }
  if (wv && trad.door !== 'water') { vx += wv[0] * 0.3; vz += wv[1] * 0.3; }
  const jitter = (rnd(0, b.key, 9) - 0.5) * 0.9;
  return Math.atan2(vx, vz) + jitter;   // 0＝+z 方向
}
// 集落のおおよその広がり（m）：世帯数の平方根に比例（密集しすぎ・散らばりすぎを防ぐ目安）
function extentOf(layout) { const n = Math.max(layout.nTarget || 0, layout.items.filter(i => i.role === 'dwelling' && i.state !== 'removed').length, 4); return 12 + 4.2 * Math.sqrt(n); }
// 育つ位置の候補：すでにある建物（空き家・廃屋以外）と、中心の火。ここから外へ向かって家が増える
function growPool(layout) {
  const pool = [{ x: layout.center.x, z: layout.center.z, r: layout.plaza.r * 0.5 }];
  for (const i of layout.items) if (i.state !== 'removed' && i.state !== 'ruin' && (i.role === 'dwelling' || i.role === 'hall' || i.role === 'storehouse')) pool.push({ x: i.x, z: i.z, r: Math.hypot(i.plan.w, i.plan.kind === 'rect' ? i.plan.d : i.plan.w) / 2 });
  return pool;
}
function place(layout, spec, b, opts) {
  const { terr, seed, trad } = spec, o = opts || {}, items = layout.items;
  const r0 = Math.hypot(b.plan.w, b.plan.kind === 'rect' ? b.plan.d : b.plan.w) / 2 + 1.2;
  const anchor = o.anchor || layout.center, maxSlope = MAX_SLOPE[b.role] || 24;
  const organic = !!o.grow || o.prefDist === 0, Rc = extentOf(layout), pool = o.grow ? growPool(layout) : null, ax = layout.axis;
  let best = null, bestS = -1e9;
  const nTry = 40, R = o.radius || (layout.plaza.r + r0 + 2);
  // 近くの建物だけを調べる（空間の格子）：全ての建物を毎回調べると、建物の数の2乗に比例して遅くなる（約9000人の集落で18秒）。重なりの判定・最も近い建物・近くの建物の数は、近くの建物だけで同じ結果になる
  const CELL = 24, grid = new Map(); let live = 0, ext = 0;
  for (const it of items) { if (it.state === 'removed') continue; live++; const sh2 = shapeOf(it), e2 = Math.hypot(sh2.hw, sh2.hd); if (e2 > ext) ext = e2; const key = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL); let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(it, sh2, e2); }
  for (let k = 0; k < nTry; k++) {
    const grow = 1 + Math.floor(k / 14) * 0.45;   // 見つからなければ、外へ広げる
    const ang = rnd(seed, b.key, 200 + k) * Math.PI * 2; let cx = anchor.x, cz = anchor.z, rad;
    if (pool) { const P = pool[Math.floor(rnd(seed, b.key, 500 + k) * pool.length)]; cx = P.x; cz = P.z; rad = (r0 + P.r + 1.8 + rnd(seed, b.key, 300 + k) * 9) * grow; }
    else rad = (R + rnd(seed, b.key, 300 + k) * (o.spread || 18)) * grow;
    const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad;
    const d = Math.hypot(x - layout.center.x, z - layout.center.z); if (d < layout.plaza.r + r0 * 0.7) continue;
    const wd = terr.water(x, z); if (wd > 0.25 && b.role !== 'rack') continue;
    const slope = terr.slope(x, z); if (slope > maxSlope) continue;
    b.x = x; b.z = z; b.rot = doorDirection(trad, terr, b, layout);
    const sh = shapeOf(b); let bad = false, nnMin = 1e9, nb = 0;
    const esh = Math.hypot(sh.hw, sh.hd), Rq = Math.max(Math.hypot(sh.hw, sh.hd) + ext + 3, r0 + 3 + 26), gx0 = Math.floor((x - Rq) / CELL), gx1 = Math.floor((x + Rq) / CELL), gz0 = Math.floor((z - Rq) / CELL), gz1 = Math.floor((z + Rq) / CELL);
    outer: for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) { const l = grid.get(gx + ',' + gz); if (!l) continue; for (let q = 0; q < l.length; q += 3) { const it = l[q], dd = Math.hypot(x - it.x, z - it.z); if (dd <= esh + l[q + 2] + 6 && overlaps(sh, l[q + 1], 1.6)) { bad = true; break outer; } if (dd < nnMin) nnMin = dd; if (dd < 16) nb++; } }
    if (bad) continue;
    if (live > 0 && nnMin > 1e8) nnMin = Rq + 1;   // 近くに建物がない（遠くにはある）：点数の上限（-3）に当たる距離
    const nw = terr.nearestWater(x, z); let s;
    if (organic) {
      // 自然な育ち方：平らさ・水との距離・まとまり（近すぎず遠すぎない間隔）・集落の広がりの上限・その集落の伸びる向き
      s = -slope * 0.4 - Math.max(0, d - Rc) * 0.12 - d * 0.03;
      if (nnMin < 1e8) s += Math.max(-3, 2.5 - Math.abs(nnMin - (r0 + 3)) * 0.3) + Math.min(nb, 3) * 0.8 - Math.max(0, nb - 6);
      if (ax.k > 0) s += ax.k * 3 * Math.cos(2 * (Math.atan2(z - layout.center.z, x - layout.center.x) - ax.a)) * Math.min(1, d / 10);
    } else s = -Math.abs(d - (o.prefDist || (layout.plaza.r + 10))) * 0.35 - slope * 0.4;
    if (nw) { if (b.role === 'rack') s += 8 - Math.abs(nw.dist - 7); else if (organic) s += Math.max(-6, 7 - Math.abs(nw.dist - (spec.siteKind === 'spring' ? 14 : 35)) / 7); else s += 5 - Math.abs(nw.dist - 40) / 9; }
    if (o.anchor && !o.grow) s -= Math.hypot(x - o.anchor.x, z - o.anchor.z) * 0.25;
    if (terr.wet && terr.wet(x, z) && b.stilts < 0.3 && b.role === 'dwelling') s -= 4;
    if (s > bestS) { bestS = s; best = { x, z, rot: b.rot }; }
  }
  if (!best) return false;
  b.x = best.x; b.z = best.z; b.rot = best.rot;
  // 入口の位置（建物の外側。局所の +z 面の中央）と、地面・基礎
  const half = (b.plan.kind === 'rect' ? b.plan.d : b.plan.w) / 2, sn = Math.sin(b.rot), cs = Math.cos(b.rot);
  b.entrance = { x: b.x + sn * (half + 0.35), z: b.z + cs * (half + 0.35), dx: sn, dz: cs };
  const g = groundOf(terr, b); b.ground = g; Object.assign(b, { found: decideFoundation(b, g, trad, terr.wet && terr.wet(b.x, b.z)) });
  return true;
}
function addBuilding(layout, spec, role, house, members, anchor, opts, builtAge) {
  const { seed, trad, gid } = spec, seq = layout.nextSeq++, key = gid * 100003 + seq;
  const now = layout.day0 || 0, bday = now - (builtAge || 0) * YEAR, b = Arch.designBuilding(seed, Arch.tradAt(trad, bday, now), role, key, members, builtAge || 0);
  b.id = key; b.house = house; b.seq = seq; b.state = 'ok'; b.builtYear = Math.floor(now / YEAR) - (builtAge || 0); b.builtDay = bday; b.vacantSince = null;
  if (spec.level === 0 && (role === 'dwelling' || role === 'storehouse')) {   // 野営地：持ち運べる軽い住まい（低い壁と急な屋根のテント・小屋掛け）
    b.shelter = 'tent'; b.plan.w *= 0.85; if (b.plan.d) b.plan.d *= 0.85; b.wallH = role === 'dwelling' ? 0.45 : 0.8; b.wall.mat = b.wall.mat === 'timber' && b.role === 'dwelling' && spec.trad.roofMat === 'shingle' ? 'timber' : 'reed';
    if (b.plan.kind === 'rect') { b.roof.kind = 'gable'; b.plan.d = Math.max(b.plan.d, b.plan.w * 1.3); } else b.roof.kind = 'cone';
    b.roof.mat = b.roof.mat === 'mud' || b.roof.mat === 'slab' ? 'thatch' : b.roof.mat; b.roof.pitch = 58; b.roof.h = Math.tan(58 * Math.PI / 180) * (b.roof.kind === 'gable' ? b.plan.w : Math.min(b.plan.w, b.plan.d || b.plan.w)) / 2; b.roof.overhang = 0.15;
    b.windows = 0; b.ornament = 0; b.trim = false; b.stilts = role === 'storehouse' ? 1 : 0; b.sunken = 0;
  }
  const o0 = opts || {};
  if (!place(layout, spec, b, Object.assign({ anchor }, o0)) && !place(layout, spec, b, { anchor: layout.center, grow: !!o0.grow, radius: (o0.radius || 10) * 1.8 + 10, spread: (o0.spread || 18) * 2 + 20, prefDist: layout.plaza.r + 30 }) && !place(layout, spec, b, { anchor: layout.center, radius: extentOf(layout) * 1.2, spread: extentOf(layout) * 1.5, prefDist: extentOf(layout) * 1.5 })) return null;   // 置けなければ、範囲を広げてもう一度
  layout.items.push(b); if (role === 'dwelling') layout.byHouse[house] = b.id; return b;
}
// ---- 集落全体の配置
// spec：{ seed, gid, trad, hist, level, households:[{house, members, kin}], economy:{fish,gather,hunt,tool,farm,herd,trade}, terr:{height,slope,water,nearestWater,wet}, day }
function layoutSettlement(spec) {
  const { seed, gid, hist, level, households, economy, terr } = spec, layout = newLayout(gid); layout.history = hist; const day0 = spec.day || 0; layout.day0 = day0;
  const nH = households.length;
  // 中心：平らで乾いた場所（焚き火と広場）。最初の候補の近くで探す
  // 水辺の村は、水から20〜40mの乾いた平地を好む（水が近すぎる・遠すぎるのを避ける）
  let bc = { x: 0, z: 0 }, bs = 1e9; for (let k = 0; k < 30; k++) { const a = rnd(seed, gid, 50 + k) * 6.283, r = k === 0 ? 0 : 4 + rnd(seed, gid, 90 + k) * 22, x = Math.cos(a) * r, z = Math.sin(a) * r, nw0 = terr.nearestWater(x, z), s = terr.slope(x, z) + (terr.water(x, z) > 0.1 ? 60 : 0) + r * 0.15 + (nw0 ? Math.min(30, Math.abs(nw0.dist - 30) * 0.3) : 0); if (s < bs) { bs = s; bc = { x, z }; } }
  layout.center = bc; layout.nTarget = nH;
  // 中心は「必ず円形の広場」ではない：野営地・半定住は焚き火だけ。村でも、広場を持つのは一部（広場のある村は、集会所が広場の縁に立つ）
  const openPlaza = level === 2 && rnd(seed, gid, 60) < 0.45;
  layout.plaza.kind = openPlaza ? 'open' : 'hearth'; layout.plaza.r = openPlaza ? 4 + 0.45 * Math.sqrt(nH) : level === 0 ? 2.2 : 2.6 + 0.18 * Math.sqrt(nH);
  // この集落が伸びやすい向き：どれだけ偏るか（0＝丸く、1＝帯状）は集落ごとに違う。川や海のある所では、水辺の引力のほうが強い
  layout.axis = { a: rnd(seed, gid, 61) * Math.PI, k: Math.max(0, rnd(seed, gid, 62) * 1.3 - 0.25) };
  const ageOf = (k) => Math.round(rnd(seed, gid, 700 + k) * Math.min(hist.age, hist.rebuildCycle * 1.3));
  // 村の集会所（中心の広場の縁）
  if (level === 2) { const hb = addBuilding(layout, spec, 'hall', -1, 8, layout.center, { radius: layout.plaza.r + 4, spread: 5, prefDist: layout.plaza.r + 5 }, Math.min(hist.age, ageOf(-1))); if (hb) hb.hallKey = true; }
  // 住居：世帯ごと。親族（kin）の近くに置く。親が先に建つように、世帯IDの順（古い世帯が先）
  const order = households.slice().sort((a, b) => a.house - b.house), kinAnchor = new Map();
  for (const h of order) {
    const anc = h.kin !== undefined && kinAnchor.has(h.kin) ? kinAnchor.get(h.kin) : null;
    const b = addBuilding(layout, spec, 'dwelling', h.house, h.members, anc || layout.center, anc ? { radius: 8, spread: 14, prefDist: 0 } : { grow: true }, ageOf(h.house));
    if (b) { if (h.kin !== undefined && !kinAnchor.has(h.kin)) kinAnchor.set(h.kin, { x: b.x, z: b.z }); b.cluster = h.kin; }
  }
  // 倉庫：世帯の数と暮らし（採集・保存）に応じて
  const nStore = level === 0 ? Math.round(nH * 0.05) : Math.ceil(nH * (0.12 + 0.07 * level + 0.15 * (economy.gather || 0)));
  for (let k = 0; k < nStore; k++) { const hh = order[Math.floor(rnd(seed, gid, 400 + k) * nH)], a = hh && layout.byHouse[hh.house] ? layout.items.find(i => i.id === layout.byHouse[hh.house]) : null; addBuilding(layout, spec, 'storehouse', 1e6 + k, 2, a ? { x: a.x, z: a.z } : layout.center, { radius: 7, spread: 9, prefDist: layout.plaza.r + 8 }, ageOf(900 + k)); }
  // 干し場：漁が盛んなら、水辺に
  const nRack = Math.ceil((economy.fish || 0) * nH * 0.14); for (let k = 0; k < nRack; k++) { const cen = centroidOf(layout), w = terr.nearestWater(cen.x, cen.z); addBuilding(layout, spec, 'rack', 2e6 + k, 1, w && w.dist < 150 ? { x: cen.x + w.dx * Math.max(0, w.dist - 6), z: cen.z + w.dz * Math.max(0, w.dist - 6) } : cen, { radius: 2, spread: 10, prefDist: Math.max(0, (w ? w.dist : 20) - 6) }, ageOf(950 + k)); }
  // 作業場：道具づくりの人が多ければ、集落の外れに
  const nWork = Math.min(4, Math.ceil((economy.tool || 0) * nH * 0.25)) + (level >= 1 && nH > 20 ? 1 : 0); for (let k = 0; k < nWork; k++) addBuilding(layout, spec, 'workshop', 3e6 + k, 2, layout.center, { radius: extentOf(layout) * 0.7, spread: 14, prefDist: extentOf(layout) }, ageOf(980 + k));
  // 衰退した集落：住む人のいない廃屋（外れ）。成立の古さと衰退の度合いに応じて
  if (hist.status === 'declining') { const nRuin = Math.max(1, Math.round(nH * 0.35)); for (let k = 0; k < nRuin; k++) { const b = addBuilding(layout, spec, 'dwelling', 4e6 + k, 3, layout.center, { radius: extentOf(layout) * 0.7, spread: 16, prefDist: extentOf(layout) }, 40 + ageOf(1000 + k)); if (b) { b.state = rnd(seed, gid, 1100 + k) < 0.5 ? 'ruin' : 'vacant'; delete layout.byHouse[4e6 + k]; } } }
  // 畑・家畜小屋：農耕・牧畜がある集団のときだけ（まだ実装されていない生業。接続口）
  if (economy.farm) layoutFields(layout, spec, nH);
  // 道
  buildPaths(layout, spec);
  // 防衛設備（柵）
  if (hist.defense > 0) buildFence(layout, spec);
  // 履歴：成立の記録と、開始前から建っていた建物の記録（推定）
  logEv(layout, day0, 'found', null, { level, households: nH, synthetic: true, note: 'この記録の開始時点の集落（開始前の歴史は推定）' });
  for (const b of layout.items) if (!b.rec) mkRec(b, b.builtDay !== undefined ? b.builtDay : Math.round(b.builtYear * YEAR), 'initial', b.state === 'ok' && b.house >= 0 && b.house < 1e6 ? b.house : null, true);
  { const env = envOf(spec); for (const b of layout.items) initLife(b, spec, env, b.age || 0, day0); layout.stock = stockInit(nH); layout.proj = []; layout.t = day0; layout.life = 1; }
  layout.resolved = true; return layout;
}
function centroidOf(layout) { const d = layout.items.filter(i => i.role === 'dwelling' && i.state !== 'removed'); if (!d.length) return { x: layout.center.x, z: layout.center.z }; return { x: d.reduce((a, b) => a + b.x, 0) / d.length, z: d.reduce((a, b) => a + b.z, 0) / d.length }; }
// 畑の広がりが変わったとき：建物は動かさず、畑だけ作り直す
function refreshFields(layout, spec, nH, day) { layout.fields = []; if (spec.economy && spec.economy.farm) layoutFields(layout, spec, nH); layout.fieldLv = spec.economy && spec.economy.farmLv != null ? spec.economy.farmLv : null; logEv(layout, day || 0, 'fields', null, { n: layout.fields.length }); }
function layoutFields(layout, spec, nH) {   // 畑：水に近い平らな所に、家の外側。農耕の仕組みが入ったときに使う
  const { terr, seed, gid } = spec, lv = spec.economy && spec.economy.farmLv != null ? spec.economy.farmLv : 3, n = Math.max(1, Math.ceil(nH * 0.5 * lv / 4)); const dws = layout.items.filter(i => i.role === 'dwelling');
  for (let k = 0; k < n * 6 && layout.fields.length < n; k++) {
    const a = rnd(seed, gid, 1500 + k) * 6.283, r = layout.plaza.r + 30 + rnd(seed, gid, 1600 + k) * 60, x = layout.center.x + Math.cos(a) * r, z = layout.center.z + Math.sin(a) * r, w = 14 + rnd(seed, gid, 1700 + k) * 10, d = 10 + rnd(seed, gid, 1800 + k) * 8, rot = a;
    if (terr.slope(x, z) > 9 || terr.water(x, z) > 0.1) continue;
    const f = { x, z, rot, hw: w / 2, hd: d / 2, round: false }; if (dws.some(b => overlaps(shapeOf(b), f, 2)) || layout.fields.some(o => overlaps(o, f, 1.5)) || layout.items.some(b => overlaps(shapeOf(b), f, 2))) continue;
    layout.fields.push(f);
  }
}
// 道：中心の火と各家の入口を、近い所から順に、すでにつながった所へつなぐ（建物にぶつかるときは迂回の点を足す）。
// 道の太さは「その道を通る家の数」で決まる（踏まれ具合）。水場への道は、水に一番近い道の端から水辺へ（中心から放射状には出さない）
function buildPaths(layout, spec) {
  const { terr } = spec, nodes = [{ x: layout.center.x, z: layout.center.z, id: 'plaza', par: -1 }], paths = [], solid = layout.items.filter(i => i.state !== 'removed').map(i => ({ s: shapeOf(i), id: i.id }));
  const hits = (x1, z1, x2, z2, skipA, skipB) => { for (const o of solid) { if (o.id === skipA || o.id === skipB) continue; for (let t = 0.15; t < 0.9; t += 0.15) { const px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t; if (overlaps({ x: px, z: pz, rot: 0, hw: 0.4, hd: 0.4, round: true }, o.s, 0)) return o; } } return null; };
  const doors = layout.items.filter(i => i.entrance && i.state !== 'removed' && i.state !== 'ruin').sort((a, b) => Math.hypot(a.entrance.x - layout.center.x, a.entrance.z - layout.center.z) - Math.hypot(b.entrance.x - layout.center.x, b.entrance.z - layout.center.z));
  for (const b of doors) {
    let bn = 0, bd = 1e9; for (let i = 0; i < nodes.length; i++) { const n = nodes[i], d = Math.hypot(n.x - b.entrance.x, n.z - b.entrance.z); if (d < bd) { bd = d; bn = i; } }
    let from = nodes[bn], fromIdx = bn, to = { x: b.entrance.x, z: b.entrance.z };
    const blk = hits(from.x, from.z, to.x, to.z, b.id, null);
    if (blk) { const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l, sgn = rnd(spec.seed, b.id, 55) < 0.5 ? 1 : -1, hs = blk.s, off = Math.max(hs.hw, hs.hd) + 1.6; const wp = { x: hs.x + px * off * sgn, z: hs.z + pz * off * sgn }; nodes.push({ x: wp.x, z: wp.z, id: 'wp' + b.id, par: fromIdx }); paths.push({ x1: from.x, z1: from.z, x2: wp.x, z2: wp.z, w: 0.9, use: 1, node: nodes.length - 1 }); from = nodes[nodes.length - 1]; fromIdx = nodes.length - 1; }
    nodes.push({ x: to.x, z: to.z, id: b.id, par: fromIdx, door: 1 }); paths.push({ x1: from.x, z1: from.z, x2: to.x, z2: to.z, w: 0.9, use: 1, node: nodes.length - 1 });
  }
  // 踏まれ具合：その先につながる家の数（木の下流から足し上げる）
  const cnt = new Array(nodes.length).fill(0); for (let i = nodes.length - 1; i > 0; i--) { cnt[i] += nodes[i].door ? 1 : 0; if (nodes[i].par >= 0) cnt[nodes[i].par] += cnt[i]; }
  for (const p of paths) { p.use = Math.max(1, cnt[p.node]); p.w = Math.min(2.2, 0.8 + 0.22 * Math.sqrt(p.use)); }
  // 水場への道：水に一番近い道の点から、水辺まで
  let wb = null, wd = 1e9; for (const n of nodes) { const w = terr.nearestWater(n.x, n.z); if (w && w.dist < wd) { wd = w.dist; wb = { n, w }; } }
  if (wb && wd < 120) { const wx = wb.n.x + wb.w.dx * wb.w.dist, wz = wb.n.z + wb.w.dz * wb.w.dist; if (wd > 1) paths.push({ x1: wb.n.x, z1: wb.n.z, x2: wx, z2: wz, w: 1.4, use: 3 }); layout.waterAccess = { x: wx, z: wz }; }
  layout.paths = paths; layout.nodes = nodes.length;
}
// 柵：集落の外側を囲む。道と水場の方向は開けておく
function buildFence(layout, spec) {
  const { terr, hist } = spec, live = layout.items.filter(i => i.state !== 'removed'); if (!live.length) return;
  let R = 0; for (const b of live) R = Math.max(R, Math.hypot(b.x - layout.center.x, b.z - layout.center.z) + Math.hypot(b.plan.w, b.plan.d || b.plan.w) / 2); R += 7; layout.fenceR = R;
  const n = Math.max(24, Math.round(2 * Math.PI * R / 1.6)), gates = [];
  for (const p of layout.paths) { const d = Math.hypot(p.x2 - layout.center.x, p.z2 - layout.center.z); if (d > R * 0.7) gates.push(Math.atan2(p.z2 - layout.center.z, p.x2 - layout.center.x)); }
  if (layout.waterAccess) gates.push(Math.atan2(layout.waterAccess.z - layout.center.z, layout.waterAccess.x - layout.center.x));
  if (!gates.length) gates.push(0);
  const post = [], da = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = layout.center.x + Math.cos(a) * R, z = layout.center.z + Math.sin(a) * R; if (gates.some(g => da(a, g) < 0.09)) continue; if (terr.water(x, z) > 0.2 || terr.slope(x, z) > 35) continue; post.push({ x, z, h: 1.8 + hist.defense * 0.5 }); }
  layout.fence = post;
}
// ======== 建物の寿命・手入れ・住居の需要と工事（第2〜4段）========
// 部位（基礎・骨組み・壁・屋根・床・開口部）ごとの健全度 cond[0..5]（1＝新品、0＝崩壊）。固定の寿命はなく、素材×品質×環境×手入れで変わる。月単位でまとめて計算する。
const PBASE = [0.8, 0.7, 1, 0.75, 0.9, 1.2], GRADE_JP = ['良好', '軽度の傷み', '中度の傷み', '重度の傷み', '崩壊'];
const grade = (h) => h > 0.8 ? 0 : h > 0.6 ? 1 : h > 0.4 ? 2 : h > 0.2 ? 3 : 4;
const total = (c) => 0.6 * Math.min(c[0], c[1]) + 0.4 * (c[2] + c[3] + c[4] + c[5]) / 4, safety = (c) => Math.min(c[0], c[1]);
const r3 = (x) => Math.round(x * 1000) / 1000;
function envOf(spec) { const e = (spec.trad && spec.trad.src && spec.trad.src.env) || { tempC: 12, precip: 1000, wood: 0.5, stone: 0.3, clay: 0.3, grass: 0.4, forest: 0.3, wetland: 0.1 }; return Mat.withAnimal(e, spec.economy); }
// 部位iの年あたりの劣化（手入れなし）：素材の傾向 × 気候（湿り・雨・凍結）× 品質（粗い1.3・標準1・精密0.75）
function yearRate(b, i, env) {
  const m = Mat.MATERIALS[b.pm[i]]; if (!m) return 0.03; const humid = Math.max(0, Math.min(1, (env.precip || 1000) / 1500)), warm = Math.max(0, Math.min(1, ((env.tempC === undefined ? 12 : env.tempC) - 3) / 20)), rain = Math.max(0, Math.min(1, (env.precip || 1000) / 1200)), frost = Math.max(0, Math.min(1, (2 - (env.tempC === undefined ? 12 : env.tempC)) / 12));
  return m.yr * (0.55 + m.rot * humid * warm * 1.4 + m.wet * (rain * 0.9 + frost * 0.5)) * [1.3, 1, 0.75][b.q === undefined ? 1 : b.q] * PBASE[i];
}
// 建物に素材・品質・状態をつける。ageYears：築年数（開始前の建物は、作った時点までの履歴から推定）。state：ok／vacant／ruin
function initLife(b, spec, env, ageYears, day0) {
  const know = spec.trad && spec.trad.know, tech = spec.trad ? spec.trad.tech : 0.4, u = (k) => rnd(spec.seed, b.id, 900 + k);
  b.pm = Mat.partsOf(b, env, know); b.q = Mat.qualityOf(tech, know, u(0)); const c = [], last = {};
  for (let i = 0; i < 6; i++) { const r = Math.max(0.0015, yearRate(b, i, env)); let h;
    if (b.state === 'ok') { const T = (1 - 0.42) / r * (0.85 + u(1 + i) * 0.5), structural = i < 2, since = structural ? ageYears : ageYears % T; h = 1 - r * since; if (!structural && ageYears >= T) last[i] = day0 - Math.round(since * YEAR); if (structural) h = Math.max(h, 0.3 + u(10 + i) * 0.2); }
    else if (b.state === 'vacant') h = 1 - r * ageYears * 1.15; else h = 0.08 + u(20 + i) * 0.22;   // 空き家：手入れが途絶えて傷む／廃屋：かなり傷んでいる
    c.push(r3(Math.max(0.05, Math.min(0.99, h)))); }
  if (b.state === 'ruin') c[1] = Math.min(c[1], 0.15); b.cond = c;
  if (b.rec) for (const i of Object.keys(last).slice(0, 3)) b.rec.edits.push({ day: last[i], type: 'replace', part: Mat.PARTS[i], synthetic: true });   // 開始前の修繕（推定）
}
// 旧い保存・古い建物にも素材・状態をつける（位置・形は変えない）
function ensureLife(layout, spec, day) {
  if (layout.life) return; const env = envOf(spec);
  for (const b of layout.items) { if (b.pm) continue; if (b.state === 'removed') continue; initLife(b, spec, env, Math.max(0, (day - (b.builtDay !== undefined ? b.builtDay : (b.builtYear || 0) * YEAR)) / YEAR), day); }
  const nH = Math.max(1, (spec.households || []).length); layout.stock = layout.stock || stockInit(nH); layout.proj = layout.proj || []; layout.t = layout.t === undefined ? day : layout.t; layout.life = 1;
}
const stockCap = (nH) => 120 + 14 * nH;
function stockInit(nH) { const o = {}; for (const f of Mat.FAMILIES) o[f] = Math.round(stockCap(nH) * 0.3); o.metal = 0; return o; }
const afford = (stock, cost) => Object.keys(cost).every(f => (stock[f] || 0) >= cost[f]), spend = (stock, cost, k) => { for (const f of Object.keys(cost)) stock[f] = Math.max(0, r3((stock[f] || 0) - cost[f] * (k === undefined ? 1 : k))); };
const edit = (b, e) => { if (!b.rec) return; b.rec.edits.push(e); if (b.rec.edits.length > 12) b.rec.edits.splice(0, b.rec.edits.length - 12); };
// 月の生産：働ける人手 × 資源の豊かさ（暮らし・知識で変わる）。蓄えには上限がある
function produce(layout, spec, households) {
  const env = envOf(spec), pop = households.reduce((a, h) => a + (h.members || 0), 0), workers = pop * 0.3, nH = Math.max(1, households.length), know = spec.trad && spec.trad.know, st = layout.stock, cap = stockCap(nH);
  const rich = { wood: env.wood + (env.forest || 0) * 0.3, stone: env.stone, earth: Math.max(0.25, env.clay || 0), plant: Math.max(env.grass || 0, env.wetland || 0, 0.15) + (env.forest || 0) * 0.1, animal: env.animal, metal: (!know || know.plank !== undefined) && (env.stone || 0) > 0.2 ? 0.08 : 0 };
  for (const f of Mat.FAMILIES) st[f] = Math.min(cap, r3((st[f] || 0) + workers * Math.min(1, rich[f]) * 0.12));
}
// 月の劣化と手入れ。屋根が傷むと雨漏りで床・骨組み・壁の傷みが速くなる（連鎖）
function decayAndMaintain(layout, spec, day, tick) {
  const env = envOf(spec), st = layout.stock;
  for (const b of layout.items) {
    if (b.state === 'removed' || b.state === 'building' || !b.cond) continue; const c = b.cond, leak = 1 + 3 * Math.max(0, 0.5 - c[3]);
    for (let i = 0; i < 6; i++) { const r = yearRate(b, i, env) / 12 * (i === 3 || i === 5 ? 1 : leak) * (b.state === 'ruin' ? 1.6 : 1); c[i] = r3(Math.max(0, c[i] - r)); }
    if (b.state === 'ok' && b.house >= 0 && (b.hh ? b.hh.length : 1) > 0) {   // 住んでいる家は、手入れされる（屋根・壁・床・開口部を先に。骨組みと基礎は大きく傷んだときだけ）
      const attention = 0.5 + 0.3 * (spec.trad ? spec.trad.tech : 0.4) + 0.15 * (rnd(spec.seed, b.id, 950 + (tick % 97)) - 0.5);
      if (rnd(spec.seed, b.id, 960 + tick) < attention) { let worst = -1, wh = 1; for (const i of [3, 2, 4, 5, 1, 0]) { const th = i === 3 ? 0.5 : i < 2 ? 0.35 : 0.42; if (c[i] < th && c[i] < wh) { wh = c[i]; worst = i; } }
        if (worst >= 0) { const full = Mat.costOf(b, b.pm), fam = Mat.MATERIALS[b.pm[worst]].fam, units = (full[fam] || 1) * (c[worst] < 0.25 ? 0.5 : 0.2) / (Mat.PARTS.length / 3), cost = { [fam]: Math.max(0.5, units) };
          if (afford(st, cost)) { const rep = c[worst] < 0.25; spend(st, cost); c[worst] = r3(Math.min(0.97, rep ? 0.95 : c[worst] + 0.5)); edit(b, { day, type: rep ? 'replace' : 'repair', part: Mat.PARTS[worst] }); if (rep) logEv(layout, day, 'replace', b, { part: Mat.PARTS[worst] }); } } }
    }
    // 状態の移り変わり：骨組み・基礎が傷みすぎたら使えなくなり（廃屋）、さらに進むと崩れる。屋根だけの傷みで建物は消えない
    if ((b.state === 'ok' || b.state === 'vacant') && safety(c) < 0.18) { const prev = b.state; b.state = 'ruin'; if (prev === 'ok') releaseResidents(layout, b); logEv(layout, day, 'ruin', b, { why: 'decay' }); }
    else if (b.state === 'ruin' && safety(c) < 0.04) collapse(layout, b, day);
  }
}
function releaseResidents(layout, b) { for (const h of (b.hh || [b.house])) if (layout.byHouse[h] === b.id) delete layout.byHouse[h]; b.hh = []; }
function collapse(layout, b, day) {   // 崩れた建物：重い部品を捨て、位置・用途・履歴だけ残す（保存容量の節約）
  b.state = 'removed'; layout.pathsDirty = true; releaseResidents(layout, b); logEv(layout, day, 'collapse', b);
  for (const k of ['roof', 'wall', 'door', 'windows', 'ornament', 'trim', 'trimHue', 'ground', 'found', 'entrance', 'cond', 'pm', 'tint', 'wallH']) delete b[k];
}
const capOf = (b) => { const a = b.plan.kind === 'round' ? Math.PI * b.plan.w * b.plan.w / 4 : b.plan.w * b.plan.d; return Math.max(2, Math.round(a / 4.2)); };
const membersOf = (layout, b, byHouse) => (b.hh || [b.house]).reduce((a, h) => a + ((byHouse && byHouse.get(h)) || 0), 0);
// 設計だけ先に作って、必要量を見積もる（同じ key・世帯の大きさなら、建てるときも同じ設計）
function previewCost(layout, spec, role, members) { const key = spec.gid * 100003 + layout.nextSeq, b = Arch.designBuilding(spec.seed, spec.trad, role, key, members, 0); b.found = { kind: spec.trad && spec.trad.stilts > 0.5 ? 'stilts' : 'shallow' }; return Mat.costOf(b, Mat.partsOf(b, envOf(spec), spec.trad && spec.trad.know)); }
function tentify(b, spec) {   // 仮小屋：材料が足りないとき、家族が先に建てる簡素な住まい（天幕・小屋掛け）
  b.shelter = 'tent'; b.plan.w *= 0.85; if (b.plan.d) b.plan.d *= 0.85; b.wallH = 0.5; if (b.plan.kind === 'rect') { b.roof.kind = 'gable'; b.plan.d = Math.max(b.plan.d, b.plan.w * 1.3); } else b.roof.kind = 'cone';
  b.roof.pitch = 58; b.roof.h = Math.tan(58 * Math.PI / 180) * (b.roof.kind === 'gable' ? b.plan.w : Math.min(b.plan.w, b.plan.d || b.plan.w)) / 2; b.roof.overhang = 0.15; b.windows = 0; b.ornament = 0; b.trim = false;
}
function addProject(layout, p) { p.id = layout.projSeq = (layout.projSeq || 0) + 1; layout.proj.push(p); return p; }
// 住居の需要：家のない世帯は、空き家・同居・増築・新築・仮小屋を比べて選ぶ。材料が足りなければ工事は待ち（中断）になる
function demand(layout, spec, households, day, tick) {
  const byHouse = new Map(households.map(h => [h.house, h.members])), items = layout.items, live = items.filter(b => b.role === 'dwelling' && b.state !== 'removed');
  const housed = (h) => { const id = layout.byHouse[h.house], b = id && items.find(i => i.id === id); return !!b && (b.state === 'ok' || b.state === 'vacant' || b.state === 'building'); };
  const inProj = new Set(layout.proj.filter(p => p.house !== undefined && p.state === 'active').map(p => p.house));   // 待ち（材料不足）の世帯は、毎月もう一度判断する
  let started = 0, labor = Math.max(0.5, Math.min(2, Math.sqrt(households.reduce((a, h) => a + h.members, 0) / 40)));
  for (const h of households) {
    if (housed(h) || inProj.has(h.house) || started >= 3) continue;
    const kinB = h.kin !== undefined ? live.filter(b => b.cluster === h.kin && b.state === 'ok') : [], refB = kinB[0] || null, ref = refB || layout.center, noise = (k) => (rnd(spec.seed, h.house, 970 + k + tick) - 0.5) * 0.3, longH = spec.trad && spec.trad.longhouse ? 0.1 : 0;
    const opts = [];
    for (const b of live) if (b.state === 'vacant' && b.cond && total(b.cond) > 0.4) opts.push({ k: 'reuse', b, cost: 0.15 + Math.hypot(b.x - ref.x, b.z - ref.z) / 250 - (b.cluster === h.kin ? 0.1 : 0) + noise(1) });
    for (const b of kinB) { const m = membersOf(layout, b, byHouse), after = (m + h.members) / capOf(b); if (after <= 1.05) opts.push({ k: 'cohabit', b, cost: 0.22 + after * 0.15 - longH + noise(2) }); else if (after <= 1.7) opts.push({ k: 'extend', b, cost: 0.42 + after * 0.1 + noise(3) }); }
    opts.push({ k: 'new', cost: 0.62 + noise(4) }); const stalled = layout.proj.find(p => p.house === h.house && p.state === 'stalled');
    const need = previewCost(layout, spec, 'dwelling', h.members); const can = afford(layout.stock, need);
    opts.sort((a, b) => a.cost - b.cost); let pick = opts.find(o => o.k !== 'new' && o.k !== 'extend') && opts[0].k !== 'new' && opts[0].k !== 'extend' ? opts[0] : opts[0];
    if (pick.k === 'new' && !can) { const cohab = opts.find(o => o.k === 'cohabit'); const stall = stalled ? (day - stalled.since) / 30 : 0;
      if (stall >= 18) { pick = { k: 'shelter' }; } else { if (!stalled) { addProject(layout, { kind: 'new', house: h.house, state: 'stalled', since: day, need, why: 'shortage' }); logEv(layout, day, 'stall', null, { house: h.house, by: h.house, why: Object.keys(need).filter(f => (layout.stock[f] || 0) < need[f]).join('・') }); } continue; } }
    if (pick.k === 'extend') { const ext = Math.round(capOf(pick.b) * 0.5 * 4.2); const cost = Mat.costOf({ plan: { kind: 'rect', w: pick.b.plan.w, d: Math.max(2, ext / Math.max(2, pick.b.plan.w)) }, wallH: pick.b.wallH, roof: pick.b.roof }, pick.b.pm); if (!afford(layout.stock, cost)) { pick = { k: 'new', cost: 1 }; if (!can) continue; } else { spend(layout.stock, cost); addProject(layout, { kind: 'extend', bid: pick.b.id, house: h.house, left: Math.max(1, Math.round(3 / labor)), state: 'active', since: day, cost }); logEv(layout, day, 'project', pick.b, { kind: 'extend', by: h.house }); started++; inProj.add(h.house); continue; } }
    if (pick.k === 'reuse') { const b = pick.b, prev = b.house; b.hh = [h.house]; b.house = h.house; b.cluster = h.kin; b.state = 'ok'; b.vacantSince = null; b.members = h.members; layout.byHouse[h.house] = b.id; logEv(layout, day, 'reoccupy', b, { by: h.house, prev }); edit(b, { day, type: 'reoccupy', by: h.house }); started++; continue; }
    if (pick.k === 'cohabit') { const b = pick.b; b.hh = (b.hh || [b.house]).concat([h.house]); layout.byHouse[h.house] = b.id; b.members = (b.members || 0) + h.members; logEv(layout, day, 'cohabit', b, { by: h.house }); edit(b, { day, type: 'cohabit', by: h.house }); started++; continue; }
    // 新築・仮小屋：場所を決めて建て始める（建設中の建物として置く）
    const shelter = pick.k === 'shelter', cost = shelter ? { plant: 4, animal: (layout.stock.animal || 0) >= 2 ? 2 : 0, wood: 3 } : need; if (shelter && !afford(layout.stock, cost)) { for (const f of Object.keys(cost)) if ((layout.stock[f] || 0) < cost[f]) delete cost[f]; }
    const nb = addBuilding(layout, spec, 'dwelling', h.house, h.members, refB ? { x: refB.x, z: refB.z } : layout.center, refB ? { radius: 8, spread: 14, prefDist: 0 } : { grow: true }, 0); if (!nb) continue;
    if (shelter) tentify(nb, spec); spend(layout.stock, cost); nb.state = 'building'; nb.cluster = h.kin; nb.hh = []; delete layout.byHouse[h.house]; mkRec(nb, day, shelter ? 'shelter' : 'demand', h.house, false);
    const area = nb.plan.kind === 'round' ? Math.PI * nb.plan.w * nb.plan.w / 4 : nb.plan.w * nb.plan.d;
    addProject(layout, { kind: shelter ? 'shelter' : 'new', bid: nb.id, house: h.house, left: shelter ? 1 : Math.max(3, Math.round((3 + area / 4) / labor)), state: 'active', since: day, cost }); logEv(layout, day, 'project', nb, { kind: shelter ? 'shelter' : 'new', by: h.house });
    layout.pathsDirty = true; if (stalled) stalled.state = 'done'; started++; inProj.add(h.house);
  }
  // 過密の解消：定員を大きく超えた家は、増築を考える
  for (const b of live) { if (b.state !== 'ok' || started >= 3 || layout.proj.some(p => p.bid === b.id && p.state !== 'done')) continue; const m = membersOf(layout, b, byHouse) || b.members || 0; if (m / capOf(b) > 1.3 && rnd(spec.seed, b.id, 980 + tick) < 0.12) { const ext = Math.round(capOf(b) * 0.4 * 4.2), cost = Mat.costOf({ plan: { kind: 'rect', w: b.plan.w, d: Math.max(2, ext / Math.max(2, b.plan.w)) }, wallH: b.wallH, roof: b.roof }, b.pm); if (afford(layout.stock, cost)) { spend(layout.stock, cost); addProject(layout, { kind: 'extend', bid: b.id, house: b.house, left: Math.max(1, Math.round(3 / labor)), state: 'active', since: day, cost, why: 'crowd' }); logEv(layout, day, 'project', b, { kind: 'extend', by: b.house, why: 'crowd' }); started++; } } }
}
// 工事の進行：完成（新築・仮小屋・増築）。増築は隣の建物・水・急斜面を避けられなければ失敗（家は変わらない）
function progress(layout, spec, households, day) {
  const { terr } = spec;
  for (const p of layout.proj) {
    if (p.state === 'stalled') { const need = p.need; if (!need || !afford(layout.stock, need)) continue; p.state = 'done'; continue; }   // 材料が貯まったら、次の月の判断でもう一度（需要側が新築を始める）
    if (p.state !== 'active') continue; if (--p.left > 0) continue; p.state = 'done'; const b = layout.items.find(i => i.id === p.bid); if (!b || b.state === 'removed') continue;
    if (p.kind === 'extend') {
      const add = Math.max(2, Math.round(capOf(b) * 0.4 * 4.2) / Math.max(2, b.plan.w)), old = { x: b.x, z: b.z, d: b.plan.d, w: b.plan.w }; let done = false;
      if (b.plan.kind === 'rect') { for (const side of [1, -1]) { b.plan.d = old.d + add; b.x = old.x - Math.sin(b.rot) * add / 2 * side; b.z = old.z - Math.cos(b.rot) * add / 2 * side; const sh = shapeOf(b); if (!layout.items.some(o => o !== b && o.state !== 'removed' && overlaps(sh, shapeOf(o), 1.2)) && terr.water(b.x, b.z) < 0.25 && terr.slope(b.x, b.z) < (MAX_SLOPE.dwelling + 4)) { done = true; break; } b.plan.d = old.d; b.x = old.x; b.z = old.z; } }
      else { b.plan.w = old.w * 1.18; const sh = shapeOf(b); if (!layout.items.some(o => o !== b && o.state !== 'removed' && overlaps(sh, shapeOf(o), 1.0))) done = true; else b.plan.w = old.w; }
      if (done) { const half = (b.plan.kind === 'rect' ? b.plan.d : b.plan.w) / 2, sn = Math.sin(b.rot), cs = Math.cos(b.rot); b.entrance = { x: b.x + sn * (half + 0.35), z: b.z + cs * (half + 0.35), dx: sn, dz: cs }; b.ground = groundOf(terr, b); for (const i of [2, 3, 4]) if (b.cond) b.cond[i] = r3(Math.min(0.97, (b.cond[i] + 0.95) / 2)); b.extended = (b.extended || 0) + 1; layout.pathsDirty = true; edit(b, { day, type: 'extend', by: p.house }); logEv(layout, day, 'extend', b, { by: p.house, why: p.why }); b.members = Math.max(b.members || 0, 1); }
      else logEv(layout, day, 'extend-failed', b, { by: p.house });
    } else {   // 新築・仮小屋の完成：入居する
      b.state = 'ok'; b.builtYear = Math.floor(day / YEAR); const hh = households.find(h => h.house === p.house);
      if (hh) { b.hh = [hh.house]; b.house = hh.house; b.members = hh.members; layout.byHouse[hh.house] = b.id; }
      else { b.state = 'vacant'; b.vacantSince = day; }
      initLife(Object.assign(b, { state: 'ok' }), spec, envOf(spec), 0, day); if (!hh) b.state = 'vacant'; b.rec.builtDay = p.since; logEv(layout, day, 'build', b, { by: p.house, why: p.kind === 'shelter' ? 'shelter' : 'demand' });
    }
  }
  layout.proj = layout.proj.filter(p => p.state !== 'done' || day - (p.since || 0) < 30);
  if (layout.proj.length > 60) layout.proj.splice(0, layout.proj.length - 60);
}
// 月の進行（遅れて見に来たときも、経過した月だけまとめて進める。世帯は今の状態で近似する。上限20年）
function advance(layout, spec, households, day) {
  ensureLife(layout, spec, day); let months = Math.floor((day - layout.t) / 30); if (months <= 0) return 0; months = Math.min(240, months); let t = layout.t;
  for (let m = 0; m < months; m++) { t += 30; const tick = Math.floor(t / 30); produce(layout, spec, households); decayAndMaintain(layout, spec, t, tick); demand(layout, spec, households, t, tick); progress(layout, spec, households, t); }
  layout.t += months * 30; if (months === 240) layout.t = day; return months;
}
// 世帯の変化に合わせて更新する：いなくなった世帯の家は空き家になり（その後は傷み方しだいで廃屋→崩壊。固定年数では消さない）、新しい世帯は需要の仕組みで住まいを得る。day は暦の日数
function syncLayout(layout, spec, households, day) {
  const cur = new Set(households.map(h => h.house)), out = { added: 0, vacated: 0, ruined: 0, removed: 0, reoccupied: 0, started: 0 }; ensureLife(layout, spec, day);
  for (const b of layout.items) {   // 住人がいなくなった家
    if (b.role !== 'dwelling' || b.house < 0 || b.house >= 4e6 || b.state === 'removed' || b.state === 'building' || b.state === 'ruin') continue;
    const hh = b.hh || [b.house], stay = hh.filter(x => cur.has(x)); if (stay.length === hh.length && b.state === 'ok') continue;
    if (stay.length !== hh.length) { for (const x of hh) if (!cur.has(x) && layout.byHouse[x] === b.id) delete layout.byHouse[x]; b.hh = stay; }
    if (stay.length === 0 && b.state === 'ok') { b.vacantSince = day; b.state = 'vacant'; out.vacated++; logEv(layout, day, 'vacate', b); } else if (stay.length && b.vacantSince !== null) { b.state = 'ok'; b.vacantSince = null; }
  }
  for (const h of households) {   // 戻ってきた世帯（空き家に残っていた住まい）
    const id = layout.byHouse[h.house], b = id ? layout.items.find(i => i.id === id) : null;
    if (b && b.state !== 'removed') { if (b.state === 'vacant') { b.state = 'ok'; b.vacantSince = null; out.reoccupied++; logEv(layout, day, 'reoccupy', b, { by: h.house }); } b.members = Math.max(h.members, b.hh && b.hh.length > 1 ? b.members : 0) || h.members; if (!b.hh) b.hh = [h.house]; else if (!b.hh.includes(h.house)) b.hh.push(h.house); }
  }
  const before = layout.items.length, st0 = layout.items.filter(i => i.state === 'ruin').length, rem0 = layout.items.filter(i => i.state === 'removed').length, pj0 = layout.proj.filter(p => p.state === 'active').length;
  advance(layout, spec, households, day);
  out.added = layout.items.length - before; out.ruined = Math.max(0, layout.items.filter(i => i.state === 'ruin').length - st0); out.removed = layout.items.filter(i => i.state === 'removed').length - rem0; out.started = layout.proj.filter(p => p.state === 'active').length - pj0;
  if (out.added || out.removed || layout.pathsDirty) { buildPaths(layout, spec); layout.pathsDirty = false; }
  return out;
}
// ---- NPC による建設・改築・解体の要求（接続口）：{ type:'build'|'renovate'|'demolish', house, day }。build は需要の仕組み（材料・工事期間）に乗る
function requestBuild(layout, type, house, day, by) { layout.queue.push({ type, house, day, by }); }
function applyRequests(layout, spec, households, day) {
  const res = { built: 0, renovated: 0, demolished: 0, queued: 0 }; ensureLife(layout, spec, day);
  for (const q of layout.queue.splice(0)) {
    const id = layout.byHouse[q.house], b = id ? layout.items.find(i => i.id === id) : null, by = q.by !== undefined ? q.by : q.house;
    if (q.type === 'build' && !b) { const h = households.find(x => x.house === q.house); if (h && !layout.proj.some(p => p.house === h.house && p.state !== 'done')) { addProject(layout, { kind: 'new', house: h.house, state: 'stalled', since: day, need: previewCost(layout, spec, 'dwelling', h.members), why: 'request' }); res.queued++; } }
    else if (q.type === 'renovate' && b) { const keep = { cond: b.cond }; const nd = Arch.designBuilding(spec.seed, spec.trad, b.role, b.id, b.members, 0); for (const k of ['plan', 'wallH', 'roof', 'wall', 'door', 'windows', 'ornament', 'tint', 'trim', 'trimHue', 'form', 'porch']) b[k] = nd[k]; b.builtYear = Math.floor(day / YEAR); b.age = 0; initLife(b, spec, envOf(spec), 0, day); edit(b, { day, type: 'renovate', by }); logEv(layout, day, 'renovate', b, { by }); res.renovated++; }
    else if (q.type === 'demolish' && b) { b.state = 'removed'; releaseResidents(layout, b); delete layout.byHouse[q.house]; logEv(layout, day, 'demolish', b, { by }); res.demolished++; }
  }
  if (res.demolished || res.renovated) layout.pathsDirty = true;
  if (layout.pathsDirty) { buildPaths(layout, spec); layout.pathsDirty = false; }
  return res;
}
// ---- 地形のキャッシュ：描画側の地形（重い）を、集落の周りだけ一度に測って、配置が使う軽い関数にする。sample(x,z) → { h: 高さ(m), w: 水深(m) }。R：範囲（m）、step：間隔（m）
function terrainFromSamples(sample, R, step) {
  R = R || 200; step = step || 5; const n = Math.floor(2 * R / step) + 1, H = new Float32Array(n * n), Wt = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const s = sample(-R + i * step, -R + j * step); H[j * n + i] = s.h; Wt[j * n + i] = s.w || 0; }
  const idx = (x, z) => ({ i: Math.max(0, Math.min(n - 1, Math.round((x + R) / step))), j: Math.max(0, Math.min(n - 1, Math.round((z + R) / step))) });
  const bil = (A, x, z) => { const fx = Math.max(0, Math.min(n - 1.001, (x + R) / step)), fz = Math.max(0, Math.min(n - 1.001, (z + R) / step)), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j; return (A[j * n + i] * (1 - tx) + A[j * n + i + 1] * tx) * (1 - tz) + (A[(j + 1) * n + i] * (1 - tx) + A[(j + 1) * n + i + 1] * tx) * tz; };
  // 水に一番近いセルへの向きと距離：水のセルから広げる（8方向の幅優先）
  const near = new Int32Array(n * n).fill(-1), q = []; for (let k = 0; k < n * n; k++) if (Wt[k] > 0.15) { near[k] = k; q.push(k); }
  for (let h = 0; h < q.length; h++) { const k = q[h], i = k % n, j = (k / n) | 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue; const nk = nj * n + ni; if (near[nk] < 0) { near[nk] = near[k]; q.push(nk); } } }
  return {
    height: (x, z) => bil(H, x, z),
    slope: (x, z) => { const d = step; return Math.atan(Math.hypot(bil(H, x + d, z) - bil(H, x - d, z), bil(H, x, z + d) - bil(H, x, z - d)) / (2 * d)) * 180 / Math.PI; },
    water: (x, z) => bil(Wt, x, z),
    nearestWater: (x, z) => { const { i, j } = idx(x, z), k = near[j * n + i]; if (k < 0) return null; const wi = k % n, wj = (k / n) | 0, wx = -R + wi * step, wz = -R + wj * step, dx = wx - x, dz = wz - z, d = Math.hypot(dx, dz) || 1; return { dist: Math.max(0, d - step * 0.5), dx: dx / d, dz: dz / d }; },
    wet: (x, z) => { const w = (() => { const { i, j } = idx(x, z), k = near[j * n + i]; if (k < 0) return 1e9; const wi = k % n, wj = (k / n) | 0; return Math.hypot((wi - i) * step, (wj - j) * step); })(); return w < 14; },
  };
}
// 建物の足元の測定点（建物の中心を原点とした、世界の向きでのオフセット）：地面の高さを測るときに使う
function footprintPoints(b) {
  const hw = b.plan.w / 2, hd = (b.plan.kind === 'rect' ? b.plan.d : b.plan.w) / 2, cs = Math.cos(b.rot), sn = Math.sin(b.rot);
  const ring = b.plan.kind === 'rect' ? [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] : [0, 1, 2, 3, 4, 5, 6, 7].map(k => [Math.cos(k * Math.PI / 4) * hw, Math.sin(k * Math.PI / 4) * hw]);
  return [[0, 0]].concat(ring).map(([lx, lz]) => [lx * cs + lz * sn, -lx * sn + lz * cs]);
}
const api = { advance, ensureLife, initLife, grade, total, safety, GRADE_JP, yearRate, envOf, capOf, previewCost, upgradeLayout, refreshFields, PURPOSE, terrainFromSamples, footprintPoints, foundationFor: decideFoundation, settleHistory, layoutSettlement, syncLayout, requestBuild, applyRequests, shapeOf, overlaps };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohSettle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
