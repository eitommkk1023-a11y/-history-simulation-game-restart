'use strict';
// 継承の決まり（7種）の単体テスト：手で作った家族で、期待どおりの跡継ぎが選ばれるかを確かめる
const { Population } = require('./npc-core.js'), P = require('./people-core.js');
const NONE = 0xffffffff; let fail = 0;
function family(rule, playerSex) {
  const N = new Population(1, 3, 100); N.day = 360 * 100;
  const add = (sex, ageY, m, f) => { const i = N._add(1, sex, N.day - ageY * 360, m, f); N.eth[i] = 1; return i; };
  N.groupEth[1] = 1;
  const player = add(playerSex, 50, NONE, NONE), mate = add(playerSex ? 0 : 1, 48, NONE, NONE);
  const sib = add(1, 45, NONE, NONE);   // 弟（親は不明でも兄弟として扱うため、親を作る）
  const mom = add(0, 80, NONE, NONE), dad = add(1, 82, NONE, NONE); N.mother[player] = mom; N.father[player] = dad; N.mother[sib] = mom; N.father[sib] = dad;
  const sister = add(0, 52, NONE, NONE); N.mother[sister] = mom; N.father[sister] = dad;
  const parentF = playerSex ? mate : player, parentM = playerSex ? player : mate;
  const c = [add(0, 26, parentF, parentM), add(1, 22, parentF, parentM), add(0, 10, parentF, parentM)];   // 長女26・長男22・末娘10
  const niece = add(0, 20, sister, NONE), nephew = add(1, 18, NONE, sib);
  N.death[mom] = 1; N.death[dad] = 1;   // 親は亡くなっている
  const people = { npc: N, ethnicities: [{ id: 1, adultAge: 18, succession: rule }], player: { designated: null } };
  return { people, player, c, sib, sister, niece, nephew };
}
function expect(label, got, want) { const ok = got === want; if (!ok) fail++; console.log((ok ? '○' : '×') + ' ' + label + (ok ? '' : `（期待 ${want}、結果 ${got}）`)); }
{ const f = family(0, 1); expect('長子相続：最年長の子（長女）', P.peFindHeir(f.people, f.player).id, f.c[0]); }
{ const f = family(1, 1); expect('男系長子：最年長の息子（長男）', P.peFindHeir(f.people, f.player).id, f.c[1]); }
{ const f = family(2, 1); const h = P.peFindHeir(f.people, f.player); expect('末子相続：末子（10歳）。未成年なので後見つき', h.id === f.c[2] && h.minor, true); }
{ const f = family(3, 0); expect('母系相続（女性）：長女', P.peFindHeir(f.people, f.player).id, f.c[0]); }
{ const f = family(3, 1); expect('母系相続（男性）：姉妹の子（姪）', P.peFindHeir(f.people, f.player).id, f.niece); }
{ const f = family(4, 1); expect('兄弟相続：年長のきょうだい（姉）', P.peFindHeir(f.people, f.player).id, f.sister); }
{ const f = family(5, 1); const h = P.peFindHeir(f.people, f.player); expect('選出：血縁の成人から（子・きょうだい・甥姪）', [f.c[0], f.c[1], f.sib, f.sister, f.niece, f.nephew].includes(h.id), true); }
{ const f = family(6, 1); f.people.player.designated = f.nephew; expect('指名：指名された人（甥）', P.peFindHeir(f.people, f.player).id, f.nephew); }
{ const f = family(6, 1); expect('指名（指名なし）：血縁の成人', [f.c[0], f.c[1], f.sib, f.sister, f.niece, f.nephew].includes(P.peFindHeir(f.people, f.player).id), true); }
{ const f = family(0, 1); const N = f.people.npc; for (const i of f.c) N.death[i] = 1; N.death[f.sister] = 1; N.death[f.sib] = 1; expect('子・きょうだいが亡くなっていれば甥姪', [f.niece, f.nephew].includes(P.peFindHeir(f.people, f.player).id), true); }
{ const f = family(0, 1); const N = f.people.npc; N.death[f.c[0]] = 1; N.death[f.c[1]] = 1; const h = P.peFindHeir(f.people, f.player); expect('長子相続：成人の子が亡くなっていれば、次の子（末娘・未成年）', h.id === f.c[2] && h.minor, true); }
{ const f = family(0, 1); const N = f.people.npc; for (const i of [...f.c, f.sib, f.sister, f.niece, f.nephew]) N.death[i] = 1; expect('血縁がいなければ見つからない（null）', P.peFindHeir(f.people, f.player), null); }
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
