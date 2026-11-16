'use strict';
// npc/*.js を HTML の <script id="…"> に埋め込む（構文の検査つき）：node tools/embed-modules.js [HTMLの場所]
// 1つでも構文エラーがあれば、HTML は書き換えない。（行の途中の // コメントが、同じ行の後ろを消してしまう事故を、埋め込む前に見つけるため）
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), HTML = path.resolve(process.argv[2] || path.join(ROOT, 'World-of-History-v30-development.html'));
const MODS = { 'game-config': 'game-config.js', 'small-world': 'small-world.js', 'ledger': 'ledger.js', 'settlement-tier': 'settlement-tier.js', 'pop-cohort': 'pop-cohort.js', 'people-core': 'people-core.js', 'settle-layout': 'settle-layout.js', 'npc-core': 'npc-core.js', 'arch-gen': 'arch-gen.js', 'nation': 'nation.js', 'tech': 'tech.js' };
let html = fs.readFileSync(HTML, 'utf8'), changed = [], bad = [];
for (const [id, f] of Object.entries(MODS)) {
  const file = path.join(ROOT, 'npc', f); if (!fs.existsSync(file)) continue;
  const c = spawnSync('node', ['--check', file], { encoding: 'utf8' }); if (c.status !== 0) { bad.push(f + '：' + (c.stderr || '').split('\n').filter(Boolean).slice(0, 3).join(' ')); continue; }
  const re = new RegExp('(<script id="' + id + '">\\n)([\\s\\S]*?)(\\n</script>)'), m = re.exec(html); if (!m) continue;
  const js = fs.readFileSync(file, 'utf8').replace(/\n+$/, ''); if (m[2] !== js) { html = html.slice(0, m.index + m[1].length) + js + html.slice(m.index + m[1].length + m[2].length); changed.push(id); }
}
if (bad.length) { console.error('構文エラー（HTMLは変更しません）：\n  ' + bad.join('\n  ')); process.exit(1); }
if (changed.length) fs.writeFileSync(HTML, html);
console.log(changed.length ? '埋め込んだ：' + changed.join(', ') : '変更なし（HTMLはすでに最新）');
