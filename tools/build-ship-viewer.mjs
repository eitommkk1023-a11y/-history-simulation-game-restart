// Bundles src/ship/*.mjs and tools/ship-viewer.template.html into one standalone HTML file.
// Usage: node tools/build-ship-viewer.mjs   ->  ship-viewer.html
import { readFileSync, writeFileSync } from 'node:fs';
const order = ['hull-geometry', 'mass', 'hydrostatics', 'hull-params', 'dynamics', 'flooding', 'ship-model', 'samples'];
let out = '';
for (const name of order) {
  let src = readFileSync(new URL(`../src/ship/${name}.mjs`, import.meta.url), 'utf8');
  const names = [];
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.mjs';?\s*$/gm, (_, list, mod) => `const {${list}} = M_${mod.replace(/-/g, '_')};`);
  src = src.replace(/^export\s+(?:async\s+)?(function|const|class)\s+(\w+)/gm, (_, kind, n) => { names.push(n); return `${kind} ${n}`; });
  if (/^export\s*\{/m.test(src)) throw new Error(`unsupported export form in ${name}`);
  out += `const M_${name.replace(/-/g, '_')} = (() => {\n${src}\nreturn { ${names.join(', ')} };\n})();\n`;
}
out += `const Ship = Object.assign({}, ${order.map((n) => `M_${n.replace(/-/g, '_')}`).join(', ')});\n`;
const tpl = readFileSync(new URL('./ship-viewer.template.html', import.meta.url), 'utf8');
writeFileSync(new URL('../ship-viewer.html', import.meta.url), tpl.replace('/*BUNDLE*/', () => out));
console.log('wrote ship-viewer.html');
