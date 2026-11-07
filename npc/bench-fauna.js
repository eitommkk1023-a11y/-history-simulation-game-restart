'use strict';
// 動物の月次計算の、速さと同一性の検証：node npc/bench-fauna.js <旧generator.js> <新generator.js> <world.bin> [years]
// 旧と新で、同じ初期状態から同じ月数だけ進め、動物の状態（全個体群）が完全に一致することを確かめ、時間を比べる
const v8 = require('v8'), fs = require('fs'), path = require('path');
const Go = require(path.resolve(process.argv[2])), Gn = require(path.resolve(process.argv[3])), world = v8.deserialize(fs.readFileSync(process.argv[4])), YEARS = +(process.argv[5] || 20);
const env = world.fauna.env, cc = world.climate.cell;
const digest = (F) => { let s = 0; const h = (x) => { s = (Math.imul(s, 31) + (x | 0)) | 0; }; for (const sid of Object.keys(F.species).sort()) { const S = F.species[sid]; for (const p of S.pops) { h(p.alive ? 1 : 0); h(Math.round(p.pregnant * 1e6)); for (const a of p.juv) h(Math.round(a * 1e6)); for (const a of p.adults) h(Math.round(a * 1e6)); h(p.cells.length); for (const c of p.cells) h(c); h(Math.round(p.foodRatio * 1e9)); h(p.hunger); for (const k of Object.keys(p.deaths).sort()) h(Math.round(p.deaths[k] * 1e6)); } h(S.rngState); h(S.nextId); } return s >>> 0; };
const run = (G, ctxExtra) => { const F = G.faunaClone(world.fauna); const t0 = process.hrtime.bigint(); const ds = []; for (let i = 0; i < YEARS * 12; i++) { const month = i % 12; G.faunaMonthly(F, Object.assign({ month, env, cc }, ctxExtra)); if ((i + 1) % 12 === 0) ds.push(digest(F)); } return { ms: Number(process.hrtime.bigint() - t0) / 1e6, ds }; };
const snow = new Float32Array(cc.n || cc.w * cc.h), ash = new Float32Array(cc.n || cc.w * cc.h); for (let i = 0; i < snow.length; i += 7) snow[i] = (i % 13) * 6;   // 雪・火山灰がある場合も確かめる
let fail = 0; for (const [name, ex] of [['雪なし', {}], ['雪・灰あり', { snow, ash, tOff: 0.5 }]]) { const a = run(Go, ex), b = run(Gn, ex); const same = a.ds.every((d, i) => d === b.ds[i]); if (!same) fail++; console.log(`${name}：${YEARS}年 旧 ${(a.ms / YEARS / 12).toFixed(2)}ms/月 → 新 ${(b.ms / YEARS / 12).toFixed(2)}ms/月（${(a.ms / b.ms).toFixed(2)}倍）　結果の一致（毎年の検査値）：${same ? '○' : '×'}`); }
console.log(fail ? '一致しない' : '全て一致'); process.exit(fail ? 1 : 0);
