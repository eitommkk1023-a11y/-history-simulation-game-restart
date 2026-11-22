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
  population: { initSiteMin: 0.45, initSiteSlope: 0.85, splitPop: 220, splitPopSettled: 500, splitFedMin: 0.85, surplusFert: 1.5, surplusDis: 0.6, surplusFrom: 3, surplusFull: 12, farmPerKm2: 5, farmRadiusKm: 3, farmFeeds: 8, capBase: 150, overcapDis: 0.5 },   /* farmFeeds：農民1人（土地の限り以内）が養う人数。capBase：農耕以外で養える人数。overcapDis：養える人数を超えた分の割合×これ＝病気のハザード（人があふれると病気・飢えで頭打ち） */   /* farmRadiusKm：畑にできるのは、集落から歩いて通える範囲（この半径の円）まで */   /* farmPerKm2：生活圏の1km²あたり、農民がこの人数を超えると収穫の伸びが鈍る（土地の限り。M1） */   /* surplus*：蓄えが surplusFrom か月分を超え surplusFull か月分に近いほど、出生が最大 +surplusFert、飢えに伴う病気が最大 −surplusDis（M1） */
  // 層（個人・集計）の方針（ctx.layers を与えたときの既定値）
  layers: { enabled: true, activateAbove: 3000, cap: 300, nearCap: 2000, demoteRate: 0.25, promotePerMonth: 40, nearDist: 40, focusM: 3000 },   // enabled：通常のプレイで層の方針を使う／activateAbove：個人の総数がこれを超えたときだけ働く／focusM：プレイヤー・カメラからこの距離（m）以内の集団は、個人にする
  // 集落の階層：定住の段階（minSettle：0野営 1半定住 2村）と人口（minPop）の下限。町以上は、今は人口だけ（M4 で水・衛生・統治・市場などの条件を足す）
  tiers: [
    { id: 'camp', label: '野営', minSettle: 0, minPop: 0 },
    { id: 'semi', label: '半定住', minSettle: 1, minPop: 0 },
    { id: 'village', label: '村', minSettle: 2, minPop: 0 },
    { id: 'town', label: '町', minSettle: 2, minPop: 1000 },
    { id: 'city', label: '都市', minSettle: 2, minPop: 10000 },
    { id: 'metropolis', label: '大都市', minSettle: 2, minPop: 50000 },
  ],
  // 台帳（食料を整数の刻みで記録）：enabled＝影の台帳を動かす（食料の本体は、まだ従来のモデル）
  ledger: { enabled: true, authority: true },   /* authority：食料の蓄えを、台帳の整数（1刻み＝100kcal）で持つ（M1）。false なら従来の小数のまま */
  // 食料の助け合い（M2-a）：飢えそうな村へ、関係の近い村が、人の背で食料を届ける（歩きなので数日分まで）
  aid: { enabled: true, maxPerMonth: 12, porterKg: 25, walkKmH: 3, walkHoursPerDay: 8, detour: 1.3, maxDays: 3, minRelation: 20, keepMonths: 6, needBelowMonths: 1.5, wantMonths: 3, lossPerDay: 0.005, maxPorters: 40 },
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
  const p = c.population || {}; num('population.initSiteMin', p.initSiteMin, 0.05, 1); num('population.initSiteSlope', p.initSiteSlope, 0, 2); num('population.splitPop', p.splitPop, 20, 1e6); num('population.splitPopSettled', p.splitPopSettled, p.splitPop, 1e6); num('population.splitFedMin', p.splitFedMin, 0, 1); num('population.surplusFert', p.surplusFert, 0, 5); num('population.surplusDis', p.surplusDis, 0, 0.95); num('population.farmFeeds', p.farmFeeds, 1, 50); num('population.capBase', p.capBase, 0, 5000); num('population.overcapDis', p.overcapDis, 0, 5); num('population.farmPerKm2', p.farmPerKm2, 1, 1000); num('population.farmRadiusKm', p.farmRadiusKm, 0.2, 30); num('population.surplusFrom', p.surplusFrom, 0, 36); num('population.surplusFull', p.surplusFull, (p.surplusFrom || 0) + 0.5, 60);
  const a = c.aid || {}; num('aid.maxPerMonth', a.maxPerMonth, 0, 1000); num('aid.porterKg', a.porterKg, 1, 500); num('aid.walkKmH', a.walkKmH, 0.5, 20); num('aid.walkHoursPerDay', a.walkHoursPerDay, 1, 24); num('aid.detour', a.detour, 1, 5); num('aid.maxDays', a.maxDays, 0.5, 30); num('aid.minRelation', a.minRelation, 0, 1000); num('aid.keepMonths', a.keepMonths, 0, 60); num('aid.needBelowMonths', a.needBelowMonths, 0, 12); num('aid.wantMonths', a.wantMonths, 0.5, 24); num('aid.lossPerDay', a.lossPerDay, 0, 0.5); num('aid.maxPorters', a.maxPorters, 1, 10000);
  const l = c.layers || {}; num('layers.cap', l.cap, 10, 1e5); num('layers.nearCap', l.nearCap, l.cap, 1e6); num('layers.demoteRate', l.demoteRate, 0.01, 1); num('layers.promotePerMonth', l.promotePerMonth, 1, 1e5); num('layers.nearDist', l.nearDist, 1, 3000); num('layers.activateAbove', l.activateAbove, 0, 1e7); num('layers.focusM', l.focusM, 100, 100000);
  const tr = c.tiers; if (!Array.isArray(tr) || tr.length < 3) errs.push('tiers は3つ以上の配列'); else tr.forEach((x, i) => { if (!x.id || !x.label || !(x.minSettle >= 0) || !(x.minPop >= 0)) errs.push('tiers.' + i + ' の形が違う'); if (i && (x.minSettle < tr[i - 1].minSettle || (x.minSettle === tr[i - 1].minSettle && x.minPop < tr[i - 1].minPop))) errs.push('tiers は、段階・人口が下から上へ並ぶ（' + i + '番目）'); });
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
