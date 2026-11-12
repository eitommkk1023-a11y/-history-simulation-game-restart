const { chromium } = require('playwright'); const D = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/t/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html'); await p.waitForSelector('#titleScreen.show', { timeout: 60000 }); await p.waitForTimeout(800); await p.evaluate(() => document.getElementById('tSmall').click());
  await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 1200000 }); await p.waitForTimeout(3500);
  for (const h of [450, 150]) { await p.evaluate((h) => __wohGodView.setView({ h, pitch: 0.55 }), h); await p.waitForTimeout(12000); console.log(h, '木', await p.evaluate(() => JSON.stringify([__wohTrees.count, __wohTrees.dbg]))); await p.screenshot({ path: D + 'terr_' + h + '.png' }); }
  console.log('errors', errs.slice(0, 3)); await b.close();
})();
