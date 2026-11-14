'use strict';
// 検証用の世界データを作る：HTML に埋め込まれた生成器・動物・岩石のコードを取り出し、指定のSeedで世界を作って .cache/ に保存する。
// 使い方：node tools/make-world-fixture.js [Seed…]（既定 42）。1つあたり約20秒・約150〜200MB。.cache/ は git に入れない。
const fs = require('fs'), path = require('path'), v8 = require('v8');
const ROOT = path.resolve(__dirname, '..'), CACHE = path.join(ROOT, '.cache'), HTML = path.resolve(process.env.WOH_HTML || path.join(ROOT, 'World-of-History-v30-development.html'));
function block(s, id) { const t = '<script id="' + id + '" type="text/plain">'; const a = s.indexOf(t); if (a < 0) throw new Error('HTMLに ' + id + ' がありません'); const b = s.indexOf('</script>', a + t.length); return s.slice(a + t.length, b); }
function buildGen() {
  const s = fs.readFileSync(HTML, 'utf8'), exp = 'module.exports={faunaPlantFood, generateWorld, faunaMonthly, faunaHunt, faunaSummary, faunaClone, faunaDensity, faRng, faTotal, faJuveniles, faAdults, ANIMAL_SPECIES, FAUNA_TIER, faunaSuitability, ROCKS, ROCK_ASSEMBLAGES, buildRockInput, evolveRockTerrain, createStratigraphy, exposedRockId, rockHash};';
  const code = 'const self={postMessage(){}};\n' + block(s, 'generator-src') + '\n' + block(s, 'fauna-src') + '\n' + block(s, 'rock-src') + '\n' + exp + '\n';
  fs.mkdirSync(CACHE, { recursive: true }); const p = path.join(CACHE, 'gen.js'); fs.writeFileSync(p, code); return p;
}
function ensure(seeds) {
  const genPath = buildGen(); const out = {};
  for (const seed of seeds) { const f = path.join(CACHE, 'world_' + seed + '.bin'); if (!fs.existsSync(f) || fs.statSync(f).mtimeMs < fs.statSync(genPath).mtimeMs - 1e9 * 0) { if (!fs.existsSync(f)) { const G = require(genPath); const t0 = Date.now(); const w = G.generateWorld(seed >>> 0, () => { }); fs.writeFileSync(f, v8.serialize(w)); console.log('世界を作った', seed, ((Date.now() - t0) / 1000).toFixed(1) + '秒', (fs.statSync(f).size / 1e6).toFixed(0) + 'MB'); } } out[seed] = f; }
  return { gen: genPath, worlds: out };
}
module.exports = { ensure, CACHE };
if (require.main === module) { const seeds = process.argv.slice(2).map(Number).filter(Number.isFinite); const r = ensure(seeds.length ? seeds : [42]); console.log(JSON.stringify(r, null, 1)); }
