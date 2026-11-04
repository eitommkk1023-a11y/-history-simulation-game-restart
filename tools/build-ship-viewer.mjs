// Bundles src/ship/*.mjs and tools/ship-viewer.template.html into one standalone HTML file.
// Usage: node tools/build-ship-viewer.mjs   ->  ship-viewer.html
import { readFileSync, writeFileSync } from 'node:fs';
import { bundleShipModules } from './ship-bundle.mjs';
const out = bundleShipModules();
const tpl = readFileSync(new URL('./ship-viewer.template.html', import.meta.url), 'utf8');
writeFileSync(new URL('../ship-viewer.html', import.meta.url), tpl.replace('/*BUNDLE*/', () => out));
console.log('wrote ship-viewer.html');
