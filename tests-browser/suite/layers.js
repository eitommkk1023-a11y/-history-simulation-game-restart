const WOH = require('../woh-env.js');
// 人口の層（個人・集計）の、ゲームでの動作：方針が働く／近づくとすぐ個人になる／保存→読み込みで集計が保たれる／エラーなし
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.addInitScript(() => { globalThis.__wohConfigPatch = { layers: { cap: 60, activateAbove: 300, focusM: 1500 } }; });
  await p.goto(WOH.url('?small=LAY-1&stage=3')); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(3000);
  let bad = 0; const t = (name, cond, extra) => { if (!cond) bad++; console.log((cond ? 'OK  ' : 'NG  ') + name, extra == null ? '' : extra); };
  const S = () => p.evaluate(() => { const s = WohPeople.peopleLayerSummary(__geo.people); return { ind: s.individuals, agg: Math.round(s.aggregated), tot: Math.round(s.total), pop: Math.round(__geo.people.groups.filter(g => g.alive).reduce((a, g) => a + g.pop, 0)) }; });
  const s0 = await S(); t('設定の上書きが効く（上限60）', await p.evaluate(() => WohConfig.CONFIG.layers.cap === 60), JSON.stringify(s0));
  await p.evaluate(() => { __geo.skipDays(360 * 3); }); await p.waitForTimeout(2000);
  const s1 = await S(); t('3年後：方針が働き、集計の住民がいる', s1.agg > 100, JSON.stringify(s1)); t('個人＋集計＝集団の人口の合計（±2%）', Math.abs(s1.tot / s1.pop - 1) < 0.02, `${s1.tot}／${s1.pop}`);
  // 近づく：集計が最も多い集団へ飛ぶ → すぐ個人になる
  const g = await p.evaluate(() => { const gs = __geo.people.groups.filter(x => x.alive && x.agg).sort((a, c) => c.agg.total() - a.agg.total()); return gs[0] ? { id: gs[0].id, agg: Math.round(gs[0].agg.total()) } : null; }); t('集計の多い集団がある', !!g, JSON.stringify(g));
  if (g) { const ind0 = await p.evaluate((id) => __geo.people.npc.members[id].filter(i => __geo.people.npc.death[i] === 0x7fffffff && __geo.people.npc.group[i] === id).length, g.id); await p.evaluate((id) => __wohGodView.flyTo(id, 120), g.id); await p.waitForTimeout(5000);
    const r = await p.evaluate((id) => { const x = __geo.people.groups[id - 1]; return { agg: Math.round(x.agg ? x.agg.total() : 0), ind: __geo.people.npc.members[id].filter(i => __geo.people.npc.death[i] === 0x7fffffff && __geo.people.npc.group[i] === id).length }; }, g.id);
    t('近づくと、集計の住民がすぐ個人になる', r.agg < g.agg * 0.2 && r.ind > ind0 + g.agg * 0.5, `集計 ${g.agg}→${r.agg}、個人 ${ind0}→${r.ind}`); }
  // 保存→読み込み：集計が保たれる
  const before = await S(); const after = await p.evaluate(async () => { const st = __wohZ.serialize(), z = await __wohZ.pack(st), u = await __wohZ.unpack(z); __geo.applyState(u); const s = WohPeople.peopleLayerSummary(__geo.people); return { ind: s.individuals, agg: Math.round(s.aggregated), tot: Math.round(s.total) }; });
  t('保存→読み込みで、集計の住民が保たれる', Math.abs(after.agg - before.agg) <= 3 && Math.abs(after.tot - before.tot) <= 3, `${before.agg}→${after.agg}`);
  await p.evaluate(() => { __geo.skipDays(360); }); await p.waitForTimeout(1500); const s2 = await S(); t('読み込み後も進められる', s2.tot > 0 && Number.isFinite(s2.tot), JSON.stringify(s2));
  console.log('errors', JSON.stringify(errs.slice(0, 3))); console.log(bad || errs.length ? 'NG あり' : 'ALL OK'); await b.close(); process.exit(bad || errs.length ? 1 : 0);
})();
