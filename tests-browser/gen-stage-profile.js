const G = require('./v30/gen_v5.js'); const rows = []; let prev = null; const t0 = Date.now();
const rep = (s) => { const k = String(s).replace(/（.*$/, '').replace(/ ?\d+ ?\/ ?\d+/, '').trim(); const t = Date.now(); if (!prev || prev.k !== k) { if (prev) rows.push([prev.k, t - prev.t]); prev = { k, t }; } };
const w = G.generateWorld(+process.argv[2] || 12345, rep); rows.push([prev.k, Date.now() - prev.t]);
console.log('全体', ((Date.now() - t0) / 1000).toFixed(1) + '秒'); const agg = {}; for (const [k, d] of rows) agg[k] = (agg[k] || 0) + d; console.log(Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => String(v).padStart(6) + 'ms  ' + k).join('\n'));
