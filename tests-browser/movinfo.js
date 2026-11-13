const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?small=GP-1'); await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); await p.waitForTimeout(3000);
  for (const h of [150, 600, 1500]) {
    await p.evaluate((h) => __wohGodView.setView({ h, pitch: 0.9 }), h); await p.waitForTimeout(7000);
    const r = await p.evaluate(async () => { const F = __wohFrameStats; const f0 = F.frames, t0 = performance.now(); await new Promise(r => setTimeout(r, 4000)); return { fps: +((F.frames - f0) / ((performance.now() - t0) / 1000)).toFixed(1), tri: F.tri, calls: F.calls, treeMs: F.treeMs, trees: __wohTrees.count }; });
    console.log('高さ', h, JSON.stringify(r)); }
  await b.close();
})();
