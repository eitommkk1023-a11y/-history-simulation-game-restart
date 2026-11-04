'use strict';
// 提案の通りやすさ：node npc/test-proposal.js <generator.js> <world.bin>
const v8 = require('v8'), fs = require('fs'), path = require('path');
const G = require(path.resolve(process.argv[2])), world = v8.deserialize(fs.readFileSync(process.argv[3]));
const P = require('./people-core.js');
const env = world.fauna.env, cc = world.climate.cell, res = world.resources, plantFood = (c, m, out) => G.faunaPlantFood(env, cc, c, m, out, 0, 0);
const FA = { faunaHunt: G.faunaHunt, faunaDensity: G.faunaDensity, ANIMAL_SPECIES: G.ANIMAL_SPECIES }, fauna = G.faunaClone(world.fauna);
const people = P.peopleGenerate(42, { world, plantFood, fauna, FA }), N = people.npc, ALIVE = 0x7fffffff;
for (let i = 0; i < 24; i++) { G.faunaMonthly(fauna, { month: i % 12, env, cc }); P.peopleMonthly(people, { month: i % 12, day: i * 30, world, fauna, FA, plantFood, env, cc, res }); }
// 候補：集団ごとの成人の提案者（首長と一般）
const stats = {}; const add = (key, r) => { const o = stats[key] || (stats[key] = { n: 0, pass: 0, sup: 0, opp: 0 }); o.n++; o.pass += r.passed ? 1 : 0; o.sup += r.support; o.opp += r.leaderOppose ? 1 : 0; };
const rng = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
const adultsBy = new Map(); for (let i = 0; i < N.n; i++) if (N.death[i] === ALIVE && N.age(i) >= N.adultAge(i)) { const g = N.group[i]; if (!adultsBy.has(g)) adultsBy.set(g, []); adultsBy.get(g).push(i); }
const day = N.day; let tries = 0;
for (const g of people.groups) {
  if (!g.alive) continue; const A = adultsBy.get(g.id) || []; if (A.length < 6) continue;
  for (const role of ['leader', 'member', 'member', 'member']) {
    const proposer = role === 'leader' ? g.leader : A[Math.floor(rng() * A.length)]; if (proposer === undefined || proposer < 0 || N.death[proposer] !== ALIVE || proposer === g.leader && role === 'member') continue;
    people.player = { id: proposer, over: false, proposalReady: 0, dynasty: [proposer] };
    for (const kind of ['hunt', 'gather', 'fish', 'auto', 'migrate']) {
      const save = { policy: g.policy, moveTo: g.moveTo }; const ctx = { world, x: g.x + (rng() - 0.5) * 50, y: g.y + (rng() - 0.5) * 50 };
      people.player.proposalReady = 0; const r = P.peopleProposal(people, kind, ctx); tries++; g.policy = save.policy; g.moveTo = save.moveTo;
      if (!r.ok) { add('無効:' + r.reason, { passed: false, support: 0 }); continue; }
      const hungry = g.hunger >= 2 ? '飢え' : '食料あり';
      add(`${role === 'leader' ? '首長' : '一般'}・${kind === 'migrate' ? '移住(' + hungry + ')' : '方針'}`, r);
    }
  }
}
console.log(`試行 ${tries} 回（集団ごとに、首長1人・一般3人が、5種類を提案）`);
for (const [k, o] of Object.entries(stats).sort()) console.log(`${k.padEnd(18, '　')} ${String(o.n).padStart(4)}回 通った ${(100 * o.pass / o.n).toFixed(0)}% 賛成率の平均 ${(100 * o.sup / o.n).toFixed(0)}%${o.opp ? ` 首長が反対 ${(100 * o.opp / o.n).toFixed(0)}%` : ''}`);
