const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?small=LK-2'); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(4000);
  const t0 = await p.evaluate(() => document.getElementById('godSrc').textContent.slice(0, 120)); console.log('一覧', t0);
  const v0 = await p.evaluate(() => __wohGodView.state); await p.evaluate(() => { document.getElementById('godSrc').closest('details').open = true; document.querySelector('#godSrc [data-rs]').click(); }); await p.waitForTimeout(3500);
  const v1 = await p.evaluate(() => __wohGodView.state); console.log('移動', Math.round(Math.hypot(v1.xM - v0.xM, v1.yM - v0.yM)), 'm, h', Math.round(v1.h), '説明', await p.evaluate(() => document.getElementById('godSrcInfo').textContent));
  console.log('errors', JSON.stringify(errs.slice(0, 3))); await b.close(); })();
