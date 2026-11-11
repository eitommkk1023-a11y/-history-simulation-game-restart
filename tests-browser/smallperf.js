const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-precise-memory-info'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  const p = await ctx.newPage(); const t0 = Date.now(); await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?small=PERF-1');
  await p.waitForFunction(() => document.body.classList.contains('god-on'), null, { timeout: 500000 }); const boot = (Date.now() - t0) / 1000; await p.waitForTimeout(2500);
  const r = await p.evaluate(() => { const out = {}; const T = (n, f) => { const s = performance.now(); f(); out[n] = +((performance.now() - s) / 1000).toFixed(2); }; globalThis.__wohFastSim = true;
    T('1年_1回目_秒', () => window.__geo.skipDays(360)); T('1年_2回目_秒', () => window.__geo.skipDays(360)); T('1年_3回目_秒', () => window.__geo.skipDays(360)); T('720日_秒', () => window.__geo.skipDays(720)); T('360日計測付き_秒', () => window.__geo.skipDays(360)); globalThis.__wohFastSim = false;
    const s = performance.now(); const st = serializeStateForTest(); return out; function serializeStateForTest() { return null; } });
  const day = await p.evaluate(() => window.__geo.clock.day); await p.evaluate(() => document.getElementById('godSaveMeasure').click()); await p.waitForTimeout(3000);
  const sv = await p.evaluate(() => document.getElementById('godSaveOut').textContent); const heap = await p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
  // 実際の保存（IndexedDB）にかかる時間
  const sec = await p.evaluate(async () => { const s = performance.now(); document.getElementById('btnMenu').click(); await new Promise(r => setTimeout(r, 400)); document.querySelector('#menuSlots [data-save="slot1"]').click(); await new Promise(r => setTimeout(r, 2500)); return +((performance.now() - s) / 1000 - 2.9).toFixed(2); });
  console.log(JSON.stringify({ 起動秒: boot, ...r, 日: day, 保存容量: sv, ヒープMB: heap, 保存の操作秒: sec })); await b.close();
})();
