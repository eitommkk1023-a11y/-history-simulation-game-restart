'use strict';
// ================================================================ 人々（民族・集団と、NPC による人口）
// 人口の本体は npc-core.js の Population（全住民に個人ID）。この中身は、民族・集団の配置、食料（狩猟・採集・漁労）、移住・分裂・接触。
// 集団の食料の状況（飢え・寒さ・病気）が、個人の死亡率・出生率に反映される。仕事（採集者・狩人・漁師）の人数と技能が収穫量になる。
// 生成（配置）は Seed で同じ結果：乱数は mulberry32、計算は四則演算と sqrt だけ。時間経過は Math.exp 等を使う。
// 数値の扱い：［研究］は研究データ、［仕様］は決めた値、［仮］はゲーム用の仮の値（調整用）
(function (root) {
const Npc = typeof require !== 'undefined' ? require('./npc-core.js') : root.WohNpc;
const { Population, NJOB, NSKILL, SI, mix, SOC_K } = Npc, NONE = 0xffffffff, ALIVE = 0x7fffffff;

// ---------------------------------------------------------------- 設定値
const PE = {
  // ---- 生成
  ETHNICITIES: 100,                               // 初期民族数［仕様］
  SIZE_CLASS: [[0.3, 30, 60], [0.5, 60, 150], [0.2, 150, 250]],   // 初期人口：小・中・大の範囲［仕様］、割合［仮］（平均 約105人）
  MIN_SPACING: 45,                                // 初期配置の集団どうしの最小間隔（ブロック ≒ 150km）。置けなければ少しずつ縮める［仮］
  RIVER_STEP: 3,                                  // 川の点を何点おきに候補にするか［仮］
  HELPER_SHARE: 0.35,                             // 仕事に就いていない10〜13歳・兼任の人が、採集に回る割合［仮］
  KNOW_DEFAULT: 0.15,                             // その仕事の人がいないときの技能（0〜1）［仮］
  FERT_ADJ: 1.5,                                  // 年齢別出生率（全女性の平均）を、結婚している女性だけに当てるための補正［仮］
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
    dens: new Float32Array(n), tmp5: new Float32Array(5),
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
    const deer = world.fauna.species.deer ? world.fauna.species.deer.suit[c] / 255 : 0;
    v = (sum + mn * 4) * PE.GATHER_KG_PER_UNIT + fish + deer * 20;
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
const PROPOSALS = [['hunt', '方針：狩猟を優先'], ['gather', '方針：採集を優先'], ['fish', '方針：漁を優先'], ['auto', '方針：自動に戻す'], ['migrate', '移住：今いる場所へ']];
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
    const focus = kind === 'gather' ? 1 : kind === 'hunt' ? 2 : kind === 'fish' ? 3 : 0;
    if (focus) sc += jb === focus ? 35 : (jb >= 1 && jb <= 3 ? -10 : 0);
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
    const k = peNearestRiver(S, ctx.x, ctx.y, PE.RIVER_SNAP); if (k < 0) return { ok: false, reason: 'noRiver' };
    target = peDryNear(S, ctx.world, ctx.world.riverPts[k * 3], ctx.world.riverPts[k * 3 + 1]);
    if (peSeaBetween(S, ctx.world, g.x, g.y, target.x, target.y)) return { ok: false, reason: 'sea' };
    dist = Math.hypot(target.x - g.x, target.y - g.y); if (dist < 6) return { ok: false, reason: 'near' };
  } else if (g.policy === kind) return { ok: false, reason: 'same' };
  // 投票（成人から最大30人）
  const L = P.members[g.id], adults = []; for (const v of L) if (P.death[v] === ALIVE && P.group[v] === g.id && v !== me && P.age(v) >= P.adultAge(v)) adults.push(v);
  const voters = []; const pool = adults.slice(); for (let i = 0; i < PROP_VOTERS && pool.length; i++) { const k = Math.floor(P.random() * pool.length); voters.push(pool[k]); pool[k] = pool[pool.length - 1]; pool.pop(); }
  if (!voters.length) return { ok: false, reason: 'alone' };
  let yes = 0; for (const v of voters) if (peVoterScore(people, v, me, kind, g, dist) > 0) yes++;
  const support = yes / voters.length, isLeader = g.leader === me;
  let leaderOppose = false; if (!isLeader && g.leader >= 0 && P.death[g.leader] === ALIVE) leaderOppose = peVoterScore(people, g.leader, me, kind, g, dist) <= 0;
  const need = isLeader ? PROP_NEED.leader : PROP_NEED.member + (leaderOppose ? PROP_NEED.leaderOppose : 0), passed = support >= need;
  pl.proposalReady = P.day + PROP_COOLDOWN * (passed ? 1 : 2);
  if (passed) { if (kind === 'migrate') { g.moveTo = { x: target.x, y: target.y, by: 'player' }; } else g.policy = kind; }
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
  st.pop.fill(0); st.need.fill(0); st.labor.fill(0); st.lab.fill(0); st.sk.fill(0); st.c6.fill(0); st.women.fill(0);
  const day = P.day;
  for (let i = 0; i < n; i++) {
    if (P.death[i] !== ALIVE) continue;
    const g = P.group[i], a = Math.min(80, Math.floor((day - P.birth[i]) / 360)), male = P.sex[i] === 1;
    st.pop[g]++; st.need[g] += male ? PE_NEED_M[a] : PE_NEED_F[a];
    const lw = PE_LABOR[a]; st.labor[g] += lw;
    // プレイヤーの人物は、選んだ活動の仕事として数える（家族・学ぶ・体を鍛えるは食料の仕事に数えない）
    const j = i === P.actId && P.actKind !== 'auto' && P.actKind !== 'work' ? P.actJob : P.job[i];
    if (j) { st.lab[g * NJOB + j] += lw; if (j <= 3) st.sk[g * 4 + j] += P.skills[i * NSKILL + j - 1]; }
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
    const hn = h0 * (1 - ds), hd = h0 * ds * hz.hungerDis[g] + hz.dis[g] * (ai < 5 || ai >= 60 ? 1.5 : 1), hs = hz.starv[g] * PE_STARV[ai], hc = hz.cold[g] * PE_COLD[ai];
    last[0] = hn; last[1] = hd; last[2] = hs; last[3] = hc;
    const care = i !== undefined && P.actKind === 'family' && a < 5 && P.house[i] !== NONE && P.house[i] === P.house[P.actId] ? 0.7 : 1;   // 家族の時間：同じ世帯の幼い子は死ににくい
    return (hn + hd + hs + hc) * care;
  };
  P.fertFn = (a, g, i) => { const ai = Math.floor(a); return ai >= 15 && ai < 50 ? PE_ASFR[ai] * hz.fert[g] * PE.FERT_ADJ * (i !== undefined && P.actKind === 'family' && P.spouse[i] === P.actId ? 1.4 : 1) : 0; };   // 家族の時間：配偶者の出産が増える
  P.onBirth = (g) => { people.groups[g - 1].born++; };
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
function peEnsureGroups(people) { people.npc.ensureGroups(people.groups.length + 1); return peHazards(people); }
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
  // 候補：川の点ごとの暮らしやすさ
  const cand = [], score = [];
  let smax = 0;
  for (let c = 0; c < S.n; c++) {
    if (S.riverStart[c] === S.riverStart[c + 1]) continue;
    const v = peSiteValue(S, world, c);
    if (v <= 0) continue;
    if (!world.climate.cell.zone[c]) continue;
    for (let j = S.riverStart[c]; j < S.riverStart[c + 1]; j++) {
      const k = S.riverPt[j], i = Math.round(P[k * 3 + 1]) * S.W + Math.round(P[k * 3]);
      const e = world.elev[i];
      const hi = e > 3500 ? 0.1 : e > 2000 ? 1 - 0.9 * (e - 2000) / 1500 : 1;   // 高地は暮らしにくい
      cand.push(k); score.push(v * hi);
      if (v * hi > smax) smax = v * hi;
    }
  }
  const cum = new Float64Array(cand.length);
  let tot = 0;
  for (let i = 0; i < cand.length; i++) { const s = score[i] / smax; tot += s * s; cum[i] = tot; }
  const pick = () => { const r = rng() * tot; let lo = 0, hi = cum.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; } return lo; };
  const sites = [];
  let spacing = PE.MIN_SPACING, fails = 0;
  while (sites.length < PE.ETHNICITIES && cand.length) {
    const k = cand[pick()], x = P[k * 3], y = P[k * 3 + 1];
    let ok = true;
    for (const s of sites) { const dx = s.rx - x, dy = s.ry - y; if (dx * dx + dy * dy < spacing * spacing) { ok = false; break; } }
    if (!ok) { if (++fails > 400) { spacing *= 0.85; fails = 0; } continue; }
    const d = peDryNear(S, world, x, y);
    sites.push({ rx: x, ry: y, x: d.x, y: d.y });
  }
  const people = { version: 2, nextGroupId: 1, nextEthId: 1, rngState: 0, playerEth: 0, ethnicities: [], groups: [], contacts: {}, languages: [], npc: null, haz: null, stat: null };
  // 安定人口に近い年齢構成（基本の死亡率での生存率）の累積
  const surv = new Float64Array(PE_AGES);
  let l = 1;
  for (let a = 0; a < PE_AGES; a++) { surv[a] = l; l *= 1 - PE_H0[a] * (1 - PE_H0[a] / 2); }
  let ssum = 0; for (let a = 0; a < PE_AGES; a++) ssum += surv[a];
  const hue0 = rng(), pops = [];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const eth = { id: people.nextEthId++, nameKey: '', langId: 0, family: 0, parent: 0, founded: 0, alive: true, color: null };
    eth.nameKey = 'eth:' + eth.id;
    { const w = (peHash('succ' + eth.id + '/' + sd) % 1000) / 1000; let acc = 0, k = 0; for (; k < SUCC_W.length - 1; k++) { acc += SUCC_W[k]; if (w < acc) break; } eth.succession = k; }   // 継承の決まりは文化ごと［仮］
    { const w = (peHash('lead' + eth.id + '/' + sd) % 1000) / 1000; let acc = 0, k = 0; for (; k < LEAD_W.length - 1; k++) { acc += LEAD_W[k]; if (w < acc) break; } eth.leadership = k; }   // 首長の決め方は文化ごと［仮］
    eth.adultAge = 18 + (peHash('adult' + eth.id + '/' + sd) % 7) - 3;   // 成人の年齢は文化ごとに違う：15〜21歳（基本18歳）［仮］
    eth.color = peHsl((hue0 + i * 0.6180339887) % 1, 0.55 + 0.3 * rng(), 0.45 + 0.15 * rng());
    people.ethnicities.push(eth);
    let r = rng(), cls = PE.SIZE_CLASS[0];
    for (const c of PE.SIZE_CLASS) { cls = c; if (r < c[0]) break; r -= c[0]; }
    pops.push(Math.round(cls[1] + (cls[2] - cls[1]) * rng()));
    const g = peNewGroup(people, eth.id, s.x, s.y);
    g.radius = peRadius(pops[i]);
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
  peopleCreatePlayer(people, sd);
  return people;
}
function peNewGroup(people, ethId, x, y) {
  const id = people.nextGroupId++;
  const g = {
    id, ethId, alive: true, nameKey: 'grp:' + id, x, y, homeX: x, homeY: y, radius: PE.R_MIN, food: 0, policy: 'auto', moveTo: null,
    labor: { hunt: 0, gather: 0, fish: 0 }, lastFood: { need: 0, got: 0, hunt: 0, gather: 0, fish: 0 },
    hunger: 0, born: 0, died: { natural: 0, starvation: 0, cold: 0, disease: 0 },
    fed: 1, epi: 0, kills: 0, pop: 0, c6: [0, 0, 0, 0, 0, 0], leader: -1, council: [], leaderSince: 0,
  };
  people.groups.push(g);
  if (people.npc) { peEnsureGroups(people); people.npc.groupEth[id] = ethId; }
  return g;
}
function peNeedOf(st, g) { return st.need[g.id] || 0; }
function peNeed(g) { return g.lastFood ? g.lastFood.need : 0; }

// ---------------------------------------------------------------- 1か月の計算の下準備と、集団ごとの「期待される収穫と働き手の割り振り」
function peMonthSetup(people, ctx, S) {
  const world = ctx.world, FA = ctx.FA, deer = ctx.fauna && FA && ctx.fauna.species && ctx.fauna.species.deer;
  if (deer) FA.faunaDensity(ctx.fauna, 'deer', S.dens); else S.dens.fill(0);
  const hunt = FA && FA.ANIMAL_SPECIES && FA.ANIMAL_SPECIES.deer ? FA.ANIMAL_SPECIES.deer.hunt : null;
  return { hunt: deer ? hunt : null, huntCtx: { month: ctx.month, env: ctx.env || world.fauna.env, cc: ctx.cc || world.climate.cell } };
}
// 生活圏の植物・魚（他の集団と分け合う残り）を数え、働き手 workers 人が方針に沿って仕事を選んだときの割り振り L と、仕事ごとの収穫の関数を返す
// know：技能（0〜1）。PE_TC/PE_TS（生活圏のセル）は、この後の収穫の差し引きにも使うので、呼んだ直後にだけ有効
function peGroupPlan(people, g, ctx, S, sc, workers, knowG, knowF, knowH) {
  const world = ctx.world, cc = S.cc, n = S.n, month = ctx.month, res = ctx.res || world.resources, env = sc.huntCtx.env, hunt = sc.hunt;
  const travel = g.moveTo ? PE.MOVE_FOOD : 1;
  const nc = peTerritory(S, g), out = S.tmp5, PW = PE.PLANT_W, rcell = res.cell;
  let availG = 0, availF = 0, bestCell = -1, bestD = 0;
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
    if (S.dens[c] > bestD) { bestD = S.dens[c]; bestCell = c; }
  }
  const kH = PE.HUNT_SKILL[0] + PE.HUNT_SKILL[1] * knowH, days = PE.WORK_DAYS;
  const rateG = PE.GATHER_RATE * (PE.GATHER_SKILL[0] + PE.GATHER_SKILL[1] * knowG) * travel;
  const rateF = PE.FISH_RATE * (PE.FISH_SKILL[0] + PE.FISH_SKILL[1] * knowF) * travel;
  const sat = (E, A) => A > 0 ? A * (1 - Math.exp(-E / A)) : 0;
  let huntK = 0;
  if (hunt && bestCell >= 0) {
    const fo = env.forest[bestCell] / 255, rug = env.rugged[bestCell] / 255;
    const Tb = cc.tMean[month * n + bestCell] / 10;
    const season = Tb < 5 ? 1.2 : Tb > 18 ? 0.85 : 1;
    const terrain = (1 - 0.25 * fo) * (1 - 0.4 * peClamp01(rug * 1.6)) * (1 + 0.1 * (env.grass[bestCell] / 255));
    huntK = hunt.rate * season * (hunt.time[PE.HUNT_TIME] || 1) * terrain * bestD / (bestD + hunt.halfDensity) * kH * days * travel;
  }
  const huntEff = (h) => { if (h <= 0) return 0; const p = Math.min(PE.HUNT_PARTIES, Math.max(1, Math.ceil(h / PE.HUNT_PARTY))); return p * Math.pow(h / p, hunt ? hunt.crowd : 0.7); };
  const yH = (h) => huntK * huntEff(h) * 30, yG = (h) => sat(h * days * rateG, availG), yF = (h) => sat(h * days * rateF, availF);
  const L = { hunt: 0, gather: 0, fish: 0 }, fn = { hunt: (h) => yH(h) * PE.MEAT_VALUE, gather: yG, fish: yF };
  let rest = workers;
  if (g.policy && g.policy !== 'auto' && L[g.policy] !== undefined) { L[g.policy] = workers * PE.POLICY_SHARE; rest -= L[g.policy]; }
  const chunk = workers / PE.LABOR_CHUNKS;
  while (rest > 1e-9 && chunk > 0) {
    const d = Math.min(chunk, rest);
    let bk = 'gather', bv = -1;
    for (const k of ['gather', 'fish', 'hunt']) { const v = fn[k](L[k] + d) - fn[k](L[k]); if (v > bv) { bv = v; bk = k; } }
    L[bk] += d; rest -= d;
  }
  return { L, yH, yG, yF, availG, availF, bestCell, nc, kH, hunt, huntEff, travel };
}
// 仕事の必要度：食料を得る仕事は、最適な割り振りに合わせる（残りの 15% は道具・建築・運搬・治療・警備）
function peSetDemand(people, g, pl) {
  const P = people.npc, d = P.gdemand.subarray(g.id * NJOB, g.id * NJOB + NJOB), L = pl.L, t = (L.hunt + L.gather + L.fish) || 1;
  const fl = P.gflags[g.id];
  d.fill(0); d[1] = 0.85 * L.gather / t; d[2] = 0.85 * L.hunt / t; d[3] = 0.85 * L.fish / t;
  d[4] = .04; d[5] = .03; d[6] = .02; d[7] = .03; d[8] = .03;
  d[9] = (fl & 1) ? .2 : 0; d[10] = (fl & 2) ? .1 : 0; d[11] = (fl & 4) ? .05 : 0;
}

// ---------------------------------------------------------------- プレイヤーの移住先の指定（UI から）
// ---------------------------------------------------------------- プレイヤーの移住先の指定（UI から）
// 近くの川沿いに直す。行けない（近くに川が無い・海を越える）ときは { ok:false, reason }
function peopleSetMove(people, g, x, y, world) {
  const S = peWorld(world, peCache && peCache.world === world ? peCache.plantFood : null);
  const k = peNearestRiver(S, x, y, PE.RIVER_SNAP);
  if (k < 0) return { ok: false, reason: 'noRiver' };
  const d = peDryNear(S, world, world.riverPts[k * 3], world.riverPts[k * 3 + 1]);
  if (peSeaBetween(S, world, g.x, g.y, d.x, d.y)) return { ok: false, reason: 'sea' };
  g.moveTo = { x: d.x, y: d.y, by: 'player' };
  return { ok: true, x: d.x, y: d.y };
}


// ---------------------------------------------------------------- 1か月の計算
// ctx：{ month, day, world, fauna, FA, rng?, plantFood(c, m, out5), env, cc, res, snow?, tOff? }
// 返り値：出来事の配列 [{ type, imp, relevant, group, eth, x, y, ... }]（postEvent は呼び出し側が呼ぶ）
// 流れ：集計 → 集団ごとの食料（収穫・消費・飢え・寒さ・病気の状況を表に書く）→ 住民を30日進める → 分裂・全滅・接触
function peopleMonthly(people, ctx) {
  const world = ctx.world, S = peWorld(world, ctx.plantFood), P = people.npc;
  const rng = ctx.rng || peRng(people.rngState);
  const ev = [], month = ctx.month;
  if (ctx.day !== undefined) P.day = ctx.day;
  peApplyActivity(people);
  S.tick++;
  const sc = peMonthSetup(people, ctx, S);
  const st = peStats(people);
  const alive = people.groups.filter(g => g.alive);
  for (let i = alive.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = alive[i]; alive[i] = alive[j]; alive[j] = t; }
  const contacted = new Set();
  for (const k in people.contacts) { const [a, b] = k.split('-'); if (+a === people.playerEth) contacted.add(+b); if (+b === people.playerEth) contacted.add(+a); }
  const rel = (eth) => eth === people.playerEth || contacted.has(eth);
  for (const g of alive) peGroupMonth(people, g, ctx, S, rng, ev, sc, st, rel);
  for (let d = 0; d < 30; d++) P.stepDay();   // 住民を30日進める（人ごとに月に1回判定。日付はずれている）
  peStats(people);
  peopleSuccession(people, ev);   // プレイヤーの人物が亡くなっていれば、その文化の決まりで継承
  peApplyActivity(people);
  peLeaders(people, ev, rel, false, month === 0, false);   // 首長：いなくなった集団は決め直し、年に1回は見直す
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
function peFindSite(people, g, S, world, rng, range, minValue) {
  const P = world.riverPts, rc = Math.ceil(range[1] / S.step);
  const cx = Math.min(S.cw - 1, (g.homeX / S.step) | 0), cy = Math.min(S.ch - 1, (g.homeY / S.step) | 0);
  const others = people.groups.filter(o => o.alive && o !== g);
  let best = null, bv = minValue;
  for (let t = 0; t < PE.SITE_SAMPLES; t++) {
    const xx = cx + Math.floor((rng() * 2 - 1) * rc), yy = cy + Math.floor((rng() * 2 - 1) * rc);
    if (xx < 0 || yy < 0 || xx >= S.cw || yy >= S.ch) continue;
    const c = yy * S.cw + xx, s0 = S.riverStart[c], s1 = S.riverStart[c + 1];
    if (s0 === s1) continue;
    const k = S.riverPt[s0 + Math.floor(rng() * (s1 - s0))], x = P[k * 3], y = P[k * 3 + 1];
    const dx = x - g.homeX, dy = y - g.homeY, dd = dx * dx + dy * dy;
    if (dd < range[0] * range[0] || dd > range[1] * range[1]) continue;
    const v = peSiteValue(S, world, c) * (0.9 + 0.2 * rng());
    if (v <= bv) continue;
    let crowd = false;
    for (const o of others) {
      const ox = (o.moveTo ? o.moveTo.x : o.homeX) - x, oy = (o.moveTo ? o.moveTo.y : o.homeY) - y;
      if (ox * ox + oy * oy < PE.MIG_CLEAR * PE.MIG_CLEAR) { crowd = true; break; }
    }
    if (crowd || peSeaBetween(S, world, g.x, g.y, x, y)) continue;
    bv = v; best = peDryNear(S, world, x, y);
  }
  return best;
}
// 移動中：1か月に MOVE_SPEED ブロック進む。着いたら生活圏の中心にする
function peTravel(people, g, S, world, ev, rel) {
  const t = g.moveTo, dx = t.x - g.x, dy = t.y - g.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d <= PE.MOVE_SPEED) {
    // 着いた所の近くの川沿いに野営する（プレイヤーが川から離れた所を指定した場合）
    const k = peNearestRiver(S, t.x, t.y, PE.RIVER_SNAP);
    if (k >= 0) { const r = peDryNear(S, world, world.riverPts[k * 3], world.riverPts[k * 3 + 1]); if (!peSeaBetween(S, world, t.x, t.y, r.x, r.y)) { t.x = r.x; t.y = r.y; } }
    g.x = t.x; g.y = t.y; g.homeX = t.x; g.homeY = t.y; g.moveTo = null; g.hunger = 0;
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

function peGroupMonth(people, g, ctx, S, rng, ev, sc, st, rel) {
  const P = people.npc, hz = peEnsureGroups(people), world = ctx.world, cc = S.cc, n = S.n, month = ctx.month, id = g.id;
  const pop = st.pop[id];
  if (pop <= 0) return;
  const need = st.need[id], workers = st.labor[id];
  // 技能（0〜1）：その仕事に就いている人の技能の平均。いなければ既定値
  const cnt = (j) => P.gcount[id * NJOB + j];
  const know = (j) => cnt(j) > 0 ? st.sk[id * 4 + j] / cnt(j) / 255 : PE.KNOW_DEFAULT;
  const kG = know(1), kH = know(2), kF = know(3);
  const home = peCellOf(S, g.x, g.y);
  const T = cc.tMean[month * n + home] / 10 + (ctx.tOff || 0);
  const pl = peGroupPlan(people, g, ctx, S, sc, workers, kG, kF, kH), hunt = sc.hunt, huntCtx = sc.huntCtx;
  peSetDemand(people, g, pl);   // 仕事の必要度は、期待される収穫から（人々は少しずつ、足りない仕事へ移る）
  // ---- 実際の働き手：仕事（採集者・狩人・漁師）に就いている人。仕事に就いていない10〜13歳や、他の仕事の人は一部が採集を手伝う
  const labG = st.lab[id * NJOB + 1], labH = st.lab[id * NJOB + 2], labF = st.lab[id * NJOB + 3];
  const helpers = Math.max(0, workers - labG - labH - labF);
  const L = { hunt: labH, gather: labG + helpers * PE.HELPER_SHARE, fish: labF };
  g.labor.hunt = L.hunt; g.labor.gather = L.gather; g.labor.fish = L.fish;
  const nc = pl.nc, availG = pl.availG, availF = pl.availF, bestCell = pl.bestCell;
  const gotG = pl.yG(L.gather), gotF = pl.yF(L.fish);
  if (availG > 0) for (let i = 0; i < nc; i++) S.plantLeft[PE_TC[i]] *= 1 - gotG / availG;
  if (availF > 0) for (let i = 0; i < nc; i++) S.fishLeft[PE_TC[i]] *= 1 - gotF / availF;
  let gotH = 0; g.kills = 0;
  if (hunt && bestCell >= 0 && L.hunt >= 1) {
    const eff = pl.huntEff(L.hunt), hunters = Math.pow(eff, 1 / (hunt.crowd || 0.7));
    const party = { owner: 'grp:' + g.id, hunters, skill: pl.kH * pl.travel, time: PE.HUNT_TIME, cell: bestCell };
    const r = ctx.FA.faunaHunt(ctx.fauna, huntCtx, 'deer', party, PE.WORK_DAYS, rng);
    gotH = r.meat; g.kills = r.kills;
  }
  const got = gotH + gotG + gotF;
  // ---- 消費・保存
  const have = g.food + got;
  const ratio = need > 0 ? Math.min(1, have / need) : 1;
  const spoil = PE.SPOIL[0] + PE.SPOIL[1] * peClamp01(T / 25);
  g.food = Math.min(need * PE.STORE_MONTHS, Math.max(0, have - need) * (1 - spoil));
  g.lastFood.need = need; g.lastFood.got = got; g.lastFood.hunt = gotH; g.lastFood.gather = gotG; g.lastFood.fish = gotF;
  g.fed += (ratio - g.fed) / 12;
  if (ratio < PE.HUNGER_FOOD) {
    g.hunger++;
    if (g.hunger === 3) ev.push({ type: 'famine', imp: 1, relevant: rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y });
  } else g.hunger = 0;
  // ---- 状況を表に書く：住民は毎日の判定でこの表を使う（出生・飢え・寒さ・病気）
  hz.fert[id] = peClamp01((g.fed - PE.FERT_FOOD[0]) / (PE.FERT_FOOD[1] - PE.FERT_FOOD[0]));
  if (g.epi > 0) g.epi--;
  else if (rng() < PE.EPI_P * pop / 200) {
    g.epi = PE.EPI_MONTHS[0] + Math.floor(rng() * (PE.EPI_MONTHS[1] - PE.EPI_MONTHS[0] + 1));
    ev.push({ type: 'epidemic', imp: 1, relevant: rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y });
  }
  hz.starv[id] = PE.STARV_H * Math.pow(1 - ratio, 1.5);
  let snow = 0; if (ctx.snow) snow = ctx.snow[home] || 0;
  const harsh = peClamp01((PE.COLD_T[0] - T) / PE.COLD_T[1]) + peClamp01((snow - 50) / 100) * 0.3;
  hz.cold[id] = PE.COLD_H * harsh * (1 - PE.COLD_KNOW * kH) * (1 + (1 - ratio));
  hz.dis[id] = (g.epi > 0 ? PE.EPI_H : 0) + Math.max(0, pop / PE.CROWD_POP - 1) * PE.CROWD_H;
  hz.hungerDis[id] = 1 + (1 - ratio);
  // ---- 移動
  g.radius = peRadius(pop);
  if (g.moveTo) peTravel(people, g, S, world, ev, rel);
  else if (g.hunger >= PE.MIG_HUNGER) {
    const d = peFindSite(people, g, S, world, rng, PE.MIG_RANGE, peSiteValue(S, world, home) * PE.MIG_BETTER);
    if (d) {
      g.moveTo = { x: d.x, y: d.y, by: 'ai' };
      ev.push({ type: 'migrate', imp: 1, relevant: rel(g.ethId), group: g.id, eth: g.ethId, x: g.x, y: g.y, toX: d.x, toY: d.y });
    } else g.hunger = Math.floor(PE.MIG_HUNGER / 2);
  } else if (rng() < PE.CAMP_MOVE_P) {
    const dir = PE_DIR8[Math.floor(rng() * 8)], dist = g.radius * (0.3 + 0.6 * rng());
    const tx = g.homeX + dir[0] * dist, ty = g.homeY + dir[1] * dist;
    const k = peNearestRiver(S, tx, ty, g.radius);
    if (k >= 0) {
      const Pt = world.riverPts, dx = Pt[k * 3] - g.homeX, dy = Pt[k * 3 + 1] - g.homeY;
      if (dx * dx + dy * dy <= g.radius * g.radius * 1.2 && !peSeaBetween(S, world, g.homeX, g.homeY, Pt[k * 3], Pt[k * 3 + 1])) {
        const d = peDryNear(S, world, Pt[k * 3], Pt[k * 3 + 1]); g.x = d.x; g.y = d.y;
      }
    }
  }
}

// 分裂：同じ民族の新しい集団が、近くの別の川沿いへ。家族（夫婦と子ども）ごと移る
function peSplit(people, g, S, world, rng, ev, rel) {
  const d = peFindSite(people, g, S, world, rng, PE.SPLIT_RANGE, 0);
  if (!d) return null;
  const P = people.npc, share = PE.SPLIT_SHARE[0] + (PE.SPLIT_SHARE[1] - PE.SPLIT_SHARE[0]) * rng();
  const c = peNewGroup(people, g.ethId, g.x, g.y);
  const fam = (i) => { let r = i; if (P.age(i) < 16 && P.mother[i] !== NONE) r = P.mother[i]; const s = P.spouse[r]; return s !== NONE && s < r ? s : r; };
  let moved = 0, all = 0;
  for (let i = 0; i < P.n; i++) {
    if (P.group[i] !== g.id || P.death[i] !== ALIVE) continue;
    all++;
    if (mix(P.seed, fam(i), P.day, 77) / 4294967296 < share) { P.moveToGroup(i, c.id); moved++; }
  }
  const f = all ? moved / all : 0;
  c.food = g.food * f; g.food -= c.food;
  c.policy = g.policy; c.fed = g.fed; c.homeX = g.homeX; c.homeY = g.homeY;
  c.moveTo = { x: d.x, y: d.y, by: 'ai' };
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
  const meta = { version: people.version, nextGroupId: people.nextGroupId, nextEthId: people.nextEthId, rngState: people.rngState, playerEth: people.playerEth,
    ethnicities: people.ethnicities, groups: people.groups.map(g => Object.assign({}, g, { c6: undefined })), contacts: people.contacts, languages: people.languages, autoNames: people.autoNames || {}, placeLangs: people.placeLangs || {}, nextLangId: people.nextLangId || 0, player: people.player,
    npc: { seed: P.seed, n, day: P.day, rng: P.rng, stats: P.stats, delta: Array.from(P.delta), focus: Array.from(P.focus), ethSecondary: Array.from(P.ethSecondary), groups: P.groups } };
  return { meta, birth: cut(P.birth), death: cut(P.death), sex: cut(P.sex), group: cut(P.group), mother: cut(P.mother), father: cut(P.father), spouse: cut(P.spouse), job: cut(P.job), flags: cut(P.flags),
    eth: cut(P.eth), house: cut(P.house), cause: cut(P.cause), groupEth: P.groupEth.slice(), relId: cut(P.relId, SOC_K), relV: cut(P.relV, SOC_K * 3), pers: cut(P.pers, 4), skills: cut(P.skills, NSKILL), train: cut(P.train, Npc.NABIL), gdemand: P.gdemand.slice(), gflags: P.gflags.slice(), pool: Int32Array.from(pool), poolStart: Int32Array.from(poolStart),
    haz: { starv: people.haz.starv.slice(), cold: people.haz.cold.slice(), dis: people.haz.dis.slice(), hungerDis: people.haz.hungerDis.slice(), fert: people.haz.fert.slice() } };
}
function peopleLoad(sv) {
  const m = sv.meta, people = { version: m.version, nextGroupId: m.nextGroupId, nextEthId: m.nextEthId, rngState: m.rngState, playerEth: m.playerEth, ethnicities: m.ethnicities,
    groups: m.groups.map(g => Object.assign(g, { c6: [0, 0, 0, 0, 0, 0] })), contacts: m.contacts, languages: m.languages, autoNames: m.autoNames || {}, placeLangs: m.placeLangs || {}, nextLangId: m.nextLangId || 0, player: m.player || null, npc: null, haz: null, stat: null };
  const n = m.npc.n, P = people.npc = new Population(m.npc.seed, m.npc.groups, Math.max(1024, n * 2));
  const put = (name, src, per = 1) => { P[name].set(src.subarray ? src.subarray(0, n * per) : src); };
  for (const k of ['birth', 'death', 'sex', 'group', 'mother', 'father', 'spouse', 'job', 'flags']) put(k, sv[k]);
  put('skills', sv.skills, NSKILL); put('train', sv.train, Npc.NABIL);
  if (sv.relId) { put('relId', sv.relId, SOC_K); put('relV', sv.relV, SOC_K * 3); put('pers', sv.pers, 4); }
  if (sv.eth) { put('eth', sv.eth); put('house', sv.house); put('cause', sv.cause); P.groupEth.set(sv.groupEth); P.ethSecondary = new Map(m.npc.ethSecondary || []); }
  P.n = n; P.day = m.npc.day; P.rng = m.npc.rng; P.stats = m.npc.stats; P.delta = new Map(m.npc.delta); P.focus = new Map(m.npc.focus);
  P.gdemand.set(sv.gdemand); P.gflags.set(sv.gflags);
  for (let g = 0; g < P.groups; g++) P.pool[g] = Array.from(sv.pool.subarray(sv.poolStart[g], sv.poolStart[g + 1]));
  for (let i = 0; i < n; i++) {
    if (P.death[i] === ALIVE) P.members[P.group[i]].push(i);
    if (P.flags[i] & 2) P._fillGen(i);   // 生まれつきの値の計算結果は保存していないので、作り直す
    if (P.death[i] === ALIVE && P.job[i]) { P.gcount[P.group[i] * NJOB + P.job[i]]++; P.gwork[P.group[i]]++; }
  }
  const hz = peHazards(people); for (const k in hz) hz[k].set(sv.haz[k].subarray(0, hz[k].length));
  peInstall(people); if (!sv.eth) peSyncEth(people); if (people.player) peApplyActivity(people); peStats(people);
  return people;
}

// 民族ごとの人口（個人の民族IDで数える。12歳未満は育った集団の民族として数える）
function peopleEthCounts(people) {
  const P = people.npc, o = {}; for (let i = 0; i < P.n; i++) { if (P.death[i] !== ALIVE) continue; const e = P.eth[i] || P.groupEth[P.group[i]]; o[e] = (o[e] || 0) + 1; } return o;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { PROPOSALS, peopleProposal, LEADERSHIP, peLeaders, ACTIVITIES, peopleSetActivity, peFindHeir, peopleYou, peopleCreatePlayer, peopleSuccession, SUCCESSION, peopleEthCounts, PE, PE_H0, PE_ASFR, peopleGenerate, peopleMonthly, peopleSetMove, peopleCounts, peopleSummary, peopleSave, peopleLoad, peTotal, peNeed, peRng, peRadius, peStats };
else root.WohPeople = { PROPOSALS, peopleProposal, LEADERSHIP, ACTIVITIES, peopleSetActivity, peopleYou, SUCCESSION, peopleEthCounts, PE, peopleGenerate, peopleMonthly, peopleSetMove, peopleCounts, peopleSummary, peopleSave, peopleLoad, peTotal, peNeed, peRng, peRadius, peStats };
})(typeof globalThis !== 'undefined' ? globalThis : this);
