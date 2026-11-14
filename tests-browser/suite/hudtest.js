const WOH = require('../woh-env.js');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-dev', '1'); localStorage.setItem('woh-god', '0'); } catch (e) { } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(WOH.url('?autostart'));
  await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.waitForTimeout(3000);
  const T = (id) => p.evaluate((i) => document.getElementById(i).innerText.replace(/\n+/g, ' '), id);
  const vis = (id) => p.evaluate((i) => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, id);
  console.log('日付', await T('hudDate'), '／天気', await T('hudWx'), '／目標', await T('hudGoal'));
  console.log('FPS表示', await T('hudStats'));
  // ボタン類
  const tap = async (id) => { await p.evaluate((i) => document.getElementById(i).click(), id); await p.waitForTimeout(350); };
  await tap('hbInfo'); console.log('情報を開く', await p.evaluate(() => document.getElementById('info').classList.contains('show')), '／ミニマップ隠れる', !(await vis('miniMap'))); await tap('hbInfo');
  console.log('情報を閉じて、ミニマップ復帰', await vis('miniMap'));
  await tap('hbMenu'); console.log('メニューを開く', await p.evaluate(() => document.getElementById('menu').classList.contains('show'))); await tap('menuClose');
  // 準備中
  for (const k of ['装備', '仲間', '依頼']) { await p.evaluate((kk) => document.querySelector('#hudHot [data-hot="' + kk + '"]').click(), k); await p.waitForTimeout(200); console.log(k, '→', await p.evaluate(() => document.getElementById('forageMsg').textContent)); }
  
  // 調べる＋モード
  await p.evaluate(() => { const s = __wohForage.state; s.kcal = 1500; });
  await p.evaluate(() => document.getElementById('hmMat').click()); console.log('モード素材', await p.evaluate(() => document.getElementById('hmMat').classList.contains('on')));
  await p.evaluate(() => document.getElementById('hudTalk').click()); await p.waitForTimeout(300); console.log('調べる(素材)', await p.evaluate(() => document.getElementById('forageMsg').textContent));
  // 持ち物・製作
  await p.evaluate(() => document.querySelector('#hudHot [data-hot="bag"]').click()); await p.waitForTimeout(300); console.log('持ち物を開く', await p.evaluate(() => document.getElementById('bagPanel').classList.contains('show')));
  await p.evaluate(() => document.querySelector('#hudHot [data-hot="craft"]').click()); await p.waitForTimeout(300); console.log('製作（パネルが開いたまま・作る欄へ）', await p.evaluate(() => ({ show: document.getElementById('bagPanel').classList.contains('show'), top: Math.round(document.getElementById('bagPanel').scrollTop) })));
  await p.evaluate(() => document.getElementById('bagClose').click());
  // ミニマップのズーム
  const z0 = await p.evaluate(() => __wohMapZoom && __wohMapZoom.level); await tap('mzIn'); await p.waitForTimeout(400); const z1 = await p.evaluate(() => __wohMapZoom.level); await tap('mzOut'); await tap('mzOut'); await p.waitForTimeout(400); const z2 = await p.evaluate(() => __wohMapZoom.level);
  console.log('ズーム', z0, '→+', z1, '→−−', z2);
  // 1人称ボタン
  await tap('mzView'); console.log('視点ボタン→1人称', await p.evaluate(() => window.__wohAvatar.firstPerson)); await tap('mzView');
  // 目標が進む：薪を直接入れて火を起こす
  await p.evaluate(() => { const s = __wohForage.state; s.total = { nut: 6, firewood: 11 }; s.n = {}; }); await p.waitForTimeout(400);
  console.log('目標が進む', await T('hudGoalT'), await T('hudGoalN'));
  // 食料バー
  const w = (k) => p.evaluate(() => document.querySelector('#hudFood b').style.width); await p.evaluate(() => { __wohForage.state.kcal = 600; }); await p.waitForTimeout(400); console.log('満腹バー（600kcal）', await w());
  // UI非表示
  await tap('hbUi'); console.log('UI非表示：HUD隠れる', !(await vis('hudTL')) && !(await vis('hudHot')), '／ボタンは残る', await vis('hbUi'), '／操作ボタンは残る', await vis('jump'), await vis('joystick'));
  await p.screenshot({ path: WOH.out('hud_off.png') });
  await tap('hbUi'); console.log('UI表示：戻る', await vis('hudTL'), await vis('hudHot'));
  // マップ（俯瞰）
  await tap('hbMap'); await p.waitForTimeout(1200); console.log('マップ：HUD隠れて、上のボタン列が出る', !(await vis('hudTL')), await vis('toolbar'));
  await p.screenshot({ path: WOH.out('hud_map.png') });
  await p.evaluate(() => document.getElementById('viewMode').click()); await p.waitForTimeout(1200); console.log('戻る：HUD復帰', await vis('hudTL'), '／開発ツールは通常は隠れる', !(await vis('toolbar')));
  await tap('hbMenu'); await tap('menuDevBar'); console.log('開発ツール（開発者のみ）', await vis('toolbar'));
  await p.screenshot({ path: WOH.out('hud_devbar.png') });
  console.log('errors', errs.slice(0, 5)); await b.close();
})();
