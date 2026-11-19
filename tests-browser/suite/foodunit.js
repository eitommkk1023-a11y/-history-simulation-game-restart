const WOH = require('../woh-env.js');
// 食料の表示：村の画面の「蓄えの内訳」が、単位（1単位＝1,000kcal）で出る
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }); const p = await (await b.newContext({ viewport: { width: 874, height: 380 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + WOH.HTML + '?autostart'); await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 }); await p.evaluate(() => window.__geo.skipDays(360 * 2)); await p.waitForTimeout(1500);
  let bad = 0; const t = (name, cond, extra) => { if (!cond) bad++; console.log((cond ? 'OK  ' : 'NG  ') + name, extra == null ? '' : extra); };
  await p.evaluate(() => __wohRpgMenu.open('village')); await p.waitForTimeout(1500);
  const txt = await p.evaluate(() => (document.getElementById('rpgVillage') || {}).innerText || '');
  const line = (txt.split('\n').join(' ').match(/蓄えの内訳.{0,80}/) || [''])[0];
  console.log('panel:', JSON.stringify(txt.slice(0, 200)));
  t('村の画面に「蓄えの内訳」が出る', /蓄えの内訳/.test(txt), line);
  t('内訳が「単位」で、kg ではない', /単位/.test(line) && !/kg/.test(line), line);
  console.log('errors', JSON.stringify(errs.slice(0, 3))); console.log(bad || errs.length ? 'NG あり' : 'ALL OK'); await b.close(); process.exit(bad || errs.length ? 1 : 0);
})();
