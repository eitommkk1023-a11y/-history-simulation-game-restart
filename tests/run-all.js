'use strict';
// 検証の一括実行：node tests/run-all.js [--node] [--browser] [--only 名前,名前] [--list]
//  - node：npc/test-*.js（世界データが要るものは、tools/make-world-fixture.js が .cache/ に作る）
//  - browser：tests-browser/suite/*.js（Playwright。対象のHTMLは環境変数 WOH_HTML、既定は開発版）
// 結果は tests/last-run.json と、画面の表に出る。終了コードは、不合格があれば 1
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), args = process.argv.slice(2), has = (f) => args.includes(f), only = has('--only') ? (args[args.indexOf('--only') + 1] || '').split(',').filter(Boolean) : [];
const runNode = has('--node') || !has('--browser'), runBrowser = has('--browser') || !has('--node');
// テストごとの追加の引数（世界データが要るもの：<生成器> <世界>、そのあとの引数）
const EXTRA = { 'test-small-world': ['20', '42'], 'test-layers': ['12'], 'test-growth': ['20'] };
const BROWSER = 'hudtest titletest devtest rocksmoke gotest avatartest proptest foragetest cooktest crafttest hometest fptest vitaltest deathtest tiestest survivaltest peopletest godtest stage uitog srcui drift smallfull bench'.split(' ');
const SLOW = new Set(['smallfull', 'stage', 'bench']);
function judge(code, out) {
  const lines = out.split('\n'), bad = lines.filter(l => /^(NG|×|FAIL|不合格)/.test(l.trim()) || /^Error|TypeError|ReferenceError/.test(l.trim()));
  const errs = lines.filter(l => /^errors\b|errors \[/.test(l.trim())).pop();
  const okErr = !errs || /errors \[\]/.test(errs);
  return { ok: code === 0 && !bad.length && okErr, detail: code !== 0 ? 'exit ' + code : bad.length ? bad[0].slice(0, 100) : okErr ? '' : errs.slice(0, 100) };
}
const results = []; let fixtures = null;
function run(kind, name, cmd, argv, timeout) {
  if (only.length && !only.includes(name)) return;
  const t0 = Date.now(); const r = spawnSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', timeout, maxBuffer: 1 << 26, env: Object.assign({}, process.env, { STAGE: process.env.STAGE || '1' }) });
  const out = (r.stdout || '') + (r.stderr || ''), j = r.error ? { ok: false, detail: String(r.error.message).slice(0, 80) } : judge(r.status, out);
  const sec = ((Date.now() - t0) / 1000).toFixed(1); results.push({ kind, name, ok: j.ok, sec: +sec, detail: j.detail });
  console.log((j.ok ? '○' : '×') + ' ' + kind.padEnd(7) + name.padEnd(22) + (sec + '秒').padStart(8) + (j.detail ? '  ' + j.detail : ''));
}
if (has('--list')) { console.log('node:', fs.readdirSync(path.join(ROOT, 'npc')).filter(f => /^test-.*\.js$/.test(f)).join(' ')); console.log('browser:', BROWSER.join(' ')); process.exit(0); }
if (runNode) {
  for (const f of fs.readdirSync(path.join(ROOT, 'npc')).filter(f => /^test-.*\.js$/.test(f)).sort()) {
    const name = f.replace(/\.js$/, ''), text = fs.readFileSync(path.join(ROOT, 'npc', f), 'utf8'), needs = /process\.argv\[2\]/.test(text) && /deserialize/.test(text);
    if (only.length && !only.includes(name)) continue;
    let argv = ['npc/' + f];
    if (needs) { if (!fixtures) { try { fixtures = require('../tools/make-world-fixture.js').ensure([42]); } catch (e) { fixtures = { err: e.message }; } } if (fixtures.err) { results.push({ kind: 'node', name, ok: false, sec: 0, detail: 'スキップ：' + fixtures.err }); console.log('× node   ' + name.padEnd(22) + '  スキップ（世界データを作れない）：' + fixtures.err); continue; } argv = argv.concat([fixtures.gen, fixtures.worlds[42]], EXTRA[name] || []); }
    else if (EXTRA[name]) argv = argv.concat(EXTRA[name]);
    run('node', name, 'node', argv, 900000);
  }
}
if (runBrowser) { for (const n of BROWSER) run('browser', n, 'node', ['tests-browser/suite/' + n + '.js'], SLOW.has(n) ? 600000 : 300000); }
const pass = results.filter(r => r.ok).length, fail = results.length - pass;
console.log('\n' + (fail ? `不合格 ${fail} ／ ` : '全て合格　') + `${pass}/${results.length}　` + results.reduce((a, r) => a + r.sec, 0).toFixed(0) + '秒');
fs.writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify({ at: new Date().toISOString(), html: process.env.WOH_HTML || 'World-of-History-v30-development.html', pass, fail, results }, null, 1));
process.exit(fail ? 1 : 0);
