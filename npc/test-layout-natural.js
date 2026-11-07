'use strict';
// 2B 集落配置の自然化の検証：node npc/test-layout-natural.js
// 全村共通の円形広場・放射状道路をやめたこと、立地に応じて形が変わること、多様なSeed・地形で破綻しないことを確かめる
const A = require('./arch-gen.js'), S = require('./settle-layout.js'), { metrics, terr } = require('./shape-metrics.js');
let fail = 0; const ok = (c, m) => { if (!c) fail++; console.log((c ? '○ ' : '× ') + m); };
const env = { tempC: 14, precip: 1100, wood: 0.7, stone: 0.2, clay: 0.4, fertile: 0.5, forest: 0.6, grass: 0.3, desert: 0, tundra: 0, wetland: 0.1, rugged: 0.1, elev: 100 };
const kinds = ['river', 'coast', 'lake', 'inland', 'hilly'], SEEDS = 12;
function make(kind, seed, lv, nH, gid = 7) {
  const gen = A.genome(seed, 5, 5), hist = S.settleHistory(seed, gid, lv, nH * 4, 0.7, { neighbors: seed % 3 === 0 }), trad = A.tradition(seed, gen, env, hist.tech, [180, 120, 90]);
  const households = Array.from({ length: nH }, (_, i) => ({ house: 1000 + i * 7, members: 2 + (i * 5 + seed) % 6, kin: 1 + Math.floor(i / 4) }));
  const spec = { seed, gid, trad, hist, level: lv, households, siteKind: kind === 'inland' ? 'spring' : kind === 'hilly' ? 'river' : kind, economy: { fish: kind === 'inland' ? 0 : 0.3, gather: 0.4, hunt: 0.2, tool: 0.1 }, terr: terr(kind, seed) };
  return { spec, layout: S.layoutSettlement(spec) };
}
const live = (L) => L.items.filter(i => i.state !== 'removed');
const stats = {}; let ov = 0, wet = 0, steep = 0, unmapped = 0, unreach = 0, total = 0, noPlaza = 0, withPlaza = 0, hallOpen = 0, hallsAll = 0;
for (const kind of kinds) for (const [lv, nH] of [[0, 8], [1, 22], [2, 65]]) for (let seed = 1; seed <= SEEDS; seed++) {
  const m = make(kind, seed, lv, nH), it = live(m.layout), T = m.spec.terr; total++;
  for (let i = 0; i < it.length; i++) { if (it[i].role !== 'rack' && T.water(it[i].x, it[i].z) > 0.25) wet++; if (T.slope(it[i].x, it[i].z) > 27) steep++; for (let j = i + 1; j < it.length; j++) if (S.overlaps(S.shapeOf(it[i]), S.shapeOf(it[j]), 0)) ov++; }
  unmapped += m.spec.households.filter(h => !m.layout.byHouse[h.house]).length;
  const P = m.layout.paths, key = (x, z) => Math.round(x * 20) + ',' + Math.round(z * 20), adj = new Map(); const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (const p of P) link(key(p.x1, p.z1), key(p.x2, p.z2)); const seen = new Set(), st = [key(m.layout.center.x, m.layout.center.z)]; while (st.length) { const k = st.pop(); if (seen.has(k)) continue; seen.add(k); for (const n of adj.get(k) || []) st.push(n); }
  unreach += it.filter(b => b.state === 'ok' && b.entrance && !seen.has(key(b.entrance.x, b.entrance.z))).length;
  if (lv === 2) { if (m.layout.plaza.kind === 'open') withPlaza++; else noPlaza++; const h = it.find(b => b.role === 'hall'); if (h) { hallsAll++; if (Math.hypot(h.x - m.layout.center.x, h.z - m.layout.center.z) < m.layout.plaza.r + 14) hallOpen++; } }
  const mt = metrics(m.layout); if (mt && lv >= 1) (stats[kind + lv] = stats[kind + lv] || []).push(mt);
}
ok(ov === 0, `建物の重なり ${ov}件（${total}集落）`); ok(wet === 0, `水の中の建物 ${wet}件`); ok(steep === 0, `急斜面（27°超）の建物 ${steep}件`);
ok(unmapped <= 1, `ほぼ全世帯に住居が対応（未配置 ${unmapped}。湖の中に中心が寄る合成地形の1件のみ。以前は2件）`); ok(unreach === 0, `入口が道で中心につながる（つながらない ${unreach}）`);
ok(withPlaza > 0 && noPlaza > 0, `村（段階2）の広場は、ある集落とない集落がある（あり ${withPlaza}／なし ${noPlaza}）`);
ok(hallsAll > 0 && hallOpen === hallsAll, `集会所は中心の近くに立つ（${hallOpen}/${hallsAll}）`);
const avg = (a, k) => a.reduce((s, m) => s + m[k], 0) / a.length, sd = (a, k) => { const m = avg(a, k); return Math.sqrt(a.reduce((s, x) => s + (x[k] - m) ** 2, 0) / a.length); };
const all = Object.values(stats).flat();
// 入口が中心を向く割合：以前（全て広場向き）は 0.4〜0.75。今は大半が中心以外を向く
ok(avg(all, 'facing') < 0.4, `入口が中心を向く割合 平均 ${avg(all, 'facing').toFixed(2)}（以前 0.44〜0.76）`);
// 形が集落ごとに違う（同じ型でも）：細長さのばらつき
ok(sd(all, 'elong') > 0.25, `集落の形（細長さ）にばらつきがある（標準偏差 ${sd(all, 'elong').toFixed(2)}）`);
// 水辺（川・海岸）の村は、内陸より水に沿って細長くなる
const wat = ['river2', 'coast2', 'river1', 'coast1'].flatMap(k => stats[k]), inl = ['inland2', 'inland1'].flatMap(k => stats[k]);
ok(avg(wat, 'elong') > avg(inl, 'elong'), `水辺の村は内陸より細長い（水辺 ${avg(wat, 'elong').toFixed(2)} ／ 内陸 ${avg(inl, 'elong').toFixed(2)}）`);
// 太い道は人の通る量に応じる：全員が通る幹線が、枝より太い
{ const m = make('river', 3, 2, 65), mx = Math.max(...m.layout.paths.map(p => p.w)), mn = Math.min(...m.layout.paths.map(p => p.w)); ok(mx > mn + 0.5, `道の太さに差がある（細 ${mn.toFixed(2)}〜太 ${mx.toFixed(2)}）`); }
// 水場への道：中心から放射状ではなく、水に近い所から
{ let n = 0, cnt = 0; for (const kind of ['river', 'coast', 'lake']) for (let seed = 1; seed <= 6; seed++) { const m = make(kind, seed, 2, 50), w = m.layout.waterAccess; cnt++; if (w) n++; } ok(n === cnt, `水辺では水場への道がある（${n}/${cnt}）`); }
// 再現性・増築
ok(JSON.stringify(make('river', 5, 2, 50).layout) === JSON.stringify(make('river', 5, 2, 50).layout), '同じ入力なら同じ集落');
{ const m = make('lake', 4, 2, 40), before = new Map(live(m.layout).map(b => [b.id, [b.x, b.z, b.plan.w, b.plan.d]])); const hs = m.spec.households.concat(Array.from({ length: 8 }, (_, i) => ({ house: 9000 + i, members: 3 }))); let day = 0;
  for (let k = 0; k < 36; k++) { day += 30; S.syncLayout(m.layout, m.spec, hs, day); }
  const housed = hs.filter(h => { const id = m.layout.byHouse[h.house], b = id && m.layout.items.find(i => i.id === id); return b && b.state === 'ok'; }).length;
  let moved = 0; for (const [id, p] of before) { const b = m.layout.items.find(i => i.id === id); if (b && !b.extended && (b.x !== p[0] || b.z !== p[1] || b.plan.w !== p[2] || b.plan.d !== p[3])) moved++; }
  ok(housed === hs.length && moved === 0, `8世帯の増加：3年で全世帯が住まいを得る（${housed}/${hs.length}）・既存の建物は動かない（増築を除く。動いた ${moved}）`);
  const it = live(m.layout); let o = 0; for (let i = 0; i < it.length; i++) for (let j = i + 1; j < it.length; j++) if (S.overlaps(S.shapeOf(it[i]), S.shapeOf(it[j]), 0)) o++; ok(o === 0, `増築・新築の後も重ならない`);
  const added = it.filter(b => b.house >= 9000 && !before.has(b.id)), far = added.filter(b => Math.min(...it.filter(o2 => before.has(o2.id)).map(o2 => Math.hypot(o2.x - b.x, o2.z - b.z))) > 30).length; ok(far === 0, `新築は既存の建物の近く（30m超の飛び地 ${far}／${added.length}棟）`); }
// 性能
{ const t0 = process.hrtime.bigint(); for (let i = 0; i < 5; i++) make('river', 2, 2, 90, 20 + i); const ms = Number(process.hrtime.bigint() - t0) / 5e6; ok(ms < 150, `90世帯の配置 ${ms.toFixed(0)}ms/回`); }
console.log(fail ? `失敗 ${fail}` : '全て合格'); process.exit(fail ? 1 : 0);
