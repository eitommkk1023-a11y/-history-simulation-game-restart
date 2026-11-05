// Builds ship-sandbox.html: a sea-only test world (no world generation) that uses the same ship code as the game.
// three.js is taken from the main game file (it embeds r128), so the page works offline. Usage: node tools/build-ship-sandbox.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { bundleShipModules } from './ship-bundle.mjs';
const game = readFileSync(new URL('../World-of-History-v30-development.html', import.meta.url), 'utf8');
const lines = game.split('\n');
const start = lines.findIndex((l) => l.startsWith('<script>/**')), end = lines.findIndex((l, i) => i > start && l.startsWith('</script>'));
if (start < 0 || end < 0) throw new Error('three.js block not found in the game file');
const three = [lines[start].slice('<script>'.length), ...lines.slice(start + 1, end)].join('\n');
if (!/THREE/.test(three.slice(0, 4000) + three.slice(-4000))) throw new Error('unexpected three.js block');
const tpl = readFileSync(new URL('./ship-sandbox.template.html', import.meta.url), 'utf8');
const out = tpl.replace('/*THREE*/', () => three).replace('/*BUNDLE*/', () => bundleShipModules());
if (out.includes('</script') && out.split('</script').length - 1 !== tpl.split('</script').length - 1) throw new Error('embedded code contains </script');
writeFileSync(new URL('../ship-sandbox.html', import.meta.url), out);
console.log('wrote ship-sandbox.html', (out.length / 1e6).toFixed(2), 'MB');
