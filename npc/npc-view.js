'use strict';
// 周辺の住民を3Dで見せるための、描画に依存しない部分：誰を描くか・どこにいるか（保存しない。個人ID・世帯・職業・時刻から計算）・タップしたときの説明。
// 位置は「野営地の中心からの距離（メートル、3Dの世界のメートル）」。視覚上の1日は DAY_SEC 秒（現実の時間）で、世界の暦とは別。
(function (root) {
const Npc = typeof require !== 'undefined' ? require('./npc-core.js') : root.WohNpc;
const { mix, JOBS, NSKILL } = Npc, NONE = 0xffffffff, ALIVE = 0x7fffffff;
const DAY_SEC = 600;
const rnd = (a, b, c) => mix(a, b, c, 909) / 4294967296;
const smooth = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
// 家（0）から仕事場所（1）への移動の割合：夜は家、日の出から少しで出かけ、日没の前に帰る
function workPhase(t) { if (t < 0.2 || t >= 0.8) return 0; if (t < 0.28) return smooth((t - 0.2) / 0.08); if (t < 0.72) return 1; return 1 - smooth((t - 0.72) / 0.08); }
// 振る舞い：home＝家の周り（子ども・引退した人）／wander＝野営地の周りを歩き回る（採集・農・牧畜）／away＝日中は遠くへ出る（狩人・漁師）／guard＝野営地の周りを巡回／camp＝野営地の近く
function role(P, i) {
  if (P.age(i) < P.adultAge(i) - 4) return 'home';
  const j = P.job[i]; if (!j) return 'home';
  return j === 1 || j === 9 || j === 10 ? 'wander' : j === 2 || j === 3 ? 'away' : j === 8 ? 'guard' : 'camp';
}
// 世帯の家の位置（野営地の中心から、メートル）。住民は、この家の近くで夜を過ごす
function homeBase(P, hh) { const ha = rnd(P.seed, hh, 1) * Math.PI * 2, hr = 7 + rnd(P.seed, hh, 2) * 36; return { x: Math.cos(ha) * hr, z: Math.sin(ha) * hr, rot: rnd(P.seed, hh, 8) * Math.PI * 2 }; }
// 近くの集団ごとの世帯：groupSet に入る集団の、生きている人から数える。Map(集団 → Map(世帯 → 人数))
function viewHouseholds(people, groupSet) {
  const P = people.npc, out = new Map(); for (const g of groupSet) out.set(g, new Map());
  for (let i = 0; i < P.n; i++) { if (P.death[i] !== ALIVE) continue; const m = out.get(P.group[i]); if (!m) continue; const hh = P.house[i] !== NONE ? P.house[i] : i; m.set(hh, (m.get(hh) || 0) + 1); }
  return out;
}
function rawPos(P, i, t) {
  const seed = P.seed, hh = P.house[i] !== NONE ? P.house[i] : i;
  const hb = homeBase(P, hh), hx = hb.x + (rnd(seed, i, 3) - 0.5) * 6, hz = hb.z + (rnd(seed, i, 4) - 0.5) * 6;
  const r = role(P, i), s = workPhase(t), ph = rnd(seed, i, 5) * Math.PI * 2, aw = rnd(seed, i, 6) * Math.PI * 2, rw = rnd(seed, i, 7), T = Math.PI * 2;
  let wx = hx, wz = hz, dx = 0, dz = 0;
  if (r === 'home') { dx = 4 * Math.sin(T * t * 10 + ph); dz = 4 * Math.cos(T * t * 8 + ph); return { x: hx + dx, z: hz + dz, role: r }; }
  if (r === 'wander') { const R = 70 + rw * 110; wx = Math.cos(aw) * R; wz = Math.sin(aw) * R; dx = 12 * Math.sin(T * t * 20 + ph); dz = 12 * Math.cos(T * t * 17 + ph); }
  else if (r === 'away') { const R = 230 + rw * 70; wx = Math.cos(aw) * R; wz = Math.sin(aw) * R; }
  else if (r === 'guard') { const a = aw + T * t * 4; wx = Math.cos(a) * 45; wz = Math.sin(a) * 45; }
  else { const R = 10 + rw * 30; wx = Math.cos(aw) * R; wz = Math.sin(aw) * R; dx = 3 * Math.sin(T * t * 12 + ph); dz = 3 * Math.cos(T * t * 9 + ph); }
  return { x: hx + (wx + dx - hx) * s, z: hz + (wz + dz - hz) * s, role: r };
}
// 位置（野営地の中心からのメートル）、向き、歩いているか
function viewPosition(P, i, t) {
  const a = rawPos(P, i, t), b = rawPos(P, i, (t + 0.002) % 1), ddx = b.x - a.x, ddz = b.z - a.z, sp = Math.hypot(ddx, ddz) / (0.002 * DAY_SEC);
  return { x: a.x, z: a.z, heading: sp > 0.02 ? Math.atan2(ddx, ddz) : 0, moving: sp > 0.25, speed: sp, role: a.role };
}
// 描く人の候補：groupSet に入る集団の、生きている人。上限 cap
function viewCandidates(people, groupSet, cap) {
  const P = people.npc, out = [];
  for (let i = 0; i < P.n && out.length < cap; i++) if (P.death[i] === ALIVE && groupSet.has(P.group[i])) out.push(i);
  return out;
}
// 民族の色（服の色）。[r,g,b] 0〜255
function viewColor(people, i) { const e = people.ethnicities[(people.npc.eth[i] || people.npc.groupEth[people.npc.group[i]]) - 1]; return e && e.color ? e.color : [160, 160, 160]; }
// 見た目の高さの割合（年齢）：2歳で約45%、15歳で100%
function viewScale(P, i) { const a = P.age(i); return a >= 15 ? 1 : 0.45 + 0.55 * Math.max(0, a - 1) / 14; }
// プレイヤーの人物から見た関係
function relation(people, id) {
  const P = people.npc, me = people.player && people.player.id; if (me === undefined || me < 0) return '';
  if (id === me) return 'あなた';
  const m = P.mother[me], f = P.father[me], sp = P.spouse[me];
  if (sp === id) return '配偶者';
  if (P.mother[id] === me || P.father[id] === me) return '子';
  if ((m !== NONE && id === m) || (f !== NONE && id === f)) return '親';
  const sib = (x, y) => (P.mother[x] !== NONE && P.mother[x] === P.mother[y]) || (P.father[x] !== NONE && P.father[x] === P.father[y]);
  if (sib(id, me)) return 'きょうだい';
  const pm = P.mother[id], pf = P.father[id];
  if ((pm !== NONE && (P.mother[pm] === me || P.father[pm] === me)) || (pf !== NONE && (P.mother[pf] === me || P.father[pf] === me))) return '孫';
  if ((pm !== NONE && sib(pm, me)) || (pf !== NONE && sib(pf, me))) return '甥・姪';
  if (sp !== NONE && (P.mother[sp] === id || P.father[sp] === id)) return '配偶者の親';
  if (P.house[id] !== NONE && P.house[id] === P.house[me]) return '同じ世帯';
  if (P.group[id] === P.group[me]) return '同じ集団';
  return '他の集団';
}
// 気持ちの強さを言葉に（0〜255、128が普通）
const level = (v) => v < 80 ? '低い' : v < 112 ? 'やや低い' : v < 144 ? 'ふつう' : v < 176 ? 'やや高い' : '高い';
// あなたから見た、その人への気持ち（信頼・好意・尊敬）：家族は決まった値、それ以外は交流の記録。なければ null
function bond(people, id) {
  const P = people.npc, me = people.player && people.player.id; if (me === undefined || me < 0 || id === me) return null;
  const rel = relation(people, id), kin = { '配偶者': [210, 200, 170], '子': [200, 200, 160], '親': [200, 190, 200], 'きょうだい': [190, 180, 150], '孫': [190, 200, 150], '甥・姪': [170, 170, 150], '配偶者の親': [160, 140, 170] }[rel];
  const b = P.bondOf(me, id); if (b) return b;
  return kin || null;
}
const bondText = (b) => b ? `信頼 ${level(b[0])}／好意 ${level(b[1])}／尊敬 ${level(b[2])}` : '（まだ付き合いがない）';
// タップしたときの説明
function viewDescribe(people, id) {
  const P = people.npc, a = Math.floor(P.age(id)), j = P.job[id], ad = P.adultAge(id);
  const job = a < ad - 4 ? (a < 10 ? '子ども' : '見習い前') : !j ? (P.flags[id] & 8 ? '引退' : '無職') : JOBS[j].name;
  const sk = []; for (let k = 0; k < NSKILL; k++) { const v = P.skills[id * NSKILL + k]; if (v > 0) sk.push([JOBS[k + 1].skill, v]); } sk.sort((x, y) => y[1] - x[1]);
  const e = people.ethnicities[(P.eth[id] || P.groupEth[P.group[id]]) - 1];
  return { id, age: a, sex: P.sex[id] === 1 ? '男' : '女', job, relation: relation(people, id), skills: sk.slice(0, 3).map(([n, v]) => n + ' ' + v), eth: e ? e.id : 0, married: P.spouse[id] !== NONE, leader: !!(people.groups[P.group[id] - 1] && people.groups[P.group[id] - 1].leader === id), council: !!(people.groups[P.group[id] - 1] && (people.groups[P.group[id] - 1].council || []).includes(id)), bond: bondText(bond(people, id)), isYou: !!people.player && people.player.id === id };
}
const api = { homeBase, viewHouseholds, bond, bondText, DAY_SEC, workPhase, role, viewPosition, viewCandidates, viewColor, viewScale, relation, viewDescribe };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohNpcView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
