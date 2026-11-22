const WOH = require('../woh-env.js');
// 見た目の基準画像：同じSeedで同じ場面を撮り、基準画像（tests/visual/）と比べる。--update で基準を作り直す
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), cp = require('child_process');
const BASE = path.join(__dirname, '..', '..', 'tests', 'visual'); const UPDATE = process.argv.includes('--update'); const TOL = 0.04; // 異なる画素の割合の許容
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 874, height: 380 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('woh-seed-fixed', '1'); } catch (e) { } let a = 12345; Math.random = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + WOH.HTML + '?autostart'); await p.waitForFunction(() => window.__geo && window.__geo.world && !document.getElementById('loading').classList.contains('show'), null, { timeout: 400000 });
  await p.evaluate(() => window.__geo.skipDays(360 * 2)); await p.waitForTimeout(2500);
  const shots = {}; const out = WOH.out('visual_'); fs.mkdirSync(out, { recursive: true });
  const snap = async (n) => { const f = path.join(out, n + '.png'); await p.screenshot({ path: f }); shots[n] = f; };
  await snap('field');
  await p.evaluate(() => __wohRpgMenu.open('village')); await p.waitForTimeout(1500); await snap('village-panel');
  let bad = 0; fs.mkdirSync(BASE, { recursive: true });
  for (const n of Object.keys(shots)) {
    const base = path.join(BASE, n + '.png');
    if (UPDATE || !fs.existsSync(base)) { fs.copyFileSync(shots[n], base); console.log('基準を作成 ' + n); continue; }
    const r = cp.spawnSync('python3', ['-c', 'import sys;from PIL import Image,ImageChops;a=Image.open(sys.argv[1]).convert("RGB");b=Image.open(sys.argv[2]).convert("RGB");\nif a.size!=b.size:print(1.0)\nelse:\n d=ImageChops.difference(a,b).convert("L").point(lambda v:255 if v>24 else 0);print(sum(1 for v in d.getdata() if v)/(a.size[0]*a.size[1]))', shots[n], base], { encoding: 'utf8' });
    const ratio = parseFloat(r.stdout); const ok = ratio <= TOL; if (!ok) bad++; console.log((ok ? 'OK  ' : 'NG  ') + n + ' 差 ' + (ratio * 100).toFixed(2) + '%（許容 ' + TOL * 100 + '%）');
  }
  console.log('errors', JSON.stringify(errs.slice(0, 3))); await b.close(); process.exit(bad || errs.length ? 1 : 0);
})();
