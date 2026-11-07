// 長時間の高速進行：メモリ・統計の大きさ・実効速度の推移
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-precise-memory-info'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?autostart');
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 }); await p.waitForTimeout(3000);
  const ev = (f) => p.evaluate(f);
  await ev(() => { const pe = window.__geo.people, out = []; for (const g of pe.groups) { if (!g.alive || !g.hist || g.settle !== 2) continue; out.push(g.id); if (out.length >= 8) break; } for (const id of out) window.__wohMapData.ensureLayout(id); const g = pe.groups[out[0] - 1]; __wohAvatar.toBlock(g.homeX, g.homeY, 0, 0); }); await p.waitForTimeout(5000);
  await ev(() => __wohGod.enter()); await p.waitForTimeout(1000); await ev(() => __wohGod.setTime('y30'));
  const rows = []; const snap = () => ev(() => { const pe = window.__geo.people, L = pe.statLog; let items = 0, log = 0, projs = 0; for (const g of pe.groups) if (g.layout) { items += g.layout.items.length; log += g.layout.log.length; projs += g.layout.proj.length; } return { year: Math.floor(window.__geo.clock.day / 360), heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), stat: L.days.length, items, log, living: pe.npc.livingCount(), eff: __wohClockEff(), pop: Math.round(pe.groups.reduce((a, g) => a + (g.alive ? g.pop : 0), 0)), saveKB: Math.round(JSON.stringify(pe.groups.filter(g => g.layout).map(g => g.layout)).length / 1024) }; });
  for (let i = 0; i < 8; i++) { await p.waitForTimeout(20000); const r = await snap(); rows.push(r); console.log(JSON.stringify(r)); }
  await ev(() => __wohGod.setTime('pause')); console.log('errors', errs.slice(0, 3)); await b.close();
})();
