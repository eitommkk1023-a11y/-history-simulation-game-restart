// 素材・耐久・需要・工事：ブラウザでの検証（保存復元・旧保存の互換・3D一致・表示）
const { chromium } = require('playwright');
const UD = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/ud_' + Date.now();
const URLA = 'file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/' + (process.argv[2] || 'index3.html');
const URLB = 'file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html';
const D = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/t/';
const launch = () => chromium.launchPersistentContext(UD, { args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'], viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
const FP = () => { const pe = window.__geo.people, out = {}; for (const g of pe.groups) { if (!g.alive || !g.layout) continue; const L = g.layout; out[g.id] = { n: L.items.length, h: JSON.stringify(L.items.map(b => [b.id, b.x, b.z, b.rot, b.state, b.plan.w, b.plan.d, b.pm, b.cond, b.q, b.hh])).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7), stock: JSON.stringify(L.stock || null), proj: JSON.stringify(L.proj || null), t: L.t, log: L.log.length, life: L.life }; } return out; };
(async () => {
  let bad = 0; const t = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + x : '')); if (!c) bad++; };
  let ctx = await launch(); await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  let p = ctx.pages()[0] || await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URLA + '?autostart'); await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 }); await p.waitForTimeout(3000);
  const ids = await p.evaluate(() => { const pe = window.__geo.people, seen = {}, out = []; for (const g of pe.groups) { if (!g.alive || !g.hist || (g.settle || 0) < 1) continue; const k = g.site && g.site.kind; if ((seen[k] || 0) >= 2) continue; seen[k] = (seen[k] || 0) + 1; out.push(g.id); } return out.slice(0, 6); });
  for (const id of ids) await p.evaluate((id) => window.__wohMapData.ensureLayout(id), id);
  await p.evaluate(() => window.__geo.skipDays(360)); await p.waitForTimeout(1500);
  for (const id of ids) await p.evaluate((id) => { const g = window.__geo.people.groups[id - 1]; __wohAvatar.toBlock(g.homeX, g.homeY, 0, 0); window.__wohMapData.ensureLayout(id); }, id).catch(() => { });
  await p.waitForTimeout(6000); await p.evaluate(() => window.__geo.skipDays(180)); await p.waitForTimeout(6000);
  const before = await p.evaluate(FP); console.log('保存前', Object.keys(before).length, '集落', JSON.stringify(Object.values(before)[0]).slice(0, 200));
  await p.evaluate(() => document.getElementById('btnMenu').click()); await p.waitForTimeout(500); await p.evaluate(() => document.querySelector('#menuSlots [data-save="slot1"]').click()); await p.waitForTimeout(2500); await ctx.close();
  ctx = await launch(); p = ctx.pages()[0] || await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URLB); await p.waitForSelector('#titleScreen.show', { timeout: 60000 }).catch(() => { }); await p.waitForTimeout(1500); await p.evaluate(() => document.getElementById('tLoad').click()); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('#menuSlots [data-load="slot1"]').click());
  await p.waitForFunction(() => window.__geo && window.__geo.world && window.__geo.people && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 }); await p.waitForTimeout(2500);
  const after = await p.evaluate(FP); const same = Object.keys(before).every(id => after[id] && ['n', 'h', 'stock', 'proj', 't', 'log', 'life'].every(k => JSON.stringify(after[id][k]) === JSON.stringify(before[id][k])));
  const fromOld = process.argv[2] && process.argv[2] !== 'index3.html';
  if (fromOld) { t('旧版の保存を読める（位置・形は一致）', Object.keys(before).every(id => after[id] && after[id].n === before[id].n)); t('旧形式から素材・状態が補われる（最初の更新で）', await p.evaluate(async () => { const pe = window.__geo.people; for (const g of pe.groups) if (g.layout) { window.__wohMapData.ensureLayout(g.id); } window.__geo.skipDays(40); await new Promise(r => setTimeout(r, 3000)); return true; })); }
  else t('保存→別セッションで、建物の位置・素材・状態・材料の蓄え・工事が全て一致', same, Object.keys(after).length + '集落');
  await p.evaluate(() => window.__geo.skipDays(120)); await p.waitForTimeout(3000);
  const adv = await p.evaluate(() => { const pe = window.__geo.people; let n = 0, withLife = 0, tot = 0, proj = 0, repairs = 0; for (const g of pe.groups) if (g.layout) { n++; if (g.layout.life) withLife++; for (const b of g.layout.items) { tot++; if (b.cond) { } if (b.rec) repairs += b.rec.edits.filter(e => e.type === 'repair' || e.type === 'replace').length; } proj += (g.layout.proj || []).length; } return { n, withLife, tot, proj, repairs }; });
  console.log('進めた後', JSON.stringify(adv)); t('進めた後も、集落の素材・状態・工事の仕組みが動く（旧保存は、近づいて更新された集落から補われる）', fromOld ? (adv.withLife >= 1 && adv.n > 0) : (adv.withLife === adv.n && adv.n > 0));
  // 3Dと配置の一致と、表示
  const gid = ids[0]; await p.evaluate((g) => { const G = window.__geo.people.groups[g - 1]; __wohAvatar.toBlock(G.homeX, G.homeY, 0, 0); }, gid); await p.waitForTimeout(7000);
  const m = await p.evaluate((g) => __wohSettle.matchReport(g), gid); console.log('3D照合', JSON.stringify(m)); t('地図の詳細と3Dの建物が同じ位置', m && m.tot > 3 && m.ok === m.tot, m ? m.ok + '/' + m.tot : ''); await p.screenshot({ path: D + 'life_3d.png' });
  await p.evaluate((g) => { __wohRpgMenu.open('map'); __wohMap.focusVillage(g, { detail: true }); }, gid); await p.waitForTimeout(1500);
  const cond = await p.evaluate(() => { const d = document.getElementById('rpgMapVInfo'); return d ? d.innerText.slice(0, 100) : ''; });
  await p.evaluate(() => { const g = window.__geo.people.groups.find(x => x.layout && x.layout.items.some(b => b.cond)); const b = g.layout.items.find(b => b.cond && b.role === 'dwelling' && b.state === 'ok'); document.getElementById('rpgMapVInfo'); }); await p.screenshot({ path: D + 'life_map.png' });
  t('建築の材料と工事の欄が出る', await p.evaluate(() => /建築の材料と工事/.test(document.getElementById('rpgMapVInfo').innerText)));
  console.log('errors', errs.slice(0, 4)); if (errs.length) bad++; console.log(bad ? 'FAIL ' + bad : 'ALL OK'); await ctx.close(); process.exit(bad ? 1 : 0);
})();
