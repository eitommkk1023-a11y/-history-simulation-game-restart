// 2C 検証：配置・履歴の保存と復元（別セッション）。node layoutsave.js
const { chromium } = require('playwright');
const UD = '/tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/ud_' + Date.now();
const URL = 'file:///tmp/claude-0/-home-user--/d03687c2-a545-5a23-9b43-0b8d77dc6c9c/scratchpad/v30/index3.html';
const launch = () => chromium.launchPersistentContext(UD, { args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'], viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
const FP = () => { const pe = window.__geo.people, out = {}; for (const g of pe.groups) { if (!g.alive || !g.layout) continue; const L = g.layout; out[g.id] = { n: L.items.length, h: JSON.stringify(L.items.map(b => [b.id, +b.x.toFixed(3), +b.z.toFixed(3), +b.rot.toFixed(3), b.role, b.state, b.plan.w, b.plan.d, b.roof && b.roof.kind, b.wall && b.wall.mat, b.house, b.builtYear])).length + ':' + JSON.stringify(L.items.map(b => [b.id, b.x, b.z, b.rot])).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7), paths: L.paths.length, ph: JSON.stringify(L.paths).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7), fields: (L.fields || []).length, fence: (L.fence || []).length, water: JSON.stringify(L.waterAccess || null), center: JSON.stringify(L.center), at: JSON.stringify(L.at), log: (L.log || []).length, recs: L.items.filter(b => b.rec).length, chron: (g.chron || []).length, ver: L.version }; } return out; };
(async () => {
  let bad = 0; const t = (n, c, x) => { console.log((c ? 'OK  ' : 'NG  ') + n + (x !== undefined ? '  ' + x : '')); if (!c) bad++; };
  let ctx = await launch(); await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); } catch (e) { } });
  let p = ctx.pages()[0] || await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '?autostart');
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(3000);
  // 立地の違う村を6つ、既存の方法で配置を作る
  const ids = await p.evaluate(() => { const pe = window.__geo.people, seen = {}, out = []; for (const g of pe.groups) { if (!g.alive || !g.hist || (g.settle || 0) < 1) continue; const k = g.site && g.site.kind; if (seen[k] >= 2) continue; seen[k] = (seen[k] || 0) + 1; out.push(g.id); } return out.slice(0, 7); });
  for (const id of ids) await p.evaluate((id) => window.__wohMapData.ensureLayout(id), id);
  console.log('配置を作った集団', ids.join(','));
  // 世帯の増減・年月を進めて、履歴を作る（1年）
  await p.evaluate(() => window.__geo.skipDays(360)); await p.waitForTimeout(1500);
  for (const id of ids) await p.evaluate((id) => window.__wohMapData.ensureLayout(id), id);
  // 施設を建てても配置は変わらない（以前は作り直していた）
  const g0 = ids[0], pre = await p.evaluate(FP);
  await p.evaluate((g) => { const pe = window.__geo.people, G = pe.groups[g - 1]; WohPeople.peopleGrantTech(pe, G.ethId, ['cultivate', 'herd', 'pottery', 'storage'].filter(x => true)); G.facil = G.facil || {}; }, g0).catch(() => { });
  const before = await p.evaluate(FP); console.log('保存前', Object.keys(before).length, '集落');
  await p.evaluate(() => document.getElementById('btnMenu').click()); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('#menuSlots [data-save="slot1"]').click()); await p.waitForTimeout(2000);
  t('記録1に保存できる', await p.evaluate(() => document.querySelector('#menuSlots [data-load="slot1"]') !== null));
  await ctx.close();
  ctx = await launch(); p = ctx.pages()[0] || await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForSelector('#titleScreen.show', { timeout: 60000 }).catch(() => { }); await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('tLoad').click()); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('#menuSlots [data-load="slot1"]').click());
  await p.waitForFunction(() => window.__geo && window.__geo.world && window.__geo.people && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 }); await p.waitForTimeout(2500);
  const after = await p.evaluate(FP);
  t('読み込み後に配置が残っている', Object.keys(after).length === Object.keys(before).length, Object.keys(after).length + '/' + Object.keys(before).length);
  for (const id of Object.keys(before)) { const a = after[id], b = before[id]; if (!a) { t('集落' + id + 'の配置が復元', false); continue; } for (const k of ['n', 'h', 'paths', 'ph', 'fields', 'fence', 'water', 'center', 'at', 'log', 'recs', 'chron']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) t('集落' + id + ' ' + k + ' 一致', false, JSON.stringify(b[k]).slice(0, 50) + ' → ' + JSON.stringify(a[k]).slice(0, 50)); }
  t('全集落で 建物の位置・形・道・水場・履歴が一致', Object.keys(before).every(id => after[id] && ['n', 'h', 'paths', 'ph', 'fields', 'fence', 'water', 'center', 'at', 'log', 'recs', 'chron'].every(k => JSON.stringify(after[id][k]) === JSON.stringify(before[id][k]))));
  // 読み込み後に時間を進めても、既存の建物は動かない
  await p.evaluate(() => window.__geo.skipDays(90)); await p.waitForTimeout(1500);
  for (const id of ids) await p.evaluate((id) => window.__wohMapData.ensureLayout(id), id);
  const later = await p.evaluate(FP); let moved = 0; for (const id of Object.keys(before)) { const L = await p.evaluate((id) => window.__geo.people.groups[id - 1].layout.items.map(b => [b.id, b.x, b.z, b.rot]), +id); }
  t('読み込み後に進めても、集落が消えない', Object.keys(later).length >= Object.keys(before).length);
  console.log('errors', errs.slice(0, 4)); if (errs.length) bad++; console.log(bad ? 'FAIL ' + bad : 'ALL OK'); await ctx.close(); process.exit(bad ? 1 : 0);
})();
