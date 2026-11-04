'use strict';
// プレイヤーの活動の効果：同じ状態から、活動だけを変えて10年進めて比べる。node npc/test-activity.js <generator.js> <world.bin>
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3]));
const P = require('./people-core.js'), Npc = require('./npc-core.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources;
const plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES };
const base = P.peopleGenerate(42, { world, plantFood, fauna: G.faunaClone(world.fauna), FA });
const N0 = base.npc, ALIVE = 0x7fffffff, NONE = 0xffffffff, SI = Npc.SI, NSKILL = Npc.NSKILL;
// 候補：集団ごとに、独身の男性（22〜28歳）を1人（家族の効果を見るため）。12人
const cands = [], seenG = new Set(); for (let i = 0; i < N0.n && cands.length < 12; i++) if (N0.death[i] === ALIVE && N0.sex[i] === 1 && N0.spouse[i] === NONE && N0.age(i) >= 22 && N0.age(i) < 28 && !seenG.has(N0.group[i]) && base.groups[N0.group[i] - 1].fed > 0.95) { cands.push(i); seenG.add(N0.group[i]); }
const names = ['学習力', '筋力', '持久力', '敏捷性', '器用さ'], R = {};   // R[候補][活動]
for (const c of cands) {
  base.player.id = c; base.player.dynasty = [c]; const snap = P.peopleSave(base); R[c] = {};
  for (const [k] of P.ACTIVITIES) {
    const people = P.peopleLoad(snap), N = people.npc; P.peopleSetActivity(people, k); const id = c, fauna = G.faunaClone(world.fauna);
    const s0 = Array.from(N.skills.subarray(id * NSKILL, id * NSKILL + 3)), st0 = names.map(n => N.stat(id, SI[n]));
    let alive = true;
    for (let i = 0; i < 120 && alive; i++) { G.faunaMonthly(fauna, { month: i % 12, env, cc }); P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); if (N.death[id] !== ALIVE) alive = false; }
    if (!alive) continue;
    const s1 = Array.from(N.skills.subarray(id * NSKILL, id * NSKILL + 3)), st1 = names.map(n => N.stat(id, SI[n]));
    let kids = 0; for (let i = 0; i < N.n; i++) if (N.mother[i] === id || N.father[i] === id) kids++;
    R[c][k] = { sk: s1.map((v, j) => v - s0[j]), st: st1.map((v, j) => v - st0[j]), wed: N.spouse[id] !== NONE ? 1 : 0, kids };
  }
}
console.log(`候補 ${cands.length}人。10年後の、「自動」との差の平均（どちらも生きていた候補だけ）`);
for (const [k, name] of P.ACTIVITIES) {
  if (k === 'auto') continue; let n = 0; const d = { sk: [0, 0, 0], st: [0, 0, 0, 0, 0], wed: 0, kids: 0 };
  for (const c of cands) { const a = R[c].auto, b = R[c][k]; if (!a || !b) continue; n++; for (let j = 0; j < 3; j++) d.sk[j] += b.sk[j] - a.sk[j]; for (let j = 0; j < 5; j++) d.st[j] += b.st[j] - a.st[j]; d.wed += b.wed - a.wed; d.kids += b.kids - a.kids; }
  n = Math.max(1, n); console.log(`${name.padEnd(6, '　')} 技能(採集/狩/漁) ${d.sk.map(v => (v / n >= 0 ? '+' : '') + (v / n).toFixed(0)).join('/')}  能力(学習/筋/持久/敏捷/器用) ${d.st.map(v => (v / n >= 0 ? '+' : '') + (v / n).toFixed(1)).join('/')}  結婚 ${(d.wed / n >= 0 ? '+' : '') + (100 * d.wed / n).toFixed(0)}pt  子 ${(d.kids / n >= 0 ? '+' : '') + (d.kids / n).toFixed(1)}人  （${n}人）`);
}
