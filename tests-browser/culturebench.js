// 第3工程：建築の多様化の、見た目・FPS相当（描画物の数・走査時間）・メモリの比較。node culturebench.js <html> <label>
const { chromium } = require('playwright'); const fs = require('fs');
const file = process.argv[2], label = process.argv[3] || 'x';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-precise-memory-info'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); localStorage.setItem('woh-god', '1'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + file + '?autostart');
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(3000);
  const ev = (f, a) => p.evaluate(f, a);
  const ids = await ev(() => { const pe = window.__geo.people, seen = {}, out = []; for (const g of pe.groups) { if (!g.alive || !g.hist || (g.settle || 0) < 2) continue; const k = g.site && g.site.kind; if ((seen[k] || 0) >= 3) continue; seen[k] = (seen[k] || 0) + 1; out.push(g.id); } return out.slice(0, 10); });
  const res = { label, groups: ids.length, villages: [] };
  const heap0 = await ev(() => performance.memory ? performance.memory.usedJSHeapSize : 0);
  for (const id of ids) {
    await ev((id) => window.__wohMapData.ensureLayout(id), id);
    await ev((id) => { const g = window.__geo.people.groups[id - 1]; __wohAvatar.toBlock(g.homeX, g.homeY, 0, 0); }, id); await p.waitForTimeout(5500);
    const r = await ev((id) => { const g = window.__geo.people.groups[id - 1], L = g.layout, st = __wohSettle.stats; const d = L.items.filter(b => b.role === 'dwelling'); const sig = {}; for (const b of d) { const k = [b.form || '-', b.wall.mat, b.wall.method || '-', b.roof.kind, b.roof.mat].join('/'); sig[k] = (sig[k] || 0) + 1; } return { id, site: g.site && g.site.kind, eth: g.ethId, n: L.items.length, sig, instances: st.items, counts: st.counts, scanMs: +st.scanMs.toFixed(1), maxScanMs: +st.maxScanMs.toFixed(1), layoutMs: +(st.layoutMs || 0).toFixed(1), heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }; }, id);
    res.villages.push(r);
  }
  const prims = res.villages.map(v => Object.values(v.counts).reduce((a, x) => a + x, 0)); res.primsAvg = Math.round(prims.reduce((a, x) => a + x, 0) / prims.length); res.primsMax = Math.max(...prims);
  res.scanAvg = +(res.villages.reduce((a, v) => a + v.scanMs, 0) / res.villages.length).toFixed(1); res.scanMax = Math.max(...res.villages.map(v => v.maxScanMs));
  res.heapMB0 = +(heap0 / 1048576).toFixed(1); res.heapMB1 = +(res.villages[res.villages.length - 1].heap / 1048576).toFixed(1);
  const allSig = new Set(); for (const v of res.villages) for (const k of Object.keys(v.sig)) allSig.add(k); res.distinctTypes = allSig.size;
  res.perVillageTypes = res.villages.map(v => Object.keys(v.sig).length);
  res.errors = errs.slice(0, 3); delete res.villages; console.log(JSON.stringify(res)); await b.close();
})();
