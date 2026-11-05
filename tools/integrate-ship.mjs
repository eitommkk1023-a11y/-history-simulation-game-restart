// Builds World-of-History-v30-ships.html = the original game file + one added <script id="ship-system"> block.
// The original file is not modified. Usage: node tools/integrate-ship.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { bundleShipModules } from './ship-bundle.mjs';
const src = readFileSync(new URL('../World-of-History-v30-development.html', import.meta.url), 'utf8');
if (src.includes('id="ship-system"')) throw new Error('source already contains the ship system block');
const glue = readFileSync(new URL('./ship-glue.js', import.meta.url), 'utf8');
const block = `<script id="ship-system">\n(() => {\n${bundleShipModules()}\n${glue}\n})();\n</script>\n`;
if (block.includes('</script>')) { /* only the closing tag we add may appear */ }
const body = block.slice(0, -'</script>\n'.length);
if (body.includes('</script')) throw new Error('bundle contains </script');
const at = src.lastIndexOf('</body>');
if (at < 0) throw new Error('no </body> in the game file');
writeFileSync(new URL('../World-of-History-v30-ships.html', import.meta.url), src.slice(0, at) + block + src.slice(at));
console.log('wrote World-of-History-v30-ships.html');
