const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?small=GP-1'); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(3000);
  const S = () => p.evaluate(() => { const s = __wohGodView.state, B = __wohSmallBounds; return [Math.round(s.xM - B.x0), Math.round(s.yM - B.y0), Math.round(s.h)]; });
  await p.evaluate(() => __wohGodView.setView ? 0 : 0); await p.mouse.move(300, 200); await p.evaluate(() => __wohGodView.setView({ h: 1500, pitch: 0.9 })); await p.waitForTimeout(3000); console.log('開始', await S(), '窓の幅m', await p.evaluate(() => Math.round(__wohSmallBounds.x1 - __wohSmallBounds.x0)));
  for (let r = 0; r < 12; r++) { await p.mouse.move(300, 250); await p.mouse.down(); for (let i = 1; i <= 6; i++) { await p.mouse.move(300 - i * 10, 250); await p.waitForTimeout(30); } await p.mouse.up(); await p.waitForTimeout(3000); console.log('ドラッグ60px後', await S()); }
  await p.waitForTimeout(8000); console.log('放置後', await S());
  await b.close();
})();
