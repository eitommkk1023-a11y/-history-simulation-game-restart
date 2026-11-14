'use strict';
// ================================================================ 人々（民族・集団と、NPC による人口）
// 人口の本体は npc-core.js の Population（全住民に個人ID）。この中身は、民族・集団の配置、食料（狩猟・採集・漁労）、移住・分裂・接触。
// 集団の食料の状況（飢え・寒さ・病気）が、個人の死亡率・出生率に反映される。仕事（採集者・狩人・漁師）の人数と技能が収穫量になる。
// 生成（配置）は Seed で同じ結果：乱数は mulberry32、計算は四則演算と sqrt だけ。時間経過は Math.exp 等を使う。
// 数値の扱い：［研究］は研究データ、［仕様］は決めた値、［仮］はゲーム用の仮の値（調整用）
(function (root) {
const Npc = typeof require !== 'undefined' ? require('./npc-core.js') : root.WohNpc;
const Arch = typeof require !== 'undefined' ? require('./arch-gen.js') : root.WohArch, Settle = typeof require !== 'undefined' ? require('./settle-layout.js') : root.WohSettle;
const Nation = typeof require !== 'undefined' ? require('./nation.js') : root.WohNation, Tech = typeof require !== 'undefined' ? require('./tech.js') : root.WohTech;
const { Population, NJOB, NSKILL, SI, mix, SOC_K } = Npc, NONE = 0xffffffff, ALIVE = 0x7fffffff;

// ---------------------------------------------------------------- 設定値
const PE = {
  // ---- 生成
  ETHNICITIES: 100,                               // 初期民族数［仕様］
  SIZE_CLASS: [[0.3, 30, 60], [0.5, 60, 150], [0.2, 150, 250]],   // 初期人口：小・中・大の範囲［仕様］、割合［仮］（平均 約105人）
  MIN_SPACING: 45,                                // 初期配置の集団どうしの最小間隔（ブロック ≒ 150km）。置けなければ少しずつ縮める［仮］
  RIVER_STEP: 3,                                  // 川の点を何点おきに候補にするか［仮］
  SITE_SHARE: { river: 0.4, coast: 0.3, lake: 0.2, spring: 0.1 },   // 初期配置で、場所の種類をどの割合で選ぶか［仮］。種類ごとに、点数の2乗に比例して選ぶ（食料の多い海岸だけに偏らないように）
  SITE_RIVER_ONLY: false,                         // true：集落の候補を川の点だけにする（以前の挙動。比較・試験用）
  HELPER_SHARE: 0.35,                             // 仕事に就いていない10〜13歳・兼任の人が、採集に回る割合［仮］
  KNOW_DEFAULT: 0.15,                             // その仕事の人がいないときの技能（0〜1）［仮］
  FERT_ADJ: 1.5,
  AGRI_FERT: 0.3, AGRI_DIS: 0.3, AGRI_STARV: 0.5,   // 農耕・牧畜の効果［仮］：食料に占める割合（0.6で最大）に応じて、出生が増え（定住・離乳が早い）、基本の病気の死亡と飢えが減る（蓄えと安定した栄養）
  // 定住：0野営地（移動）→1半定住→2村。同じ場所に安定してとどまり、食料が豊かな場所で村になる［仮］
  SETTLE1_MONTHS: 60, SETTLE2_MONTHS: 120,     // 半定住・村になるまでの、同じ場所での安定した月数
  SETTLE2_POP: 50, SETTLE2_FED: 0.97, SETTLE2_P: 0.03,   // 村になる条件（人口・食料の充足）と確率（1か月）
  SETTLE_SITE_PCT: 0.65,                        // 暮らしやすさが、集団の配置の場所の上位35%なら「豊かな場所」
  VILLAGE_STORE: 0.25,                          // 定住の段階ごとに、蓄えられる量が増える割合
  VILLAGE_HUNGER: 3,                            // 村は、食料不足がこの月数ぶん長く続かないと、捨てて移住しない                                  // 年齢別出生率（全女性の平均）を、結婚している女性だけに当てるための補正［仮］
  FOOD_INIT: [1, 2],                              // 初期の蓄え（必要量の何か月分）［仮］
  // ---- 生活圏（半径＝R_BASE＋R_PER_SQRT×√人口、R_MIN〜R_MAX ブロック）［仮］
  R_BASE: 3, R_PER_SQRT: 0.4, R_MIN: 4, R_MAX: 9,
  // ---- 食料（kg は「食べ物の重さ」。肉・植物・魚とも 1kg ≒ 1,800kcal として扱う）［仮］
  KCAL_PER_KG: 1800,
  KCAL_ADULT: 2200,                               // 大人の女性 1日［研究：2,000〜2,500kcal］
  NEED_W: { infant: 0.25, small: 0.45, child: 0.6, teen: 0.85, man: 1.15, woman: 1.0, old: 0.85 },   // 年齢・性別の必要量の比［仮］
  WORK_DAYS: 20,                                  // 1か月に食料集めに出る日数［仮］
  LABOR_W: { teen: 0.4, adult: 1, old: 0.5, aged: 0.1 },   // 働き手として数える割合（10-14歳、15-59歳、60-69歳、70歳以上）［仮］
  POLICY_SHARE: 0.55,                             // 方針（狩猟・採集・漁）を指定したとき、その仕事に回す最低の割合［仮］
  LABOR_CHUNKS: 12,                               // 働き手の割り振りを何回に分けて決めるか［仮］
  // 採集：植物の指数（faunaPlantFood の 草・葉・新芽・木の実・果実）のうち人が食べられる割合［仮］
  PLANT_W: [0.12, 0.15, 0.5, 1.0, 1.0],
  GATHER_KG_PER_UNIT: 8,                          // 人が食べられる植物の指数 1 あたりの量（kg/km²/月、取り尽くせる上限）［仮］
  GATHER_RATE: 6,                                 // 熟練した採集者1人・1日の最大収穫（kg）［仮］
  GATHER_SKILL: [0.5, 0.5],                       // 効率＝a＋b×知識［仮］
  // 漁労：world.resources.cell の fishFresh/fishSea（t/年、セル全体）のうち獲れる量
  FISH_SHARE: 0.6,                                // 年間の漁獲の目安のうち、人が獲り尽くせる割合［仮］
  FISH_RATE: 8,                                   // 熟練した漁師1人・1日の最大漁獲（kg）［仮］
  FISH_SKILL: [0.35, 0.65],                       // 効率＝a＋b×知識［仮］
  FISH_COLD: 0.5,                                 // 月平均気温が 0℃ 未満の月の漁獲（氷）［仮］
  // 狩猟：faunaHunt（鹿）。狩りは数人の組で行う
  HUNT_PARTY: 6,                                  // 1組の人数［仮］
  HUNT_PARTIES: 4,                                // 1か月に出す組の数の上限［仮］
  HUNT_SKILL: [0.3, 0.6],                         // faunaHunt に渡す技術＝a＋b×知識（実験パネルの 低0.3〜高0.9 に合わせる）［仮］
  MEAT_VALUE: 3,                                  // 働き手の割り振りで、肉 1kg を植物・魚の何kg分と見るか（脂肪・たんぱく質の価値）［仮］
  HUNT_TIME: 'dawn',                              // 狩りの時間帯（鹿は薄明薄暮性）［仮］
  // 蓄え
  SPOIL: [0.08, 0.14],                            // 1か月に腐る割合＝a＋b×(気温/25℃)［仮］
  // 農耕・牧畜（技術の層 nation.js で、民族が「栽培」「牧畜」を持つと使える）［仮］
  FARM_RATE: 12,                                  // 熟練した農民1人・1日の最大収穫（kg。成長期の月のみ。肥沃な土地・技術で増える）
  FARM_LEARN_YEARS: 80,                           // 農耕を始めて、技能が最大になるまでの年数
  FARM_VALUE: 1, HERD_VALUE: 1.4,                 // 働き手の割り振りで、農産物・畜産物 1kg を採集物の何kg分と見るか
  HERD_KG: 5, HERD_PER: 20, HERD_GROW: 0.012,     // 家畜1頭・1か月の食料（乳・肉。kg）／牧人1人が世話できる頭数／1か月の増え方
  HERD_CAP: [10, 400],                            // 牧草地で支えられる頭数＝a＋b×草地の割合
  FARM_STORE: 1.2,                                // 農産物の割合が高いほど、蓄えられる量（倍）
  // 蓄えは3種類：穀物・根・木の実（長持ち）／生鮮（肉・魚・貝・果実・乳。すぐ傷む）／干物・燻製。1か月の傷み＝a＋b×(気温/25℃)［仮。個人の持ち物の表と同じ考え方］
  SPOIL_DUR: [0.015, 0.02], SPOIL_FRESH: [0.15, 0.15], SPOIL_DRIED: [0.006, 0.006],
  GATHER_DURABLE: 0.55,                           // 採集で得た食料のうち、長持ちする（根・木の実・草の実）割合
  RACK_KG: 200, RACK_YIELD: 0.8,                  // 干し棚1つが、1か月に干物へ変える生鮮の量（kg）と、干物になる割合
  STORE_MONTHS: 4,                                // 蓄えられる上限（必要量の何か月分。移動生活なので少ない）［仮］
  // ---- 人口：年齢別の死亡（年あたりの基本ハザード）［研究：Gurven & Kaplan 2007 の狩猟採集民の生命表に近づけた］
  // 乳児死亡 約20%、15歳までの生存 約55〜60%、40歳から死亡率が約 6.5%/年 ずつ増える（ゴンペルツ）
  H_AGE: [[0, 0.33], [1, 0.12], [2, 0.045], [5, 0.012], [10, 0.008], [15, 0.011]],   // [この年齢から, ハザード]
  H_GOMPERTZ_AGE: 40, H_GOMPERTZ: 1.067,
  DISEASE_SHARE: [0.6, 0.45],                     // 基本の死亡のうち病気の割合（15歳未満、15歳以上）［研究：病気が死因の 5〜7割］
  // 出生：年齢別出生率（15〜49歳の女性）の形、食料が十分なときの合計特殊出生率［研究：4〜6］
  TFR: 5.0,
  SEX_RATIO: 0.512,                               // 出生の男の割合［研究］
  FERT_FOOD: [0.6, 0.95],                         // 食料の充足（12か月の平均）がこの間で出生率 0→1［仮］
  // 飢え・寒さ・病気で増える死亡（年あたりのハザード）［仮］
  STARV_H: 2.5,                                   // 食料が全く無いとき（(1−充足率)^1.5 を掛ける）
  STARV_AGE: { child: 1.8, adult: 0.6, old: 1.5 },
  COLD_H: 0.35,                                   // 厳しい寒さ（月平均 −25℃）のとき
  COLD_T: [-5, 20],                               // 月平均気温が −5℃ より寒いと、20℃ 下がるまでに 0→1
  COLD_AGE: { infant: 2.5, child: 1.2, adult: 0.5, old: 1.6 },
  COLD_KNOW: 0.5,                                 // 狩猟の知識（毛皮の衣服）で寒さの害を減らす割合
  EPI_P: 0.0025,                                  // 疫病が始まる確率（1か月、人口 200 人あたり。接触した民族があると 1.5 倍）［仮］
  EPI_H: 1.0, EPI_MONTHS: [1, 3],                 // 疫病のあいだ加わるハザード、続く月数［仮］
  CROWD_POP: 200, CROWD_H: 0.03,                  // 人口がこれを超えると病気が増える（超えた割合×CROWD_H）［仮］
  HUNGER_FOOD: 0.9,                               // 充足率がこれ未満の月を「食料不足」と数える［仮］
  // ---- 知識（1か月あたり）［仮］
  KNOW_LEARN: 0.0045,                             // 経験で増える：LEARN×(その仕事の割合)×(1−知識)×人口の効果
  KNOW_DECAY: 0.0015,                             // 使わないと減る：DECAY×知識×(1−その仕事の割合×3)
  KNOW_POP: 60,                                   // これより小さい集団は知識を保ちにくい
  KNOW_SMALL: 0.004,                              // 小さい集団で減る量：SMALL×知識×(1−人口/KNOW_POP)
  // ---- 移動・移住・分裂・接触・全滅［仮］
  CAMP_MOVE_P: 0.35,                              // 野営地を生活圏の中で移す確率（1か月）
  MIG_HUNGER: 4,                                  // 食料不足がこの月数続くと移住先を探す
  MIG_RANGE: [12, 60],                            // 移住先を探す距離（ブロック）
  MIG_BETTER: 1.1,                                // 今の所よりこれだけ良くなければ移住しない
  MIG_CLEAR: 22,                                  // 他の集団の生活圏の中心からこれ以上離れた所に移る（ブロック）
  MOVE_SPEED: 25,                                 // 移動の速さ（ブロック/月 ≒ 80km）
  MOVE_FOOD: 0.7,                                 // 移動中の食料集めの効率
  RIVER_SNAP: 60,                                 // 指定された移住先から川を探す距離（ブロック）
  SPLIT_POP: 220,                                 // この人口を超えると分かれることがある
  SPLIT_P: 0.08,                                  // 分かれる確率（1か月）
  SPLIT_SHARE: [0.3, 0.45],                       // 分かれて出ていく割合
  SPLIT_RANGE: [12, 45],                          // 新しい集団の行き先の距離（ブロック）
  CONTACT_EXTRA: 6,                               // 生活圏の半径の和＋これ以内に近づくと接触（ブロック）
  EXTINCT_MIN: 3,                                 // これ未満になると全滅
  SITE_SAMPLES: 60,                               // 移住先・分裂先の候補の数
};

// ---------------------------------------------------------------- 年齢別の表（読み込み時に作る。四則演算だけ）
const PE_AGES = 81;
const PE_H0 = new Float64Array(PE_AGES), PE_DS = new Float64Array(PE_AGES), PE_ASFR = new Float64Array(PE_AGES);
const PE_NEED_M = new Float64Array(PE_AGES), PE_NEED_F = new Float64Array(PE_AGES), PE_LABOR = new Float64Array(PE_AGES);
const PE_STARV = new Float64Array(PE_AGES), PE_COLD = new Float64Array(PE_AGES);
(function peTables() {
  let h = 0, k = 0;
  for (let a = 0; a < PE_AGES; a++) {
    while (k < PE.H_AGE.length && PE.H_AGE[k][0] <= a) { h = PE.H_AGE[k][1]; k++; }
    if (a > PE.H_GOMPERTZ_AGE) h *= PE.H_GOMPERTZ;
    PE_H0[a] = h;
    PE_DS[a] = a < 15 ? PE.DISEASE_SHARE[0] : PE.DISEASE_SHARE[1];
  }
  // 年齢別出生率の形［研究：自然出生力の狩猟採集民（!Kung・Hadza など）に近い形］→ TFR に合わせる
  let s = 0;
  for (let a = 15; a < 50; a++) {
    const v = a < 20 ? 0.3 + 0.7 * (a - 15) / 5 : a < 30 ? 1 : a < 40 ? 1 - 0.45 * (a - 30) / 10 : 0.55 - 0.5 * (a - 40) / 10;
    PE_ASFR[a] = v; s += v;
  }
  for (let a = 15; a < 50; a++) PE_ASFR[a] *= PE.TFR / s;
  const W = PE.NEED_W, kg = PE.KCAL_ADULT * 30 / PE.KCAL_PER_KG;   // 大人の女性1人の1か月の必要量（kg）
  for (let a = 0; a < PE_AGES; a++) {
    const c = a < 2 ? W.infant : a < 5 ? W.small : a < 10 ? W.child : a < 15 ? W.teen : 0;
    PE_NEED_M[a] = kg * (c || (a < 60 ? W.man : W.old));
    PE_NEED_F[a] = kg * (c || (a < 60 ? W.woman : W.old));
    const L = PE.LABOR_W;
    PE_LABOR[a] = a < 10 ? 0 : a < 15 ? L.teen : a < 60 ? L.adult : a < 70 ? L.old : L.aged;
    PE_STARV[a] = a < 15 ? PE.STARV_AGE.child : a < 60 ? PE.STARV_AGE.adult : PE.STARV_AGE.old;
    PE_COLD[a] = a < 2 ? PE.COLD_AGE.infant : a < 15 ? PE.COLD_AGE.child : a < 60 ? PE.COLD_AGE.adult : PE.COLD_AGE.old;
  }
})();


// ---------------------------------------------------------------- 小さな道具
// 乱数（faRng と同じ mulberry32。state() で状態を保存できる）
function peRng(seed) {
  let a = seed >>> 0;
  const f = function () { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.state = () => a; f.set = (s) => { a = s | 0; };
  return f;
}
function peHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function peClamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function peTotal(g) { return g.pop || 0; }
// 表示用の6区分：男女×子ども(0-14)・大人(15-59)・高齢者(60+)（月ごとの集計から）
function peopleCounts(g) { const c = g.c6 || [0, 0, 0, 0, 0, 0]; return { mChild: c[0], mAdult: c[1], mOld: c[2], fChild: c[3], fAdult: c[4], fOld: c[5], total: g.pop || 0 }; }
function peRadius(pop) {
  const r = PE.R_BASE + PE.R_PER_SQRT * Math.sqrt(Math.max(0, pop));
  return r < PE.R_MIN ? PE.R_MIN : r > PE.R_MAX ? PE.R_MAX : r;
}
// HSL（0〜1）→ RGB（0〜255）。四則演算だけ
function peHsl(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const ch = (t) => { t = t - Math.floor(t); return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(ch(h + 1 / 3) * 255), Math.round(ch(h) * 255), Math.round(ch(h - 1 / 3) * 255)];
}

// ---------------------------------------------------------------- 世界ごとの下準備（保存しない。無ければ作る）
// 川の点を気候格子のセルごとに分けた索引、セルごとの暮らしやすさ、月ごとの作業用の配列
let peCache = null;
function peWorld(world, plantFood) {
  if (peCache && peCache.world === world) { if (plantFood) peCache.plantFood = plantFood; return peCache; }
  const cc = world.climate.cell, n = cc.n || cc.gridW * cc.gridH, cw = cc.w || cc.gridW, ch = cc.h || cc.gridH, step = cc.gridStep || 8;
  const W = (world.stats && world.stats.width) || Math.round(Math.sqrt(world.type.length)), H = world.type.length / W;
  const P = world.riverPts, np = P.length / 3;
  // 川の点（RIVER_STEP 点おき）をセルごとに（CSR 形式）
  const cnt = new Int32Array(n + 1);
  const cellOfPt = (k) => Math.min(ch - 1, (P[k * 3 + 1] / step) | 0) * cw + Math.min(cw - 1, (P[k * 3] / step) | 0);
  for (let k = 0; k < np; k += PE.RIVER_STEP) cnt[cellOfPt(k) + 1]++;
  for (let c = 0; c < n; c++) cnt[c + 1] += cnt[c];
  const pts = new Int32Array(cnt[n]), fill = cnt.slice(0, n);
  for (let k = 0; k < np; k += PE.RIVER_STEP) pts[fill[cellOfPt(k)]++] = k;
  const kmBlock = 3.33, cellKm2 = (step * kmBlock) * (step * kmBlock);
  peCache = {
    world, plantFood, cc, n, cw, ch, step, W, H, riverStart: cnt, riverPt: pts, kmBlock, cellKm2,
    site: new Float32Array(n).fill(-1),           // セルの暮らしやすさ（-1 は未計算）
    tick: 0, stamp: new Int32Array(n), plantLeft: new Float32Array(n), fishLeft: new Float32Array(n),
    dens: new Float32Array(n), densBy: {}, tmp5: new Float32Array(5),
  };
  return peCache;
}
function peCellOf(S, x, y) {
  return Math.min(S.ch - 1, Math.max(0, (y / S.step) | 0)) * S.cw + Math.min(S.cw - 1, Math.max(0, (x / S.step) | 0));
}
// セルの暮らしやすさ（kg/km²/年 の目安）：植物（年合計＋一番少ない月×4）＋魚＋鹿。四則演算だけ（生成にも使う）
function peSiteValue(S, world, c) {
  if (S.site[c] >= 0) return S.site[c];
  const cc = S.cc, env = world.fauna.env, out = S.tmp5, PW = PE.PLANT_W;
  let v = 0;
  if (env.land[c] > 40 && cc.zone[c]) {
    let sum = 0, mn = 1e9;
    for (let m = 0; m < 12; m++) {
      S.plantFood(c, m, out);
      const h = out[0] * PW[0] + out[1] * PW[1] + out[2] * PW[2] + out[3] * PW[3] + out[4] * PW[4];
      sum += h; if (h < mn) mn = h;
    }
    const rc = world.resources.cell;
    const fish = (rc.fishFresh[c] + rc.fishSea[c]) * 1000 * PE.FISH_SHARE / S.cellKm2;
    let game = 0; for (const sid in world.fauna.species) game += world.fauna.species[sid].suit[c] / 255 * 12;   // 獲物になる野生動物（鹿・牛・ヒツジとヤギ・イノシシ）の生息しやすさ
    v = (sum + mn * 4) * PE.GATHER_KG_PER_UNIT + fish + game;
    // 寒さ：年平均気温が低いほど暮らしにくい。高地も少し
    const T = cc.tAnnual[c] / 10;
    v *= T < -8 ? 0.15 : T < 4 ? 0.15 + 0.85 * (T + 8) / 12 : 1;
  }
  S.site[c] = v;
  return v;
}
// 川の点 k の近くの、乾いた陸のブロック（無ければ川の点そのもの）
function peDryNear(S, world, px, py) {
  const W = S.W, H = S.H, x0 = Math.round(px), y0 = Math.round(py);
  for (let r = 1; r <= 3; r++)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (world.type[i] && !world.water[i]) return { x, y };
    }
  return { x: Math.min(W - 1, Math.max(0, x0)), y: Math.min(H - 1, Math.max(0, y0)) };
}
// 2点の間に海があるか（歩いて行けるか）。2ブロックおきに調べる
function peSeaBetween(S, world, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy), k = Math.max(1, Math.ceil(d / 2));
  for (let i = 1; i < k; i++) {
    const x = Math.round(x0 + dx * i / k), y = Math.round(y0 + dy * i / k);
    if (!world.type[y * S.W + x]) return true;
  }
  return false;
}
// 近くの川の点（距離 maxD 以内で一番近いもの）
function peNearestRiver(S, x, y, maxD) {
  const P = S.world.riverPts, rc = Math.ceil(maxD / S.step);
  const cx = Math.min(S.cw - 1, (x / S.step) | 0), cy = Math.min(S.ch - 1, (y / S.step) | 0);
  let best = -1, bd = maxD * maxD;
  for (let yy = Math.max(0, cy - rc); yy <= Math.min(S.ch - 1, cy + rc); yy++)
    for (let xx = Math.max(0, cx - rc); xx <= Math.min(S.cw - 1, cx + rc); xx++) {
      const c = yy * S.cw + xx;
      for (let j = S.riverStart[c]; j < S.riverStart[c + 1]; j++) {
        const k = S.riverPt[j], ddx = P[k * 3] - x, ddy = P[k * 3 + 1] - y, dd = ddx * ddx + ddy * ddy;
        if (dd < bd) { bd = dd; best = k; }
      }
    }
  return best;
}


// ---------------------------------------------------------------- 文化の特徴（集団ごと、0〜1の8つ）と、そこから決まる民族の決まり
// 0外婚性 1母系性 2年長者の尊重 3世襲性 4合議性 5男系性 6成人年齢（0＝15歳〜1＝21歳） 7言葉のずれ（親の言語からの離れ具合）
const CULT_DIMS = 8;
const CULT_NAMES = ['外婚性', '母系性', '年長者の尊重', '世襲性', '合議性', '男系性', '成人年齢', '言葉のずれ'];
// 民族の決まり：継承（0長子 1男系長子 2末子 3母系 4兄弟 5選出 6指名）・首長（0長老 1能力 2世襲 3合議）・成人年齢
function peCultureRules(v) {
  // 係数は、各決まりが25・17・10・16・7・15・10%ほどになるように調整した［仮］
  const sc = [0.44 + 0.3 * v[3], 1.96 * v[5] * (1 - v[1]) * (0.5 + 0.5 * v[3]), 1.07 * (1 - v[3]) * (1 - v[2]) + 0.02, v[1] * v[1], 1.61 * v[2] * (1 - v[3]) * (1 - v[4]), 0.89 * v[4], 2.15 * v[2] * (1 - v[3]) * v[4]];
  let succession = 0; for (let k = 1; k < 7; k++) if (sc[k] > sc[succession]) succession = k;
  const ld = [v[2], 1.05 * (1 - v[3]) * (1 - v[2] * 0.5) + 0.12, 0.85 * v[3], 0.9 * v[4]];
  let leadership = 0; for (let k = 1; k < 4; k++) if (ld[k] > ld[leadership]) leadership = k;
  return { succession, leadership, adultAge: Math.round(15 + 6 * v[6]) };
}
function peCultDist(a, b) { let s2 = 0; for (let k = 0; k < CULT_DIMS; k++) s2 += (a[k] - b[k]) ** 2; return Math.sqrt(s2 / CULT_DIMS); }
// ---------------------------------------------------------------- 民族の形成・分裂・融合・吸収（年に1回、集団単位で計算する）
// 設定［仮］。ethSpeed（変化の速さ）は、ゲーム内の長い時間を短くして確かめるための倍率（標準 1）
const ETHNO = {
  LINK_D: 35,          // 同じ民族の集団が「つながっている」距離（ブロック）。近隣の距離（結婚・接触）と同じ
  NOISE: 0.035,        // 文化の特徴が毎年揺れる幅（一様乱数の±）
  PULL_CORE: 0.2,      // 本体・同じ塊の平均へ寄る強さ（1年）
  PULL_NEIGHBOR: 0.03, // 近くの他の民族の文化に寄る強さ（1年）
  SPLIT_DIST: 0.2,     // 分裂：本体との文化の距離（RMS）
  SPLIT_ISO: 60,       // 分裂：離れている年数（約3世代）
  SPLIT_POP: 80,       // 分裂：塊の人口
  SPLIT_P: 0.06,       // 分裂が起こる確率（1年）。距離が大きいほど高い
  MERGE_CONTACT: 40,   // 融合・吸収：接触している年数
  MERGE_X: 0.12,       // 融合・吸収：小さい民族の成人に対する、集団をまたぐ結婚（直近）の割合
  MERGE_DIST: 0.25,    // 融合：二つの民族の文化の距離
  ABSORB_DIST: 0.4,    // 吸収：文化の距離（小さい民族が依存している）
  ABSORB_RATIO: 0.3,   // この人口比より小さいと、融合でなく吸収
  MERGE_P: 0.05,       // 融合・吸収が起こる確率（1年）
  REIDENT_P: 0.2,      // 民族が変わった集団の大人が、新しい民族を自分の帰属にする確率（1年）
};
function peEthNew(people, parents, groupsMoved, core, kind) {
  const P = people.npc, id = people.nextEthId++, parent = people.ethnicities[parents[0] - 1];
  const h = peHash('ethcolor' + id) / 4294967296, rules = peCultureRules(core);
  const eth = { id, nameKey: 'eth:' + id, langId: parent.langId, family: parent.family, parent: parents[0], parents: parents.slice(), founded: P.day, alive: true, state: 'alive', origin: kind,
    color: peHsl((h + 0.31) % 1, 0.55 + 0.3 * ((h * 7) % 1), 0.45 + 0.15 * ((h * 13) % 1)), cult0: core.slice() };
  Object.assign(eth, rules); people.ethnicities.push(eth);
  for (const g of groupsMoved) g.ethId = id;
  peSyncEth(people); return eth;
}
function peEthYear(people, ev, rel) {
  const P = people.npc, speed = people.ethSpeed || 1, rnd = () => P.random();
  const live = people.groups.filter(g => g.alive && g.cult), byEth = new Map();
  for (const g of live) { if (!byEth.has(g.ethId)) byEth.set(g.ethId, []); byEth.get(g.ethId).push(g); }
  const nb = peNeighbors(people), gById = new Map(live.map(g => [g.id, g]));
  const wmean = (arr) => { const o = new Array(CULT_DIMS).fill(0); let w = 0; for (const g of arr) { const x = Math.max(1, g.pop); w += x; for (let k = 0; k < CULT_DIMS; k++) o[k] += g.cult[k] * x; } for (let k = 0; k < CULT_DIMS; k++) o[k] /= w || 1; return o; };
  // 民族ごとに、同じ民族でつながった集団の塊を作る。一番人口の多い塊が本体
  const info = new Map();
  for (const [eid, arr] of byEth) {
    const seen = new Set(), comps = [];
    for (const g of arr) { if (seen.has(g.id)) continue; const comp = [], q = [g]; seen.add(g.id); while (q.length) { const x = q.pop(); comp.push(x); for (const o of arr) if (!seen.has(o.id) && Math.hypot(o.x - x.x, o.y - x.y) <= ETHNO.LINK_D) { seen.add(o.id); q.push(o); } } comps.push(comp); }
    comps.sort((a, b) => b.reduce((s, g) => s + g.pop, 0) - a.reduce((s, g) => s + g.pop, 0));
    info.set(eid, { comps, core: wmean(comps[0]) });
  }
  // 文化の特徴の変化：本体は本体へ、離れた塊はその塊の平均へ寄り、近くの他の民族の文化へも少し寄る。毎年揺れる
  const pc = Math.min(0.6, ETHNO.PULL_CORE * speed), pn = Math.min(0.3, ETHNO.PULL_NEIGHBOR * speed), nz = ETHNO.NOISE * Math.sqrt(speed);
  const next = new Map();
  for (const [eid, I] of info) for (let c = 0; c < I.comps.length; c++) {
    const mean = c === 0 ? I.core : wmean(I.comps[c]);
    for (const g of I.comps[c]) {
      const v = g.cult.slice(), others = (nb[g.id] || []).map(i => gById.get(i)).filter(o => o && o.ethId !== g.ethId);
      for (let k = 0; k < CULT_DIMS; k++) {
        v[k] += pc * (mean[k] - v[k]) + (rnd() - 0.5) * 2 * nz;
        for (const o of others) v[k] += pn * (o.cult[k] - v[k]) / Math.max(1, others.length);
        v[k] = v[k] < 0 ? 0 : v[k] > 1 ? 1 : v[k];
      }
      next.set(g.id, v); g.iso = c === 0 ? 0 : (g.iso || 0) + 1;
    }
  }
  for (const g of live) g.cult = next.get(g.id);
  for (const [eid, I] of info) I.core = wmean(I.comps[0]);
  const you = people.player && people.player.id, youG = you >= 0 ? P.group[you] : 0;
  const mine = (arr) => arr.some(g => g.id === youG);
  // 分裂：離れた塊が、文化の距離・離れている年数・人口の条件をそろえたとき、確率的に新しい民族になる
  const touched = new Set();
  for (const [eid, I] of info) {
    const parent = people.ethnicities[eid - 1]; if (!parent || !parent.alive) continue;
    for (let c = 1; c < I.comps.length; c++) {
      const comp = I.comps[c], pop = comp.reduce((s, g) => s + g.pop, 0), iso = Math.min(...comp.map(g => g.iso || 0)), mean = wmean(comp), dist = peCultDist(mean, I.core);
      if (pop < ETHNO.SPLIT_POP || iso < ETHNO.SPLIT_ISO / speed || dist < ETHNO.SPLIT_DIST) continue;
      if (rnd() >= Math.min(0.5, ETHNO.SPLIT_P * speed * dist / ETHNO.SPLIT_DIST)) continue;
      const eth = peEthNew(people, [eid], comp, mean, 'split'); touched.add(eid);
      const g0 = comp[0]; ev.push({ type: 'ethSplit', imp: mine(comp) || rel(eid) ? 2 : 1, relevant: mine(comp) || rel(eid), eth: eth.id, parent: eid, groups: comp.map(g => g.id), x: g0.x, y: g0.y, iso, dist: +dist.toFixed(2), pop });
    }
  }
  // 融合・吸収：接触が長く、集団をまたぐ結婚が多く、文化が近い二つの民族
  const adultsOf = new Map(); for (const g of live) adultsOf.set(g.ethId, (adultsOf.get(g.ethId) || 0) + Math.max(0, g.pop - (g.c6 ? g.c6[0] + g.c6[3] : 0)));
  const popOf = new Map(); for (const g of live) popOf.set(g.ethId, (popOf.get(g.ethId) || 0) + g.pop);
  const pairs = new Set();
  for (const g of live) for (const id of nb[g.id] || []) { const o = gById.get(id); if (o && o.ethId !== g.ethId) pairs.add(Math.min(g.ethId, o.ethId) + '-' + Math.max(g.ethId, o.ethId)); }
  for (const [k, T] of Object.entries(people.ties)) { if (!pairs.has(k)) { T.ct = Math.max(0, T.ct - 2); } T.x *= 0.97; }
  for (const k of pairs) { const T = people.ties[k] || (people.ties[k] = { ct: 0, x: 0 }); T.ct++; }
  for (const k of pairs) {
    const [A, B] = k.split('-').map(Number), T = people.ties[k], ea = people.ethnicities[A - 1], eb = people.ethnicities[B - 1];
    if (!ea || !eb || !ea.alive || !eb.alive || touched.has(A) || touched.has(B) || !info.has(A) || !info.has(B)) continue;
    if (T.ct < ETHNO.MERGE_CONTACT / speed) continue;
    const pa = popOf.get(A) || 0, pb = popOf.get(B) || 0, small = pa <= pb ? A : B, big = small === A ? B : A, ratio = Math.min(pa, pb) / Math.max(1, Math.max(pa, pb));
    const dist = peCultDist(info.get(A).core, info.get(B).core);
    if (T.x < ETHNO.MERGE_X * Math.max(1, adultsOf.get(small) || 0)) continue;
    const absorb = ratio < ETHNO.ABSORB_RATIO;
    if (dist > (absorb ? ETHNO.ABSORB_DIST : ETHNO.MERGE_DIST)) continue;
    if (rnd() >= Math.min(0.5, ETHNO.MERGE_P * speed)) continue;
    const gA = byEth.get(A) || [], gB = byEth.get(B) || [], all = gA.concat(gB);
    touched.add(A); touched.add(B);
    if (absorb) {
      const es = people.ethnicities[small - 1]; es.alive = false; es.state = 'absorbed'; es.absorbedBy = big; for (const g of byEth.get(small) || []) g.ethId = big; peSyncEth(people);
      ev.push({ type: 'ethAbsorb', imp: all.some(g => g.id === youG) || rel(small) || rel(big) ? 2 : 1, relevant: all.some(g => g.id === youG) || rel(small) || rel(big), eth: big, small, x: all[0].x, y: all[0].y, ratio: +ratio.toFixed(2), dist: +dist.toFixed(2) });
    } else {
      const core = info.get(A).core.map((x, i) => (x * pa + info.get(B).core[i] * pb) / Math.max(1, pa + pb));
      const eth = peEthNew(people, [pa >= pb ? A : B, pa >= pb ? B : A], all, core, 'merge'); ea.alive = false; ea.state = 'merged'; ea.mergedInto = eth.id; eb.alive = false; eb.state = 'merged'; eb.mergedInto = eth.id;
      ev.push({ type: 'ethMerge', imp: all.some(g => g.id === youG) || rel(A) || rel(B) ? 2 : 1, relevant: all.some(g => g.id === youG) || rel(A) || rel(B), eth: eth.id, parents: eth.parents, x: all[0].x, y: all[0].y, ratio: +ratio.toFixed(2), dist: +dist.toFixed(2), w: pb / Math.max(1, pa + pb) });
    }
    delete people.ties[k];
  }
  // 帰属の移り変わり：民族が変わった集団の大人は、毎年一部が新しい民族を自分の帰属にする（元の民族は副次的な帰属として残る）
  const rp = Math.min(0.9, ETHNO.REIDENT_P * speed);
  for (let i = 0; i < P.n; i++) {
    if (P.death[i] !== ALIVE || !P.eth[i]) continue; const ge = P.groupEth[P.group[i]];
    if (ge && P.eth[i] !== ge && rnd() < rp) { P.ethSecondary.set(i, [P.eth[i]]); P.eth[i] = ge; }
  }
  if (you >= 0 && P.death[you] === ALIVE) people.playerEth = P.eth[you] || P.groupEth[P.group[you]];
}
// 動作確認用：民族が2集団以上ある民族から、1集団を新しい民族として分ける（開発者・テスト用）
function peopleForceEthSplit(people, ev) {
  const live = people.groups.filter(g => g.alive && g.cult), byEth = new Map(); for (const g of live) { if (!byEth.has(g.ethId)) byEth.set(g.ethId, []); byEth.get(g.ethId).push(g); }
  for (const [eid, arr] of byEth) if (arr.length >= 2) { const g = arr.slice().sort((a, b) => a.pop - b.pop)[0], eth = peEthNew(people, [eid], [g], g.cult, 'split'); ev.push({ type: 'ethSplit', imp: 2, relevant: true, eth: eth.id, parent: eid, groups: [g.id], x: g.x, y: g.y, iso: 0, dist: 0, pop: g.pop, forced: true }); return eth; }
  return null;
}
// ---------------------------------------------------------------- 首長（集団の長）：決め方は文化ごと
// 0長老制（年長で尊敬される人）／1能力制（尊敬・技能・判断力などの総合）／2世襲（前の首長の跡継ぎ）／3合議（上位3人の中で、一番尊敬される人が代表）。割合［仮］
const LEADERSHIP = ['長老制', '能力制', '世襲', '合議'];
const LEAD_W = [0.3, 0.3, 0.25, 0.15];
// force：全集団を決め直す（開始時）。yearly：年に1回の見直し（今の首長より15%以上高い人がいれば交代）。それ以外は、首長が亡くなった・いなくなった集団だけ
function peLeaders(people, ev, rel, force, yearly, silent) {
  const P = people.npc, ng = people.groups.length + 1, cur = (g) => g.leader;
  const adult = (i) => P.death[i] === ALIVE && P.age(i) >= P.adultAge(i);
  const need = []; for (const g of people.groups) { if (!g.alive) continue; const l = g.leader; const ok = l !== undefined && l >= 0 && adult(l) && P.group[l] === g.id; if (force || yearly || !ok) need.push([g, ok]); }
  if (!need.length) return;
  const rep = new Float32Array(P.n);   // 他の人から見た尊敬（普通の128からの差の合計）
  for (let i = 0; i < P.n; i++) { if (P.death[i] !== ALIVE) continue; const b = i * SOC_K; for (let s = 0; s < SOC_K; s++) { const j = P.relId[b + s]; if (j !== NONE) rep[j] += P.relV[(b + s) * 3 + 2] - 128; } }
  const cands = new Map(); for (const [g] of need) cands.set(g.id, []);
  for (let i = 0; i < P.n; i++) { if (!adult(i)) continue; const c = cands.get(P.group[i]); if (c) c.push(i); }
  const topSkill = (i) => { let m = 0; for (let k = 0; k < NSKILL; k++) m = Math.max(m, P.skills[i * NSKILL + k]); return m; };
  const merit = (i) => rep[i] * 0.5 + 0.5 * topSkill(i) + 0.3 * (P.stat(i, SI['判断力']) + P.stat(i, SI['計画力']) + P.stat(i, SI['洞察力'])) / 3;
  const you = people.player && people.player.id;
  for (const [g, ok] of need) {
    const C = cands.get(g.id); if (!C.length) continue;
    const eth = people.ethnicities[g.ethId - 1], rule = eth && eth.leadership !== undefined ? eth.leadership : 1;
    const old = g.leader === undefined ? -1 : g.leader;
    let best = -1, score = (i) => 0, council = null;
    if (rule === 0) { const old35 = C.filter(i => P.age(i) >= 35); score = (i) => P.age(i) + 0.15 * rep[i]; const L = old35.length ? old35 : C; for (const i of L) if (best < 0 || score(i) > score(best)) best = i; }
    else if (rule === 2 && old >= 0 && !ok && P.death[old] !== ALIVE) {
      const h = peFindHeir(people, old); if (h && P.group[h.id] === g.id && adult(h.id)) best = h.id;
      if (best < 0) { score = merit; for (const i of C) if (best < 0 || score(i) > score(best)) best = i; }
    } else if (rule === 2) { best = ok ? old : -1; if (best < 0) { score = merit; for (const i of C) if (best < 0 || score(i) > score(best)) best = i; } }
    else {
      score = merit; const sorted = C.slice().sort((a, b) => score(b) - score(a));
      if (rule === 3) { council = sorted.slice(0, 3); best = council.slice().sort((a, b) => rep[b] - rep[a])[0]; } else best = sorted[0];
    }
    if (best < 0) continue;
    if (council) g.council = council;
    // 今の首長が務まっているなら、15%以上高い人がいるときだけ交代（世襲は首長が亡くなったときだけ）
    if (ok && best !== old) { if (rule === 2) best = old; else if (!(score(best) > score(old) * 1.15 + 1)) best = old; }
    if (best !== old) {
      g.leader = best; g.leaderSince = P.day;
      if (!silent) { const mine = you !== undefined && you >= 0 && P.group[you] === g.id; ev.push({ type: 'leaderChange', imp: mine ? 2 : 1, relevant: mine || rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y, to: best, from: old, you: best === you }); }
    } else if (g.leader === undefined) g.leader = best;
  }
}
// ---------------------------------------------------------------- 提案：集団の方針・移住をプレイヤーの人物が提案する
// 集団の成人（最大30人を抽出）が、それぞれ賛成か反対かを判断する。必要な賛成：首長の提案は40%、一般の人は50%、首長が反対しているときは+10ポイント
const PROPOSALS = [['hunt', '方針：狩猟を優先'], ['gather', '方針：採集を優先'], ['fish', '方針：漁を優先'], ['farm', '方針：農耕を優先'], ['herd', '方針：牧畜を優先'], ['auto', '方針：自動に戻す'], ['share0', '分配：各世帯で持つ'], ['share25', '分配：収穫の25%を分ける'], ['share50', '分配：収穫の半分を分ける'], ['migrate', '移住：今いる場所へ']];
const SHARE_OF = { share0: 0, share25: 0.25, share50: 0.5 };
const PROP_NEED = { leader: 0.4, member: 0.5, leaderOppose: 0.1 };
const PROP_VOTERS = 30, PROP_COOLDOWN = 60;
function peVoterScore(people, v, proposer, kind, g, dist) {
  const P = people.npc, rnd = () => P.random();
  // 提案者への信頼（家族は高い）と、年長者の重み、首長の提案の重み
  const b = P.bondOf(v, proposer); let trust = b ? b[0] : 128;
  if (P.spouse[v] === proposer || P.mother[v] === proposer || P.father[v] === proposer || P.mother[proposer] === v || P.father[proposer] === v) trust += 50;
  else if ((P.mother[v] !== NONE && P.mother[v] === P.mother[proposer]) || (P.father[v] !== NONE && P.father[v] === P.father[proposer])) trust += 35;
  let sc = (trust - 128) / 5 + Math.max(-8, Math.min(8, (P.age(proposer) - 30) / 3)) + (g.leader === proposer ? 12 : 0);
  const cautious = (P.stat(v, SI['慎重さ']) - 128) / 5, curious = (P.stat(v, SI['好奇心']) - 128) / 6, jb = P.job[v];
  if (kind === 'migrate') {
    sc += 38 * Math.min(1, g.hunger / 4) - (g.hunger === 0 ? 22 : 0) - cautious * 1.2 + curious - dist / 6;
    if (P.house[v] !== NONE && P.house[v] === P.house[proposer]) sc += 4;
  } else {
    const focus = kind === 'gather' ? 1 : kind === 'hunt' ? 2 : kind === 'fish' ? 3 : kind === 'farm' ? 9 : kind === 'herd' ? 10 : 0;
    if (focus) sc += jb === focus ? 35 : ((jb >= 1 && jb <= 3) || jb === 9 || jb === 10 ? -10 : 0);
    if (kind in SHARE_OF) { const lv = SHARE_OF[kind], cur = g.share || 0; sc += (lv > cur ? 1 : lv < cur ? -1 : 0) * ((g.fed < 0.9 || g.hunger > 0 ? 14 : -4) + (jb >= 1 && jb <= 3 || jb === 9 ? -6 : 4)); }
    sc += (g.hunger >= 2 ? 10 : 0) - cautious;
  }
  return sc + (rnd() - 0.5) * 16;
}
// 提案の可否を調べ、投票して、通れば反映する。ctx：{ world, x, y（移住先のブロック座標）, day }
function peopleProposal(people, kind, ctx) {
  const P = people.npc, pl = people.player; if (!pl || pl.over || pl.id < 0) return { ok: false, reason: 'noPlayer' };
  if (!PROPOSALS.some(p => p[0] === kind)) return { ok: false, reason: 'unknown' };
  const me = pl.id, g = people.groups[P.group[me] - 1]; if (!g || !g.alive) return { ok: false, reason: 'noGroup' };
  if (P.age(me) < P.adultAge(me)) return { ok: false, reason: 'minor' };
  if (P.day < (pl.proposalReady || 0)) return { ok: false, reason: 'cooldown', wait: Math.ceil(((pl.proposalReady || 0) - P.day) / 30) };
  let dist = 0, target = null;
  if (kind === 'migrate') {
    if (g.moveTo) return { ok: false, reason: 'moving' };
    const S = peCache && peCache.world === ctx.world ? peCache : null; if (!S) return { ok: false, reason: 'noWorld' };
    const ns = peNearestSite(S, ctx.world, ctx.x, ctx.y, PE.RIVER_SNAP); if (!ns) return { ok: false, reason: 'noRiver' };
    target = peDryNear(S, ctx.world, ns.x, ns.y); target.site = peSiteTag(S, ctx.world, ns, people, g);
    if (peSeaBetween(S, ctx.world, g.x, g.y, target.x, target.y)) return { ok: false, reason: 'sea' };
    dist = Math.hypot(target.x - g.x, target.y - g.y); if (dist < 6) return { ok: false, reason: 'near' };
  } else if (kind in SHARE_OF) { if ((g.share || 0) === SHARE_OF[kind]) return { ok: false, reason: 'same' }; }
  else {
    if ((kind === 'farm' || kind === 'herd') && !peTechOf(people, g.ethId)[kind]) return { ok: false, reason: 'noTech' };
    if (g.policy === kind) return { ok: false, reason: 'same' };
  }
  // 投票（成人から最大30人）
  const L = P.members[g.id], adults = []; for (const v of L) if (P.death[v] === ALIVE && P.group[v] === g.id && v !== me && P.age(v) >= P.adultAge(v)) adults.push(v);
  const voters = []; const pool = adults.slice(); for (let i = 0; i < PROP_VOTERS && pool.length; i++) { const k = Math.floor(P.random() * pool.length); voters.push(pool[k]); pool[k] = pool[pool.length - 1]; pool.pop(); }
  if (!voters.length) return { ok: false, reason: 'alone' };
  let yes = 0; for (const v of voters) if (peVoterScore(people, v, me, kind, g, dist) > 0) yes++;
  const support = yes / voters.length, isLeader = g.leader === me;
  let leaderOppose = false; if (!isLeader && g.leader >= 0 && P.death[g.leader] === ALIVE) leaderOppose = peVoterScore(people, g.leader, me, kind, g, dist) <= 0;
  const need = isLeader ? PROP_NEED.leader : PROP_NEED.member + (leaderOppose ? PROP_NEED.leaderOppose : 0), passed = support >= need;
  pl.proposalReady = P.day + PROP_COOLDOWN * (passed ? 1 : 2);
  if (passed) { if (kind === 'migrate') { g.moveTo = { x: target.x, y: target.y, by: 'player', site: target.site }; } else if (kind in SHARE_OF) g.share = SHARE_OF[kind]; else g.policy = kind; }
  return { ok: true, passed, kind, support, need, voters: voters.length, isLeader, leaderOppose, group: g.id, eth: g.ethId, x: g.x, y: g.y };
}
// ---------------------------------------------------------------- プレイヤーの人物と、文化ごとの継承
// 継承の決まり（民族ごと）：0長子相続 1男系長子 2末子相続 3母系相続 4兄弟相続 5能力による選出 6指名。割合［仮］
const SUCCESSION = ['長子相続', '男系長子', '末子相続', '母系相続', '兄弟相続', '能力による選出', '指名'];
const SUCC_W = [0.3, 0.2, 0.1, 0.15, 0.05, 0.15, 0.05];
// 血縁：子・孫・きょうだい・きょうだいの子（生きている人だけ。亡くなった子・きょうだいを通した孫・甥姪も含む）
function peKin(P, id) {
  const m = P.mother[id], f = P.father[id], sibAll = new Set(), kidsAll = new Set();
  for (let i = 0; i < P.n; i++) {
    if (i === id) continue;
    if ((m !== NONE && P.mother[i] === m) || (f !== NONE && P.father[i] === f)) sibAll.add(i);
    if (P.mother[i] === id || P.father[i] === id) kidsAll.add(i);
  }
  const alive = (i) => P.death[i] === ALIVE, sib = [], kids = [], nephews = [], grand = [];
  for (const i of sibAll) if (alive(i)) sib.push(i);
  for (const i of kidsAll) if (alive(i)) kids.push(i);
  for (let i = 0; i < P.n; i++) {
    if (!alive(i)) continue;
    const mo = P.mother[i], fa = P.father[i];
    if ((mo !== NONE && sibAll.has(mo)) || (fa !== NONE && sibAll.has(fa))) nephews.push(i);
    if ((mo !== NONE && kidsAll.has(mo)) || (fa !== NONE && kidsAll.has(fa))) grand.push(i);
  }
  return { sib, kids, nephews, grand, sibAll };
}
function peFindHeir(people, id) {
  const P = people.npc, eth = people.ethnicities[(P.eth[id] || P.groupEth[P.group[id]]) - 1], rule = eth && eth.succession !== undefined ? eth.succession : 0;
  const K = peKin(P, id), elder = (a, b) => P.birth[a] - P.birth[b], younger = (a, b) => P.birth[b] - P.birth[a];
  const male = (i) => P.sex[i] === 1, female = (i) => P.sex[i] === 0, sorted = (arr, cmp) => arr.slice().sort(cmp);
  const isAdult = (i) => P.age(i) >= P.adultAge(i);
  const score = (i) => (P.stat(i, Npc.SI['判断力']) + P.stat(i, Npc.SI['洞察力']) + P.stat(i, Npc.SI['計画力']) + P.stat(i, Npc.SI['誠実性']) + P.stat(i, Npc.SI['社交性'])) / 5;
  const byScore = (a, b) => score(b) - score(a);
  const viaSister = (arr) => arr.filter(i => P.mother[i] !== NONE && K.sibAll.has(P.mother[i]) && P.sex[P.mother[i]] === 0);   // 姉妹の子（母系）
  const viaBrother = (arr) => arr.filter(i => P.father[i] !== NONE && K.sibAll.has(P.father[i]) && P.sex[P.father[i]] === 1);   // 兄弟の子（父系）
  const sonsLine = (arr) => arr.filter(i => P.father[i] === id || (P.father[i] !== NONE && male(P.father[i])));
  let order = [], adultsOnly = false;
  if (rule === 0) order = [sorted(K.kids, elder), sorted(K.grand, elder), sorted(K.sib, elder), sorted(K.nephews, elder)];
  else if (rule === 1) order = [sorted(K.kids.filter(male), elder), sorted(K.grand.filter(i => male(i) && sonsLine([i]).length), elder), sorted(K.sib.filter(male), elder), sorted(viaBrother(K.nephews).filter(male), elder)];
  else if (rule === 2) order = [sorted(K.kids, younger), sorted(K.grand, younger), sorted(K.sib, younger), sorted(K.nephews, younger)];
  else if (rule === 3) order = female(id) ? [sorted(K.kids.filter(female), elder), sorted(viaSister(K.nephews).filter(female), elder), sorted(K.sib.filter(female), elder)] : [sorted(viaSister(K.nephews), elder), sorted(K.sib.filter(female), elder)];
  else if (rule === 4) order = [sorted(K.sib, elder), sorted(K.kids, elder), sorted(K.nephews, elder)];
  else if (rule === 5) { adultsOnly = true; const grp = []; for (let i = 0; i < P.n; i++) if (P.death[i] === ALIVE && P.group[i] === P.group[id] && i !== id && isAdult(i)) grp.push(i); order = [sorted(K.kids.concat(K.grand, K.sib, K.nephews).filter(isAdult), byScore), sorted(grp, byScore)]; }
  else { adultsOnly = true; const d = people.player && people.player.designated; order = [d !== null && d !== undefined && P.death[d] === ALIVE ? [d] : [], sorted(K.kids.concat(K.grand, K.sib, K.nephews).filter(isAdult), byScore)]; }
  // 決まりで見つからなければ、血縁をたどる（子→孫→きょうだい→きょうだいの子）。選出・指名は成人を優先する
  order.push(sorted(K.kids, elder), sorted(K.grand, elder), sorted(K.sib, elder), sorted(K.nephews, elder));
  const seen = new Set(), flat = []; for (const L of order) for (const i of L) if (!seen.has(i)) { seen.add(i); flat.push(i); }
  const pick = adultsOnly ? (flat.find(isAdult) !== undefined ? flat.find(isAdult) : flat.find(i => P.age(i) >= 1)) : flat.find(i => P.age(i) >= 1);
  return pick !== undefined ? { id: pick, rule, minor: !isAdult(pick) } : null;
}
function peopleCreatePlayer(people, sd) {
  const P = people.npc, rng = peRng(sd ^ peHash('player')), cand = [];
  for (let i = 0; i < P.n; i++) { if (P.death[i] !== ALIVE) continue; const a = P.age(i), e = P.eth[i] || P.groupEth[P.group[i]]; if (e === people.playerEth && a >= 20 && a < 35) cand.push(i); }
  if (!cand.length) for (let i = 0; i < P.n; i++) if (P.death[i] === ALIVE && P.age(i) >= P.adultAge(i)) cand.push(i);
  const id = cand.length ? cand[Math.floor(rng() * cand.length)] : -1;
  people.player = { id, dynasty: id >= 0 ? [id] : [], gen: 1, lineage: 1, onExtinct: 'continue', designated: null, over: false, minorUntil: 0, activity: 'auto' };
  peApplyActivity(people);
  return people.player;
}
// プレイヤーの人物の活動（他の人の選択肢と同じ）：auto＝他の人と同じ自動の判断／work＝本業／gather・hunt・fish＝採集・狩り・漁／study＝学ぶ／body＝体を鍛える／family＝家族との時間
const ACTIVITIES = [['auto', '自動'], ['work', '本業'], ['gather', '採集'], ['hunt', '狩り'], ['fish', '漁'], ['study', '学ぶ'], ['body', '体を鍛える'], ['family', '家族']];
const ACT_JOB = { gather: 1, hunt: 2, fish: 3 };
function peApplyActivity(people) {
  const P = people.npc, pl = people.player;
  if (!pl || pl.id < 0 || pl.over) { P.actId = -1; P.actKind = 'auto'; P.actJob = 0; return; }
  const k = pl.activity || 'auto';
  P.actId = pl.id; P.actKind = k; P.actJob = ACT_JOB[k] || 0;
}
function peopleSetActivity(people, kind) {
  if (!people.player || !ACTIVITIES.some(a => a[0] === kind)) return false;
  people.player.activity = kind; peApplyActivity(people); return true;
}
// 毎月：プレイヤーの人物が亡くなっていたら、その文化の決まりで跡継ぎへ。いなければ、開始時の選択（続ける／ゲームオーバー）に従う
function peopleSuccession(people, ev) {
  const pl = people.player, P = people.npc; if (!pl || pl.over || pl.id < 0 || P.death[pl.id] === ALIVE) return;
  const dead = pl.id, deadEth = P.eth[dead] || P.groupEth[P.group[dead]], h = peFindHeir(people, dead), at = { x: 0, y: 0 };
  const gx = people.groups[P.group[dead] - 1]; if (gx) { at.x = gx.x; at.y = gx.y; }
  if (h) {
    pl.activity = 'auto'; pl.id = h.id; pl.gen++; pl.dynasty.push(h.id); pl.designated = null; pl.minorUntil = h.minor ? P.day + Math.ceil((P.adultAge(h.id) - P.age(h.id)) * 360) : 0;
    ev.push({ type: 'playerSucceed', imp: 2, relevant: true, eth: deadEth, x: at.x, y: at.y, rule: h.rule, minor: h.minor, from: dead, to: h.id });
    return;
  }
  if (pl.onExtinct === 'gameover') { pl.over = true; ev.push({ type: 'playerEnd', imp: 3, relevant: true, eth: deadEth, x: at.x, y: at.y, from: dead }); return; }
  // 続ける：同じ集団の別の成人が、新しい一族の人物になる
  // 同じ集団の成人 → 同じ民族の成人 → 世界の誰か、の順に探す（一番若い成人）
  let best = -1;
  for (const scope of [(i) => P.group[i] === P.group[dead], (i) => (P.eth[i] || P.groupEth[P.group[i]]) === deadEth, () => true]) {
    for (let i = 0; i < P.n; i++) if (P.death[i] === ALIVE && scope(i) && P.age(i) >= P.adultAge(i) && (best < 0 || P.birth[i] > P.birth[best])) best = i;
    if (best >= 0) break;
  }
  if (best < 0) { pl.over = true; ev.push({ type: 'playerEnd', imp: 3, relevant: true, eth: deadEth, x: at.x, y: at.y, from: dead }); return; }
  pl.activity = 'auto'; pl.id = best; pl.lineage++; pl.gen = 1; pl.dynasty = [best]; pl.minorUntil = 0;
  ev.push({ type: 'playerNewLine', imp: 2, relevant: true, eth: deadEth, x: at.x, y: at.y, from: dead, to: best });
}
// 人物の野営地（ブロック座標）。3D のキャラクターを置く場所
function peCampOfPerson(people, id) { const g = people.groups[people.npc.group[id] - 1]; return g ? { x: g.x, y: g.y } : null; }
// プレイヤーの人物の表示用の情報
function peopleYou(people) {
  const pl = people.player, P = people.npc; if (!pl || pl.id < 0) return null;
  const id = pl.id, K = peKin(P, id), e = people.ethnicities[(P.eth[id] || P.groupEth[P.group[id]]) - 1];
  return { id, age: Math.floor(P.age(id)), sex: P.sex[id] === 1 ? '男' : '女', eth: e ? e.id : 0, rule: e ? SUCCESSION[e.succession] : '', gen: pl.gen, lineage: pl.lineage, kids: K.kids.length, spouse: P.spouse[id] !== NONE, leader: people.groups[P.group[id] - 1] ? people.groups[P.group[id] - 1].leader : -1, over: pl.over, minor: pl.minorUntil > P.day, activity: pl.activity || 'auto', camp: peCampOfPerson(people, id) };
}

// ---------------------------------------------------------------- 集計：生きている人を1回走査して、集団ごとの数を出す
function peStats(people) {
  const P = people.npc, ng = people.groups.length + 1, n = P.n;
  const st = people.stat && people.stat.ng === ng ? people.stat : (people.stat = {
    ng, pop: new Float64Array(ng), need: new Float64Array(ng), labor: new Float64Array(ng), lab: new Float64Array(ng * NJOB), sk: new Float64Array(ng * 4), c6: new Float64Array(ng * 6), women: new Float64Array(ng),
  });
  if (!st.jobCount) st.jobCount = new Float64Array(ng * NJOB); st.jobCount.fill(0);
  st.pop.fill(0); st.need.fill(0); st.labor.fill(0); st.lab.fill(0); st.sk.fill(0); st.c6.fill(0); st.women.fill(0);
  const day = P.day;
  for (let i = 0; i < n; i++) {
    if (P.death[i] !== ALIVE) continue;
    const g = P.group[i], a = Math.max(0, Math.min(80, Math.floor((day - P.birth[i]) / 360))), male = P.sex[i] === 1;
    const away = people.serviceAvailability && people.serviceAvailability.get(i), share = away ? 1 - Math.max(0, Math.min(30, away.awayDays)) / 30 : 1;
    st.pop[g]++; st.need[g] += (male ? PE_NEED_M[a] : PE_NEED_F[a]) * share;
    const lw = PE_LABOR[a] * share; st.labor[g] += lw;
    // プレイヤーの人物は、選んだ活動の仕事として数える（家族・学ぶ・体を鍛えるは食料の仕事に数えない）
    const j = i === P.actId && P.actKind !== 'auto' && P.actKind !== 'work' ? P.actJob : P.job[i];
    if (j) { st.jobCount[g * NJOB + j] += share; st.lab[g * NJOB + j] += lw; if (j <= 3) st.sk[g * 4 + j] += P.skills[i * NSKILL + j - 1] * share; }
    st.c6[g * 6 + (a < 15 ? 0 : a < 60 ? 1 : 2) + (male ? 0 : 3)]++;
    if (!male && a >= 15 && a < 50) st.women[g]++;
  }
  for (const g of people.groups) { const k = g.id; g.pop = st.pop[k]; g.c6 = Array.from(st.c6.subarray(k * 6, k * 6 + 6)); }
  return st;
}
// 集団の状況（飢え・寒さ・病気）を、個人の死亡率・出生率に反映する表（集団の id で引く）
function peHazards(people) {
  const ng = people.groups.length + 1;
  if (!people.haz || people.haz.starv.length < ng + 8) {
    const o = people.haz, mk = (a, fill) => { const b = new Float32Array(ng + 64).fill(fill); if (a) b.set(a); return b; };
    people.haz = { starv: mk(o && o.starv, 0), cold: mk(o && o.cold, 0), dis: mk(o && o.dis, 0), hungerDis: mk(o && o.hungerDis, 1), fert: mk(o && o.fert, 1) };
  }
  return people.haz;
}
function peInstall(people) {
  const P = people.npc, hz = peHazards(people), last = new Float64Array(4);
  P.hazardFn = (a, g, i) => {
    const ai = a >= 80 ? 80 : a < 0 ? 0 : Math.floor(a), h0 = PE_H0[ai], ds = PE_DS[ai];
    const ext = people.serviceNutrition && people.serviceNutrition.get(i), ratio = ext ? Math.max(0, Math.min(1, ext.ratio)) : null;
    const starv = ext ? PE.STARV_H * Math.pow(1 - ratio, 1.5) : hz.starv[g], hungerDis = ext ? 1 + (1 - ratio) : hz.hungerDis[g];
    const hn = h0 * (1 - ds), hd = h0 * ds * hungerDis + hz.dis[g] * (ai < 5 || ai >= 60 ? 1.5 : 1), hs = starv * PE_STARV[ai], hc = hz.cold[g] * PE_COLD[ai];
    last[0] = hn; last[1] = hd; last[2] = hs; last[3] = hc;
    const care = i !== undefined && P.actKind === 'family' && a < 5 && P.house[i] !== NONE && P.house[i] === P.house[P.actId] ? 0.7 : 1;   // 家族の時間：同じ世帯の幼い子は死ににくい
    return (hn + hd + hs + hc) * care;
  };
  P.fertFn = (a, g, i) => { const ai = Math.floor(a); return ai >= 15 && ai < 50 ? PE_ASFR[ai] * hz.fert[g] * PE.FERT_ADJ * (i !== undefined && P.actKind === 'family' && P.spouse[i] === P.actId ? 1.4 : 1) : 0; };   // 家族の時間：配偶者の出産が増える
  P.onBirth = (g) => { people.groups[g - 1].born++; };
  // 集団をまたぐ結婚：外婚性の高い文化ほど、隣の集団の男性を選ぶ。夫が妻の集団へ移るのは、母系性の高い集団［仮］
  P.crossFn = (g, i) => {
    const gr = people.groups[g - 1], nb = people.nbr && people.nbr[g]; if (!gr || !nb || !nb.length) return 0;
    const exo = gr.cult ? 0.03 + 0.45 * gr.cult[0] : 0.03; if (P.random() >= exo) return 0;
    const ok = nb.filter(x => P.pool[x] && P.pool[x].length); return ok.length ? ok[Math.floor(P.random() * ok.length)] : 0;
  };
  P.residenceFn = (gWife, gHusband) => { const w = people.groups[gWife - 1]; return !!(w && w.cult && w.cult[1] > 0.6); };
  P.onCross = (i, j) => { const a = P.eth[i] || P.groupEth[P.group[i]], b = P.eth[j] || P.groupEth[P.group[j]]; if (a && b && a !== b) peTie(people, a, b).x++; };
  P.adultAgeFn = (e) => { const x = people.ethnicities[e - 1]; return x && x.adultAge ? x.adultAge : 18; };
  // 死因（10分類）：1老衰 2非感染性疾患 3感染症 4戦死 5殺害 6事故 7飢餓 8出産関連 9災害 10環境（戦死・殺害・出産関連はまだ起こらない）
  P.onDeath = (i) => {
    const D = people.groups[P.group[i] - 1].died, tot = last[0] + last[1] + last[2] + last[3], a = P.age(i);
    let r = P.random() * tot;
    if ((r -= last[0]) <= 0) { D.natural++; P.pendingCause = a >= 60 ? 1 : P.random() < 0.5 ? 2 : 6; }
    else if ((r -= last[1]) <= 0) { D.disease++; P.pendingCause = 3; }
    else if ((r -= last[2]) <= 0) { D.starvation++; P.pendingCause = 7; }
    else { D.cold++; P.pendingCause = 10; }
  };
}
// 近くの集団（他の民族も含む）：結婚・接触・文化の影響の範囲
const NBR_D = 35;   // ブロック（約115km）［仮］
function peNeighbors(people) {
  const live = people.groups.filter(g => g.alive), nb = {};
  for (const g of live) nb[g.id] = [];
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) { const a = live[i], b = live[j], dx = a.x - b.x, dy = a.y - b.y; if (dx * dx + dy * dy <= NBR_D * NBR_D) { nb[a.id].push(b.id); nb[b.id].push(a.id); } }
  people.nbr = nb; return nb;
}
function peTie(people, a, b) { const k = Math.min(a, b) + '-' + Math.max(a, b); return people.ties[k] || (people.ties[k] = { ct: 0, x: 0 }); }
function peEnsureGroups(people) { people.npc.ensureGroups(people.groups.length + 1); return peHazards(people); }
// ---------------------------------------------------------------- 集落の建築・配置との接続（arch-gen.js / settle-layout.js）
// 表示用の中心：定住した集団（半定住・村）は拠点の位置、野営地は今の位置
function peCampCenter(g) { return (g.settle || 0) >= 1 ? { x: g.homeX, y: g.homeY } : { x: g.x, y: g.y }; }
function peSettleHistInit(people, g, sd, fresh) {
  if (!Settle) return; const eth = people.ethnicities[g.ethId - 1], nb = people.nbr && people.nbr[g.id] ? people.nbr[g.id].some(i => { const o = people.groups[i - 1]; return o && o.ethId !== g.ethId; }) : false;
  const cult = g.cult || [], techBias = ((cult[2] || 0.5) - 0.5) * 0.12 + ((cult[3] || 0.5) - 0.5) * 0.06;
  g.hist = Settle.settleHistory(sd, g.id, g.settle || 0, g.pop || 0, g.siteQ === undefined ? 0.5 : g.siteQ, { neighbors: nb, cultureTech: techBias });
  if (fresh) { g.hist.age = 0; g.hist.foundedYear = Math.floor((people.npc ? people.npc.day : 0) / 360); g.hist.status = 'young'; g.hist.events = []; g.hist.defense = 0; }
  g.layout = null;
}
// 世帯の一覧：世帯IDは夫のID。親族（kin）は、夫の母の世帯（いなければ自分の世帯）
function peopleHouseholds(people, gid) {
  const P = people.npc, m = new Map();
  for (const i of P.members[gid] || []) { if (P.death[i] !== ALIVE || P.group[i] !== gid) continue; const hh = P.house[i] !== NONE ? P.house[i] : i; m.set(hh, (m.get(hh) || 0) + 1); }
  const out = []; for (const [hh, n] of m) { let kin = hh; if (hh < P.n) { const mo = P.mother[hh]; if (mo !== NONE && P.house[mo] !== NONE) kin = P.house[mo]; } out.push({ house: hh, members: n, kin }); }
  return out;
}
// 暮らしの割合（採集・狩り・漁・道具づくり）：集落に何が必要かを決める。農耕・牧畜・交易は、条件のある集団のときだけ（まだ実装されていない生業の接続口）
function peopleEconomy(people, gid) {
  const P = people.npc, pop = Math.max(1, (people.groups[gid - 1] || {}).pop || 1), c = (j) => P.gcount[gid * NJOB + j] / pop, fl = P.gflags[gid];
  const g = people.groups[gid - 1] || {};
  return { gather: c(1), hunt: c(2), fish: c(3), tool: c(4), farm: !!(fl & 1) && c(9) > 0, herd: !!(fl & 2) && c(10) > 0, trade: !!(fl & 4) && c(11) > 0, farmLv: g.fieldLv || 0, herdN: Math.round(g.herdN || 0) };
}
// 建築伝統の元になる民族：分裂した民族は親の、融合した民族は主な親の系統を受け継ぐ
function peRootEth(people, id) { let e = people.ethnicities[id - 1], n = 0; while (e && e.parents && e.parents.length && n++ < 50) e = people.ethnicities[e.parents[0] - 1]; return e ? e.id : id; }
// ---- 建築知識：集団ごとに、知っている建築技法（g.arch.have：技法→身につけた日）と、他民族から受けた様式の影響（g.arch.infl）を持つ。
// 民族の技術の層から身につくものと、近くの集団（とくに他民族）との交流で伝わるものがある。乱数は主の乱数列を使わない（決定的）
const ARCH = { P: 0.035, REGION: 0.3, INFL_MAX: 0.4, D: 200 };   // ARCH_P ほか   // 仮の値：交流で伝わる確率（年・1対1）、地域差の強さ、他民族の様式の影響の上限、交流の届く距離（グリッド。集団の最近傍の距離は中央値およそ100）
const peArchU = (sd, a, b) => Npc.mix(sd, a, b, 8800) / 4294967296;
function peArchInit(people, g) {
  if (!Arch || !Arch.BASE_TECHS) return null; if (g.arch) return g.arch;
  const S = people.nation, sd = people.npc.seed, have = {}; for (const id of Arch.BASE_TECHS) have[id] = -1e9;
  Arch.TECH_IDS.forEach((id, k) => { const T = Arch.TECHS[id]; if (!T.nodes || !S) return; if (T.nodes.some(n => Nation.hasNode(S, g.ethId, n))) have[id] = -Math.round((20 + peArchU(sd, g.id, k) * 220) * 360); });   // 開始前から持っていた技法：開始の20〜240年前（推定）
  g.arch = { have, from: {}, infl: [] }; return g.arch;
}
function peArchYear(people) {
  if (!Arch || !Arch.TECH_IDS || !people.npc) return; const S = people.nation, sd = people.npc.seed, day = people.npc.day, year = Math.floor(day / 360), live = people.groups.filter(g => g.alive), add = [], nb = {};
  for (const g of live) nb[g.id] = [];   // 交流の届く範囲にある集団（peNeighbors の距離は、この世界の広さでは短すぎて近隣がほぼ無いため、別に持つ）
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) { const a = live[i], b = live[j], dx = a.x - b.x, dy = a.y - b.y; if (dx * dx + dy * dy <= ARCH.D * ARCH.D) { nb[a.id].push(b.id); nb[b.id].push(a.id); } }
  for (const g of live) peArchInit(people, g);
  for (const g of live) {
    const A = g.arch, ex = (g.cult && g.cult[0] !== undefined ? g.cult[0] : 0.5);
    Arch.TECH_IDS.forEach((id, k) => { const T = Arch.TECHS[id]; if (A.have[id] !== undefined || !T.nodes || !S) return; if (T.nodes.some(n => Nation.hasNode(S, g.ethId, n))) add.push({ g, id, from: null }); });   // 自分たちの技術の層から
    for (const oid of nb[g.id] || []) {   // 近くの集団から学ぶ（同じ民族の集団どうしは学びやすく、他民族とは様式がしみこむ）
      const o = people.groups[oid - 1]; if (!o || !o.alive || !o.arch) continue; const c = Math.max(0, 1 - Math.hypot(o.x - g.x, o.y - g.y) / ARCH.D); if (c <= 0) continue; const other = o.ethId !== g.ethId;
      Arch.TECH_IDS.forEach((id, k) => { if (A.have[id] !== undefined || o.arch.have[id] === undefined || o.arch.have[id] > day) return; if (peArchU(sd, g.id * 7919 + oid, k + year * 31) < ARCH.P * c * (other ? 0.8 : 1.6) * (0.5 + ex)) add.push({ g, id, from: o }); });
      if (other) { let f = A.infl.find(x => x.eth === o.ethId); if (!f) { f = { eth: o.ethId, w: 0, since: day }; A.infl.push(f); } f.w = Math.min(ARCH.INFL_MAX, f.w + 0.012 * c * (0.5 + ex)); }
    }
    if (A.infl.length > 4) { A.infl.sort((a, b) => b.w - a.w); A.infl.length = 4; }
  }
  for (const a of add) { if (a.g.arch.have[a.id] !== undefined) continue; a.g.arch.have[a.id] = day; a.g.arch.from[a.id] = a.from ? { eth: a.from.ethId, grp: a.from.id, day } : { own: 1, day }; }
}
function peopleTradition(people, world, gid) {
  const g = people.groups[gid - 1], eth = people.ethnicities[g.ethId - 1], c = peCampCenter(g), sd = people.npc.seed, env = Arch.envAt(world, c.x, c.y), A = peArchInit(people, g);
  let gen = Arch.genome(sd, peRootEth(people, eth.id), eth.id);
  gen = Arch.regional(gen, sd, Math.floor(c.x / 25) * 1000 + Math.floor(c.y / 25), ARCH.REGION);   // 地域差：近い集団どうしは似た癖
  if (A) for (const f of A.infl) { if (f.w < 0.03) continue; const oe = people.ethnicities[f.eth - 1]; if (oe) gen = Arch.blend(gen, Arch.genome(sd, peRootEth(people, oe.id), oe.id), f.w, sd, g.id); }   // 他民族からの影響
  return Arch.tradition(sd, gen, env, g.hist ? g.hist.tech : 0.4, eth.color, A ? A.have : null);
}
// 集団の落ち着き方が変わったとき（村になった・拠点を移した）：集落の歴史と配置を作り直す
// 集団（集落）の年表：成立・定住の段階の移行・放棄・移住先への到着。day は暦の絶対日。synthetic＝開始前の歴史から作った推定
function peChron(people, g, type, extra) { const c = g.chron || (g.chron = []); c.push(Object.assign({ day: people.npc ? people.npc.day : 0, type }, extra || {})); if (c.length > 80) c.splice(1, c.length - 80); }
function peSettleChanged(people, g, fresh) { peSettleHistInit(people, g, people.npc.seed, fresh); }
// 集団の民族を住民の側の表に写す（12歳で民族が決まるときに使う）
function peSyncEth(people) { const P = people.npc; for (const g of people.groups) P.groupEth[g.id] = g.ethId; }

// ---------------------------------------------------------------- 生成：100民族・100集団を川沿いに置き、住民（NPC）を作る
// W：{ world, plantFood(c, m, out5), fauna?, FA?, month? }（fauna・FA があれば、狩猟の期待値も職業の必要度に反映）
function peopleGenerate(seed, W) {
  const world = W.world;
  const S = peWorld(world, W.plantFood);
  const sd = typeof seed === 'number' ? seed >>> 0 : peHash(String(seed));
  const rng = peRng(sd ^ peHash('people'));
  const P = world.riverPts;
  // 候補：川・海岸・湖畔・湧水の点ごとの、複数条件の採点（食料・水・地形・資源・交通・洪水）。点数の2乗に比例して選ぶ
  const T = peSites(S, world), cand = [], score = [], info = [], SM = W.small || null, inWin = (x, y) => !SM || (x >= SM.win.x0 + 40 && x < SM.win.x1 - 40 && y >= SM.win.y0 + 40 && y < SM.win.y1 - 40);   // 窓の縁から40セル（約1.3km）内側   // SM：小規模ワールドの設定（窓・村の数・人口・村どうしの距離〈セル〉）
  let smax = 0;
  for (let q = 0; q < T.count; q++) {
    const x = T.x[q], y = T.y[q]; if (!inWin(x, y)) continue; const r = peSiteScore(S, world, x, y, SITE_KINDS[T.kind[q]], null);
    if (!r || r.score <= 0) continue;
    cand.push(q); score.push(r.score); info.push(r);
    if (r.score > smax) smax = r.score;
  }
  // 種類ごとに、点数の2乗の累積を作る。まず種類を割合で選び、その中で点数に比例して選ぶ
  const byKind = SITE_KINDS.map(() => ({ idx: [], cum: [], tot: 0 }));
  for (let i = 0; i < cand.length; i++) { const kb = byKind[T.kind[cand[i]]], w = score[i] / smax; kb.tot += w * w; kb.idx.push(i); kb.cum.push(kb.tot); }
  const pickIn = (kb) => { const r = rng() * kb.tot; let lo = 0, hi = kb.cum.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (kb.cum[mid] < r) lo = mid + 1; else hi = mid; } return kb.idx[lo]; };
  const pick = () => {
    let wsum = 0; for (let k = 0; k < byKind.length; k++) if (byKind[k].idx.length) wsum += PE.SITE_SHARE[SITE_KINDS[k]] || 0;
    let r = rng() * wsum, kk = -1; for (let k = 0; k < byKind.length; k++) { if (!byKind[k].idx.length) continue; r -= PE.SITE_SHARE[SITE_KINDS[k]] || 0; if (r <= 0) { kk = k; break; } }
    if (kk < 0) kk = byKind.findIndex(x => x.idx.length);
    return pickIn(byKind[kk]);
  };
  const sites = [];
  let spacing = SM ? SM.minD : PE.MIN_SPACING, maxD = SM ? SM.maxD : 1e9, fails = 0;
  // 小規模ワールド：食料の点数が高い（約50人の村を養える）場所から順に選ぶ（点数にわずかな乱数を足した順。置けなければ次の候補へ）。大規模世界は従来どおり、点数の2乗に比例して選ぶ
  const order = SM ? cand.map((q, i) => i).sort((a, b) => score[b] * (0.92 + 0.16 * rng()) - score[a] * (0.92 + 0.16 * rng())) : null; let oi = 0;
  while (sites.length < (SM ? SM.n : PE.ETHNICITIES) && cand.length) {
    if (SM && oi >= order.length) { oi = 0; spacing = Math.max(SM.minD * 0.6, spacing * 0.92); maxD *= 1.1; }
    const pi = SM ? order[oi++] : pick(), q = cand[pi], x = T.x[q], y = T.y[q];
    let ok = true;
    for (const s of sites) { const dx = s.rx - x, dy = s.ry - y; if (dx * dx + dy * dy < spacing * spacing) { ok = false; break; } }
    if (ok && SM && sites.length && !sites.some(s => (s.rx - x) * (s.rx - x) + (s.ry - y) * (s.ry - y) <= maxD * maxD)) ok = false;   // 小規模ワールド：少なくとも1つの村から、最大の距離以内
    if (!ok) { if (!SM && ++fails > 400) { spacing *= 0.85; fails = 0; } continue; }
    const d = peDryNear(S, world, x, y);
    sites.push({ rx: x, ry: y, x: d.x, y: d.y, site: { kind: info[pi].kind, score: info[pi].score, parts: info[pi].parts } });
  }
  const people = { win: SM ? SM.win : null, version: 2, ties: {}, ethSpeed: 1, nbr: {}, nextGroupId: 1, nextEthId: 1, rngState: 0, playerEth: 0, ethnicities: [], groups: [], contacts: {}, languages: [], npc: null, haz: null, stat: null };
  // 安定人口に近い年齢構成（基本の死亡率での生存率）の累積
  const surv = new Float64Array(PE_AGES);
  let l = 1;
  for (let a = 0; a < PE_AGES; a++) { surv[a] = l; l *= 1 - PE_H0[a] * (1 - PE_H0[a] / 2); }
  let ssum = 0; for (let a = 0; a < PE_AGES; a++) ssum += surv[a];
  const hue0 = rng(), pops = [];
  // 小規模ワールド：村ごとの人数は popMin〜popMax で幅広くばらつかせ、点数の高い（暮らしやすい）場所の村ほど大きくする（大きな村が食料不足にならないように）
  const popPlan = SM && SM.popMin != null ? (() => { const pr2 = peRng(sd ^ peHash('villagePops')); return Array.from({ length: sites.length }, () => Math.round(SM.popMin + (SM.popMax - SM.popMin) * Math.pow(pr2(), 1.25))).sort((a, b) => b - a); })() : null;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const eth = { id: people.nextEthId++, nameKey: '', langId: 0, family: 0, parent: 0, founded: 0, alive: true, color: null };
    eth.nameKey = 'eth:' + eth.id;
    eth.state = 'alive'; eth.parents = [];
    eth.color = peHsl((hue0 + i * 0.6180339887) % 1, 0.55 + 0.3 * rng(), 0.45 + 0.15 * rng());
    people.ethnicities.push(eth);
    let r = rng(), cls = PE.SIZE_CLASS[0];
    for (const c of PE.SIZE_CLASS) { cls = c; if (r < c[0]) break; r -= c[0]; }
    pops.push(SM ? (popPlan ? popPlan[i] : Math.round(SM.popTotal / SM.n * (0.8 + 0.4 * rng()))) : Math.round(cls[1] + (cls[2] - cls[1]) * rng()));
    const g = peNewGroup(people, eth.id, s.x, s.y);
    g.site = s.site;
    g.radius = peRadius(pops[i]);
    g.cult = Array.from({ length: CULT_DIMS }, (_, k) => peHash('cult' + eth.id + ':' + k + '/' + sd) / 4294967296);   // 民族の文化の特徴［仮］
    Object.assign(eth, peCultureRules(g.cult)); eth.cult0 = g.cult.slice();
  }
  people.playerEth = people.ethnicities.length ? people.ethnicities[Math.floor(rng() * people.ethnicities.length)].id : 0;
  people.rngState = (rng() * 4294967296) | 0;
  // 住民：年齢は安定人口の分布から。性別は男 51.2%
  const total = pops.reduce((a, b) => a + b, 0), npc = people.npc = new Population(sd, people.groups.length + 1, Math.max(1024, total * 3));
  peInstall(people); peHazards(people); peSyncEth(people);
  const pr = peRng(sd ^ peHash('founders'));
  for (const g of people.groups) {
    for (let k = 0; k < pops[g.id - 1]; k++) {
      let r = pr() * ssum, a = 0; while (a < PE_AGES - 1 && (r -= surv[a]) > 0) a++;
      const id = npc.addFounder(g.id, a + pr() * 0.999); npc.sex[id] = pr() < PE.SEX_RATIO ? 1 : 0;
    }
  }
  // 初期の家族：成人の約75%を夫婦にし、35歳未満の人には、年の合う夫婦を親（と世帯）として割り当てる（きょうだいができる）。残りは1人の世帯
  for (const g of people.groups) {
    const members = []; for (let i = 0; i < npc.n; i++) if (npc.group[i] === g.id) members.push(i);
    const wom = members.filter(i => npc.sex[i] === 0 && npc.age(i) >= 18 && npc.age(i) < 50), men = members.filter(i => npc.sex[i] === 1 && npc.age(i) >= 18 && npc.age(i) < 55);
    for (let k = wom.length - 1; k > 0; k--) { const j = Math.floor(pr() * (k + 1)); const t = wom[k]; wom[k] = wom[j]; wom[j] = t; }
    const free = new Set(men), couples = [];
    for (const w of wom) {
      if (pr() > 0.75) continue;
      const cands = []; for (const m of free) if (Math.abs(npc.age(m) - npc.age(w)) <= 8) cands.push(m);
      if (!cands.length) continue;
      const m = cands[Math.floor(pr() * cands.length)]; free.delete(m);
      npc.spouse[w] = m; npc.spouse[m] = w; npc.house[w] = m; npc.house[m] = m; couples.push([w, m]);
    }
    const nk = new Map();
    for (const i of members) {
      const a = npc.age(i); if (a >= 35) continue;
      const ok = couples.filter(([w, m]) => w !== i && m !== i && npc.spouse[i] !== w && npc.age(w) - a >= 17 && npc.age(w) - a <= 42 && (nk.get(w) || 0) < 8);
      if (!ok.length) continue;
      const [w, m] = ok[Math.floor(pr() * ok.length)]; npc.mother[i] = w; npc.father[i] = m; nk.set(w, (nk.get(w) || 0) + 1);
      if (npc.spouse[i] === NONE) npc.house[i] = m;
    }
    for (const i of members) if (npc.house[i] === NONE) npc.house[i] = i;
  }
  // 環境に合わせて、仕事の必要度を決めてから、それまでの人生（職業・技能）を作る
  peStats(people);
  const month = W.month || 0, ctx = { month, world, fauna: W.fauna, FA: W.FA, plantFood: W.plantFood, env: world.fauna.env, cc: world.climate.cell, res: world.resources };
  S.tick++;   // セルごとの植物・魚の残りを、この月の分として数え直す
  const sc = peMonthSetup(people, ctx, S);
  for (const g of people.groups) { const pl = peGroupPlan(people, g, ctx, S, sc, g.pop * 0.5, 0.3, 0.3, 0.3); peSetDemand(people, g, pl); g.food = peNeedOf(people.stat, g) * (PE.FOOD_INIT[0] + (PE.FOOD_INIT[1] - PE.FOOD_INIT[0]) * rng()); }
  npc.initFounders();
  for (let r = 0; r < 36; r++) for (let i = 0; i < npc.n; i++) if (npc.death[i] === ALIVE && npc.age(i) >= 10) npc._interact(i);   // それまでの暮らしでできた人間関係
  peStats(people);
  peLeaders(people, [], () => false, true, false, true);
  { // 初期の定住：豊かな場所の集団は、すでに村（縄文のように、はじめから暮らしのある社会）
    const vals = people.groups.map(g => ({ g, v: peSiteValue(S, world, peCellOf(S, g.x, g.y)) })).sort((a, b) => b.v - a.v);
    const hi = vals[Math.floor(vals.length * (1 - PE.SETTLE_SITE_PCT))] ? vals[Math.floor(vals.length * (1 - PE.SETTLE_SITE_PCT))].v : 0; people.siteHi = hi; const mid = vals[Math.floor(vals.length * 0.6)] ? vals[Math.floor(vals.length * 0.6)].v : 0; people.siteMid = mid;   // 暮らしやすさが上位60%に入らない場所は、移動して暮らす（野営地のまま）
    vals.forEach(({ g, v }, k) => { const r = k / vals.length; g.siteQ = 1 - r; if (SM ? true : (r < 0.35 && g.pop >= 40)) { g.settle = 2; g.stay = PE.SETTLE2_MONTHS; } else if (r < 0.6) { g.settle = 1; g.stay = PE.SETTLE1_MONTHS; } peChron(people, g, 'start', { level: g.settle || 0, synthetic: true, site: g.site ? g.site.kind : null }); });
  }
  peNeighbors(people);
  for (const g of people.groups) peSettleHistInit(people, g, sd);   // 集落の歴史（成立年代・衰退・防衛・建築技術）。開始前の歴史は一日ずつ計算せず、成立年代から決める
  peopleCreatePlayer(people, sd);
  peNationEnsure(people, W.world);
  for (const g of people.groups) peArchInit(people, g);
  peStatRecord(people, true);
  return people;
}
function peNewGroup(people, ethId, x, y) {
  const id = people.nextGroupId++;
  const g = {
    id, ethId, alive: true, nameKey: 'grp:' + id, x, y, homeX: x, homeY: y, radius: PE.R_MIN, food: 0, policy: 'auto', moveTo: null,
    labor: { hunt: 0, gather: 0, fish: 0 }, lastFood: { need: 0, got: 0, hunt: 0, gather: 0, fish: 0 },
    hunger: 0, born: 0, died: { natural: 0, starvation: 0, cold: 0, disease: 0 },
    fed: 1, epi: 0, kills: 0, pop: 0, c6: [0, 0, 0, 0, 0, 0], leader: -1, council: [], leaderSince: 0, settle: 0, stay: 0, cult: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0], iso: 0,
  };
  people.groups.push(g);
  if (people.npc) { peEnsureGroups(people); people.npc.groupEth[id] = ethId; }
  return g;
}
function peNeedOf(st, g) { return st.need[g.id] || 0; }
function peNeed(g) { return g.lastFood ? g.lastFood.need : 0; }

// ---------------------------------------------------------------- 1か月の計算の下準備と、集団ごとの「期待される収穫と働き手の割り振り」
function peMonthSetup(people, ctx, S) {
  const world = ctx.world, FA = ctx.FA, F = ctx.fauna, species = [];
  if (FA && F && F.species) for (const sid in F.species) {   // 獲物：その月の各種の密度（頭/km²）
    const sp = FA.ANIMAL_SPECIES[sid]; if (!sp) continue;
    const arr = S.densBy[sid] || (S.densBy[sid] = new Float32Array(S.n)); FA.faunaDensity(F, sid, arr);
    species.push({ sid, hunt: sp.hunt, meat: sp.yield.meat, dens: arr });
  }
  return { species, huntCtx: { month: ctx.month, env: ctx.env || world.fauna.env, cc: ctx.cc || world.climate.cell } };
}
// 生活圏の植物・魚（他の集団と分け合う残り）を数え、働き手 workers 人が方針に沿って仕事を選んだときの割り振り L と、仕事ごとの収穫の関数を返す
// know：技能（0〜1）。PE_TC/PE_TS（生活圏のセル）は、この後の収穫の差し引きにも使うので、呼んだ直後にだけ有効
function peGroupPlan(people, g, ctx, S, sc, workers, knowG, knowF, knowH) {
  const world = ctx.world, cc = S.cc, n = S.n, month = ctx.month, res = ctx.res || world.resources, env = sc.huntCtx.env;
  const travel = g.moveTo ? PE.MOVE_FOOD : 1;
  const nc = peTerritory(S, g), out = S.tmp5, PW = PE.PLANT_W, rcell = res.cell;
  let availG = 0, availF = 0, grassSum = 0, tsSum = 0; const sp = sc.species.map(x => Object.assign({ bestCell: -1, bestD: 0 }, x));
  for (let i = 0; i < nc; i++) {
    const c = PE_TC[i];
    if (S.stamp[c] !== S.tick) {
      S.stamp[c] = S.tick;
      ctx.plantFood(c, month, out);
      S.plantLeft[c] = (out[0] * PW[0] + out[1] * PW[1] + out[2] * PW[2] + out[3] * PW[3] + out[4] * PW[4]) * PE.GATHER_KG_PER_UNIT * S.cellKm2;
      const Tc = cc.tMean[month * n + c] / 10 + (ctx.tOff || 0);
      S.fishLeft[c] = (rcell.fishFresh[c] + rcell.fishSea[c]) * 1000 / 12 * PE.FISH_SHARE * (Tc < 0 ? PE.FISH_COLD : 1);
    }
    availG += S.plantLeft[c] * PE_TS[i];
    availF += S.fishLeft[c] * PE_TS[i];
    grassSum += env.grass[c] / 255 * PE_TS[i]; tsSum += PE_TS[i];
    for (const x of sp) if (x.dens[c] > x.bestD) { x.bestD = x.dens[c]; x.bestCell = c; }
  }
  const kH = PE.HUNT_SKILL[0] + PE.HUNT_SKILL[1] * knowH, days = PE.WORK_DAYS;
  const rateG = PE.GATHER_RATE * (PE.GATHER_SKILL[0] + PE.GATHER_SKILL[1] * knowG) * travel;
  const rateF = PE.FISH_RATE * (PE.FISH_SKILL[0] + PE.FISH_SKILL[1] * knowF) * travel;
  const sat = (E, A) => A > 0 ? A * (1 - Math.exp(-E / A)) : 0;
  // 獲物ごとの、期待される収穫（1か月の捕獲数 × 1頭あたりの肉）。生活圏にいる種の中で、一番得な種を狩る
  for (const x of sp) {
    x.huntK = 0;
    if (x.bestCell >= 0) {
      const c = x.bestCell, fo = env.forest[c] / 255, rug = env.rugged[c] / 255, Tb = cc.tMean[month * n + c] / 10, season = Tb < 5 ? 1.2 : Tb > 18 ? 0.85 : 1;
      const terrain = (1 - 0.25 * fo) * (1 - 0.4 * peClamp01(rug * 1.6)) * (1 + 0.1 * (env.grass[c] / 255));
      x.huntK = x.hunt.rate * season * (x.hunt.time[PE.HUNT_TIME] || 1) * terrain * x.bestD / (x.bestD + x.hunt.halfDensity) * kH * days * travel;
    }
    x.huntEff = (h) => { if (h <= 0) return 0; const p = Math.min(PE.HUNT_PARTIES, Math.max(1, Math.ceil(h / PE.HUNT_PARTY))); return p * Math.pow(h / p, x.hunt.crowd || 0.7); };
    x.yield = (h) => x.huntK * x.huntEff(h) * x.meat;
  }
  const bestSpecies = (h) => { let b = null, bv = 0; for (const x of sp) { const v = x.yield(h); if (v > bv) { bv = v; b = x; } } return b; };
  const yH = (h) => { const b = bestSpecies(h); return b ? b.yield(h) : 0; };
  const yG = (h) => sat(h * days * rateG, availG), yF = (h) => sat(h * days * rateF, availF);
  // 農耕・牧畜：民族が技術を持つときだけ。農耕は成長期（気温）に収穫が出る。割り振りは年平均で見て、実際の収穫は月ごと
  const tech = peTechOf(people, g.ethId), fq = peFarmEnv(S, world, ctx, g, month, tsSum > 0 ? grassSum / tsSum : 0, tech.farmSince);
  const fMult = tech.mult * (1 + 0.12 * peFacil(g).field);
  const yFarm = tech.farm ? (h) => h * days * PE.FARM_RATE * fq.know * fq.q * fq.sf * fMult : () => 0;
  const farmAvg = tech.farm ? (h) => h * days * PE.FARM_RATE * fq.know * fq.q * fq.sfAvg * fMult : () => 0;
  const herdN = tech.herd ? (g.herdN || 0) : 0, herdQ = 0.5 + 0.5 * peClamp01(fq.grass * 2.5) * (fq.T < 0 ? 0.6 : 1);
  const yHerd = (h) => herdN > 0 ? Math.min(herdN, PE.HERD_PER * h + 3) * PE.HERD_KG * herdQ : 0;
  const L = { hunt: 0, gather: 0, fish: 0, farm: 0, herd: 0 }, fn = { hunt: (h) => yH(h) * PE.MEAT_VALUE, gather: yG, fish: yF };
  if (tech.farm) fn.farm = (h) => farmAvg(h) * PE.FARM_VALUE;
  if (herdN > 0) fn.herd = (h) => yHerd(h) * PE.HERD_VALUE;
  let rest = workers;
  if (g.policy && g.policy !== 'auto' && L[g.policy] !== undefined) { L[g.policy] = workers * PE.POLICY_SHARE; rest -= L[g.policy]; }
  const chunk = workers / PE.LABOR_CHUNKS;
  while (rest > 1e-9 && chunk > 0) {
    const d = Math.min(chunk, rest);
    let bk = 'gather', bv = -1;
    for (const k in fn) { const v = fn[k](L[k] + d) - fn[k](L[k]); if (v > bv) { bv = v; bk = k; } }
    L[bk] += d; rest -= d;
  }
  return { L, yH, yG, yF, yFarm, yHerd, tech, fq, herdN, availG, availF, nc, kH, bestSpecies, travel };
}
// 仕事の必要度：食料を得る仕事は、最適な割り振りに合わせる（残りの 15% は道具・建築・運搬・治療・警備）
function peSetDemand(people, g, pl) {
  const P = people.npc, d = P.gdemand.subarray(g.id * NJOB, g.id * NJOB + NJOB), L = pl.L, t = (L.hunt + L.gather + L.fish + L.farm + L.herd) || 1;
  const fl = P.gflags[g.id];
  d.fill(0); d[1] = 0.85 * L.gather / t; d[2] = 0.85 * L.hunt / t; d[3] = 0.85 * L.fish / t;
  d[4] = .04; d[5] = .03; d[6] = .02; d[7] = .03; d[8] = .03;
  d[9] = (fl & 1) ? 0.85 * L.farm / t : 0; d[10] = (fl & 2) ? 0.85 * L.herd / t : 0; d[11] = (fl & 4) ? .05 : 0;
}

// ---------------------------------------------------------------- プレイヤーの移住先の指定（UI から）
// ---------------------------------------------------------------- プレイヤーの移住先の指定（UI から）
// 近くの川沿いに直す。行けない（近くに川が無い・海を越える）ときは { ok:false, reason }
function peopleSetMove(people, g, x, y, world) {
  const S = peWorld(world, peCache && peCache.world === world ? peCache.plantFood : null);
  const ns = peNearestSite(S, world, x, y, PE.RIVER_SNAP);
  if (!ns) return { ok: false, reason: 'noRiver' };
  const d = peDryNear(S, world, ns.x, ns.y);
  if (peSeaBetween(S, world, g.x, g.y, d.x, d.y)) return { ok: false, reason: 'sea' };
  g.moveTo = { x: d.x, y: d.y, by: 'player', site: peSiteTag(S, world, ns, people, g) };
  return { ok: true, x: d.x, y: d.y };
}


// ---------------------------------------------------------------- 1か月の計算
// ctx：{ month, day, world, fauna, FA, rng?, plantFood(c, m, out5), env, cc, res, snow?, tOff? }
// 返り値：出来事の配列 [{ type, imp, relevant, group, eth, x, y, ... }]（postEvent は呼び出し側が呼ぶ）
// 流れ：集計 → 集団ごとの食料（収穫・消費・飢え・寒さ・病気の状況を表に書く）→ 住民を30日進める → 分裂・全滅・接触
// ---------------------------------------------------------------- 統計の記録（人口・出生・死亡・集落の段階の時系列）
// 90日ごとに記録する。多くなったら古いほうを間引く（新しいものほど細かく）。世界・地域・集落の人口の推移と、増減・発展・衰退を過去にさかのぼって見るために保存する。乱数は使わない
const STAT_EVERY = 90, STAT_CAP = 520;
function peStatLog(people) { const L = people.statLog || (people.statLog = { days: [], pop: [], grp: [], vil: [], born: [], died: [], dis: [], starv: [], gp: [], gl: [] }); if (!L.gf) { L.gf = []; L.gs = []; L.fed = []; L.food = []; for (let i = 0; i < L.days.length; i++) { L.gf.push(null); L.gs.push(null); L.fed.push(0); L.food.push(0); } } return L; }   // gf＝集団ごとの食料の充足（%）、gs＝蓄え（20単位）、fed＝全体の平均充足（%）、food＝全体の蓄え。古い記録（食料の欄なし）は空として読む
function peStatRecord(people, force) {
  const P = people.npc, day = P.day, L = peStatLog(people); if (!force && L.days.length && day - L.days[L.days.length - 1] < STAT_EVERY) return;
  let pop = 0, grp = 0, vil = 0, born = 0, died = 0, dis = 0, starv = 0, fedSum = 0, foodSum = 0; const gp = new Uint16Array(people.groups.length + 1), gl = new Uint8Array(people.groups.length + 1), gf = new Uint8Array(people.groups.length + 1), gs = new Uint16Array(people.groups.length + 1);
  for (const g of people.groups) { born += g.born || 0; died += g.died.natural + g.died.starvation + g.died.cold + g.died.disease; dis += g.died.disease; starv += g.died.starvation; if (!g.alive) continue; pop += g.pop; grp++; if (g.settle === 2) vil++; gp[g.id] = Math.min(65535, Math.round(g.pop)); gl[g.id] = (g.settle || 0) + 1; gf[g.id] = Math.max(0, Math.min(255, Math.round((g.fed === undefined ? 1 : g.fed) * 100))); gs[g.id] = Math.min(65535, Math.round((g.food || 0) / 20)); fedSum += (g.fed === undefined ? 1 : g.fed) * g.pop; foodSum += g.food || 0; }
  if (L.days.length && L.days[L.days.length - 1] === day) return;
  L.days.push(day); L.pop.push(Math.round(pop)); L.grp.push(grp); L.vil.push(vil); L.born.push(born); L.died.push(died); L.dis.push(dis); L.starv.push(starv); L.gp.push(gp); L.gl.push(gl); L.gf.push(gf); L.gs.push(gs); L.fed.push(pop > 0 ? Math.round(fedSum / pop * 100) : 0); L.food.push(Math.round(foodSum));
  if (L.days.length > STAT_CAP) { const half = L.days.length >> 1, keep = []; for (let i = 0; i < L.days.length; i++) if (i >= half || i % 2 === 0) keep.push(i); for (const k of ['days', 'pop', 'grp', 'vil', 'born', 'died', 'dis', 'starv', 'gp', 'gl', 'gf', 'gs', 'fed', 'food']) L[k] = keep.map(i => L[k][i]); }
}
// 系列を取り出す：scope＝'world'｜'region'（id＝地域のID、regionOf(g) を渡す）｜'group'（id＝集団のID）。from＝この日以降
function peopleStatSeries(people, scope, id, regionOf, from) {
  const L = people.statLog; if (!L || !L.days.length) return { days: [], pop: [], born: [], died: [] };
  const out = { days: [], pop: [], born: [], died: [], lvl: [], groups: [], fed: [], food: [] }; let prev = null;
  for (let i = 0; i < L.days.length; i++) { if (from !== undefined && L.days[i] < from) continue; let pop = 0, n = 0, lv = 0;
    if (scope === 'world') { pop = L.pop[i]; n = L.grp[i]; } else { const gp = L.gp[i], gl = L.gl[i]; for (let g = 1; g < gp.length; g++) { if (!gl[g]) continue; if (scope === 'group' ? g === id : regionOf(people.groups[g - 1]) === id) { pop += gp[g]; n++; lv = Math.max(lv, gl[g] - 1); } } }
    let fed = 0, food = 0; if (scope === 'world') { fed = L.fed[i] || 0; food = L.food[i] || 0; } else if (L.gf[i]) { const gp = L.gp[i], gf = L.gf[i], gs = L.gs[i]; let w = 0; for (let g = 1; g < gp.length; g++) { if (!gl_(L, i, g)) continue; if (scope === 'group' ? g === id : regionOf(people.groups[g - 1]) === id) { fed += gf[g] * gp[g]; w += gp[g]; food += gs[g] * 20; } } fed = w ? Math.round(fed / w) : 0; }
    out.fed.push(fed); out.food.push(food);
    out.days.push(L.days[i]); out.pop.push(pop); out.groups.push(n); out.lvl.push(scope === 'group' ? (n ? lv : -1) : null); out.born.push(L.born[i]); out.died.push(L.died[i]); }
  return out;
}
function gl_(L, i, g) { return L.gl[i][g]; }
// 各集団の、from 日以降の人口の増減（ランキング用）。変化率つき
function peopleStatChange(people, from) {
  const L = people.statLog, out = []; if (!L || L.days.length < 2) return out; let i0 = L.days.findIndex(d => d >= from); if (i0 < 0) i0 = 0; const i1 = L.days.length - 1; if (i0 >= i1) return out;
  for (const g of people.groups) { const a = L.gp[i0][g.id] || 0, b = L.gp[i1][g.id] || 0; if (!a && !b) continue; out.push({ id: g.id, from: a, to: b, diff: b - a, rate: a > 0 ? (b - a) / a : (b > 0 ? 1 : 0), alive: !!g.alive, lvl0: (L.gl[i0][g.id] || 0) - 1, lvl1: (L.gl[i1][g.id] || 0) - 1 }); }
  return out;
}
function peStatSave(people) { const L = peStatLog(people); if (!L.days.length) return null; const n = L.days.length, ng = people.groups.length + 1, gp = new Uint16Array(n * ng), gl = new Uint8Array(n * ng), gf = new Uint8Array(n * ng), gs = new Uint16Array(n * ng); for (let i = 0; i < n; i++) { gp.set(L.gp[i].subarray(0, ng), i * ng); gl.set(L.gl[i].subarray(0, ng), i * ng); if (L.gf[i]) { gf.set(L.gf[i].subarray(0, ng), i * ng); gs.set(L.gs[i].subarray(0, ng), i * ng); } }
  return { meta: { ng, days: L.days, pop: L.pop, grp: L.grp, vil: L.vil, born: L.born, died: L.died, dis: L.dis, starv: L.starv, fed: L.fed, food: L.food }, gp, gl, gf, gs }; }
function peStatLoad(people, st) { if (!st || !st.meta) return; const m = st.meta, n = m.days.length, ng = m.ng, L = peStatLog(people); Object.assign(L, { days: m.days.slice(), pop: m.pop.slice(), grp: m.grp.slice(), vil: m.vil.slice(), born: m.born.slice(), died: m.died.slice(), dis: m.dis.slice(), starv: m.starv.slice(), gp: [], gl: [], gf: [], gs: [], fed: (m.fed || new Array(n).fill(0)).slice(), food: (m.food || new Array(n).fill(0)).slice() }); for (let i = 0; i < n; i++) { L.gp.push(new Uint16Array(st.gp.subarray(i * ng, (i + 1) * ng))); L.gl.push(new Uint8Array(st.gl.subarray(i * ng, (i + 1) * ng))); L.gf.push(st.gf ? new Uint8Array(st.gf.subarray(i * ng, (i + 1) * ng)) : null); L.gs.push(st.gs ? new Uint16Array(st.gs.subarray(i * ng, (i + 1) * ng)) : null); } }
function peopleMonthly(people, ctx) {
  const world = ctx.world, S = peWorld(world, ctx.plantFood), P = people.npc;
  const rng = ctx.rng || peRng(people.rngState);
  const ev = [], month = ctx.month;
  if (ctx.populationAdvanced === true && P.day !== ctx.day) throw new TypeError('population/world day mismatch');
  if (ctx.day !== undefined) P.day = ctx.day;
  peNationEnsure(people, world); peTechFlags(people); ctx.nationYear = people.nation ? people.nation.year : 0;
  peApplyActivity(people);
  { const pl = people.player; if (pl && pl.id >= 0 && P.death[pl.id] === ALIVE) people.playerEth = P.eth[pl.id] || P.groupEth[P.group[pl.id]]; }   // プレイヤーの民族は、人物の主な民族に従う
  S.tick++;
  const sc = peMonthSetup(people, ctx, S);
  const st = peStats(people);
  const alive = people.groups.filter(g => g.alive);
  for (let i = alive.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = alive[i]; alive[i] = alive[j]; alive[j] = t; }
  const contacted = new Set();
  for (const k in people.contacts) { const [a, b] = k.split('-'); if (+a === people.playerEth) contacted.add(+b); if (+b === people.playerEth) contacted.add(+a); }
  const rel = (eth) => eth === people.playerEth || contacted.has(eth);
  peNeighbors(people);   // 近くの集団（結婚・接触・文化の影響）
  for (const g of alive) peGroupMonth(people, g, ctx, S, rng, ev, sc, st, rel);
  if (ctx.populationAdvanced !== true) for (let d = 0; d < 30; d++) P.stepDay();   // 住民を30日進める（人ごとに月に1回判定。日付はずれている）
  peStats(people);
  peopleSuccession(people, ev);   // プレイヤーの人物が亡くなっていれば、その文化の決まりで継承
  peApplyActivity(people);
  peLeaders(people, ev, rel, false, month === 0, false);   // 首長：いなくなった集団は決め直し、年に1回は見直す
  if (month === 6) { peEthYear(people, ev, rel); peNationYear(people, ev, rel); }   // 民族の形成・分裂・融合と、技術の広がり（年に1回）
  // 分裂
  for (const g of alive) {
    if (!g.alive || g.moveTo) continue;
    if (g.pop > PE.SPLIT_POP && rng() < PE.SPLIT_P) peSplit(people, g, S, world, rng, ev, rel);
  }
  // 全滅
  for (const g of people.groups) {
    if (!g.alive) continue;
    const pop = g.pop;
    if (pop < PE.EXTINCT_MIN || (pop < 8 && peStatsWomen(people, g) < 1)) {
      g.alive = false;
      for (let i = 0; i < P.n; i++) if (P.group[i] === g.id && P.death[i] === ALIVE) { P._die(i, 9); g.died.natural++; }
      g.pop = 0;
      ev.push({ type: 'extinct', imp: 1, relevant: rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y });
      const eth = people.ethnicities.find(e => e.id === g.ethId);
      if (eth && eth.alive && !people.groups.some(o => o.alive && o.ethId === eth.id)) {
        eth.alive = false;
        ev.push({ type: 'ethExtinct', imp: 2, relevant: true, eth: eth.id, x: g.x, y: g.y });
      }
    }
  }
  // 接触：他の民族の集団と初めて近づいたとき
  const live = people.groups.filter(g => g.alive);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.ethId === b.ethId) continue;
    const dx = a.x - b.x, dy = a.y - b.y, r = a.radius + b.radius + PE.CONTACT_EXTRA;
    if (dx * dx + dy * dy > r * r) continue;
    const key = Math.min(a.ethId, b.ethId) + '-' + Math.max(a.ethId, b.ethId);
    if (people.contacts[key] !== undefined) continue;
    people.contacts[key] = ctx.day || 0;
    const pl = a.ethId === people.playerEth || b.ethId === people.playerEth;
    ev.push({ type: 'contact', imp: 1, relevant: pl || rel(a.ethId) || rel(b.ethId), eth: a.ethId, eth2: b.ethId, group: a.id, group2: b.id,
      x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), player: pl });
  }
  if (rng.state) people.rngState = rng.state();
  peStatRecord(people);
  return ev;
}
function peStatsWomen(people, g) { return people.stat.women[g.id]; }

// 生活圏のセル（中心から半径＋セルの半分以内）と、それぞれのセルのうち生活圏に入る割合
const PE_DIR8 = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
const PE_TC = new Int32Array(64), PE_TS = new Float64Array(64);
function peTerritory(S, g) {
  const r = g.radius, half = S.step / 2, x = g.x, y = g.y;
  const x0 = Math.max(0, Math.floor((x - r) / S.step)), x1 = Math.min(S.cw - 1, Math.floor((x + r) / S.step));
  const y0 = Math.max(0, Math.floor((y - r) / S.step)), y1 = Math.min(S.ch - 1, Math.floor((y + r) / S.step));
  let k = 0, wsum = 0;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    if (k >= 64) break;
    const dx = Math.max(0, Math.abs(cx * S.step + half - x) - half), dy = Math.max(0, Math.abs(cy * S.step + half - y) - half);
    if (dx * dx + dy * dy > r * r) continue;
    PE_TC[k] = cy * S.cw + cx;
    // セルの中で生活圏に入る大まかな面積（中心に近いほど多い）
    const cdx = cx * S.step + half - x, cdy = cy * S.step + half - y;
    const w = 1 / (1 + (cdx * cdx + cdy * cdy) / (r * r));
    PE_TS[k] = w; wsum += w; k++;
  }
  // 生活圏の面積（km²）をセルに配る。1つのセルのうち使えるのは最大でセル全体
  const areaKm2 = 3.14159 * r * r * S.kmBlock * S.kmBlock;
  for (let i = 0; i < k; i++) PE_TS[i] = Math.min(1, areaKm2 * PE_TS[i] / wsum / S.cellKm2);
  return k;
}


// 移住先・分裂先を探す：距離 range の川沿いで、他の集団から離れた、暮らしやすい所（minValue 以上）。無ければ null
// ---------------------------------------------------------------- 集落の立地：候補は川だけでなく、海岸・湖畔・湧水。複数の条件で採点し、理由（内訳）を残す
const SITE_KINDS = ['river', 'coast', 'lake', 'spring'], SITE_LABEL = { river: '川沿い', coast: '海岸', lake: '湖畔', spring: '湧水・オアシス' };
// 候補の点（セルごと・CSR形式）。川＝川の線の点、海岸＝海に接する陸、湖畔＝湖に接する陸、湧水＝地下水が浅く、地表の水から遠い肥えた所。一度作って使い回す
function peSites(S, world) {
  if (S.sites) return S.sites;
  const W = S.W, H = S.H, type = world.type, water = world.water, P = world.riverPts, n = S.n, px = [], py = [], kd = [];
  for (let c = 0; c < n; c++) for (let j = S.riverStart[c]; j < S.riverStart[c + 1]; j++) { const k = S.riverPt[j]; px.push(P[k * 3]); py.push(P[k * 3 + 1]); kd.push(0); }
  if (!PE.SITE_RIVER_ONLY) {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!type[i] || water[i]) continue;
      if ((((x * 73856093) ^ (y * 19349663)) >>> 0 & 3) !== 0) continue;   // 4つに1つに間引く
      if (!type[i - 1] || !type[i + 1] || !type[i - W] || !type[i + W]) { px.push(x); py.push(y); kd.push(1); }
      else if (water[i - 1] === 2 || water[i + 1] === 2 || water[i - W] === 2 || water[i + W] === 2) { px.push(x); py.push(y); kd.push(2); }
    }
    const g = world.resources && world.resources.grid;
    if (g && g.gwDepth) for (let gy = 0; gy < g.h; gy++) for (let gx = 0; gx < g.w; gx++) {
      const gi = gy * g.w + gx, x = gx * g.step, y = gy * g.step; if (x >= W || y >= H) continue;
      if (g.fertility[gi] <= 40 || g.gwDepth[gi] >= 20 || g.gwRecharge[gi] <= 100) continue;
      if ((((gx * 2654435761) ^ (gy * 40503)) >>> 0 & 7) !== 0) continue;
      const i = y * W + x; if (!type[i] || water[i]) continue;
      let near = false; for (let dy = -8; dy <= 8 && !near; dy += 2) for (let dx = -8; dx <= 8; dx += 2) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (!type[j] || water[j]) { near = true; break; } }
      if (!near) { px.push(x); py.push(y); kd.push(3); }
    }
  }
  const cnt = new Int32Array(n + 1), cellOf = new Int32Array(px.length);
  for (let q = 0; q < px.length; q++) { const c = peCellOf(S, px[q], py[q]); cellOf[q] = c; cnt[c + 1]++; }
  for (let c = 0; c < n; c++) cnt[c + 1] += cnt[c];
  const fill = cnt.slice(0, n), X = new Float32Array(px.length), Y = new Float32Array(px.length), K = new Uint8Array(px.length);
  for (let q = 0; q < px.length; q++) { const o = fill[cellOf[q]]++; X[o] = px[q]; Y[o] = py[q]; K[o] = kd[q]; }
  S.sites = { start: cnt, x: X, y: Y, kind: K, count: px.length };
  return S.sites;
}
// 定住（村になる条件）に使う価値：野生の食料に、農耕・牧畜を持つ民族なら、肥えた土地・草地の分を足す（川沿いの肥えた谷が、農耕で村になれるように）
function peSettleValue(S, world, g, people) {
  const c = peCellOf(S, g.homeX, g.homeY), v = peSiteValue(S, world, c); if (!people || !people.nation) return v;
  const t = peTechOf(people, g.ethId); if (!t.farm && !t.herd) return v;
  const gr = world.resources && world.resources.grid, gi = gr ? Math.min(gr.h - 1, (g.homeY / gr.step) | 0) * gr.w + Math.min(gr.w - 1, (g.homeX / gr.step) | 0) : -1;
  return v + (t.farm && gi >= 0 ? 900 * gr.fertility[gi] / 255 : 0) + (t.herd ? 300 * world.fauna.env.grass[c] / 255 : 0);
}
// 暮らし方に応じた好み：農耕なら肥えた土地、牧畜なら草地、漁なら水辺（hint＝{ farm, herd, fish } の割合）
function peSiteHint(people, g) {
  const t = peTechOf(people, g.ethId), P = people.npc, tot = Math.max(1, (g.pop || 1));
  return { farm: t.farm ? 1 : 0, herd: t.herd ? 1 : 0, fish: P && P.gcount ? P.gcount[g.id * NJOB + 3] / tot : 0 };
}
// 点 (x,y) の立地の採点。{ ok, score, kind, parts }。parts は、なぜその点数かの内訳（食料・水・地形・資源・交通・洪水・暮らし方）
function peSiteScore(S, world, x, y, kind, hint) {
  const c = peCellOf(S, x, y), food = peSiteValue(S, world, c); if (!(food > 0) || !world.climate.cell.zone[c]) return null;
  const env = world.fauna.env, rug = env.rugged[c] / 255, wet = env.wetland[c] / 255, gr = world.resources && world.resources.grid;
  const i = Math.round(y) * S.W + Math.round(x), e = world.elev[i], hi = e > 3500 ? 0.1 : e > 2000 ? 1 - 0.9 * (e - 2000) / 1500 : 1;
  const gi = gr ? Math.min(gr.h - 1, (y / gr.step) | 0) * gr.w + Math.min(gr.w - 1, (x / gr.step) | 0) : -1;
  const freshNear = kind === 'river' || kind === 'lake' || peNearestRiver(S, x, y, 3) >= 0;
  const waterF = kind === 'river' || kind === 'lake' ? 1 : kind === 'spring' ? 0.8 : freshNear ? 1 : 0.5;
  const terrain = (1 - 0.65 * Math.pow(rug, 1.4)) * hi, resource = gr && gi >= 0 ? Math.min(1, (gr.wood[gi] + gr.stone[gi] + gr.clay[gi]) / 382) : 0;
  const transport = kind === 'coast' ? 0.22 : kind === 'lake' ? 0.12 : kind === 'river' ? 0.1 : 0;
  const flood = 1 - 0.35 * wet * (kind === 'river' || kind === 'lake' ? 1 : 0.4);
  let tech = 1; if (hint) { const fert = gr && gi >= 0 ? gr.fertility[gi] / 255 : 0.3; tech = (hint.farm ? 0.75 + 0.7 * fert : 1) * (hint.herd ? 0.85 + 0.4 * env.grass[c] / 255 : 1) * (1 + 0.25 * (hint.fish || 0) * (kind === 'coast' || kind === 'lake' || kind === 'river' ? 1 : 0)); }
  const mult = (1 + 0.35 * resource + transport);
  return { kind, score: food * waterF * terrain * mult * flood * tech, parts: { food: Math.round(food), water: +waterF.toFixed(2), terrain: +terrain.toFixed(2), resource: +resource.toFixed(2), transport: +transport.toFixed(2), flood: +flood.toFixed(2), tech: +tech.toFixed(2) } };
}
// いちばん近い候補の点（kind を指定すれば、その種類だけ）。maxD ブロック以内。なければ null
function peNearestSite(S, world, x, y, maxD, kind) {
  const T = peSites(S, world), rc = Math.ceil(maxD / S.step), cx = Math.min(S.cw - 1, Math.max(0, (x / S.step) | 0)), cy = Math.min(S.ch - 1, Math.max(0, (y / S.step) | 0));
  let best = -1, bd = maxD * maxD;
  for (let yy = Math.max(0, cy - rc); yy <= Math.min(S.ch - 1, cy + rc); yy++) for (let xx = Math.max(0, cx - rc); xx <= Math.min(S.cw - 1, cx + rc); xx++) {
    const c = yy * S.cw + xx;
    for (let j = T.start[c]; j < T.start[c + 1]; j++) { if (kind !== undefined && T.kind[j] !== kind) continue; const dx = T.x[j] - x, dy = T.y[j] - y, dd = dx * dx + dy * dy; if (dd <= bd) { bd = dd; best = j; } }
  }
  return best < 0 ? null : { x: T.x[best], y: T.y[best], kind: T.kind[best] };
}
// 候補の点（peNearestSite の結果）に、立地の記録 { kind, score, parts } をつける
function peSiteTag(S, world, ns, people, g) { const r = peSiteScore(S, world, ns.x, ns.y, SITE_KINDS[ns.kind], people && g ? peSiteHint(people, g) : null); return r ? { kind: r.kind, score: r.score, parts: r.parts } : { kind: SITE_KINDS[ns.kind], score: 0, parts: {} }; }
// いまの集団の立地の点数（記録があればそれ、なければその場所を川沿いとして採点）
function peCurSite(S, world, g, people) {
  if (g.site && Number.isFinite(g.site.score)) return g.site.score;
  const r = peSiteScore(S, world, g.homeX, g.homeY, 'river', people ? peSiteHint(people, g) : null); return r ? r.score : 0;
}
// 立地の理由（画面・試験用）
function peopleSiteInfo(people, gid) { const g = people.groups[gid - 1]; if (!g || !g.site) return null; return { kind: g.site.kind, label: SITE_LABEL[g.site.kind] || g.site.kind, score: Math.round(g.site.score), parts: g.site.parts }; }

function peFindSite(people, g, S, world, rng, range, minValue) {
  const T = peSites(S, world), rc = Math.ceil(range[1] / S.step), hint = peSiteHint(people, g);
  const cx = Math.min(S.cw - 1, (g.homeX / S.step) | 0), cy = Math.min(S.ch - 1, (g.homeY / S.step) | 0);
  const others = people.groups.filter(o => o.alive && o !== g);
  let best = null, bv = minValue;
  for (let t = 0; t < PE.SITE_SAMPLES; t++) {
    const xx = cx + Math.floor((rng() * 2 - 1) * rc), yy = cy + Math.floor((rng() * 2 - 1) * rc);
    if (xx < 0 || yy < 0 || xx >= S.cw || yy >= S.ch) continue;
    const c = yy * S.cw + xx, s0 = T.start[c], s1 = T.start[c + 1];
    if (s0 === s1) continue;
    const q = s0 + Math.floor(rng() * (s1 - s0)), x = T.x[q], y = T.y[q];
    if (people.win && !(x >= people.win.x0 && x < people.win.x1 && y >= people.win.y0 && y < people.win.y1)) continue;   // 小規模ワールド：窓の外へは移らない
    const dx = x - g.homeX, dy = y - g.homeY, dd = dx * dx + dy * dy;
    if (dd < range[0] * range[0] || dd > range[1] * range[1]) continue;
    const r = peSiteScore(S, world, x, y, SITE_KINDS[T.kind[q]], hint); if (!r) continue;
    const v = r.score * (0.9 + 0.2 * rng());
    if (v <= bv) continue;
    let crowd = false;
    for (const o of others) {
      const ox = (o.moveTo ? o.moveTo.x : o.homeX) - x, oy = (o.moveTo ? o.moveTo.y : o.homeY) - y;
      if (ox * ox + oy * oy < PE.MIG_CLEAR * PE.MIG_CLEAR) { crowd = true; break; }
    }
    if (crowd || peSeaBetween(S, world, g.x, g.y, x, y)) continue;
    bv = v; best = Object.assign(peDryNear(S, world, x, y), { site: { kind: r.kind, score: r.score, parts: r.parts } });
  }
  return best;
}
// 移動中：1か月に MOVE_SPEED ブロック進む。着いたら生活圏の中心にする
function peTravel(people, g, S, world, ev, rel) {
  const t = g.moveTo, dx = t.x - g.x, dy = t.y - g.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d <= PE.MOVE_SPEED) {
    // 着いた所の近くの川沿いに野営する（プレイヤーが川から離れた所を指定した場合）
    if (!t.site) { const ns = peNearestSite(S, world, t.x, t.y, PE.RIVER_SNAP); if (ns) { const r = peDryNear(S, world, ns.x, ns.y); if (!peSeaBetween(S, world, t.x, t.y, r.x, r.y)) { t.x = r.x; t.y = r.y; t.site = peSiteTag(S, world, ns, people, g); } } }
    if (t.site) g.site = t.site;
    g.x = t.x; g.y = t.y; g.homeX = t.x; g.homeY = t.y; g.moveTo = null; g.hunger = 0; g.settle = 0; g.stay = 0; if (people.npc) peSettleChanged(people, g, true); peChron(people, g, 'arrive', { site: g.site ? g.site.kind : null, by: t.by || 'ai' });
    ev.push({ type: 'arrive', imp: 0, relevant: rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y, by: t.by || 'ai' });
    return;
  }
  const nx = Math.round(g.x + dx * PE.MOVE_SPEED / d), ny = Math.round(g.y + dy * PE.MOVE_SPEED / d);
  if (!world.type[ny * S.W + nx]) {   // 途中に海（指定の後に地形が変わった等）：やめる
    ev.push({ type: 'moveBlocked', imp: 0, relevant: rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y });
    g.moveTo = null; g.homeX = g.x; g.homeY = g.y;
    return;
  }
  g.x = nx; g.y = ny;
}

// ---------------------------------------------------------------- 農耕・牧畜（技術の層との接続）
// 技術の層：民族ごとの技術（nation.js）。最初の月に作り、年に1度進める。新しい民族は親の技術を受け継ぐ
function peNationSites(people) {
  const m = new Map();
  for (const g of people.groups) { if (!g.alive || !g.cult) continue; let o = m.get(g.ethId); if (!o) m.set(g.ethId, o = { x: 0, y: 0, pop: 0, cult: new Array(CULT_DIMS).fill(0) }); const w = Math.max(1, g.pop); o.x += g.x * w; o.y += g.y * w; o.pop += g.pop; for (let k = 0; k < CULT_DIMS; k++) o.cult[k] += g.cult[k] * w; }
  for (const o of m.values()) { const w = Math.max(1, o.pop); o.x /= w; o.y /= w; for (let k = 0; k < CULT_DIMS; k++) o.cult[k] /= w; }
  return m;
}
function peNationEnsure(people, world) {
  if (people.nation || !Nation) return;
  if (people.nationSave) { try { people.nation = Nation.load(world, people.nationSave); } catch (e) { people.nation = null; } people.nationSave = null; if (people.nation) return; }
  const sites = peNationSites(people), eths = [];
  for (const e of people.ethnicities) { const o = sites.get(e.id); if (e.alive && o) eths.push({ id: e.id, x: o.x, y: o.y, pop: o.pop, cult: o.cult }); }
  people.nation = Nation.create(world, people.npc.seed, eths, { capacity: eths.length * 3 + 16 });
}
function peNationYear(people, ev, rel) {
  const S = people.nation; if (!S) return;
  const sites = peNationSites(people);
  for (const e of people.ethnicities) { const o = sites.get(e.id); if (!e.alive || !o) continue; if (!S.idx.has(e.id)) Nation.spawn(S, { id: e.id, x: o.x, y: o.y, pop: o.pop, cult: o.cult }, e.parent); const i = S.idx.get(e.id); S.pop[i] = Math.max(10, o.pop); S.cult[i] = o.cult; }
  const speed = people.ethSpeed || 1, steps = Math.max(1, Math.round(speed)), before = S.log.length;
  for (let k = 0; k < steps; k++) Nation.step(S);
  peArchYear(people);   // 建築技法の広がり（年に1回）
  for (let k = before; k < S.log.length; k++) {   // 新しい技術が生まれた：その民族が世界で初めて、の出来事
    const l = S.log[k], e = S.eths[l.eth], o = sites.get(e.id), mine = people.playerEth === e.id;
    if (!o) continue; ev.push({ type: 'techFirst', imp: mine ? 2 : 1, relevant: mine || rel(e.id), eth: e.id, node: l.node, x: Math.round(o.x), y: Math.round(o.y) });
  }
}
// 民族が持っている農耕・牧畜の技術と、収穫への効き（乗数）
function peTechOf(people, ethId) {
  const S = people.nation, o = { farm: false, herd: false, kiln: false, mult: 1, farmSince: -1 }; if (!S) return o;
  const h = (n) => Nation.hasNode(S, ethId, n);
  o.farm = h('cultivate'); o.herd = h('herd'); o.kiln = h('kiln');
  if (o.farm) { o.farmSince = Nation.sinceNode(S, ethId, 'cultivate'); o.mult = 1 + (h('irrigate') ? 0.35 : 0) + (h('rotation') ? 0.2 : 0) + (h('draft') ? 0.15 : 0) + (h('iron') ? 0.1 : 0); }
  return o;
}
// 農耕の環境：成長期の係数（月・年平均）、土地の肥沃さ、技能（始めてからの年数）、草地の割合
function peFarmEnv(S, world, ctx, g, month, grass, farmSince) {
  const cc = S.cc, n = S.n, home = peCellOf(S, g.x, g.y), tm = (m) => cc.tMean[m * n + home] / 10 + (ctx.tOff || 0), sfOf = (T) => peClamp01((T - 4) / 10);
  const T = tm(month); let avg = 0; for (let m = 0; m < 12; m++) avg += sfOf(tm(m)); avg /= 12;
  const gr = world.resources && world.resources.grid; let f = 0.25;
  if (gr) { const cx = Math.max(0, Math.min(gr.w - 1, Math.floor(g.x / gr.step))), cy = Math.max(0, Math.min(gr.h - 1, Math.floor(g.y / gr.step))); let s = 0, c = 0; for (let j = Math.max(0, cy - 1); j <= Math.min(gr.h - 1, cy + 1); j++) for (let i = Math.max(0, cx - 1); i <= Math.min(gr.w - 1, cx + 1); i++) { s += gr.fertility[j * gr.w + i]; c++; } f = c ? s / c / 255 : 0.25; }
  const yrs = farmSince >= 0 ? Math.max(0, (ctx.nationYear || 0) - farmSince) : 0;
  return { sf: sfOf(T), sfAvg: avg, q: 0.3 + 0.9 * peClamp01(f / 0.5), know: 0.35 + 0.65 * peClamp01(yrs / PE.FARM_LEARN_YEARS), grass: grass || 0, T };
}
// 畑の季節（見た目用）：0耕土 1芽 2伸長 3実り 4刈り跡。成長期（気温）が来ると芽吹き、積もった成長で伸びて実り、成長期が終わると刈り跡になる
function peCropCycle(g, sf, farm) {
  if (!farm) { g.cropStage = undefined; return; }
  if (sf < 0.05) {
    if (g.cropGrow > 0) { g.cropStage = 4; g.cropProg = 0; g.cropGrow = 0; g.cropOff = 0; }
    else { g.cropOff = (g.cropOff || 0) + 1; if (g.cropOff >= 2) g.cropStage = 0; else if (g.cropStage === undefined) g.cropStage = 0; g.cropProg = Math.min(1, (g.cropOff || 0) / 4); }
  } else {
    g.cropGrow = (g.cropGrow || 0) + sf; const x = g.cropGrow;
    if (x < 1) { g.cropStage = 1; g.cropProg = x; } else if (x < 3) { g.cropStage = 2; g.cropProg = (x - 1) / 2; } else { g.cropStage = 3; g.cropProg = Math.min(1, (x - 3) / 2); }
  }
}
// 家畜：牧草地で支えられる頭数に向かって増える。技術を得た最初の月に、小さな群れを持つ
function peHerdStep(g, pl, pop) {
  const fq = pl.fq, cap = (PE.HERD_CAP[0] + PE.HERD_CAP[1] * peClamp01(fq.grass * 1.5)) * (1 + 0.4 * peFacil(g).pen);
  if (!g.herdN) g.herdN = Math.max(6, Math.round(pop * 0.12));
  g.herdN += g.herdN * PE.HERD_GROW * (1 - g.herdN / cap) * (fq.T < -5 ? 0.3 : 1);
  if (g.herdN > cap * 1.05) g.herdN = cap * 1.05;
}
// 集団の「村の成長」の見立て（画面用）：段階・農民・牧人・家畜・農産物の割合・蓄え
const GROWTH_LABELS = ['野営地', '半定住', '村', '大きな村'];
function peopleGrowth(people, gid) {
  const g = people.groups[gid - 1]; if (!g) return null;
  const P = people.npc, tech = peTechOf(people, g.ethId), settle = g.settle || 0, pop = g.pop || 0;
  const stage = settle === 2 && pop >= 120 && (g.farmFrac || 0) > 0.3 ? 3 : settle;
  const cnt = (j) => P.gcount[gid * NJOB + j];
  const need = g.lastFood ? g.lastFood.need : 0;
  return { site: peopleSiteInfo(people, gid), stage, label: GROWTH_LABELS[stage], pop, farm: tech.farm, herd: tech.herd, farmers: cnt(9), herders: cnt(10), herdN: Math.round(g.herdN || 0), farmFrac: g.farmFrac || 0, share: g.share || 0, policy: g.policy || 'auto', facil: Object.assign({}, peFacil(g)), avail: peFacilAvail(people, g), preview: peFacilPreview(people, g), stock: { dur: Math.max(0, g.food - (g.fresh || 0) - (g.dried || 0)), fresh: g.fresh || 0, dried: g.dried || 0 }, build: g.build ? { kind: g.build.kind, left: g.build.left, spot: g.build.spot || null } : null, spots: g.facilSpots || {}, storeDays: need > 0 ? Math.round(30 * g.food / need) : 0,
    income: g.lastFood ? { hunt: g.lastFood.hunt, gather: g.lastFood.gather, fish: g.lastFood.fish, farm: g.lastFood.farm || 0, herd: g.lastFood.herd || 0, need } : null };
}
// ---------------------------------------------------------------- 村の技術・技能の集計（表示用。新しい数値や制度は作らず、いま管理しているものを集めて見せる）
// 管理しているもの：①技術（民族が持つ。その民族の人は「知っている」）②技能（個人ごとの 0〜255。仕事ごとに11種。使うほど伸びる）。
// 「熟練者」＝その技術に結びつく仕事の技能が TECH_PRACTICE_MIN 以上の人。結びつきは下の表（表示用の対応）。技能と結びつかない技術（組織・記録の一部）は、熟練は管理していない。
const TECH_SKILL = { cultivate: 8, irrigate: 8, rotation: 8, herd: 9, draft: 9, pottery: 3, copper: 3, bronze: 3, iron: 3, steel: 3, goldwork: 3, kiln: 3, metalarms: 3, waterwheel: 4, fort: 4, dugout: 5, seafaring: 5, cart: 5, tally: 10, script: 10, bow: 1 };
const TECH_PRACTICE_MIN = 30;
const TECH_AX = { food: '食料', material: '素材・加工', energy: '動力', transport: '輸送', record: '記録', organize: '組織', military: '軍事' };
function peopleTechSummary(people, gid) {
  const P = people.npc, S = people.nation, g = people.groups[gid - 1]; if (!g || !S || !Tech) return null;
  const members = [], names = Npc.JOBS.map(j => j.skill).slice(1);
  for (const i of P.members[gid] || []) {
    if (P.death[i] !== ALIVE || P.group[i] !== gid) continue;   // 生存者で、いまこの村に所属する人だけ（死亡・離脱は入らない）
    const age = Math.floor(P.age(i)); if (age < 10) continue;
    const eth = P.eth[i] || P.groupEth[gid], sk = []; for (let k = 0; k < NSKILL; k++) sk.push(P.skills[i * NSKILL + k]);
    const known = []; for (const n of Tech.NODES) if (Nation.hasNode(S, eth, n.id)) known.push(n.id);
    members.push({ id: i, age, job: P.job[i], eth, skills: sk, known });
  }
  const techs = [];
  for (const n of Tech.NODES) {
    const si = TECH_SKILL[n.id], holders = [];
    let knowers = 0;
    for (const m of members) if (m.known.includes(n.id)) { knowers++; if (si !== undefined && m.skills[si] >= TECH_PRACTICE_MIN) holders.push({ id: m.id, skill: m.skills[si] }); }
    if (!knowers) continue;
    holders.sort((a, b) => b.skill - a.skill);
    techs.push({ id: n.id, name: n.jp, ax: n.ax, cat: TECH_AX[n.ax] || n.ax, knowers, practiced: holders.length, top: holders.length ? holders[0].skill : 0, holders, skillName: si !== undefined ? names[si] : null, solo: si !== undefined && holders.length === 1 });
  }
  return { gid, count: members.length, members, techs, skillNames: names, min: TECH_PRACTICE_MIN };
}
function peDefaultTechs() { return Tech ? Tech.NODES.map(n => ({ id: n.id, name: n.jp, ax: n.ax })) : []; }

// 施設ごとの「いま足りないもの」（未解放の理由）と、「建てた後の見込み」（いまの村の数字から計算）・不利な使い方の注意・おすすめ。画面用（読み取りだけ）
function peFacilMissing(g, t, kind) {
  const m = [], st = g.settle || 0, nm = ['野営地', '半定住', '村'][st];
  const need1 = () => { if (st < 1) m.push('半定住以上になる必要（いまは' + nm + '）'); };
  if (kind === 'pit' || kind === 'well') need1();
  else if (kind === 'granary') { if (st !== 2) m.push('村になる必要（いまは' + nm + '）'); if (!t.farm && (g.farmFrac || 0) < 0.3) m.push('栽培の技術を持つか、農産物が食料の3割以上になる必要（いま' + Math.round(100 * (g.farmFrac || 0)) + '%）'); }
  else if (kind === 'pen') { if (!t.herd) m.push('牧畜の技術がない'); need1(); if ((g.herdN || 0) < 8) m.push('家畜があと' + Math.ceil(8 - (g.herdN || 0)) + '頭必要（いま' + Math.round(g.herdN || 0) + '頭）'); }
  else if (kind === 'hearth') { if (st !== 2) m.push('村になる必要（いまは' + nm + '）'); if ((g.pop || 0) < 60) m.push('人口があと' + Math.ceil(60 - (g.pop || 0)) + '人必要（いま' + Math.round(g.pop || 0) + '人）'); }
  else if (kind === 'field') { if (!t.farm) m.push('栽培の技術がない'); need1(); }
  else if (kind === 'kiln') { if (!t.kiln) m.push('「高温焼成」の技術がない'); need1(); }
  return m;
}
function peFacilPreview(people, g) {
  const t = peTechOf(people, g.ethId), fa = peFacil(g), T = g.lastT === undefined ? 15 : g.lastT, need = g.lastFood && g.lastFood.need ? g.lastFood.need : 0;
  const dur = Math.max(0, g.food - (g.fresh || 0) - (g.dried || 0)), fresh = g.fresh || 0, dried = g.dried || 0, tot = Math.max(1, dur + fresh + dried);
  const lf = g.lastFood || {}, freshIn = (lf.hunt || 0) + (lf.fish || 0) + (lf.herd || 0) + (lf.gather || 0) * (1 - PE.GATHER_DURABLE), durIn = (lf.farm || 0) + (lf.gather || 0) * PE.GATHER_DURABLE, inTot = Math.max(1, freshIn + durIn);
  const freshShare = freshIn / inTot, kg = (v) => Math.round(v) + 'kg', days = (v) => need > 0 ? (v / need * 30).toFixed(1) + '日分' : '-';
  const r0 = peSpoilRates(T, fa, g.pop), out = {};
  const withF = (k, n) => Object.assign({}, fa, { [k]: Math.min(FACIL[k].max, fa[k] + n) });
  const half = (r) => r <= 1e-9 ? '半年以上' : Math.round(30 * Math.log(0.5) / Math.log(1 - r)) + '日';
  const lifeLine = (k) => { const r1 = peSpoilRates(T, withF(k, 1), g.pop); return [['dur', '穀物・根・木の実'], ['fresh', '生鮮'], ['dried', '干物']].filter(x => Math.abs(r1[x[0]] - r0[x[0]]) > 1e-9).map(x => x[1] + 'が半分に減るまで（保存日数）：' + half(r0[x[0]]) + ' → ' + half(r1[x[0]]) + (r1[x[0]] > r0[x[0]] ? '（短くなる）' : '')); };
  const spoilLine = (k, label) => { const r1 = peSpoilRates(T, withF(k, 1), g.pop); const a = [['dur', '穀物・根', dur], ['fresh', '生鮮', fresh], ['dried', '干物', dried]].filter(x => x[2] >= 1 && Math.abs(r1[x[0]] - r0[x[0]]) > 1e-9).map(x => { const b0 = x[2] * r0[x[0]], b1 = x[2] * r1[x[0]]; return x[1] + 'の傷み（いまの蓄えで月）' + kg(b0) + ' → ' + kg(b1) + (r1[x[0]] > r0[x[0]] ? '（増える）' : ''); }); return a; };
  const add = (k, lines, warn, rec) => { out[k] = { lines, warn: warn || null, recommend: rec || null }; };
  { const L = lifeLine('pit').concat(spoilLine('pit')); L.push('蓄えの上限 ' + kg(peStoreCap(g, need, fa)) + ' → ' + kg(peStoreCap(g, need, withF('pit', 1)))); L.unshift('受け持つ人数 ' + Math.min(g.pop || 0, fa.pit * FACIL_SERVES.pit) + '人 → ' + Math.min(Math.round(g.pop || 0), (fa.pit + 1) * FACIL_SERVES.pit) + '人（村の人口 ' + Math.round(g.pop || 0) + '人）'); add('pit', L, freshShare >= 0.4 ? '食料の入りの' + Math.round(freshShare * 100) + '%が生鮮です。貯蔵穴は穀物・根向きで、生鮮は傷みやすくなります。干し棚か共同の炉のほうが合っています' : (fa.pit > 0 && fresh > 0 ? '生鮮はこの穴に入れると傷みやすくなります（穀物・根向き）' : null), freshShare < 0.4 && durIn > 0 ? '穀物・根が主な村向き' : null); }
  { const sp = Math.min(fresh, FACIL.rack.max * 0); const room = Math.max(0, fresh), conv = Math.min(room, PE.RACK_KG * (T < 0 ? 0.5 : 1)), L = ['保存日数：生鮮 ' + half(r0.fresh) + ' → 干物 ' + half(r0.dried) + '（干した分は、傷みがごくわずか）', '1つで、生鮮の余りを月に最大' + kg(PE.RACK_KG * (T < 0 ? 0.5 : 1)) + '（干物になるのは' + Math.round(PE.RACK_YIELD * 100) + '%）', (fresh >= 1 ? 'いまの生鮮の蓄え ' + kg(fresh) + '（→ 干物 ' + kg(conv * PE.RACK_YIELD) + '）' : 'いまは生鮮の蓄えがありません（余りが出たときに干します）')]; add('rack', L, fresh < 20 && freshIn < need * 0.3 ? '生鮮の余りがほとんどないので、いまは効果が小さい（魚・肉が余る村向き）' : null, freshShare >= 0.4 ? '生鮮が多い村向き' : null); }
  { const L = lifeLine('granary').concat(spoilLine('granary')); L.push('蓄えの上限 ' + kg(peStoreCap(g, need, fa)) + ' → ' + kg(peStoreCap(g, need, withF('granary', 1)))); L.unshift('受け持つ人数 ' + Math.min(Math.round(g.pop || 0), fa.granary * FACIL_SERVES.granary) + '人 → ' + Math.min(Math.round(g.pop || 0), (fa.granary + 1) * FACIL_SERVES.granary) + '人（村の人口 ' + Math.round(g.pop || 0) + '人）'); L.push('不作で食料が足りないとき、飢えて亡くなる人が最大35%減る（受け持つ分。いま' + Math.round(100 * 0.35 * peCover('granary', fa.granary, g.pop)) + '% → ' + Math.round(100 * 0.35 * peCover('granary', fa.granary + 1, g.pop)) + '%）'); add('granary', L, null, durIn >= freshIn ? '穀物・根が主な村向き' : null); }
  { const L = lifeLine('hearth').concat(spoilLine('hearth')); L.unshift('受け持つ人数 ' + Math.min(Math.round(g.pop || 0), FACIL_SERVES.hearth) + '人（村の人口 ' + Math.round(g.pop || 0) + '人）'); L.push('食料が足りないとき、飢えて亡くなる人が約15%減る（受け持つ分）'); add('hearth', L, null, freshShare >= 0.4 ? '生鮮が多い村向き' : null); }
  add('well', ['疫病の起こりやすさ（井戸なしを100%として）' + Math.round(100 * (1 - 0.25 * Math.min(2, fa.well))) + '% → ' + Math.round(100 * (1 - 0.25 * Math.min(2, fa.well + 1))) + '%']);
  { const cap0 = PE.HERD_CAP[0] + PE.HERD_CAP[1] * 0.5; add('pen', ['養える家畜が約+40%（いま' + Math.round(g.herdN || 0) + '頭）', '家畜の食料（月）：乳・肉が増える']); }
  { const gain = (lf.farm || 0) * (0.12 / (1 + 0.12 * fa.field)); add('field', ['農耕の収穫が +12%（いまの農産物は月' + kg(lf.farm || 0) + ' → 約+' + kg(gain) + '）']); }
  add('kiln', ['高温焼成の窯。土器の品質に効く（品質の仕組みは次の段階）']);
  for (const k in FACIL) out[k].missing = peFacilMissing(g, t, k);
  return out;
}

// 技術を民族に与える（開発・試験用）
function peopleGrantTech(people, ethId, node) { const S = people.nation; if (!S || !S.idx.has(ethId)) return false; return Nation.adoptNode(S, ethId, node, S.year); }
// 技術に合わせて、集団に農民・牧人の職が開く
function peTechFlags(people) {
  const P = people.npc, memo = new Map();
  for (const g of people.groups) { if (!g.alive) continue; let t = memo.get(g.ethId); if (!t) memo.set(g.ethId, t = peTechOf(people, g.ethId)); P.gflags[g.id] = (P.gflags[g.id] & 4) | (t.farm ? 1 : 0) | (t.herd ? 2 : 0); }
}

// ---------------------------------------------------------------- 村の施設（指導者が建てる）
// 材料は、あなたの持ち物（暮らしの持ち物）から。建てるには月数がかかり、集団の人数が足りないと進まない。効果は施設ごとに数に応じて増える（上限あり）
const FACIL = {
  pit: { name: '貯蔵穴', cost: { stone: 3, fiber: 4 }, months: 2, max: 4, role: 'storage_pit', info: '1つで25人ぶんの蓄えを受け持つ。受け持つ分は、穀物・根・木の実が腐りにくい（×0.7）。生鮮は逆に傷みやすい（×1.3）。蓄えられる量+25%（受け持つ分）', lock: '半定住以上（動かない集団）', when: (g) => (g.settle || 0) >= 1 },
  rack: { name: '干し棚', cost: { firewood: 6, fiber: 6, rope: 1 }, months: 1, max: 4, role: 'drying_rack', info: '生鮮の肉・魚・果実を、1つで月に約200kgぶん干物に変える（寒い月は半分）。野営地でも建てられる（分解できる）', lock: '集団が移動中でないこと', when: (g) => true },
  granary: { name: '倉庫', cost: { firewood: 8, fiber: 10, rope: 2 }, months: 3, max: 4, role: 'raised_storehouse', info: '1つで40人ぶんの蓄えを受け持つ。受け持つ分は、穀物・根・木の実が腐りにくく（×0.6）、干物も少し（×0.8）、蓄えられる量+50%。不作で食料が足りないとき、飢えて亡くなる人が最大35%減る（受け持つ分）', lock: '村で、栽培を持つか、農産物が食料の3割以上', when: (g, t) => g.settle === 2 && (t.farm || (g.farmFrac || 0) >= 0.3) },
  well: { name: '井戸', cost: { stone: 6, rope: 2, firewood: 3 }, months: 2, max: 2, role: 'well', info: '疫病が広がりにくくなる（1つにつき-25%）', lock: '半定住以上', when: (g) => (g.settle || 0) >= 1 },
  pen: { name: '家畜の囲い', cost: { firewood: 10, fiber: 6, rope: 2 }, months: 2, max: 3, role: 'livestock_pen', info: '養える家畜が増える（1つにつき+40%）', lock: '牧畜を持ち、半定住以上で、家畜が8頭以上', when: (g, t) => t.herd && (g.settle || 0) >= 1 && (g.herdN || 0) >= 8 },
  hearth: { name: '共同の炉', cost: { stone: 8, firewood: 4 }, months: 2, max: 1, role: 'communal_hearth', info: '80人ぶんを受け持つ。受け持つ分は、生鮮が傷みにくい（×0.7）。食料が足りないとき、飢える人が約15%減る', lock: '村で、人口60人以上', when: (g) => g.settle === 2 && (g.pop || 0) >= 60 },
  field: { name: '畑の拡張', cost: { stone: 4, fiber: 6 }, months: 4, max: 3, role: 'field', info: '農耕の収穫が増える（1つにつき+12%）', lock: '栽培を持ち、半定住以上', when: (g, t) => t.farm && (g.settle || 0) >= 1 },
  kiln: { name: '窯', cost: { clay: 10, stone: 6, firewood: 6 }, months: 4, max: 2, role: 'pottery_kiln', info: '高温焼成の窯（土器の品質は次の段階で効かせる）', lock: '技術「高温焼成」を持ち、半定住以上', when: (g, t) => t.kiln && (g.settle || 0) >= 1 },
};
// 蓄えの傷み方（1か月の割合）と上限。月の計算と、画面の「建てた後の見込み」で同じ式を使う
// 施設は「何人ぶんの蓄えを受け持つか」で効く：貯蔵穴1つ＝25人、倉庫1つ＝40人、共同の炉＝80人。受け持ちの割合（受け持つ人数÷村の人口、最大1）だけ、傷み方の効果が出る。大きな村は、増設しないと全部は賄えない
const FACIL_SERVES = { pit: 25, granary: 40, hearth: 80 };
function peCover(k, n, pop) { return Math.min(1, n * FACIL_SERVES[k] / Math.max(1, pop || 1)); }
function peSpoilRates(T, fa, pop) {
  const t25 = peClamp01(T / 25), sp = (c) => c[0] + c[1] * t25, cp = peCover('pit', fa.pit, pop), cg = peCover('granary', fa.granary, pop), ch = peCover('hearth', fa.hearth, pop);
  const mDur = 1 - Math.max(cp * 0.3, cg * 0.4);   // 長持ち：貯蔵穴で×0.7、倉庫で×0.6（受け持ちの割合ぶん）
  return { dur: sp(PE.SPOIL_DUR) * mDur, fresh: Math.min(1, sp(PE.SPOIL_FRESH) * (1 + cp * 0.3) * (1 - ch * 0.3)), dried: sp(PE.SPOIL_DRIED) * (1 - cg * 0.2) };
}
function peStoreCap(g, need, fa) { const pop = g.pop || 1; return need * PE.STORE_MONTHS * (1 + PE.VILLAGE_STORE * (g.settle || 0)) * (1 + PE.FARM_STORE * (g.farmFrac || 0)) * (1 + 0.25 * peCover('pit', fa.pit, pop) + 0.5 * peCover('granary', fa.granary, pop)); }
function peFacil(g) { const f = g.facil || (g.facil = {}); for (const k in FACIL) if (f[k] === undefined) f[k] = 0; return f; }
// 施設ごとに、いま使えるか（技術・村の段階・人口など）。画面用
function peFacilAvail(people, g) { const t = peTechOf(people, g.ethId), o = {}; for (const k in FACIL) o[k] = { open: !!FACIL[k].when(g, t), lock: FACIL[k].lock, missing: peFacilMissing(g, t, k) }; return o; }
// 建てられるか（材料の不足は呼び出し側で調べる）
function peopleBuildCheck(people, kind) {
  const F = FACIL[kind], pl = people.player; if (!F) return { ok: false, reason: 'unknown' };
  if (!pl || pl.over || pl.id < 0) return { ok: false, reason: 'noPlayer' };
  const P = people.npc, g = people.groups[P.group[pl.id] - 1]; if (!g || !g.alive) return { ok: false, reason: 'noGroup' };
  if (P.age(pl.id) < P.adultAge(pl.id)) return { ok: false, reason: 'minor' };
  if (g.moveTo) return { ok: false, reason: 'moving' };
  if (!F.when(g, peTechOf(people, g.ethId))) return { ok: false, reason: 'locked', why: F.lock };
  if (g.build) return { ok: false, reason: 'busy', kind: g.build.kind };
  if (peFacil(g)[kind] >= F.max) return { ok: false, reason: 'max' };
  if ((g.pop || 0) < 15) return { ok: false, reason: 'small' };
  return { ok: true, group: g, cost: F.cost, months: F.months };
}
// spot：見下ろしの画面で選んだ置き場所 { x, z, rot }（集落の配置の座標）。なければ自動で決まる
function peopleBuildStart(people, kind, spot) {
  const r = peopleBuildCheck(people, kind); if (!r.ok) return r;
  const sp = spot && Number.isFinite(spot.x) && Number.isFinite(spot.z) ? { x: spot.x, z: spot.z, rot: Number.isFinite(spot.rot) ? spot.rot : 0 } : null;
  r.group.build = { kind, left: FACIL[kind].months, spot: sp }; return { ok: true, kind, months: FACIL[kind].months, group: r.group.id, spot: sp };
}
function peBuildStep(people, g, ev, rel) {
  const b = g.build; if (!b) return; if (g.moveTo) return;
  if ((g.pop || 0) >= 15 && g.fed > 0.5) b.left -= 1;
  if (b.left > 0) return;
  peFacil(g)[b.kind]++; if (b.spot) { const sp = g.facilSpots || (g.facilSpots = {}); (sp[b.kind] || (sp[b.kind] = [])).push(b.spot); } g.build = null;
  const mine = people.player && people.player.id >= 0 && people.npc.group[people.player.id] === g.id;
  ev.push({ type: 'built', imp: mine ? 2 : 1, relevant: mine || rel(g.ethId), group: g.id, eth: g.ethId, kind: b.kind, x: g.x, y: g.y });
}

function peGroupMonth(people, g, ctx, S, rng, ev, sc, st, rel) {
  const P = people.npc, hz = peEnsureGroups(people), world = ctx.world, cc = S.cc, n = S.n, month = ctx.month, id = g.id;
  const pop = st.pop[id];
  if (pop <= 0) return;
  const need = st.need[id], workers = st.labor[id];
  // 技能（0〜1）：その仕事に就いている人の技能の平均。いなければ既定値
  const cnt = (j) => st.jobCount ? st.jobCount[id * NJOB + j] : P.gcount[id * NJOB + j];
  const know = (j) => cnt(j) > 0 ? st.sk[id * 4 + j] / cnt(j) / 255 : PE.KNOW_DEFAULT;
  const kG = know(1), kH = know(2), kF = know(3);
  const home = peCellOf(S, g.x, g.y);
  const T = cc.tMean[month * n + home] / 10 + (ctx.tOff || 0);
  const pl = peGroupPlan(people, g, ctx, S, sc, workers, kG, kF, kH), huntCtx = sc.huntCtx;
  peSetDemand(people, g, pl);   // 仕事の必要度は、期待される収穫から（人々は少しずつ、足りない仕事へ移る）
  // ---- 実際の働き手：仕事（採集者・狩人・漁師）に就いている人。仕事に就いていない10〜13歳や、他の仕事の人は一部が採集を手伝う
  const labG = st.lab[id * NJOB + 1], labH = st.lab[id * NJOB + 2], labF = st.lab[id * NJOB + 3];
  const labA = st.lab[id * NJOB + 9], labP = st.lab[id * NJOB + 10], fq = pl.fq;
  const helpers = Math.max(0, workers - labG - labH - labF - labA - labP);
  // 農民の、成長期でない分の時間は採集に回る
  const L = { hunt: labH, gather: labG + helpers * PE.HELPER_SHARE + labA * (1 - fq.sf) * 0.8, fish: labF };
  g.labor.hunt = L.hunt; g.labor.gather = L.gather; g.labor.fish = L.fish;
  const nc = pl.nc, availG = pl.availG, availF = pl.availF;
  const gotG = pl.yG(L.gather), gotF = pl.yF(L.fish);
  if (availG > 0) for (let i = 0; i < nc; i++) S.plantLeft[PE_TC[i]] *= 1 - gotG / availG;
  if (availF > 0) for (let i = 0; i < nc; i++) S.fishLeft[PE_TC[i]] *= 1 - gotF / availF;
  let gotH = 0; g.kills = 0;
  const hs = L.hunt >= 1 ? pl.bestSpecies(L.hunt) : null;
  if (hs) {
    const eff = hs.huntEff(L.hunt), hunters = Math.pow(eff, 1 / (hs.hunt.crowd || 0.7));
    const party = { owner: 'grp:' + g.id, hunters, skill: pl.kH * pl.travel, time: PE.HUNT_TIME, cell: hs.bestCell };
    const r = ctx.FA.faunaHunt(ctx.fauna, huntCtx, hs.sid, party, PE.WORK_DAYS, rng);
    gotH = r.meat; g.kills = r.kills; g.huntSp = hs.sid;
    if (r.meat > 0) { g.meatBy = g.meatBy || {}; g.meatBy[hs.sid] = (g.meatBy[hs.sid] || 0) + r.meat; }
  }
  const gotFarm = pl.tech.farm ? pl.yFarm(labA) : 0, gotHerd = pl.herdN > 0 ? pl.yHerd(Math.max(labP, workers * 0.04)) : 0;
  const got = (gotH + gotG + gotF + gotFarm + gotHerd) * (1 - 0.2 * (g.share || 0));   // 分けるほど、働く意欲は少し下がる
  g.farmFrac = (g.farmFrac || 0) + ((gotFarm + gotHerd) / Math.max(1, got) - (g.farmFrac || 0)) / 6;
  g.lastFood.farm = gotFarm; g.lastFood.herd = gotHerd; g.labor.farm = labA; g.labor.herd = labP;
  { const lv = Math.min(4, Math.floor(Math.log2(1 + labA / 4))); if (lv !== (g.fieldLv || 0)) { g.fieldLv = lv; if ((g.settle || 0) >= 1 && g.layout) g.fieldsDirty = true; } }   // 畑の広がりの段階が変わったら、集落の配置を作り直す
  if (pl.tech.herd) peHerdStep(g, pl, pop);
  peCropCycle(g, pl.fq.sf, pl.tech.farm);
  peBuildStep(people, g, ev, rel);
  // ---- 消費・保存：蓄えは「長持ち（穀物・根・木の実）」「生鮮」「干物」の3つ。食べるのは傷みやすい順（生鮮→長持ち→干物）。干し棚が生鮮を干物に変え、貯蔵穴・倉庫・炉が傷み方を変える
  const kk = (1 - 0.2 * (g.share || 0)) * (1 - (g.hardship || 0)), fa = peFacil(g);   // g.hardship＝不作・災害などによる収入の減り（0〜1。試験用。ふだんは0）
  let fresh = (g.fresh || 0) + (gotH + gotF + gotHerd + gotG * (1 - PE.GATHER_DURABLE)) * kk, dried = g.dried || 0, dur = Math.max(0, g.food - (g.fresh || 0) - dried) + (gotFarm + gotG * PE.GATHER_DURABLE) * kk;
  const have = fresh + dried + dur, ratio = need > 0 ? Math.min(1, have / need) : 1;
  { let eat = Math.min(need, have); const take = (v) => { const t = Math.min(v, eat); eat -= t; return v - t; }; fresh = take(fresh); dur = take(dur); dried = take(dried); }
  g.lastDryKg = 0; if (fa.rack > 0 && fresh > 0) { const conv = Math.min(fresh, fa.rack * PE.RACK_KG * (T < 0 ? 0.5 : 1)); fresh -= conv; dried += conv * PE.RACK_YIELD; g.lastDryKg = conv; }
  { const r = peSpoilRates(T, fa, g.pop); const d0 = dur, f0 = fresh, h0 = dried; dur *= 1 - r.dur; fresh *= 1 - r.fresh; dried *= 1 - r.dried; g.lastFood.spoil = { dur: d0 - dur, fresh: f0 - fresh, dried: h0 - dried }; g.lastT = T; }
  { const cap = peStoreCap(g, need, fa);   // 定住するほど、たくさん蓄えられる
    let over = fresh + dried + dur - cap;
    if (over > 0) { let t = Math.min(fresh, over); fresh -= t; over -= t; t = Math.min(dried, over); dried -= t; over -= t; t = Math.min(dur, over); dur -= t; } }
  g.fresh = fresh; g.dried = dried; g.food = fresh + dried + dur;
  g.lastFood.need = need; g.lastFood.got = got; g.lastFood.hunt = gotH; g.lastFood.gather = gotG; g.lastFood.fish = gotF;
  g.fed += (ratio - g.fed) / 12;
  if (ratio < PE.HUNGER_FOOD) {
    g.hunger++;
    if (g.hunger === 3) ev.push({ type: 'famine', imp: 1, relevant: rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y });
  } else g.hunger = 0;
  // ---- 状況を表に書く：住民は毎日の判定でこの表を使う（出生・飢え・寒さ・病気）
  const agri = peClamp01((g.farmFrac || 0) / 0.6);   // 農耕・牧畜が食料に占める割合の効き
  hz.fert[id] = peClamp01((g.fed - PE.FERT_FOOD[0]) / (PE.FERT_FOOD[1] - PE.FERT_FOOD[0])) * (1 + PE.AGRI_FERT * agri);
  if (g.epi > 0) g.epi--;
  else if (rng() < PE.EPI_P * pop / 200 * (1 - 0.25 * peFacil(g).well)) {
    g.epi = PE.EPI_MONTHS[0] + Math.floor(rng() * (PE.EPI_MONTHS[1] - PE.EPI_MONTHS[0] + 1));
    ev.push({ type: 'epidemic', imp: 1, relevant: rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y });
  }
  hz.starv[id] = PE.STARV_H * Math.pow(1 - ratio, 1.5) * (1 - PE.AGRI_STARV * agri) * (1 - 0.8 * (g.share || 0)) * (1 - 0.15 * peCover('hearth', peFacil(g).hearth, g.pop) - 0.35 * peCover('granary', peFacil(g).granary, g.pop));   // 分けているほど、共同の炉があるほど、足りないときに飢える人が出にくい
  let snow = 0; if (ctx.snow) snow = ctx.snow[home] || 0;
  const harsh = peClamp01((PE.COLD_T[0] - T) / PE.COLD_T[1]) + peClamp01((snow - 50) / 100) * 0.3;
  hz.cold[id] = PE.COLD_H * harsh * (1 - PE.COLD_KNOW * kH) * (1 + (1 - ratio));
  hz.dis[id] = (g.epi > 0 ? PE.EPI_H : 0) + Math.max(0, pop / PE.CROWD_POP - 1) * PE.CROWD_H;
  hz.hungerDis[id] = (1 + (1 - ratio)) * (1 - PE.AGRI_DIS * agri);
  // ---- 移動
  g.radius = peRadius(pop);
  peSettleStep(people, g, S, world, ev, rel, home, people.ethSpeed || 1);
  if (g.moveTo) peTravel(people, g, S, world, ev, rel);
  else if (g.hunger >= PE.MIG_HUNGER + (g.settle === 2 ? PE.VILLAGE_HUNGER : 0)) {
    const d = peFindSite(people, g, S, world, rng, PE.MIG_RANGE, peCurSite(S, world, g, people) * PE.MIG_BETTER);
    if (d) {
      g.moveTo = { x: d.x, y: d.y, by: 'ai', site: d.site };
      if (g.settle === 2) { ev.push({ type: 'abandon', imp: 1, relevant: rel(g.ethId) || (people.player && P.group[people.player.id] === g.id), group: g.id, eth: g.ethId, x: g.x, y: g.y }); }
      peChron(people, g, 'leave', { from: g.settle, why: 'hunger' }); g.settle = 0; g.stay = 0;
      ev.push({ type: 'migrate', imp: 1, relevant: rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y, toX: d.x, toY: d.y });
    } else g.hunger = Math.floor(PE.MIG_HUNGER / 2);
  } else if (rng() < PE.CAMP_MOVE_P * (g.settle === 2 ? 0 : g.settle === 1 ? 0.4 : 1)) {
    const dir = PE_DIR8[Math.floor(rng() * 8)], dist = g.radius * (0.3 + 0.6 * rng());
    const tx = g.homeX + dir[0] * dist, ty = g.homeY + dir[1] * dist;
    const kd = g.site && SITE_KINDS.indexOf(g.site.kind) >= 0 ? SITE_KINDS.indexOf(g.site.kind) : 0, ns = peNearestSite(S, world, tx, ty, g.radius, kd);
    if (ns) {
      const dx = ns.x - g.homeX, dy = ns.y - g.homeY;
      if (dx * dx + dy * dy <= g.radius * g.radius * 1.2 && !peSeaBetween(S, world, g.homeX, g.homeY, ns.x, ns.y)) {
        const d = peDryNear(S, world, ns.x, ns.y); g.x = d.x; g.y = d.y;
      }
    }
  }
}

// 定住の進み：同じ場所に安定してとどまった月数。野営地→半定住→村（村は、食料が豊かな場所で確率的に）
function peSettleStep(people, g, S, world, ev, rel, home, speed) {
  if (g.moveTo || g.hunger >= 3) { if (g.moveTo) { g.stay = 0; } return; }
  if (g.fed > 0.9) g.stay = (g.stay || 0) + 1;
  const need1 = PE.SETTLE1_MONTHS / speed, need2 = PE.SETTLE2_MONTHS / speed, P = people.npc;
  if (g.settle === 0 && g.stay >= need1 && g.pop >= 30 && peSettleValue(S, world, g, people) >= (people.siteMid || 0)) { g.settle = 1; peChron(people, g, 'settle1', { pop: g.pop }); }
  if (g.settle === 1 && g.stay >= need2 && g.pop >= PE.SETTLE2_POP && g.fed >= PE.SETTLE2_FED && peSettleValue(S, world, g, people) >= (people.siteHi || 0) && P.random() < Math.min(0.5, PE.SETTLE2_P * speed)) {
    g.settle = 2; peSettleChanged(people, g, true); peChron(people, g, 'settle2', { pop: g.pop }); const mine = people.player && people.player.id >= 0 && P.group[people.player.id] === g.id;
    ev.push({ type: 'settle', imp: mine ? 2 : 1, relevant: mine || rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y });
  }
}
// 分裂：同じ民族の新しい集団が、近くの別の川沿いへ。家族（夫婦と子ども）ごと移る
function peSplit(people, g, S, world, rng, ev, rel) {
  const d = peFindSite(people, g, S, world, rng, PE.SPLIT_RANGE, 0);
  if (!d) return null;
  const P = people.npc, share = PE.SPLIT_SHARE[0] + (PE.SPLIT_SHARE[1] - PE.SPLIT_SHARE[0]) * rng();
  const c = peNewGroup(people, g.ethId, g.x, g.y); if (g.arch) c.arch = JSON.parse(JSON.stringify(g.arch));
  const fam = (i) => { let r = i; if (P.age(i) < 16 && P.mother[i] !== NONE) r = P.mother[i]; const s = P.spouse[r]; return s !== NONE && s < r ? s : r; };
  let moved = 0, all = 0;
  for (let i = 0; i < P.n; i++) {
    if (P.group[i] !== g.id || P.death[i] !== ALIVE) continue;
    all++;
    if (mix(P.seed, fam(i), P.day, 77) / 4294967296 < share) { P.moveToGroup(i, c.id); moved++; }
  }
  const f = all ? moved / all : 0;
  c.food = g.food * f; g.food -= c.food; c.fresh = (g.fresh || 0) * f; g.fresh = (g.fresh || 0) - c.fresh; c.dried = (g.dried || 0) * f; g.dried = (g.dried || 0) - c.dried;
  c.cult = (g.cult || []).slice(); c.policy = g.policy; c.fed = g.fed; c.homeX = g.homeX; c.homeY = g.homeY;
  c.moveTo = { x: d.x, y: d.y, by: 'ai', site: d.site };
  const hz = peHazards(people); hz.fert[c.id] = hz.fert[g.id]; hz.starv[c.id] = hz.starv[g.id]; hz.cold[c.id] = hz.cold[g.id]; hz.dis[c.id] = hz.dis[g.id]; hz.hungerDis[c.id] = hz.hungerDis[g.id];
  P.gdemand.set(P.gdemand.subarray(g.id * NJOB, g.id * NJOB + NJOB), c.id * NJOB);
  c.pop = moved; g.pop = all - moved; c.radius = peRadius(c.pop); g.radius = peRadius(g.pop);
  ev.push({ type: 'split', imp: 1, relevant: rel(g.ethId), group: g.id, child: c.id, eth: g.ethId, x: g.x, y: g.y, toX: d.x, toY: d.y });
  return c;
}

// 全体の集計（UI・テスト用）
function peopleSummary(people) {
  const o = { groups: 0, ethnicities: 0, total: 0, died: { natural: 0, starvation: 0, cold: 0, disease: 0 }, born: 0, know: { hunt: 0, gather: 0, fish: 0 } };
  for (const e of people.ethnicities) if (e.alive) o.ethnicities++;
  const st = people.stat, P = people.npc;
  for (const g of people.groups) {
    for (const k in o.died) o.died[k] += g.died[k];
    o.born += g.born;
    if (!g.alive) continue;
    o.groups++; o.total += g.pop;
    if (st) for (const [k, j] of [['gather', 1], ['hunt', 2], ['fish', 3]]) { const c = P.gcount[g.id * NJOB + j]; if (c) o.know[k] += st.sk[g.id * 4 + j] / 255 / c * g.pop; }
  }
  for (const k in o.know) o.know[k] = o.total > 0 ? o.know[k] / o.total : 0;
  return o;
}

// ---------------------------------------------------------------- 保存と読み込み（人の状態そのものを保存する。型付き配列は生成し直せない）
function peopleSave(people) {
  const P = people.npc, n = P.n, cut = (a, per = 1) => a.slice(0, n * per);
  const pool = [], poolStart = [0]; for (let g = 0; g < P.groups; g++) { for (const v of P.pool[g]) pool.push(v); poolStart.push(pool.length); }
  const members = [], memberStart = [0]; for (let g = 0; g < P.groups; g++) { for (const id of P.members[g]) members.push(id); memberStart.push(members.length); }
  const meta = { win: people.win || null, version: people.version, nextGroupId: people.nextGroupId, nextEthId: people.nextEthId, rngState: people.rngState, playerEth: people.playerEth,
    ethnicities: people.ethnicities, groups: people.groups.map(g => Object.assign({}, g, { c6: undefined })), contacts: people.contacts, ties: people.ties || {}, nation: people.nation ? Nation.save(people.nation) : (people.nationSave || null), ethSpeed: people.ethSpeed || 1, languages: people.languages, autoNames: people.autoNames || {}, placeLangs: people.placeLangs || {}, nextLangId: people.nextLangId || 0, player: people.player,
    npc: { seed: P.seed, n, day: P.day, rng: P.rng, stats: P.stats, delta: Array.from(P.delta), focus: Array.from(P.focus), ethSecondary: Array.from(P.ethSecondary), groups: P.groups } };
  return { meta, birth: cut(P.birth), death: cut(P.death), sex: cut(P.sex), group: cut(P.group), mother: cut(P.mother), father: cut(P.father), spouse: cut(P.spouse), job: cut(P.job), flags: cut(P.flags),
    eth: cut(P.eth), house: cut(P.house), cause: cut(P.cause), groupEth: P.groupEth.slice(), relId: cut(P.relId, SOC_K), relV: cut(P.relV, SOC_K * 3), pers: cut(P.pers, 4), skills: cut(P.skills, NSKILL), train: cut(P.train, Npc.NABIL), gdemand: P.gdemand.slice(), gflags: P.gflags.slice(), pool: Int32Array.from(pool), poolStart: Int32Array.from(poolStart),
    members: Int32Array.from(members), memberStart: Int32Array.from(memberStart),
    stat: peStatSave(people),
    haz: { starv: people.haz.starv.slice(), cold: people.haz.cold.slice(), dis: people.haz.dis.slice(), hungerDis: people.haz.hungerDis.slice(), fert: people.haz.fert.slice() } };
}
function peopleLoad(sv) {
  const m = sv.meta, people = { win: m.win || null, version: m.version, nextGroupId: m.nextGroupId, nextEthId: m.nextEthId, rngState: m.rngState, playerEth: m.playerEth, ethnicities: m.ethnicities,
    groups: m.groups.map(g => { if (g.layout && Settle && Settle.upgradeLayout) Settle.upgradeLayout(g.layout); return Object.assign(g, { c6: [0, 0, 0, 0, 0, 0] }); }), contacts: m.contacts, ties: m.ties || {}, nationSave: m.nation || null, ethSpeed: m.ethSpeed || 1, nbr: {}, languages: m.languages, autoNames: m.autoNames || {}, placeLangs: m.placeLangs || {}, nextLangId: m.nextLangId || 0, player: m.player || null, npc: null, haz: null, stat: null };
  if (sv.stat) peStatLoad(people, sv.stat);
  const n = m.npc.n, P = people.npc = new Population(m.npc.seed, m.npc.groups, Math.max(1024, n * 2));
  const put = (name, src, per = 1) => { P[name].set(src.subarray ? src.subarray(0, n * per) : src); };
  for (const k of ['birth', 'death', 'sex', 'group', 'mother', 'father', 'spouse', 'job', 'flags']) put(k, sv[k]);
  put('skills', sv.skills, NSKILL); put('train', sv.train, Npc.NABIL);
  if (sv.relId) { put('relId', sv.relId, SOC_K); put('relV', sv.relV, SOC_K * 3); put('pers', sv.pers, 4); }
  if (sv.eth) { put('eth', sv.eth); put('house', sv.house); put('cause', sv.cause); P.groupEth.set(sv.groupEth); P.ethSecondary = new Map(m.npc.ethSecondary || []); }
  P.n = n; P.day = m.npc.day; P.rng = m.npc.rng; P.stats = m.npc.stats; P.delta = new Map(m.npc.delta); P.focus = new Map(m.npc.focus);
  P.gdemand.set(sv.gdemand); P.gflags.set(sv.gflags);
  for (let g = 0; g < P.groups; g++) P.pool[g] = Array.from(sv.pool.subarray(sv.poolStart[g], sv.poolStart[g + 1]));
  if (!!sv.members !== !!sv.memberStart) throw new TypeError('incomplete social reference save');
  if (sv.members) for (let g = 0; g < P.groups; g++) P.members[g] = Array.from(sv.members.subarray(sv.memberStart[g], sv.memberStart[g + 1]));
  for (let i = 0; i < n; i++) {
    if (!sv.members && P.death[i] === ALIVE) P.members[P.group[i]].push(i);
    if (P.flags[i] & 2) P._fillGen(i);   // 生まれつきの値の計算結果は保存していないので、作り直す
    if (P.death[i] === ALIVE && P.job[i]) { P.gcount[P.group[i] * NJOB + P.job[i]]++; P.gwork[P.group[i]]++; }
  }
  const hz = peHazards(people); for (const k in hz) hz[k].set(sv.haz[k].subarray(0, hz[k].length));
  peInstall(people); if (!sv.eth) peSyncEth(people); if (people.player) peApplyActivity(people); peStats(people);
  return people;
}


// Optional daily host-clock path. Legacy peopleMonthly callers retain their 30-day batch.
function peopleDaily(people, day) {
  const P = people.npc;
  if (!Number.isSafeInteger(day) || day < P.day || day > P.day + 1) throw new TypeError('invalid population day');
  if (day === P.day) return [];
  const born = P.stats.births, died = P.stats.deaths;
  P.stepDay();
  if (P.stats.births !== born || P.stats.deaths !== died) peStats(people);
  const ev = []; if (people.player) peopleSuccession(people, ev); return ev;
}
function peopleStorageStrides() { return { skills: NSKILL, train: Npc.NABIL, relId: SOC_K, relV: SOC_K * 3, pers: 4 }; }
function peopleDailyFoodNeed(people, id, day = people.npc.day) {
  const P = people.npc; if (!Number.isSafeInteger(id) || id < 0 || id >= P.n || !P.alive(id)) return 0;
  const age = Math.max(0, Math.min(80, Math.floor((day - P.birth[id]) / 360)));
  return (P.sex[id] === 1 ? PE_NEED_M[age] : PE_NEED_F[age]) / 30;
}
// 民族ごとの人口（個人の民族IDで数える。12歳未満は育った集団の民族として数える）
function peopleEthCounts(people) {
  const P = people.npc, o = {}; for (let i = 0; i < P.n; i++) { if (P.death[i] !== ALIVE) continue; const e = P.eth[i] || P.groupEth[P.group[i]]; o[e] = (o[e] || 0) + 1; } return o;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { peopleDaily, peopleDailyFoodNeed, peopleStorageStrides, PE, resetSiteCache() { peCache = null; }, peSites, peSiteScore, peNearestSite, peopleSiteInfo, SITE_KINDS, SITE_LABEL, peNationEnsure, peChron, peArchInit, peArchYear, ARCH, peStatRecord, peopleStatSeries, peopleStatChange, FACIL_SERVES, peCover, TECH_SKILL, TECH_AX, peopleTechSummary, FACIL, SHARE_OF, peopleBuildCheck, peopleBuildStart, peopleGrowth, peopleGrantTech, peTechOf, GROWTH_LABELS, peCampCenter, peopleHouseholds, peopleEconomy, peopleTradition, peRootEth, peopleForceEthSplit, ETHNO, CULT_NAMES, peCultureRules, PROPOSALS, peopleProposal, LEADERSHIP, peLeaders, ACTIVITIES, peopleSetActivity, peFindHeir, peopleYou, peopleCreatePlayer, peopleSuccession, SUCCESSION, peopleEthCounts, PE, PE_H0, PE_ASFR, peopleGenerate, peopleMonthly, peopleSetMove, peopleCounts, peopleSummary, peopleSave, peopleLoad, peTotal, peNeed, peRng, peRadius, peStats };
else root.WohPeople = { peopleDaily, peopleDailyFoodNeed, peopleStorageStrides, peStats, peSites, peSiteScore, peNearestSite, peopleSiteInfo, SITE_KINDS, SITE_LABEL, peNationEnsure, peChron, peArchInit, peArchYear, ARCH, peStatRecord, peopleStatSeries, peopleStatChange, FACIL_SERVES, peCover, TECH_SKILL, TECH_AX, peopleTechSummary, FACIL, SHARE_OF, peopleBuildCheck, peopleBuildStart, peopleGrowth, peopleGrantTech, peTechOf, GROWTH_LABELS, peopleSuccession, peCampCenter, peopleHouseholds, peopleEconomy, peopleTradition, peRootEth, peopleForceEthSplit, ETHNO, CULT_NAMES, PROPOSALS, peopleProposal, LEADERSHIP, ACTIVITIES, peopleSetActivity, peopleYou, SUCCESSION, peopleEthCounts, PE, peopleGenerate, peopleMonthly, peopleSetMove, peopleCounts, peopleSummary, peopleSave, peopleLoad, peTotal, peNeed, peRng, peRadius, peStats };
})(typeof globalThis !== 'undefined' ? globalThis : this);
