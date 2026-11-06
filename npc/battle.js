/* World of History: 小さな野戦（試作 v0）——編隊・持ち場・伝令・視界・士気・偽装撤退と伏兵
 * 純粋な計算（画面に触れない）。UMD：ブラウザでは WohBattle、Node では module.exports。同じSeedなら同じ結果。係数は［仮］。
 *
 * 仕様書（軍事 Ver.2〜20）の原則を、小さく確かめる：
 *  ・戦闘は人物ごとのHP（HP0＝戦闘不能。死亡ではない）。向き（正面・側面・背面）で受ける傷が変わる。
 *  ・戦術ボタンは無い。陣形・伏兵・偽装撤退は、配置・視界・命令・士気から自然に出る。
 *  ・命令は伝令が走って届ける（遅れる・途中で討たれる）。部隊は届くまで、前の命令か「持ち場」で動く。
 *  ・情報は不完全：自分の目で見た敵だけ分かる。伏兵（隠れた兵）は近づくまで見えない。報告も伝令で届く。
 *  ・戦場の時間は現実と同じ速さ（1秒＝1秒）。DT=0.5秒刻み。
 */
(function (root) {
  'use strict';
  const DT = 0.5;
  function makeRng(seed) { let a = seed >>> 0; return function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x, hyp = Math.hypot;
  const hash2 = (x, y, s) => { let h = (s ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const smooth = t => t * t * (3 - 2 * t);
  function vnoise(x, y, sp, seed) { const qx = x / sp, qy = y / sp, ix = Math.floor(qx), iy = Math.floor(qy), u = smooth(qx - ix), v = smooth(qy - iy); const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed); return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v; }

  // ---------------------------------------------------------------- 戦場（地形）
  // opts：size(m)・res(m)・seed・hill(起伏の高さm)・patches（森など：{x,y,r,c}）・elevFn（実際の標高を使うとき）
  function makeField(opts) {
    opts = opts || {}; const res = opts.res || 20, size = opts.size || 1600, n = Math.round(size / res), seed = opts.seed || 1;
    const elev = new Float32Array(n * n), cover = new Uint8Array(n * n), hill = opts.hill == null ? 10 : opts.hill;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * res, y = (j + 0.5) * res;
      elev[j * n + i] = opts.elevFn ? opts.elevFn(x, y) : hill * (vnoise(x, y, 500, seed) + 0.4 * vnoise(x, y, 150, seed + 7) - 0.7);
      let c = 0; for (const p of opts.patches || []) if (hyp(x - p.x, y - p.y) <= p.r) c = Math.max(c, p.c == null ? 2 : p.c); cover[j * n + i] = c;
    }
    const F = { n, res, size, elev, cover };
    F.inB = (x, y) => x >= 0 && y >= 0 && x < size && y < size;
    F.elevAt = (x, y) => { const gx = clamp(x / res - 0.5, 0, n - 1.001), gy = clamp(y / res - 0.5, 0, n - 1.001), i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j; const a = elev[j * n + i], b = elev[j * n + i + 1], c = elev[(j + 1) * n + i], d = elev[(j + 1) * n + i + 1]; return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
    F.coverAt = (x, y) => { const i = clamp(Math.floor(x / res), 0, n - 1), j = clamp(Math.floor(y / res), 0, n - 1); return cover[j * n + i]; };
    F.slopeAt = (x, y) => { const e = res; return hyp((F.elevAt(x + e, y) - F.elevAt(x - e, y)) / (2 * e), (F.elevAt(x, y + e) - F.elevAt(x, y - e)) / (2 * e)); };
    // 見通し：2点の間の地形（尾根）と森が視界をさえぎるか
    F.los = (x0, y0, x1, y1) => { const d = hyp(x1 - x0, y1 - y0); if (d < 8) return true; const k = Math.max(3, Math.ceil(d / 25)), e0 = F.elevAt(x0, y0) + 1.6, e1 = F.elevAt(x1, y1) + 1.6; let forest = 0; for (let m = 1; m < k; m++) { const t = m / k, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (F.elevAt(x, y) > e0 + (e1 - e0) * t + 0.4) return false; if (F.coverAt(x, y) === 2) forest++; } return forest < 3; };
    return F;
  }
  // 実際の世界の標高（ブロック格子）から戦場を作る。playable（遊ぶ画面）と同じ縮尺：1ブロック＝33.3m。森などの被覆は patches で重ねる
  function fieldFromWorld(world, bx, by, opts) {
    opts = opts || {}; const W = world.stats.width, blockM = 33.3, size = opts.size || 1600, tr = e => 1000 * Math.tanh(e / 3000) + 0.15 * Math.max(0, e - 3000) ** 2 / (Math.max(0, e - 3000) + 1000);
    const sample = (x, y) => { const gx = clamp(bx + x / blockM, 0, W - 1.01), gy = clamp(by + y / blockM, 0, W - 1.01), i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j; const E = (a, b) => tr(Math.max(0, world.elev[(b) * W + a])); return E(i, j) * (1 - u) * (1 - v) + E(i + 1, j) * u * (1 - v) + E(i, j + 1) * (1 - u) * v + E(i + 1, j + 1) * u * v; };
    return makeField(Object.assign({}, opts, { size, elevFn: sample }));
  }

  // ---------------------------------------------------------------- 武器（人物の実態から：長さ・射程・傷）
  const WEAPON = { spear: { reach: 2.4, dmg: [3, 6], cd: 1.3, acc: 0.65 }, sword: { reach: 1.4, dmg: [3, 5], cd: 0.9, acc: 0.7 }, bow: { range: 70, dmg: [2, 5], cd: 3.0, acc: 0.4 }, lance: { reach: 3.2, dmg: [4, 7], cd: 2.0, acc: 0.6 } };   // lance＝騎兵の槍（走りながら当てると傷が大きい）
  const SPEED = { walk: 1.5, jog: 3.0, run: 4.4, retreat: 4.0, chase: 3.8 };
  // 騎兵：馬に乗ると約2.2倍の速さ。軍馬の体力、突撃・槍衾・森と坂の係数［仮］
  const MM = 2.2, SPEED_M = { walk: SPEED.walk * MM, jog: SPEED.jog * MM, run: SPEED.run * MM, retreat: SPEED.retreat * MM, chase: SPEED.chase * MM };
  const HORSE = { hp: 30, riderHp: 12, hitShare: 0.3, rearP: 0.3, rearSec: 2.0, fallSec: 1.5, pikeP: 0.25, pikeDmg: 12, coverSlow: 0.5, charge: 0.9 };
  // 馬の歩様（Codex の馬の5クリップ名）：速さ(m/s)から決める
  function gaitOf(v) { return v < 0.3 ? 'idle' : v < 2.8 ? 'walk' : v < 4.7 ? 'trot' : v < 7 ? 'canter' : 'gallop'; }

  // ---------------------------------------------------------------- 戦いを作る
  function create(field, seed) { return { field, t: 0, rnd: makeRng(seed || 1), soldiers: [], units: [], messengers: [], commanders: {}, wagons: [], log: [], nextId: 1, stats: { wagonsLost: 0, horsesLost: 0, dismounted: 0, msgSent: 0, msgDelivered: 0, msgLost: 0, sprung: 0, routs: 0 }, ended: null, _grid: null, _visT: -9, _thinkT: -9 }; }
  const ROLE_ORDER = { lance: 0, shield: 0, spear: 1, sword: 2, bow: 3 };
  // 部隊：n人。weapons＝[[武器, 盾かどうか, 人数], ...]。x,y＝中心、facing＝向き（ラジアン、0＝東）
  function addUnit(B, o) {
    const u = { id: B.nextId++, side: o.side, members: [], x: o.x, y: o.y, facing: o.facing || 0, formation: o.formation || 'line', discipline: o.discipline == null ? 0.5 : o.discipline, order: { type: 'hold', x: o.x, y: o.y, facing: o.facing || 0 }, post: { x: o.x, y: o.y }, hidden: false, seen: new Map(), phase: null, phaseT: 0, pursuing: false, springUntil: -1, origin: { x: o.x, y: o.y }, lastReport: -99, cen: null, ecenPrev: null, rally: { x: o.rally ? o.rally.x : o.x - Math.cos(o.facing || 0) * 120, y: o.rally ? o.rally.y : o.y - Math.sin(o.facing || 0) * 120 }, shocked: false, name: o.name || '', cav: !!o.mounted };
    for (const [w, shield, cnt] of o.weapons) for (let i = 0; i < cnt; i++) { const s = { id: B.nextId++, side: o.side, unit: u.id, x: o.x + (B.rnd() - 0.5) * 6, y: o.y + (B.rnd() - 0.5) * 6, f: u.facing, hp: 10, state: 'ok', w, shield: !!shield, cd: B.rnd(), m: 62 + B.rnd() * 16, slot: [0, 0], fleeT: 0, hidden: false, role: shield ? 'shield' : w, ar: w === 'bow' && o.arrows != null ? o.arrows : Infinity }; if (o.mounted) { s.mounted = true; s.hp = HORSE.riderHp; s.horse = { hp: HORSE.hp, state: 0, t: -99, loose: false }; } u.members.push(s); B.soldiers.push(s); }
    B.units.push(u); assignSlots(u, B); return u;
  }
  function assignSlots(u, B) {
    const K = u.members.some(s => s.mounted) ? 1.8 : 1, arr = u.members.filter(s => s.state !== 'down').sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.id - b.id), n = arr.length;
    arr.forEach((s, i) => {
      if (u.formation === 'line') { const cols = Math.min(n, 14), row = Math.floor(i / cols), col = i % cols, inRow = Math.min(cols, n - row * cols); s.slot = [(col - (inRow - 1) / 2) * 1.5 * K, -row * 1.8 * K]; }
      else if (u.formation === 'column') { const cols = 3, row = Math.floor(i / cols), col = i % cols; s.slot = [(col - 1) * 1.4 * K, -row * 1.6 * K]; }
      else { const r = (3 + 9 * Math.sqrt(hash2(s.id, 3, 11))) * K, a = hash2(s.id, 5, 13) * Math.PI * 2; s.slot = [Math.cos(a) * r, Math.sin(a) * r]; }
    });
  }
  // 荷馬車隊：n台。arrows＝1台あたりの矢、home＝敵が近づいたとき引く先、dest＝進む先
  function addTrain(B, o) {
    const n = o.wagons || 3, out = [];
    for (let i = 0; i < n; i++) { const wg = { id: B.nextId++, side: o.side, x: o.x - Math.cos(o.facing || 0) * i * 8, y: o.y - Math.sin(o.facing || 0) * i * 8 + (i % 2) * 3, f: o.facing || 0, hp: 40, arrows: o.arrows == null ? 0 : o.arrows, food: o.food == null ? 0 : o.food, state: 'ok', t: -99, dest: { x: o.dest ? o.dest.x : o.x, y: o.dest ? o.dest.y : o.y }, home: { x: o.home ? o.home.x : o.x, y: o.home ? o.home.y : o.y }, speed: 0 }; B.wagons.push(wg); out.push(wg); }
    return out;
  }
  function stepWagons(B) {
    for (const w of B.wagons) {
      if (w.state !== 'ok') { w.speed = 0; continue; }
      let threat = 0; near(B, w.x, w.y, 40, e => { if (e.side !== w.side && e.state === 'ok' && !e.hidden) threat++; });
      const dst = threat ? w.home : w.dest, d = hyp(dst.x - w.x, dst.y - w.y), px = w.x, py = w.y;
      if (d > 2) { const v = Math.min((threat ? 2.6 : 1.8) * DT, d) * clamp(1 - B.field.slopeAt(w.x, w.y) * 0.8, 0.3, 1); w.x += (dst.x - w.x) / d * v; w.y += (dst.y - w.y) / d * v; w.f = Math.atan2(dst.y - py, dst.x - px); }
      w.speed = hyp(w.x - px, w.y - py) / DT;
    }
  }
  function addCommander(B, side, o) { const c = { side, x: o.x, y: o.y, doctrine: o.doctrine, known: new Map(), est: null, units: [], plan: null, lastAdv: -99, t0: 0 }; B.commanders[side] = c; return c; }

  // ---------------------------------------------------------------- 命令（伝令が運ぶ）
  function issue(B, side, unit, order) {
    const c = B.commanders[side]; if (!c) return;
    B.messengers.push({ id: B.nextId++, side, kind: 'order', x: c.x, y: c.y, speed: 6.5, unitId: unit.id, order, age: 0, alive: true });
    B.stats.msgSent++;
  }
  function deliver(B, m) {
    if (m.kind === 'order') { const u = B.units.find(q => q.id === m.unitId); if (!u) return; u.order = Object.assign({}, m.order, { recvT: B.t }); u.phase = null; u.phaseT = B.t; if (m.order.type === 'ambush') u.hidden = false; B.stats.msgDelivered++; B.log.push({ t: B.t, e: 'order', unit: u.id, type: m.order.type }); }
    else if (m.kind === 'report') { const c = B.commanders[m.side]; for (const r of m.sightings) c.known.set(r.id, r); updateEst(B, c); B.stats.msgDelivered++; }
  }
  function updateEst(B, c) { let sx = 0, sy = 0, n = 0; for (const r of c.known.values()) if (B.t - r.t < 60) { sx += r.x; sy += r.y; n++; } c.est = n ? { x: sx / n, y: sy / n, n } : null; }

  // ---------------------------------------------------------------- 視界・情報
  function buildGrid(B) { const g = new Map(), cs = 25; for (const s of B.soldiers) { if (s.state === 'down') continue; const k = Math.floor(s.x / cs) * 4096 + Math.floor(s.y / cs); (g.get(k) || g.set(k, []).get(k)).push(s); } B._grid = { g, cs }; }
  function near(B, x, y, r, fn) { const { g, cs } = B._grid, x0 = Math.floor((x - r) / cs), x1 = Math.floor((x + r) / cs), y0 = Math.floor((y - r) / cs), y1 = Math.floor((y + r) / cs); for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const L = g.get(i * 4096 + j); if (L) for (const s of L) fn(s); } }
  function sightRange(B, e) { return e.hidden ? 35 : (B.field.coverAt(e.x, e.y) === 2 && e.still ? 70 : 160); }
  function updateVisibility(B) {
    for (const u of B.units) {
      for (const s of u.members) {
        if (s.state === 'down') continue;
        near(B, s.x, s.y, 160, e => { if (e.side === s.side) return; const d = hyp(e.x - s.x, e.y - s.y); if (d > sightRange(B, e)) return; if (!B.field.los(s.x, s.y, e.x, e.y)) return; u.seen.set(e.id, { id: e.id, x: e.x, y: e.y, t: B.t, vx: e.vx || 0, vy: e.vy || 0 }); });
      }
      for (const [id, r] of u.seen) if (B.t - r.t > 30) u.seen.delete(id);
    }
    // 報告：部隊が見た敵を、15秒ごとに指揮官へ伝令で届ける
    for (const u of B.units) { const alive = u.members.some(s => s.state === 'ok'); if (!alive || B.t - u.lastReport < 15) continue; const fresh = []; for (const r of u.seen.values()) if (B.t - r.t < 15) fresh.push(r); if (!fresh.length) continue; u.lastReport = B.t; const c = B.commanders[u.side]; if (!c) continue; const cen = unitCenter(u); B.messengers.push({ id: B.nextId++, side: u.side, kind: 'report', x: cen.x, y: cen.y, speed: 6.5, toC: true, sightings: fresh.slice(0, 40), age: 0, alive: true }); B.stats.msgSent++; }
  }
  function unitCenter(u) { let sx = 0, sy = 0, n = 0; for (const s of u.members) if (s.state === 'ok') { sx += s.x; sy += s.y; n++; } return n ? { x: sx / n, y: sy / n, n } : { x: u.x, y: u.y, n: 0 }; }

  // ---------------------------------------------------------------- 伝令の移動
  function stepMessengers(B) {
    for (const m of B.messengers) {
      if (!m.alive) continue; m.age += DT;
      let tx, ty;
      if (m.kind === 'order') { const u = B.units.find(q => q.id === m.unitId); if (!u || !u.members.some(s => s.state === 'ok')) { m.alive = false; B.stats.msgLost++; continue; } const c = unitCenter(u); tx = c.x; ty = c.y; if (hyp(m.x - tx, m.y - ty) <= 10) { m.alive = false; deliver(B, m); continue; } }
      else { const c = B.commanders[m.side]; tx = c.x; ty = c.y; if (hyp(m.x - tx, m.y - ty) <= 10) { m.alive = false; deliver(B, m); continue; } }
      const d = hyp(tx - m.x, ty - m.y), v = Math.min(m.speed * DT, d); m.x += (tx - m.x) / d * v; m.y += (ty - m.y) / d * v;
      // 討たれる：敵兵が近くにいると（見つかって追われると）
      let threat = 0; near(B, m.x, m.y, 7, e => { if (e.side !== m.side && e.state === 'ok' && !e.hidden) threat++; });
      if (threat && B.rnd() < 1 - Math.exp(-0.9 * DT * Math.min(3, threat))) { m.alive = false; B.stats.msgLost++; B.log.push({ t: B.t, e: 'messengerKilled', side: m.side }); }
      if (m.age > 240) { m.alive = false; B.stats.msgLost++; }
    }
    B.messengers = B.messengers.filter(m => m.alive);
  }

  // ---------------------------------------------------------------- 部隊の動き（命令・持ち場・自律）
  function enemyCentroid(B, u) { let sx = 0, sy = 0, n = 0; for (const r of u.seen.values()) if (B.t - r.t < 3) { sx += r.x; sy += r.y; n++; } return n ? { x: sx / n, y: sy / n, n } : null; }
  function stepUnit(B, u) {
    const cen = unitCenter(u); u.cen = cen; if (!cen.n) return;
    const o = u.order; let dc = { x: u.post.x, y: u.post.y }, mode = 'hold', fac = u.facing, eng = 12, formation = u.formation;
    const ec = enemyCentroid(B, u);
    if (o.type === 'hold') { dc = { x: o.x, y: o.y }; fac = o.facing == null ? u.facing : o.facing; u.post = { x: o.x, y: o.y }; mode = 'hold'; eng = 14; formation = 'line'; }
    else if (o.type === 'advance') { dc = { x: o.x, y: o.y }; mode = 'march'; eng = 26; formation = 'line'; if (hyp(dc.x - cen.x, dc.y - cen.y) > 1) fac = Math.atan2(dc.y - cen.y, dc.x - cen.x); u.post = { x: o.x, y: o.y }; }
    else if (o.type === 'retreat') { dc = { x: o.x, y: o.y }; mode = 'retreat'; eng = 0; formation = 'column'; fac = Math.atan2(dc.y - cen.y, dc.x - cen.x); }
    else if (o.type === 'ambush') {
      dc = { x: o.x, y: o.y }; fac = o.facing == null ? u.facing : o.facing; formation = 'loose';
      const arrived = hyp(dc.x - cen.x, dc.y - cen.y) < 12;
      if (!u.hidden && arrived && B.field.coverAt(cen.x, cen.y) > 0) { u.hidden = true; B.log.push({ t: B.t, e: 'hidden', unit: u.id }); }
      if (u.hidden) {
        mode = 'hidden'; eng = 0; let cnt = 0, discovered = false; near(B, cen.x, cen.y, o.springR || 110, e => { if (e.side !== u.side && e.state === 'ok') { cnt++; if (hyp(e.x - cen.x, e.y - cen.y) < 20) discovered = true; } });
        if (cnt >= (o.minEnemies || 4) || discovered) { u.hidden = false; u.springUntil = B.t + 12; u.order = { type: 'hold', x: cen.x, y: cen.y, facing: fac, sprung: true }; B.stats.sprung++; B.log.push({ t: B.t, e: 'spring', unit: u.id, enemies: cnt }); mode = 'charge'; eng = 60; }
      } else mode = 'march';
    }
    else if (o.type === 'feint') {
      // 偽装撤退：持ち場で待つ → 敵と接触 → しばらく交戦 → 引く（罠の方へ）→ 反転して戦う
      if (!u.phase) { u.phase = 'wait'; u.phaseT = B.t; }
      if (u.phase === 'wait') { dc = { x: o.x, y: o.y }; mode = 'hold'; fac = o.facing == null ? 0 : o.facing; eng = 14; formation = 'line'; if (ec && hyp(ec.x - cen.x, ec.y - cen.y) < (o.contactR || 60)) { u.phase = 'engage'; u.phaseT = B.t; } }
      if (u.phase === 'engage') { dc = { x: cen.x, y: cen.y }; mode = 'hold'; eng = 20; formation = 'line'; fac = ec ? Math.atan2(ec.y - cen.y, ec.x - cen.x) : u.facing; if (B.t - u.phaseT >= (o.engageSec || 12)) { u.phase = 'retreat'; u.phaseT = B.t; B.log.push({ t: B.t, e: 'feintRetreat', unit: u.id }); } }
      if (u.phase === 'retreat') { dc = { x: o.rx, y: o.ry }; mode = 'retreat'; eng = 0; formation = 'column'; fac = Math.atan2(dc.y - cen.y, dc.x - cen.x); if (hyp(dc.x - cen.x, dc.y - cen.y) < 10) { u.phase = 'turn'; u.phaseT = B.t; B.log.push({ t: B.t, e: 'feintTurn', unit: u.id }); } }
      if (u.phase === 'turn') { dc = { x: o.rx, y: o.ry }; mode = 'hold'; eng = 40; formation = 'line'; fac = o.turnFacing == null ? Math.PI : o.turnFacing; u.post = dc; }
    }
    // 持ち場を守る自律：命令が無くても、敵が近ければ交戦する。規律が低い部隊は、引く敵を深追いする
    if (mode === 'hold' || mode === 'march') {
      const limit = 25 + 520 * (1 - u.discipline) * (1 - u.discipline);
      if (ec && B.t - (u.pursueCheck || 0) >= 1) {
        u.pursueCheck = B.t;
        // 敵が「引いているか」：近く（100m以内）で見えた敵の速度の平均が、こちらから遠ざかる向きか
        let vx = 0, vy = 0, n = 0, px = 0, py = 0; for (const r of u.seen.values()) if (B.t - r.t < 3 && hyp(r.x - cen.x, r.y - cen.y) < 100) { vx += r.vx; vy += r.vy; px += r.x; py += r.y; n++; }
        if (n >= 3 && !u.pursuing) { vx /= n; vy /= n; px /= n; py /= n; const dx = px - cen.x, dy = py - cen.y, dd = hyp(dx, dy) || 1, away = (vx * dx + vy * dy) / dd; if (away > 1.6 && u.members.filter(s => s.state === 'ok' && s.m > 45).length > 5) { u.pursuing = true; u.pursueFrom = { x: cen.x, y: cen.y }; B.log.push({ t: B.t, e: 'pursue', unit: u.id }); } }
      }
      if (u.pursuing) { if (!ec || hyp(cen.x - u.pursueFrom.x, cen.y - u.pursueFrom.y) > limit || B.t - (u.lastSeenT || 0) > 8) { if (!ec || hyp(cen.x - u.pursueFrom.x, cen.y - u.pursueFrom.y) > limit) u.pursuing = false; } if (ec) u.lastSeenT = B.t; if (u.pursuing && ec) { dc = { x: ec.x, y: ec.y }; mode = 'charge'; eng = 50; fac = Math.atan2(dc.y - cen.y, dc.x - cen.x); formation = 'loose'; } }
    }
    if (formation !== u.formation) { u.formation = formation; assignSlots(u, B); }
    u.dc = dc; u.mode = mode; u.eng = eng; u.facing = fac;
    // 中心の移動
    u.cav = u.members.some(s => s.mounted && s.state === 'ok'); const SPU = u.cav ? SPEED_M : SPEED;
    const dd = hyp(dc.x - u.x, dc.y - u.y), sp = mode === 'march' ? SPU.walk : mode === 'retreat' ? SPU.retreat : mode === 'charge' ? SPU.chase : mode === 'hidden' ? 0 : SPU.walk;
    if (mode === 'hidden') { u.x = cen.x; u.y = cen.y; }
    else if (dd > 0.5) { const v = Math.min(sp * DT, dd), slow = clamp(1 - B.field.slopeAt(u.x, u.y) * 0.6, 0.4, 1); u.x += (dc.x - u.x) / dd * v * slow; u.y += (dc.y - u.y) / dd * v * slow; }
    // 隊が遅れていたら待つ（中心が隊の実際の位置から離れすぎないように）
    if (hyp(u.x - cen.x, u.y - cen.y) > 14 && mode !== 'charge') { u.x = cen.x + (u.x - cen.x) * 0.5; u.y = cen.y + (u.y - cen.y) * 0.5; }
    for (const s of u.members) s.hidden = u.hidden;
  }

  // ---------------------------------------------------------------- 人物の動き・戦闘・士気
  function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); }
  // 向きを変える速さには限りがある（毎秒約1ラジアン）。側面や背面から襲われた直後は、まだ向き直れていない
  function face(s, ang) { let d = ang - s.f; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const m = TURN * DT; s.f += Math.abs(d) <= m ? d : (d > 0 ? m : -m); }
  const TURN = 1.0;
  function hitFactor(def, ax, ay) { const toA = Math.atan2(ay - def.y, ax - def.x), d = angDiff(def.f, toA); if (d < Math.PI / 3) return def.shield ? 0.5 : 0.8; if (d < 2 * Math.PI / 3) return 1.0; return 1.6; }   // 正面・側面・背面
  // 馬の傷：体力0で倒れる。乗り手は落馬して歩兵になり、小さな傷を負う
  function hurtHorse(B, s, amt) {
    const H = s.horse; if (!H || H.state === 2) return; H.hp -= amt;
    if (H.hp <= 0) { H.state = 2; H.t = B.t; s.mounted = false; s.hp -= 2; s.m -= 6; if (s.w === 'lance') { s.w = 'sword'; s.role = s.shield ? 'shield' : 'sword'; } B.stats.horsesLost++; B.stats.dismounted++; B.log.push({ t: B.t, e: 'horseDown', unit: s.unit }); }
  }
  function applyDamage(B, att, def, dmg, u) {
    const f = hitFactor(def, att.x, att.y), spr = B.units.find(q => q.id === att.unit).springUntil > B.t ? 1.4 : 1;
    const d = dmg * f * spr;
    if (def.mounted && def.horse.state !== 2 && B.rnd() < HORSE.hitShare) { hurtHorse(B, def, d * 1.5); if (def.mounted && def.horse.state === 0 && B.rnd() < HORSE.rearP) { def.horse.state = 1; def.horse.t = B.t; } }   // 当たりの一部は馬へ。生き残った馬は後ろ脚立ちになることがある
    else def.hp -= d;
    def.m -= 1 + (f > 1.3 ? 3 : 0);
    // 槍衾：正面から騎兵が槍の歩兵に突っ込むと、馬が突かれることがある
    if (att.mounted && def.w === 'spear' && f <= 0.8 && B.rnd() < HORSE.pikeP) hurtHorse(B, att, HORSE.pikeDmg);
    if (def.hp <= 0 && def.state !== 'down') {
      if (def.mounted) { def.horse.loose = true; def.mounted = false; } def.state = 'down'; def.casSide = def.side; def.downBy = f > 1.3 ? 'rear' : f > 0.95 ? 'flank' : 'front';
      near(B, def.x, def.y, 20, e => { if (e.state !== 'ok') return; if (e.side === def.side) e.m -= 3.5; else e.m += 0.8; });
      const du = B.units.find(q => q.id === def.unit); if (du && du.members[0] === def) { /* 隊長が倒れた */ }
    }
  }
  function stepSoldier(B, s, u) {
    if (s.state === 'down') return;
    const SP = s.mounted ? SPEED_M : SPEED, cs0 = s.mounted ? B.field.coverAt(s.x, s.y) : 0;
    s.cd -= DT; const px = s.x, py = s.y;
    s.still = true;
    if (s.state === 'flee') {
      let ex = 0, ey = 0, cnt = 0; near(B, s.x, s.y, 60, e => { if (e.side !== s.side && e.state === 'ok') { ex += s.x - e.x; ey += s.y - e.y; cnt++; } });
      let dx = u.rally.x - s.x, dy = u.rally.y - s.y; if (cnt) { dx = ex / cnt; dy = ey / cnt; } const d = hyp(dx, dy) || 1; const v = SP.run * DT;
      s.x = clamp(s.x + dx / d * v, 1, B.field.size - 1); s.y = clamp(s.y + dy / d * v, 1, B.field.size - 1); face(s, Math.atan2(dy, dx)); s.still = false;
      if (s.m > 45 && !cnt && B.t - s.fleeT > 10) s.state = 'ok';
      return;
    }
    if (s.w === 'bow' && s.ar < 6 && B.wagons.length) { for (const wg of B.wagons) if (wg.state === 'ok' && wg.side === s.side && wg.arrows > 0 && hyp(wg.x - s.x, wg.y - s.y) < 25) { const take = Math.min(12, wg.arrows); wg.arrows -= take; s.ar += take; break; } }
    // 士気：近くに敵がいなければ回復。囲まれると崩れる。四方のうち三方以上に敵が近いと「包囲」
    let sect = 0, nearEnemy = null, nd = 1e9, mask = 0;
    near(B, s.x, s.y, 22, e => { if (e.side === s.side || e.state !== 'ok' || e.hidden) return; const d = hyp(e.x - s.x, e.y - s.y); if (d < nd) { nd = d; nearEnemy = e; } if (d < 20) mask |= 1 << (Math.floor(((Math.atan2(e.y - s.y, e.x - s.x) + Math.PI) / (Math.PI / 2))) & 3); });
    for (let b = 0; b < 4; b++) if (mask & (1 << b)) sect++;
    if (sect >= 3) { s.m -= 2.2 * DT; if (!s.encircled) { s.encircled = true; B.log.push({ t: B.t, e: 'encircled', unit: u.id }); } } else if (nd > 25) s.m = Math.min(85, s.m + 0.35 * DT);
    if (s.m < 22) { s.state = 'flee'; s.fleeT = B.t; B.stats.routs++; return; }
    if (u.hidden) return;
    // 目標：持ち場の中で、近い敵（交戦の範囲 u.eng 以内）。隠れた敵・見えない敵は狙えない
    const W = WEAPON[s.w]; let tgt = null, td = 1e9;
    const R = s.w === 'bow' ? W.range : Math.max(u.eng, 3);
    if (R > 0) near(B, s.x, s.y, R, e => { if (e.side === s.side || e.state !== 'ok') return; const d = hyp(e.x - s.x, e.y - s.y); if (d > R || d >= td) return; if (e.hidden && d > 35) return; if (s.w === 'bow' && !B.field.los(s.x, s.y, e.x, e.y)) return; tgt = e; td = d; });
    const reach = s.w === 'bow' ? W.range : W.reach;
    if (tgt && s.w !== 'bow' && u.mode !== 'retreat') {
      face(s, Math.atan2(tgt.y - s.y, tgt.x - s.x));
      if (td > reach * 0.9) { const v = (u.mode === 'charge' ? SP.chase : SP.jog) * DT; s.x += (tgt.x - s.x) / td * v; s.y += (tgt.y - s.y) / td * v; s.still = false; }
      else if (s.cd <= 0) { s.cd = W.cd; if (B.rnd() < W.acc) { let dmg = W.dmg[0] + B.rnd() * (W.dmg[1] - W.dmg[0]); if (s.mounted && s.w === 'lance') dmg *= 1 + HORSE.charge * clamp((hyp(s.vx || 0, s.vy || 0) - 3) / 5, 0, 1); applyDamage(B, s, tgt, dmg, u); } }
    } else if (tgt && s.w === 'bow' && u.mode !== 'retreat') {
      face(s, Math.atan2(tgt.y - s.y, tgt.x - s.x));
      if (s.cd <= 0 && td > 5 && s.ar > 0) { s.cd = W.cd; s.ar--; const hit = W.acc * clamp(1 - td / (W.range * 1.15), 0.05, 1) * (B.field.coverAt(tgt.x, tgt.y) === 2 ? 0.5 : 1) * (tgt.still ? 1 : 0.7); if (B.rnd() < hit) applyDamage(B, s, tgt, W.dmg[0] + B.rnd() * (W.dmg[1] - W.dmg[0]), u); }
    }
    let busyW = false;
    if (!tgt && s.w !== 'bow' && B.wagons.length && u.mode !== 'retreat') {
      let wg = null, wd = 1e9; const WR = Math.max(u.eng, 3) + 4; for (const q of B.wagons) if (q.state === 'ok' && q.side !== s.side) { const d = hyp(q.x - s.x, q.y - s.y); if (d < WR && d < wd) { wg = q; wd = d; } }
      if (wg) { busyW = true; face(s, Math.atan2(wg.y - s.y, wg.x - s.x)); if (wd > W.reach * 0.9 + 2) { const v = SP.jog * DT; s.x += (wg.x - s.x) / wd * v; s.y += (wg.y - s.y) / wd * v; s.still = false; } else if (s.cd <= 0) { s.cd = W.cd; wg.hp -= W.dmg[0] + B.rnd() * (W.dmg[1] - W.dmg[0]); if (wg.hp <= 0) { wg.state = 'lost'; wg.t = B.t; B.stats.wagonsLost++; B.log.push({ t: B.t, e: 'wagonLost', side: wg.side }); } } }
    }
    if ((!tgt && !busyW) || s.w === 'bow' || u.mode === 'retreat') {
      // 隊形の位置へ
      const c = Math.cos(u.facing), sn = Math.sin(u.facing), rx = sn, ry = -c, fx = c, fy = sn, wx = u.x + rx * s.slot[0] + fx * s.slot[1], wy = u.y + ry * s.slot[0] + fy * s.slot[1];
      const d = hyp(wx - s.x, wy - s.y);
      if (d > 0.4) { const base = u.mode === 'charge' ? SP.jog : u.mode === 'retreat' ? SP.retreat : SP.walk, v = Math.min(d, (d > 6 ? (u.mode === 'retreat' ? SP.retreat : SP.jog) : base * (0.8 + Math.min(1, d / 4) * 0.5)) * DT) * clamp(1 - B.field.slopeAt(s.x, s.y) * 0.6, 0.4, 1); s.x += (wx - s.x) / d * v; s.y += (wy - s.y) / d * v; s.still = false; if (!tgt) face(s, d > 2 ? Math.atan2(wy - s.y, wx - s.x) : u.facing); }
      else if (!tgt) face(s, u.facing);
    }
    if (cs0 > 0) { s.x = px + (s.x - px) * HORSE.coverSlow; s.y = py + (s.y - py) * HORSE.coverSlow; }   // 馬は森の中で遅い
    s.vx = (s.x - px) / DT; s.vy = (s.y - py) / DT;
  }

  // ---------------------------------------------------------------- 指揮官のAI（方針）
  function think(B, c) {
    const units = B.units.filter(u => u.side === c.side && u.members.some(s => s.state === 'ok'));
    if (c.doctrine === 'frontal') {
      if (!c.plan) { c.plan = 'deployed'; }
      // 敵の見積り（報告が届いた分）または、反対側へ向けて前進する
      const tgt = c.est || c.guess;
      if (B.t >= (c.advanceAt == null ? 20 : c.advanceAt) && B.t - c.lastAdv >= 25 && tgt) { c.lastAdv = B.t; units.forEach((u, i) => issue(B, c.side, u, { type: 'advance', x: clamp(tgt.x, 40, B.field.size - 40), y: clamp(tgt.y + (i - (units.length - 1) / 2) * 70, 40, B.field.size - 40) })); }
    } else if (c.doctrine === 'cautious') {
      // 持ち場を守る。前進しない（敵が来るのを待つ）
    } else if (c.doctrine === 'scripted') {
      if (!c.plan) { c.plan = 'sent'; for (const [u, order] of c.script || []) issue(B, c.side, u, order); }
    }
  }

  // ---------------------------------------------------------------- 1ステップ
  function step(B) {
    if (B.ended) return B;
    B.t += DT; buildGrid(B);
    if (B.t - B._visT >= 1) { B._visT = B.t; updateVisibility(B); }
    if (B.t - B._thinkT >= 5) { B._thinkT = B.t; for (const side in B.commanders) think(B, B.commanders[side]); }
    stepMessengers(B); stepWagons(B);
    for (const u of B.units) stepUnit(B, u);
    // 人物は処理順に偏りが出ないよう、ステップごとに並べ替えず、IDの順で（決定的）
    for (const s of B.soldiers) stepSoldier(B, s, B.units.find(q => q.id === s.unit) || B.units[0]);
    // 終了：片側が崩れた（動ける兵が25%未満）
    const eff = {}, tot = {}; for (const s of B.soldiers) { tot[s.side] = (tot[s.side] || 0) + 1; if (s.state === 'ok') eff[s.side] = (eff[s.side] || 0) + 1; }
    for (const side in tot) if ((eff[side] || 0) / tot[side] < 0.25) { B.ended = { t: B.t, loser: +side }; }
    return B;
  }
  function run(B, seconds) { const n = Math.round(seconds / DT); for (let i = 0; i < n && !B.ended; i++) step(B); return B; }

  // ---------------------------------------------------------------- 結果
  function summary(B) {
    const sides = {}; for (const s of B.soldiers) { const o = sides[s.side] || (sides[s.side] = { total: 0, ok: 0, down: 0, flee: 0, rear: 0, flank: 0, front: 0 }); o.total++; if (s.state === 'ok') o.ok++; else if (s.state === 'down') { o.down++; o[s.downBy || 'front']++; } else o.flee++; }
    const wagons = {}; for (const w of B.wagons) { const o = wagons[w.side] || (wagons[w.side] = { total: 0, ok: 0, lost: 0, arrows: 0 }); o.total++; if (w.state === 'ok') { o.ok++; o.arrows += w.arrows; } else o.lost++; }
    return { t: B.t, ended: B.ended, sides, wagons, stats: B.stats, log: B.log };
  }

  // ---------------------------------------------------------------- 画面へ渡す馬と荷馬車（Codex の馬の仕様：speed・歩様・state 0通常/1後ろ脚立ち/2倒れる/3倒れたまま・stateT・rider）
  function viewHorses(B) {
    const horses = [], wagons = [];
    for (const s of B.soldiers) {
      if (!s.horse) continue; const H = s.horse, v = hyp(s.vx || 0, s.vy || 0); let state = 0, stateT = 0;
      if (H.state === 2) { stateT = B.t - H.t; if (stateT >= HORSE.fallSec) state = 3; else state = 2; } else if (H.state === 1) { stateT = B.t - H.t; if (stateT < HORSE.rearSec) state = 1; else { H.state = 0; stateT = 0; } }
      horses.push({ id: s.id, side: s.side, x: s.x, y: s.y, f: s.f, speed: state >= 2 ? 0 : (H.loose ? 0 : v), gait: state >= 2 ? 'idle' : gaitOf(H.loose ? 0 : v), state, stateT, rider: s.mounted ? 1 : 0, riderDown: s.state === 'down' });
    }
    for (const w of B.wagons) { const dead = w.state !== 'ok', stateT = dead ? B.t - w.t : 0; wagons.push({ id: w.id, side: w.side, x: w.x, y: w.y, f: w.f, speed: w.speed, gait: gaitOf(w.speed), state: dead ? (stateT >= HORSE.fallSec ? 3 : 2) : 0, stateT, horses: 2, arrows: w.arrows }); }
    return { horses, wagons };
  }

  // ---------------------------------------------------------------- 場面（試作用の配置）
  // 被覆（森など）を、戦場に重ねる
  function stampPatches(F, patches) { const n = F.n, res = F.res; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = (i + 0.5) * res, y = (j + 0.5) * res; for (const p of patches) if (hyp(x - p.x, y - p.y) <= p.r) F.cover[j * n + i] = Math.max(F.cover[j * n + i], p.c == null ? 2 : p.c); } }
  const W20 = [['spear', true, 10], ['spear', false, 4], ['sword', true, 2], ['bow', false, 4]];   // 20人の部隊
  // kind：'trickster'（Bが偽装撤退と伏兵）／'hold'（Bは持ち場を守る）／'attack'（Bが前進して攻める）。o.A＝西の軍（規律・指揮の方針）、o.field＝使う戦場（無ければ作る）
  function scenario(kind, seed, o) {
    o = o || {};
    const jig = (k) => (makeRng(seed * 7 + k)() - 0.5) * 60;
    const patches = [{ x: 1330 + jig(1) * 0.5, y: 670 + jig(2) * 0.3, r: 55 }, { x: 1330 + jig(3) * 0.5, y: 930 + jig(4) * 0.3, r: 55 }, { x: 900 + jig(5) * 4, y: 300 + jig(6) * 4, r: 80 }, { x: 700 + jig(7) * 3, y: 1250 + jig(8) * 3, r: 70 }];
    let F = o.field; if (F) stampPatches(F, patches); else F = makeField({ seed, size: 1600, hill: 8, patches });
    const B = create(F, seed), A = o.A || {}, aUnits = [];
    for (let i = 0; i < 3; i++) aUnits.push(addUnit(B, { side: 1, x: 250, y: 700 + i * 100, facing: 0, weapons: W20, discipline: A.discipline == null ? 0.1 : A.discipline, name: 'A' + i }));
    const ca = addCommander(B, 1, { x: 150, y: 800, doctrine: A.doctrine || 'frontal' }); ca.guess = { x: 1400, y: 800 }; ca.advanceAt = A.advanceAt;
    if (kind === 'trickster') {
      const bait = addUnit(B, { side: 2, x: 1100, y: 800, facing: Math.PI, weapons: W20, discipline: 0.9, name: 'bait' });
      const a1 = addUnit(B, { side: 2, x: 1420, y: 660, facing: Math.PI, weapons: W20, discipline: 0.9, name: 'amb1' });
      const a2 = addUnit(B, { side: 2, x: 1420, y: 940, facing: Math.PI, weapons: W20, discipline: 0.9, name: 'amb2' });
      const cb = addCommander(B, 2, { x: 1500, y: 800, doctrine: 'scripted' });
      cb.script = [[bait, { type: 'feint', x: 1100, y: 800, facing: Math.PI, contactR: 70, engageSec: 12, rx: 1480, ry: 800, turnFacing: Math.PI }], [a1, { type: 'ambush', x: patches[0].x, y: patches[0].y, facing: Math.PI / 2, springR: 160, minEnemies: 8 }], [a2, { type: 'ambush', x: patches[1].x, y: patches[1].y, facing: -Math.PI / 2, springR: 160, minEnemies: 8 }]];
    } else {
      for (let i = 0; i < 3; i++) addUnit(B, { side: 2, x: 1350, y: 700 + i * 100, facing: Math.PI, weapons: W20, discipline: kind === 'attack' ? 0.3 : 0.9, name: 'B' + i });
      const cb = addCommander(B, 2, { x: 1500, y: 800, doctrine: kind === 'attack' ? 'frontal' : 'cautious' }); cb.guess = { x: 250, y: 800 }; cb.advanceAt = 10;
    }
    return B;
  }
  const api = { scenario, stampPatches, W20, face, hitFactor, angDiff, DT, makeRng, makeField, fieldFromWorld, create, addUnit, addTrain, addCommander, issue, viewHorses, gaitOf, HORSE, SPEED_M, step, run, summary, WEAPON, SPEED, unitCenter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohBattle = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
