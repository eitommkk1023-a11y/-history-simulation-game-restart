// Builds World-of-History-v30-ships.html = the original game file + one added <script id="ship-system"> block.
// The original file is not modified. Usage: node tools/integrate-ship.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { bundleShipModules } from './ship-bundle.mjs';
const src = readFileSync(new URL('../World-of-History-v30-development.html', import.meta.url), 'utf8');
if (src.includes('id="ship-system"')) throw new Error('source already contains the ship system block');
const glue = readFileSync(new URL('./ship-glue.js', import.meta.url), 'utf8');
const b64 = (f) => readFileSync(new URL(`../assets/bellona/${f}`, import.meta.url)).toString('base64');
const loaderSrc = readFileSync(new URL('./vendor/GLTFLoader.r128.js', import.meta.url), 'utf8');
// GLTFLoader (three.js r128 example, MIT) and the Bellona model files, as plain data blocks before the ship system
const assets = `<script id="bellona-gltf-loader">\n${loaderSrc}\n</script>\n<script id="bellona-assets">\nglobalThis.__BELLONA_ASSETS = ${JSON.stringify({ lod0: b64('bellona-lod0-near.glb'), lod1: b64('bellona-lod1-mid.glb'), lod2: b64('bellona-lod2-far.glb'), interior: b64('bellona-interior.glb') })};\n</script>\n`;
const block = assets + `<script id="ship-system">\n(() => {\n${bundleShipModules()}\n${glue}\n})();\n</script>\n`;
if (block.includes('</script>')) { /* only the closing tag we add may appear */ }
const body = block.slice(0, -'</script>\n'.length).replace(assets, '');
if (body.includes('</script')) throw new Error('bundle contains </script');
const at = src.lastIndexOf('</body>');
if (at < 0) throw new Error('no </body> in the game file');
writeFileSync(new URL('../World-of-History-v30-ships.html', import.meta.url), src.slice(0, at) + block + src.slice(at));
console.log('wrote World-of-History-v30-ships.html');
