const WOH = require('../woh-env.js');
// 大きな集落の描画テスト：建物を複製して増やせる／増やすと描く建物が増える／解除で元に戻る／保存に混ざらない／ボタンで一通り動く
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(WOH.url('?small=STR-1')); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(2500);
  let bad = 0; const t = (name, cond, extra) => { if (!cond) bad++; console.log((cond ? 'OK  ' : 'NG  ') + name, extra == null ? '' : extra); };
  const gid = await p.evaluate(() => { const g = __geo.people.groups.filter(x => x.alive).sort((a, c) => c.pop - a.pop)[0]; __wohGodView.flyTo(g.id, 150); return g.id; }); await p.waitForTimeout(9000);
  const items0 = await p.evaluate(() => __wohStress.stats.items); const real = await p.evaluate((id) => __geo.people.groups[id - 1].layout ? __geo.people.groups[id - 1].layout.items.length : -1, gid);
  t('近くの集落に配置がある', real > 0, `建物 ${real}棟、描いた ${items0}`);
  const r = await p.evaluate(() => __wohStress.make(1500)); t('建物を1500棟に増やせる', r.ok && r.n === 1500, JSON.stringify(r));
  await p.waitForTimeout(5000); const items1 = await p.evaluate(() => __wohStress.stats.items); t('増やすと、描く建物が増える', items1 > items0 * 2, `${items0}→${items1}`);
  const sv = await p.evaluate(async () => { const st = __wohZ.serialize(); return { n: st.people.meta.groups.map(g => g.layout ? g.layout.items.length : 0).reduce((a, c) => Math.max(a, c), 0), stress: !!__wohStress.active }; }); t('保存の前に解除され、保存に複製が混ざらない', !sv.stress && sv.n < 1000, JSON.stringify(sv));
  const r2 = await p.evaluate(() => { __wohStress.make(800); const ok = __wohStress.clear(); return { ok, real: __geo.people.groups.filter(g => g.layout && g.layout.stress).length }; }); t('解除で、元の配置に戻る', r2.ok && r2.real === 0);
  await p.evaluate(() => { document.getElementById('godStress').closest('details').open = true; document.getElementById('godStress').click(); });
  await p.waitForFunction(() => /描画テストおわり|エラー/.test(document.getElementById('godBenchOut').value), null, { timeout: 300000 });
  const txt = await p.evaluate(() => document.getElementById('godBenchOut').value); console.log(txt); t('ボタンで一通り動く（建物 0/500/2000/5000 の結果が出る）', /建物 5000棟・引いた/.test(txt) && /建物 500棟・近い/.test(txt) && !/テストでエラー/.test(txt));
  const after = await p.evaluate(() => ({ active: !!__wohStress.active, stress: __geo.people.groups.filter(g => g.layout && g.layout.stress).length })); t('テスト後は、元に戻っている', !after.active && after.stress === 0);
  console.log('errors', JSON.stringify(errs.slice(0, 3))); console.log(bad || errs.length ? 'NG あり' : 'ALL OK'); await b.close(); process.exit(bad || errs.length ? 1 : 0);
})();
