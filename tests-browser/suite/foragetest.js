const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 402 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(2500);
  const spots = await p.evaluate(() => { const w = window.__geo.world, W = w.stats.width, H = w.stats.height, env = w.fauna.env, cc = w.climate.cell, step = Math.round(W / cc.w); let f = null, c = null, g = null;
    for (let y = 40; y < H - 40; y += 3) for (let x = 40; x < W - 40; x += 3) { const i = y * W + x; if (!w.type[i]) continue; const ci = Math.floor(y / step) * cc.w + Math.floor(x / step);
      if (!f && env.forest[ci] > 200) f = { x, y };
      if (!g && env.grass[ci] > 200) g = { x, y };
      if (!c) { for (let d = 1; d <= 1; d++) if (!w.type[i + d] || !w.type[i + d * W]) c = { x, y }; } }
    return { f, c, g }; });
  console.log('場所', JSON.stringify(spots));
  const at = async (s) => { await p.evaluate(([x, y]) => window.__wohAvatar.toBlock(x, y, 0, 0), [s.x, s.y]); await p.waitForTimeout(1500); };
  const click = async (id, n) => { for (let i = 0; i < n; i++) { await p.evaluate((i) => document.getElementById(i).click(), id); await p.waitForTimeout(800); } };
  const state = () => p.evaluate(() => ({ msg: document.getElementById('forageMsg').textContent, bag: document.getElementById('bagPanel').innerText.replace(/\n+/g, ' / ') }));
  // 森
  await at(spots.f); await click('fgFood', 8); console.log('森・食料', JSON.stringify(await state()));
  await click('fgMat', 4); console.log('森・素材', JSON.stringify(await state()));
  // 海辺
  if (spots.c) { await at(spots.c); await click('fgFood', 8); console.log('海辺・食料', JSON.stringify(await state())); }
  // 持ち物パネル
  await p.evaluate(() => document.getElementById('fgBag').click()); console.log('持ち物パネル表示', await p.evaluate(() => document.getElementById('bagPanel').classList.contains('show')), (await state()).bag);
  // 保存→読み込み
  const saved = await p.evaluate(() => JSON.parse(JSON.stringify(window.__geo.serializeState())).forage);
  console.log('保存された持ち物', JSON.stringify(saved && saved.inv), 'seq', saved && saved.seq);
  // 捨てる
  await p.evaluate(() => { const b = document.querySelector('#bagPanel [data-drop]'); if (b) b.click(); });
  console.log('捨てた後', (await state()).bag);
  // 月が変わると回復
  await p.click('#bagClose'); await at(spots.f); await p.evaluate(() => window.__geo.skipDays(31)); await p.waitForTimeout(1500);
  await click('fgFood', 3); console.log('翌月', JSON.stringify(await state()));
  await p.screenshot({ path: WOH.out('forage_0.png') });
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
