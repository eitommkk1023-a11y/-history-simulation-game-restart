// Shared by the build tools: turns src/ship/*.mjs into plain (non-module) JS that defines `const Ship`.
import { readFileSync } from 'node:fs';
export const SHIP_MODULE_ORDER = ['sea-state', 'hull-geometry', 'mass', 'hydrostatics', 'hull-params', 'dynamics', 'flooding', 'ship-model', 'pinta-1492-data', 'pinta-1492-params', 'pinta-design', 'pinta-furnishings', 'interior', 'samples', 'cargo', 'pinta-1492-scenario', 'crew', 'captain', 'fleet', 'hull-mesh', 'ship-render', 'pinta-render', 'wind-field', 'world-environment'];
export function bundleShipModules(order = SHIP_MODULE_ORDER) {
  let out = '';
  for (const name of order) {
    let src = readFileSync(new URL(`../src/ship/${name}.mjs`, import.meta.url), 'utf8');
    const names = [];
    src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.mjs';?\s*$/gm, (_, list, mod) => `const {${list.replace(/(\w+)\s+as\s+(\w+)/g, '$1: $2')}} = M_${mod.replace(/-/g, '_')};`);
    src = src.replace(/^export\s+(?:async\s+)?(function|const|class)\s+(\w+)/gm, (_, kind, n) => { names.push(n); return `${kind} ${n}`; });
    if (/^export\s*\{/m.test(src)) throw new Error(`unsupported export form in ${name}`);
    out += `const M_${name.replace(/-/g, '_')} = (() => {\n${src}\nreturn { ${names.join(', ')} };\n})();\n`;
  }
  return out + `const Ship = Object.assign({}, ${order.map((n) => `M_${n.replace(/-/g, '_')}`).join(', ')});\n`;
}
