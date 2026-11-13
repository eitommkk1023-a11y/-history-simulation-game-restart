const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] }); const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true }); const p = await ctx.newPage();
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?small=LK-2'); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(3000);
  console.log(await p.evaluate(() => JSON.stringify(__wohRiver.stats))); await b.close(); })();
