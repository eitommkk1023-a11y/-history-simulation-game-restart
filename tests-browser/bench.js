const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-precise-memory-info'] }); const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?small=LK-2'); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(3000);
  await p.evaluate(() => { document.getElementById('godBench').closest('details').open = true; document.getElementById('godBench').click(); });
  await p.waitForFunction(() => /診断おわり|エラー/.test(document.getElementById('godBenchOut').value), null, { timeout: 200000 });
  console.log(await p.evaluate(() => document.getElementById('godBenchOut').value)); console.log('errors', JSON.stringify(errs.slice(0, 3))); await b.close(); })();
