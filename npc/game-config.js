'use strict';
// ゲームの設定値（F1）：世界の段階・人口・層の方針・目標の規模・外との交易の量を、1か所に集める。
// 値を変えるだけで、人口・段階が変わる（同じ設定・同じSeedなら、同じ結果）。［仮］は調整用の仮の値。
// 上書き（開発・検証用）：node では環境変数 WOH_CONFIG（JSON）、ブラウザでは、スクリプトの読み込み前に globalThis.__wohConfigPatch = {...} を置く。
(function (root) {
const DEFAULT = {
  version: 1,
  // 世界：生成の格子と広さ（情報。生成そのものは変わらない）。スマホ前提のため、広さは今のまま（約100km四方・陸地約4,400km²）
  world: { cells: 3000, widthM: 99866.7, landKm2: 4400 },
  // 段階：小規模ワールドの窓の広さ（m）・初期の村の数・村の人数の範囲・村どうしの距離（m）・窓の陸地率の下限。S4＝世界全体（窓なし。通常の世界）
  stages: {
    1: { sizeM: 20000, villages: 4, popMin: 100, popMax: 500, minDm: 3000, maxDm: 10000 },
    2: { sizeM: 40000, villages: 10, popMin: 100, popMax: 500, minDm: 3500, maxDm: 14000 },
    3: { sizeM: 80000, villages: 24, popMin: 100, popMax: 500, minDm: 4000, maxDm: 20000, minLand: 0.55 },
    4: { whole: true },
  },
  // 人口：初期人口の調整（立地の良さの順位 q で min(1, siteMin + siteSlope×q) 倍）と、分裂の人口
  population: { initSiteMin: 0.45, initSiteSlope: 0.85, splitPop: 220, splitPopSettled: 800, splitFedMin: 0.85 },
  // 層（個人・集計）の方針（ctx.layers を与えたときの既定値）
  layers: { cap: 300, nearCap: 2000, demoteRate: 0.25, promotePerMonth: 40, nearDist: 40 },
  // 規模の目標（目安。表示・検証用。ゲームの上限ではない）：世界全体と、最大の都市の人口
  targets: { worldPopulation: [100000, 300000], cityPopulation: [30000, 100000] },
  // 外との交易（地図の外の世界）：1か月に外から入る食料の量（0＝なし）。M2（輸送と外との交易）で使う。今は未使用
  trade: { externalFoodPerMonth: 0 },
};
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, patch) { const out = Array.isArray(base) ? base.slice() : Object.assign({}, base); for (const k of Object.keys(patch || {})) out[k] = isObj(base[k]) && isObj(patch[k]) ? merge(base[k], patch[k]) : patch[k]; return out; }
function validate(c) {
  const errs = [], num = (path, v, lo, hi) => { if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) errs.push(path + ' は ' + lo + '〜' + hi + ' の数（今：' + v + '）'); };
  for (const n of [1, 2, 3]) { const s = (c.stages || {})[n]; if (!s) { errs.push('stages.' + n + ' がない'); continue; } num('stages.' + n + '.sizeM', s.sizeM, 5000, 100000); num('stages.' + n + '.villages', s.villages, 1, 200); num('stages.' + n + '.popMin', s.popMin, 5, 100000); num('stages.' + n + '.popMax', s.popMax, s.popMin, 1e6); num('stages.' + n + '.minDm', s.minDm, 200, 50000); num('stages.' + n + '.maxDm', s.maxDm, s.minDm, 100000); }
  const p = c.population || {}; num('population.initSiteMin', p.initSiteMin, 0.05, 1); num('population.initSiteSlope', p.initSiteSlope, 0, 2); num('population.splitPop', p.splitPop, 20, 1e6); num('population.splitPopSettled', p.splitPopSettled, p.splitPop, 1e6); num('population.splitFedMin', p.splitFedMin, 0, 1);
  const l = c.layers || {}; num('layers.cap', l.cap, 10, 1e5); num('layers.nearCap', l.nearCap, l.cap, 1e6); num('layers.demoteRate', l.demoteRate, 0.01, 1); num('layers.promotePerMonth', l.promotePerMonth, 1, 1e5); num('layers.nearDist', l.nearDist, 1, 3000);
  const t = c.targets || {}; if (!Array.isArray(t.worldPopulation) || !Array.isArray(t.cityPopulation)) errs.push('targets の形が違う');
  num('trade.externalFoodPerMonth', (c.trade || {}).externalFoodPerMonth, 0, 1e12);
  return errs;
}
let patch = null; try { if (typeof process !== 'undefined' && process.env && process.env.WOH_CONFIG) patch = JSON.parse(process.env.WOH_CONFIG); else if (root.__wohConfigPatch) patch = root.__wohConfigPatch; } catch (e) { console.error('設定の上書きが読めない：', e.message); }
const CONFIG = patch ? merge(DEFAULT, patch) : DEFAULT;
const errs = validate(CONFIG); if (errs.length) { console.error('設定に問題があるため、既定の設定を使う：\n  ' + errs.join('\n  ')); }
const api = { CONFIG: errs.length ? DEFAULT : CONFIG, DEFAULT, validate, merge };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
