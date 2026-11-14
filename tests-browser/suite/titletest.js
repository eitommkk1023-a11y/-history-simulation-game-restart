const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
const URL = WOH.url('');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 402 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ready = () => p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.goto(URL); await p.waitForTimeout(1500);
  console.log('タイトル表示', await p.evaluate(() => document.getElementById('titleScreen').classList.contains('show')), '世界は未生成', await p.evaluate(() => !window.__geo?.world));
  console.log('続きからの状態', await p.evaluate(() => { const c = document.getElementById('tContinue'); return c.disabled + ' / ' + document.getElementById('tContInfo').textContent; }));
  await p.screenshot({ path: 'title_0.png' });
  // 開発者モードのオン・オフ
  await p.evaluate(() => document.getElementById('tDev').click()); await p.waitForTimeout(300); console.log('開発者モード', await p.evaluate(() => document.body.classList.contains('woh-dev') + ' / ' + document.getElementById('tDevSw').textContent + ' / Seed欄 ' + document.getElementById('tDevBox').classList.contains('show')));
  await p.screenshot({ path: 'title_dev.png' });
  await p.evaluate(() => document.getElementById('tDev').click()); await p.waitForTimeout(200);
  // 新しい世界（通常モード）：開発者向けの部品が見えないこと
  await p.evaluate(() => document.getElementById('tNew').click()); await ready(); await p.waitForTimeout(1500); await p.waitForTimeout(500);
  const vis = (ids) => p.evaluate((ids) => ids.map(i => i + ':' + (document.getElementById(i) && getComputedStyle(document.getElementById(i)).display !== 'none' ? '見える' : '隠れ')).join(' '), ids);
  console.log('通常：', await vis(['btnRegen', 'btnPrev', 'seedInput', 'btnSeed', 'btnView', 'btnLab', 'devMenu', 'btnInfo', 'btnMenu', 'btnReset', 'viewMode', 'hudStats']));
  console.log('通常：民族の変化の行', await p.evaluate(() => getComputedStyle(document.getElementById('iEthSpeed').closest('.row')).display));
  await p.screenshot({ path: 'title_normal.png' });
  // 保存して再読み込み → 続きから
  await p.evaluate(() => window.__geo.skipDays(360 * 2)); const day = await p.evaluate(() => window.__geo.clock.day);
  await p.evaluate(() => window.__geo.saveTo('auto')); await p.waitForTimeout(1500);
  await p.reload(); await p.waitForTimeout(2000);
  console.log('再読み込み後の続きから', await p.evaluate(() => { const c = document.getElementById('tContinue'); return c.disabled + ' / ' + document.getElementById('tContInfo').textContent; }));
  await p.evaluate(() => document.getElementById('tContinue').click()); await ready(); await p.waitForTimeout(1500);
  console.log('続きからで日付が一致', day === await p.evaluate(() => window.__geo.clock.day), '人口の表示', await p.evaluate(() => document.getElementById('iPeople').textContent));
  // メニューからタイトルへ
  await p.waitForTimeout(300); await p.evaluate(() => document.getElementById('btnMenu').click()); await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('menuTitle').click()); await p.waitForTimeout(2500);
  console.log('タイトルへ戻る', await p.evaluate(() => document.getElementById('titleScreen')?.classList.contains('show')));
  // 開発者モード：オン → 世界を始める → 開発者向けが見える
  await p.evaluate(() => document.getElementById('tDev').click()); await p.fill('#tSeed', '42'); await p.evaluate(() => document.getElementById('tSeedGo').click()); await ready(); await p.waitForTimeout(1500); await p.waitForTimeout(500);
  console.log('開発者：Seed', await p.evaluate(() => window.__geo.seed), await vis(['btnRegen', 'seedInput', 'btnLab', 'devMenu', 'hudStats']));
  await p.screenshot({ path: 'title_devui.png' });
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
