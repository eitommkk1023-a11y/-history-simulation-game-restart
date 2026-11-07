const { chromium } = require('playwright'); const D = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/t/';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html?autostart');
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(3000); const ev = (f, a) => p.evaluate(f, a);
  const ids = await ev(() => { const pe = window.__geo.people, out = {}; for (const g of pe.groups) if (g.alive && g.hist && g.settle === 2) { const k = g.site.kind; if (!out[k]) out[k] = g.id; } return out; });
  console.log(JSON.stringify(ids));
  let k = 0; for (const [kind, id] of Object.entries(ids)) { if (k++ >= 3) break;
    await ev((id) => window.__wohMapData.ensureLayout(id), id);
    await ev((id) => { const g = window.__geo.people.groups[id - 1]; __wohAvatar.toBlock(g.homeX, g.homeY, 0, 0); }, id); await p.waitForTimeout(6500); await p.screenshot({ path: D + 'cul3d_' + kind + '.png' });
    await ev((id) => { __wohRpgMenu.open('map'); __wohMap.focusVillage(id, { detail: true }); }, id); await p.waitForTimeout(1500);
    await ev(() => { const s = document.getElementById('rpgMapColorBy'); s.value = 'form'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(600); await p.screenshot({ path: D + 'culmap_' + kind + '.png' }); await ev(() => __wohRpgMenu.close()); }
  console.log('errors', errs); await b.close();
})();
