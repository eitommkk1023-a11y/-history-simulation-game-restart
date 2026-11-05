'use strict';
// 集落の自動生成（描画に依存しない）：水場・傾斜・資源・既存の建物を見て、世帯ごとの住居と、倉庫・作業場・干し場・集会所を置き、道でつなぐ。
// - 集落の歴史（成立年代・衰退・防衛）から、建物の古さ・数・技術・防衛設備を決める（開始前の歴史は、一日ずつ計算しない）。
// - 世帯（household）と住居は、世帯IDで結びつく（layout.byHouse）。新しい世帯・消えた世帯・NPC による建設・改築・解体の要求は、syncLayout / applyRequests で反映する。
// - 座標は集落の中心からのメートル（x：東、z：南）。地形は呼び出し側が関数で渡す（描画の地形でも、テスト用の合成地形でもよい）。
// 乱数は整数ハッシュだけ。同じ入力（Seed・集団・世帯）なら同じ集落。
(function (root) {
const Npc = typeof require !== 'undefined' ? require('./npc-core.js') : root.WohNpc;
const Arch = typeof require !== 'undefined' ? require('./arch-gen.js') : root.WohArch;
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
function newLayout(gid) { return { version: 1, gid, center: { x: 0, z: 0 }, items: [], paths: [], plaza: { r: 5 }, byHouse: {}, fields: [], fence: [], queue: [], nextSeq: 1, history: null, resolved: false }; }
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
function doorDirection(trad, terr, b, plaza) {
  const to = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  let want = to(plaza.x - b.x, plaza.z - b.z);
  if (trad.door === 'water') { const w = terr.nearestWater(b.x, b.z); if (w && w.dist < 150) want = to(w.dx, w.dz); }
  else if (trad.door === 'sun') want = to(0, 1);
  else if (trad.door === 'east') want = to(1, 0);
  const jitter = (rnd(0, b.key, 9) - 0.5) * 0.5;
  const a = Math.atan2(want[0], want[1]) + jitter;   // 0＝+z 方向
  return a;
}
function place(layout, spec, b, opts) {
  const { terr, seed, trad } = spec, o = opts || {}, items = layout.items;
  const r0 = Math.hypot(b.plan.w, b.plan.kind === 'rect' ? b.plan.d : b.plan.w) / 2 + 1.2;
  const anchor = o.anchor || layout.center, maxSlope = MAX_SLOPE[b.role] || 24;
  let best = null, bestS = -1e9;
  const nTry = 40, R = o.radius || (layout.plaza.r + r0 + 2);
  for (let k = 0; k < nTry; k++) {
    const grow = 1 + Math.floor(k / 14) * 0.45;   // 見つからなければ、外へ広げる
    const ang = rnd(seed, b.key, 200 + k) * Math.PI * 2, rad = (R + rnd(seed, b.key, 300 + k) * (o.spread || 18)) * grow;
    const x = anchor.x + Math.cos(ang) * rad, z = anchor.z + Math.sin(ang) * rad;
    const d = Math.hypot(x - layout.center.x, z - layout.center.z); if (d < layout.plaza.r + r0 * 0.7) continue;
    const wd = terr.water(x, z); if (wd > 0.25 && b.role !== 'rack') continue;
    const slope = terr.slope(x, z); if (slope > maxSlope) continue;
    b.x = x; b.z = z; b.rot = doorDirection(trad, terr, b, layout.center);
    const sh = shapeOf(b); let bad = false;
    for (const it of items) { if (it.state === 'removed') continue; if (overlaps(sh, shapeOf(it), 1.6)) { bad = true; break; } }
    if (bad) continue;
    const nw = terr.nearestWater(x, z); let s = -Math.abs(d - (o.prefDist || (layout.plaza.r + 10))) * 0.35 - slope * 0.4;
    if (nw) { if (b.role === 'rack') s += 8 - Math.abs(nw.dist - 7); else s += 5 - Math.abs(nw.dist - 40) / 9; }
    if (o.anchor) s -= Math.hypot(x - o.anchor.x, z - o.anchor.z) * 0.25;
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
  const b = Arch.designBuilding(seed, trad, role, key, members, builtAge || 0);
  b.id = key; b.house = house; b.seq = seq; b.state = 'ok'; b.builtYear = -(builtAge || 0); b.vacantSince = null;
  if (spec.level === 0 && (role === 'dwelling' || role === 'storehouse')) {   // 野営地：持ち運べる軽い住まい（低い壁と急な屋根のテント・小屋掛け）
    b.shelter = 'tent'; b.plan.w *= 0.85; if (b.plan.d) b.plan.d *= 0.85; b.wallH = role === 'dwelling' ? 0.45 : 0.8; b.wall.mat = b.wall.mat === 'timber' && b.role === 'dwelling' && spec.trad.roofMat === 'shingle' ? 'timber' : 'reed';
    if (b.plan.kind === 'rect') { b.roof.kind = 'gable'; b.plan.d = Math.max(b.plan.d, b.plan.w * 1.3); } else b.roof.kind = 'cone';
    b.roof.mat = b.roof.mat === 'mud' || b.roof.mat === 'slab' ? 'thatch' : b.roof.mat; b.roof.pitch = 58; b.roof.h = Math.tan(58 * Math.PI / 180) * (b.roof.kind === 'gable' ? b.plan.w : Math.min(b.plan.w, b.plan.d || b.plan.w)) / 2; b.roof.overhang = 0.15;
    b.windows = 0; b.ornament = 0; b.trim = false; b.stilts = role === 'storehouse' ? 1 : 0; b.sunken = 0;
  }
  const o0 = opts || {};
  if (!place(layout, spec, b, Object.assign({ anchor }, o0)) && !place(layout, spec, b, { anchor: layout.center, radius: (o0.radius || 10) * 1.8 + 10, spread: (o0.spread || 18) * 2 + 20, prefDist: layout.plaza.r + 30 })) return null;   // 置けなければ、範囲を広げてもう一度
  layout.items.push(b); if (role === 'dwelling') layout.byHouse[house] = b.id; return b;
}
// ---- 集落全体の配置
// spec：{ seed, gid, trad, hist, level, households:[{house, members, kin}], economy:{fish,gather,hunt,tool,farm,herd,trade}, terr:{height,slope,water,nearestWater,wet}, day }
function layoutSettlement(spec) {
  const { seed, gid, hist, level, households, economy, terr } = spec, layout = newLayout(gid); layout.history = hist;
  const nH = households.length;
  // 中心：平らで乾いた場所（焚き火と広場）。最初の候補の近くで探す
  let bc = { x: 0, z: 0 }, bs = 1e9; for (let k = 0; k < 30; k++) { const a = rnd(seed, gid, 50 + k) * 6.283, r = k === 0 ? 0 : 4 + rnd(seed, gid, 90 + k) * 22, x = Math.cos(a) * r, z = Math.sin(a) * r, s = terr.slope(x, z) + (terr.water(x, z) > 0.1 ? 60 : 0) + r * 0.15; if (s < bs) { bs = s; bc = { x, z }; } }
  layout.center = bc; layout.plaza.r = 4 + 0.45 * Math.sqrt(nH);
  const ageOf = (k) => Math.round(rnd(seed, gid, 700 + k) * Math.min(hist.age, hist.rebuildCycle * 1.3));
  // 村の集会所（中心の広場の縁）
  if (level === 2) { const hb = addBuilding(layout, spec, 'hall', -1, 8, layout.center, { radius: layout.plaza.r + 4, spread: 5, prefDist: layout.plaza.r + 5 }, Math.min(hist.age, ageOf(-1))); if (hb) hb.hallKey = true; }
  // 住居：世帯ごと。親族（kin）の近くに置く。親が先に建つように、世帯IDの順（古い世帯が先）
  const order = households.slice().sort((a, b) => a.house - b.house), kinAnchor = new Map();
  for (const h of order) {
    const anc = h.kin !== undefined && kinAnchor.has(h.kin) ? kinAnchor.get(h.kin) : null;
    const b = addBuilding(layout, spec, 'dwelling', h.house, h.members, anc || layout.center, anc ? { radius: 8, spread: 14, prefDist: 0 } : { radius: layout.plaza.r + 5, spread: 8 + Math.sqrt(nH) * 4, prefDist: layout.plaza.r + 6 + Math.sqrt(nH) * 3.2 }, ageOf(h.house));
    if (b) { if (h.kin !== undefined && !kinAnchor.has(h.kin)) kinAnchor.set(h.kin, { x: b.x, z: b.z }); b.cluster = h.kin; }
  }
  // 倉庫：世帯の数と暮らし（採集・保存）に応じて
  const nStore = level === 0 ? Math.round(nH * 0.05) : Math.ceil(nH * (0.12 + 0.07 * level + 0.15 * (economy.gather || 0)));
  for (let k = 0; k < nStore; k++) { const hh = order[Math.floor(rnd(seed, gid, 400 + k) * nH)], a = hh && layout.byHouse[hh.house] ? layout.items.find(i => i.id === layout.byHouse[hh.house]) : null; addBuilding(layout, spec, 'storehouse', 1e6 + k, 2, a ? { x: a.x, z: a.z } : layout.center, { radius: 7, spread: 9, prefDist: layout.plaza.r + 8 }, ageOf(900 + k)); }
  // 干し場：漁が盛んなら、水辺に
  const nRack = Math.ceil((economy.fish || 0) * nH * 0.14); for (let k = 0; k < nRack; k++) { const w = terr.nearestWater(layout.center.x, layout.center.z); addBuilding(layout, spec, 'rack', 2e6 + k, 1, w && w.dist < 150 ? { x: layout.center.x + w.dx * Math.max(0, w.dist - 6), z: layout.center.z + w.dz * Math.max(0, w.dist - 6) } : layout.center, { radius: 2, spread: 10, prefDist: Math.max(0, (w ? w.dist : 20) - 6) }, ageOf(950 + k)); }
  // 作業場：道具づくりの人が多ければ、集落の外れに
  const nWork = Math.min(4, Math.ceil((economy.tool || 0) * nH * 0.25)) + (level >= 1 && nH > 20 ? 1 : 0); for (let k = 0; k < nWork; k++) addBuilding(layout, spec, 'workshop', 3e6 + k, 2, layout.center, { radius: layout.plaza.r + 14, spread: 18, prefDist: layout.plaza.r + 24 }, ageOf(980 + k));
  // 衰退した集落：住む人のいない廃屋（外れ）。成立の古さと衰退の度合いに応じて
  if (hist.status === 'declining') { const nRuin = Math.max(1, Math.round(nH * 0.35)); for (let k = 0; k < nRuin; k++) { const b = addBuilding(layout, spec, 'dwelling', 4e6 + k, 3, layout.center, { radius: layout.plaza.r + 14, spread: 20, prefDist: layout.plaza.r + 24 }, 40 + ageOf(1000 + k)); if (b) { b.state = rnd(seed, gid, 1100 + k) < 0.5 ? 'ruin' : 'vacant'; delete layout.byHouse[4e6 + k]; } } }
  // 畑・家畜小屋：農耕・牧畜がある集団のときだけ（まだ実装されていない生業。接続口）
  if (economy.farm) layoutFields(layout, spec, nH);
  // 道
  buildPaths(layout, spec);
  // 防衛設備（柵）
  if (hist.defense > 0) buildFence(layout, spec);
  layout.resolved = true; return layout;
}
function layoutFields(layout, spec, nH) {   // 畑：水に近い平らな所に、家の外側。農耕の仕組みが入ったときに使う
  const { terr, seed, gid } = spec, n = Math.ceil(nH * 0.5); const dws = layout.items.filter(i => i.role === 'dwelling');
  for (let k = 0; k < n * 6 && layout.fields.length < n; k++) {
    const a = rnd(seed, gid, 1500 + k) * 6.283, r = layout.plaza.r + 30 + rnd(seed, gid, 1600 + k) * 60, x = layout.center.x + Math.cos(a) * r, z = layout.center.z + Math.sin(a) * r, w = 14 + rnd(seed, gid, 1700 + k) * 10, d = 10 + rnd(seed, gid, 1800 + k) * 8, rot = a;
    if (terr.slope(x, z) > 9 || terr.water(x, z) > 0.1) continue;
    const f = { x, z, rot, hw: w / 2, hd: d / 2, round: false }; if (dws.some(b => overlaps(shapeOf(b), f, 2)) || layout.fields.some(o => overlaps(o, f, 1.5)) || layout.items.some(b => overlaps(shapeOf(b), f, 2))) continue;
    layout.fields.push(f);
  }
}
// 道：広場と各家の入口をつなぐ（近い順に、すでにつながった所へ）。建物にぶつかるときは迂回の点を足す。水場への道もつける
function buildPaths(layout, spec) {
  const { terr } = spec, nodes = [{ x: layout.center.x, z: layout.center.z, id: 'plaza' }], paths = [], solid = layout.items.filter(i => i.state !== 'removed').map(i => ({ s: shapeOf(i), id: i.id }));
  const hits = (x1, z1, x2, z2, skipA, skipB) => { for (const o of solid) { if (o.id === skipA || o.id === skipB) continue; for (let t = 0.15; t < 0.9; t += 0.15) { const px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t; if (overlaps({ x: px, z: pz, rot: 0, hw: 0.4, hd: 0.4, round: true }, o.s, 0)) return o; } } return null; };
  const doors = layout.items.filter(i => i.entrance && i.state !== 'removed' && i.state !== 'ruin').sort((a, b) => Math.hypot(a.entrance.x - layout.center.x, a.entrance.z - layout.center.z) - Math.hypot(b.entrance.x - layout.center.x, b.entrance.z - layout.center.z));
  for (const b of doors) {
    let bn = null, bd = 1e9; for (const n of nodes) { const d = Math.hypot(n.x - b.entrance.x, n.z - b.entrance.z); if (d < bd) { bd = d; bn = n; } }
    let from = bn, to = { x: b.entrance.x, z: b.entrance.z };
    const blk = hits(from.x, from.z, to.x, to.z, b.id, null);
    if (blk) { const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l, sgn = rnd(spec.seed, b.id, 55) < 0.5 ? 1 : -1, hs = blk.s, off = Math.max(hs.hw, hs.hd) + 1.6; const wp = { x: hs.x + px * off * sgn, z: hs.z + pz * off * sgn }; paths.push({ x1: from.x, z1: from.z, x2: wp.x, z2: wp.z, w: 0.9, use: 1 }); from = wp; nodes.push({ x: wp.x, z: wp.z, id: 'wp' + b.id }); }
    paths.push({ x1: from.x, z1: from.z, x2: to.x, z2: to.z, w: 0.9, use: 1 }); nodes.push({ x: to.x, z: to.z, id: b.id });
  }
  const w = terr.nearestWater(layout.center.x, layout.center.z);
  if (w && w.dist < 120) { const wx = layout.center.x + w.dx * w.dist, wz = layout.center.z + w.dz * w.dist; paths.push({ x1: layout.center.x, z1: layout.center.z, x2: wx, z2: wz, w: 1.4, use: 3 }); layout.waterAccess = { x: wx, z: wz }; }
  layout.paths = paths; layout.nodes = nodes.length;
  // 踏まれ具合：広場に近い道ほど太く
  for (const p of paths) { const d = Math.hypot((p.x1 + p.x2) / 2 - layout.center.x, (p.z1 + p.z2) / 2 - layout.center.z); p.w = p.w * (d < layout.plaza.r + 12 ? 1.35 : 1); }
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
// ---- 世帯の変化に合わせて更新する（新しい世帯の家を建てる・いなくなった世帯の家を空き家→廃屋→撤去）。day は暦の日数
function syncLayout(layout, spec, households, day) {
  const cur = new Set(households.map(h => h.house)), out = { added: 0, vacated: 0, ruined: 0, removed: 0, reoccupied: 0 };
  // まず、いなくなった世帯の家を空き家→廃屋→撤去に進める
  for (const b of layout.items) {
    if (b.role !== 'dwelling' || b.house < 0 || b.house >= 4e6 || cur.has(b.house) || b.state === 'removed') continue;
    if (b.vacantSince === null) { b.vacantSince = day; b.state = 'vacant'; out.vacated++; continue; }
    const yrs = (day - b.vacantSince) / YEAR;
    if (yrs > 12) { b.state = 'removed'; delete layout.byHouse[b.house]; out.removed++; } else if (yrs > 5 && b.state !== 'ruin') { b.state = 'ruin'; out.ruined++; }
  }
  // 新しい世帯：空き家（廃屋でないもの）があれば、親族に近い空き家に入る。なければ建てる
  for (const h of households) {
    const id = layout.byHouse[h.house], b = id ? layout.items.find(i => i.id === id) : null;
    if (b && b.state !== 'removed') { if (b.state === 'vacant' || b.vacantSince !== null) { b.state = 'ok'; b.vacantSince = null; out.reoccupied++; } b.members = h.members; continue; }
    const anc = h.kin !== undefined ? (layout.items.find(i => i.role === 'dwelling' && i.cluster === h.kin && i.state === 'ok') || null) : null, ref = anc || layout.center;
    let vac = null, vd = 1e9; for (const i of layout.items) { if (i.role !== 'dwelling' || i.state !== 'vacant') continue; const d = Math.hypot(i.x - ref.x, i.z - ref.z); if (d < vd) { vd = d; vac = i; } }
    if (vac) { delete layout.byHouse[vac.house]; vac.house = h.house; vac.cluster = h.kin; vac.state = 'ok'; vac.vacantSince = null; vac.members = h.members; layout.byHouse[h.house] = vac.id; out.reoccupied++; continue; }
    const nb = addBuilding(layout, spec, 'dwelling', h.house, h.members, anc ? { x: anc.x, z: anc.z } : layout.center, anc ? { radius: 8, spread: 14, prefDist: 0 } : { radius: layout.plaza.r + 5, spread: 20, prefDist: layout.plaza.r + 14 }, 0);
    if (nb) { nb.builtYear = Math.floor(day / YEAR); nb.cluster = h.kin; out.added++; }
  }
  if (out.added || out.removed) buildPaths(layout, spec);
  return out;
}
// ---- NPC による建設・改築・解体の要求（接続口）：{ type:'build'|'renovate'|'demolish', house, day }。NPC の意思決定が入るまでは、呼ぶ側が積む
function requestBuild(layout, type, house, day) { layout.queue.push({ type, house, day }); }
function applyRequests(layout, spec, households, day) {
  const res = { built: 0, renovated: 0, demolished: 0 };
  for (const q of layout.queue.splice(0)) {
    const id = layout.byHouse[q.house], b = id ? layout.items.find(i => i.id === id) : null;
    if (q.type === 'build' && !b) { const h = households.find(x => x.house === q.house); if (h) { const nb = addBuilding(layout, spec, 'dwelling', h.house, h.members, layout.center, { radius: layout.plaza.r + 5, spread: 20, prefDist: layout.plaza.r + 14 }, 0); if (nb) { nb.builtYear = Math.floor(day / YEAR); res.built++; } } }
    else if (q.type === 'renovate' && b) { const nd = Arch.designBuilding(spec.seed, spec.trad, b.role, b.id, b.members, 0); for (const k of ['plan', 'wallH', 'roof', 'wall', 'door', 'windows', 'ornament', 'tint', 'trim', 'trimHue']) b[k] = nd[k]; b.builtYear = Math.floor(day / YEAR); b.age = 0; res.renovated++; }
    else if (q.type === 'demolish' && b) { b.state = 'removed'; delete layout.byHouse[q.house]; res.demolished++; }
  }
  if (res.built || res.demolished) buildPaths(layout, spec);
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
const api = { terrainFromSamples, footprintPoints, foundationFor: decideFoundation, settleHistory, layoutSettlement, syncLayout, requestBuild, applyRequests, shapeOf, overlaps };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohSettle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
