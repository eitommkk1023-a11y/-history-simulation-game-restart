'use strict';
/* World of History NPC システム：段階1（個人ID・ID から決まる能力値・変化だけ保存・出生/結婚/死亡）＋段階2（職業・技能・成長）
 * - 全住民に個人ID（配列の添字）。生まれつきの性格・能力・潜在能力は「Seed＋ID（＋両親）」から計算し、保存しない。
 * - 保存するのは人生で変わった分（性格の変化、訓練による能力の変化、技能）だけ。
 * - 判定は月に1回（人ごとに日がずれる）、記録は日付つき。同じ Seed なら同じ結果（整数ハッシュと固定順の乱数のみ）。
 * ブラウザでも Node でも動く（外部依存なし）。 */
(function (root) {
  const NONE = 0xffffffff, ALIVE = 0x7fffffff, YEAR = 360, MONTH = 30;
  // 項目。性格は反対の傾向を1本の軸にした（0＝一方の端、255＝もう一方の端）。項目の順番は変えない（末尾にだけ足す）
  const PERSONALITY = ['社交性', '共感性', '感情安定性', '慎重さ', '好奇心', '誠実性', '野心', '柔軟性', '信頼傾向'];
  const COGNITIVE = ['学習力', '計画力', '判断力', '記憶力', '発想力', '洞察力', '注意力'];
  const PHYSICAL = ['筋力', '持久力', '瞬発力', '敏捷性', '器用さ'];
  const STAT_NAMES = [...PERSONALITY, ...COGNITIVE, ...PHYSICAL];
  const NP = PERSONALITY.length, NC = COGNITIVE.length, NPH = PHYSICAL.length;
  const NABIL = NC + NPH, NSTAT = NP + NABIL;   // 能力＝認知＋身体。能力番号 a ＝ 項目番号 k − NP。潜在能力は能力ごとに1つ
  const SI = {}; STAT_NAMES.forEach((n, k) => { SI[n] = k; });

  function mix(a, b, c, d) {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h ^ ((c + 0x165667b1) | 0), 0x27d4eb2f); h ^= h >>> 13;
    h = Math.imul(h ^ ((d + 0x1b873593) | 0), 0x85ebca6b); h ^= h >>> 16; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13;
    return h >>> 0;
  }
  function bell(h) { return Math.round(((h & 255) + ((h >>> 8) & 255) + ((h >>> 16) & 255)) / 3); }   // 0..255の釣鐘型
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;

  // ---- 職業（0＝無職：子ども・引退した人など）。train＝仕事で伸びる能力、apt＝向き不向きに使う項目、skill＝仕事で伸びる技能（技能番号＝職業番号−1）
  const NJOB = 12, NSKILL = NJOB - 1;
  const JOBS = [
    { name: '無職' },
    { name: '採集者', skill: '採集', train: [['持久力', 1], ['器用さ', 1]], apt: [['持久力', 1], ['器用さ', 1], ['注意力', .5]] },
    { name: '狩人', skill: '狩猟', train: [['持久力', 1], ['敏捷性', 1]], apt: [['持久力', 1], ['敏捷性', 1], ['注意力', .7], ['慎重さ', .3]] },
    { name: '漁師', skill: '漁労', train: [['器用さ', 1], ['持久力', 1]], apt: [['器用さ', 1], ['持久力', 1], ['注意力', .4]] },
    { name: '道具製作者', skill: '材料加工', train: [['器用さ', 1.2]], apt: [['器用さ', 1], ['発想力', .7], ['注意力', .4]] },
    { name: '建築従事者', skill: '建築', train: [['筋力', 1], ['持久力', 1]], apt: [['筋力', 1], ['持久力', .7], ['計画力', .5]] },
    { name: '運搬者', skill: '輸送', train: [['筋力', 1], ['持久力', 1]], apt: [['筋力', 1], ['持久力', 1]] },
    { name: '治療者', skill: '治療', train: [['器用さ', 1]], apt: [['器用さ', .8], ['共感性', 1], ['注意力', .7], ['学習力', .5]] },
    { name: '警備者', skill: '警戒', train: [['持久力', 1], ['敏捷性', 1]], apt: [['持久力', .7], ['敏捷性', .7], ['注意力', 1], ['感情安定性', .6]] },
    { name: '農民', skill: '農業', train: [['筋力', 1], ['持久力', 1]], apt: [['筋力', .7], ['持久力', 1], ['計画力', .4], ['誠実性', .4]] },
    { name: '牧畜従事者', skill: '家畜管理', train: [['持久力', 1]], apt: [['持久力', 1], ['注意力', .6], ['共感性', .4]] },
    { name: '交易者', skill: '商業', train: [['洞察力', 1]], apt: [['社交性', 1], ['洞察力', 1], ['信頼傾向', .5], ['計画力', .4]] },
  ];
  JOBS.forEach((j) => { for (const key of ['train', 'apt']) if (j[key]) j[key] = j[key].map(([n, w]) => { if (!(n in SI)) throw new Error('項目名が不明: ' + n); return [SI[n], w]; }); });
  const J_FARM = 9, J_HERD = 10, J_TRADE = 11;

  // ---- 欲求（資料の第6章）：生まれつきの強さは性格から計算（保存しない）。仕事が満たす度合い（JOB_APPEAL）は仮の値
  const NEEDS = ['生存・安全', '家族', '財産', '権力・地位', '信仰・思想', '知識', '自由'];
  const NNEED = NEEDS.length;
  const JOB_APPEAL = [
    null,
    [.7, .5, .3, .1, .2, .3, .6], [.7, .5, .4, .3, .2, .3, .7], [.7, .5, .4, .1, .2, .3, .6], [.5, .5, .6, .3, .2, .6, .4],
    [.5, .6, .6, .4, .3, .4, .3], [.5, .5, .5, .2, .1, .3, .5], [.5, .6, .4, .6, .6, .7, .3], [.8, .4, .4, .7, .3, .2, .2],
    [.8, .6, .5, .2, .3, .2, .2], [.7, .6, .6, .3, .3, .3, .5], [.4, .4, .8, .6, .2, .6, .7],
  ];
  // 全体の平均（測定値）。個人の「ほかの人と比べた違い」を見るために使う
  const NEED_MEAN = [.73, .45, .43, .48, .36, .45, .43];
  const JOB_ABAR = Array.from({ length: NNEED }, (_, n) => { let t = 0; for (let j = 1; j < NJOB; j++) t += JOB_APPEAL[j][n]; return t / (NJOB - 1); });
  // 年齢による能力の変化（成長期と衰え）。k は項目番号
  function ageFactor(k, a) {
    if (k < NP + NC) { if (a < 18) return 0.5 + 0.5 * (a / 18); return a <= 55 ? 1 : Math.max(0.5, 1 - 0.006 * (a - 55)); }   // 認知
    if (a < 20) return 0.45 + 0.55 * (a / 20);
    if (a <= 30) return 1;
    const rate = k === SI['瞬発力'] || k === SI['敏捷性'] ? 0.014 : k === SI['器用さ'] ? 0.006 : k === SI['筋力'] ? 0.008 : 0.009;
    return Math.max(0.35, 1 - rate * (a - 30));
  }
  // 能力の成長量の期待値（1か月）：訓練量 × (0.5＋潜在能力) × 伸びしろ。現在値が高いほど伸びにくい
  function growthExpected(cur, pot, rate) { return rate * (0.5 + pot / 255) * (1 - cur / 255); }

  class Population {
    constructor(seed, groups, cap = 1024) {
      this.seed = seed >>> 0; this.groups = groups; this.n = 0; this.cap = 0; this.day = 0;
      this.rng = (this.seed ^ 0xa5a5a5a5) >>> 0 || 1;
      this.delta = new Map();          // 性格の変化など（まれ）。key = id*64+項目 → 変化量
      this.pool = Array.from({ length: groups }, () => []);   // 結婚相手候補の男性（遅延削除）
      this.focus = new Map();   // 重要人物
      this.stats = { births: 0, deaths: 0, marriages: 0, jobChanges: 0, retired: 0 };
      this.gdemand = new Float32Array(groups * NJOB); this.gflags = new Uint8Array(groups); this.gcount = new Uint32Array(groups * NJOB); this.gwork = new Uint32Array(groups);
      for (let g = 0; g < groups; g++) this.setGroup(g, {});
      this._alloc(cap);
    }
    _alloc(cap) {
      const grow = (name, T, per, fill) => { const a = new T(cap * per); if (fill !== undefined) a.fill(fill); if (this[name]) a.set(this[name].subarray(0, this.n * per)); this[name] = a; };
      grow('birth', Int32Array, 1); grow('death', Int32Array, 1, ALIVE); grow('sex', Uint8Array, 1); grow('group', Uint16Array, 1);
      grow('mother', Uint32Array, 1, NONE); grow('father', Uint32Array, 1, NONE); grow('spouse', Uint32Array, 1, NONE);
      grow('job', Uint8Array, 1); grow('flags', Uint8Array, 1);   // flags: bit0 結婚候補の列に入っている／bit1 生まれつきの値を計算済み／bit2 職業を選んだことがある／bit3 引退
      grow('skills', Uint8Array, NSKILL);        // 技能（0〜255）
      grow('train', Int8Array, NABIL);           // 訓練による能力の変化
      grow('gen', Uint8Array, NABIL * 2);        // 生まれつきの能力・潜在能力の計算結果（働き始める年齢で埋める）
      this.cap = cap;
    }
    random() { let x = this.rng; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; this.rng = x; return x / 4294967296; }
    // 確率的な丸め：1.3 なら 30% の確率で 2、70% で 1（整数の配列で小さな成長を表すため）
    _round(x) { const f = Math.floor(x); return f + (this.random() < x - f ? 1 : 0); }
    // 民族ごとの環境と技術。demand＝仕事の必要度（職業選択の重み）
    setGroup(g, env) {
      const e = Object.assign({ gather: .3, hunt: .25, fish: .15, farm: 0, herd: 0, trade: 0 }, env), d = this.gdemand.subarray(g * NJOB, g * NJOB + NJOB);
      d.fill(0); d[1] = e.gather; d[2] = e.hunt; d[3] = e.fish; d[4] = .06; d[5] = .08; d[6] = .05; d[7] = .04; d[8] = .05; d[J_FARM] = .35 * e.farm; d[J_HERD] = .15 * e.herd; d[J_TRADE] = .06 * e.trade;
      this.gflags[g] = (e.farm > 0 ? 1 : 0) | (e.herd > 0 ? 2 : 0) | (e.trade > 0 ? 4 : 0);
    }
    _add(group, sex, birthDay, mother, father) {
      if (this.n >= this.cap) this._alloc(this.cap * 2);
      const i = this.n++; this.birth[i] = birthDay; this.sex[i] = sex; this.group[i] = group; this.mother[i] = mother; this.father[i] = father;
      return i;
    }
    addFounder(group, ageYears) { return this._add(group, this.random() < .5 ? 0 : 1, this.day - Math.floor(ageYears * YEAR + this.random() * YEAR), NONE, NONE); }
    // 生まれつきの値（保存しない）。両親が分かれば両親の平均寄り。さかのぼりは3世代まで
    genetic(id, k, depth = 0) {
      const f = bell(mix(this.seed, id, k, 1));
      const m = this.mother[id], p = this.father[id];
      if (m === NONE || p === NONE || depth >= 3) return f;
      return clamp(Math.round(0.5 * (this.genetic(m, k, depth + 1) + this.genetic(p, k, depth + 1)) + (f - 127.5) * 0.7));
    }
    _fillGen(i) { const o = i * NABIL * 2; for (let a = 0; a < NABIL; a++) { this.gen[o + a] = this.genetic(i, NP + a); this.gen[o + NABIL + a] = this.genetic(i, NSTAT + a); } this.flags[i] |= 2; }
    base(id, k) { return k >= NP && (this.flags[id] & 2) ? this.gen[id * NABIL * 2 + k - NP] : this.genetic(id, k); }
    potential(id, a) { return (this.flags[id] & 2) ? this.gen[id * NABIL * 2 + NABIL + a] : this.genetic(id, NSTAT + a); }
    // 現在値。性格＝生まれつき＋人生での変化。能力＝(生まれつき＋訓練) × 年齢による係数
    stat(id, k) {
      if (k < NP) return clamp(this.genetic(id, k) + (this.delta.get(id * 64 + k) || 0));
      return clamp(Math.round((this.base(id, k) + this.train[id * NABIL + k - NP]) * ageFactor(k, this.age(id))));
    }
    addDelta(id, k, amount) { const key = id * 64 + k; const v = Math.max(-128, Math.min(127, (this.delta.get(key) || 0) + amount)); if (v) this.delta.set(key, v); else this.delta.delete(key); }
    age(id) { return ((this.day - this.birth[id]) / YEAR); }
    alive(id) { return this.death[id] === ALIVE; }
    // 職業への向き：項目の重み付き平均（0〜1）
    aptitude(id, job) {
      const L = JOBS[job].apt; let s = 0, w = 0;
      for (const [k, wt] of L) { if (!wt) continue; s += this.stat(id, k) * wt; w += wt; }
      return w ? s / w / 255 : 0;
    }
    // 職業を選ぶ：必要度（空きが多い仕事ほど高い）×向き×家族の職業×ばらつき。今の職業には慣性がある
    pickJob(i) {
      const g = this.group[i], cur = this.job[i], fl = this.gflags[g];
      const d = this.gdemand.subarray(g * NJOB, g * NJOB + NJOB), cnt = this.gcount.subarray(g * NJOB, g * NJOB + NJOB), work = Math.max(1, this.gwork[g]);
      let tot = 0; for (let j = 1; j < NJOB; j++) if (this._avail(j, fl)) tot += d[j];
      if (tot <= 0) return 0;
      const father = this.father[i], fj = father !== NONE && this.death[father] === ALIVE ? this.job[father] : 0;
      const sc = new Float64Array(NJOB); let sum = 0, w = this._w || (this._w = new Float32Array(NNEED)); this.needWeights(i, w);
      for (let j = 1; j < NJOB; j++) {
        if (!this._avail(j, fl) || d[j] <= 0) continue;
        const t = d[j] / tot, share = cnt[j] / work;
        let v = Math.min(4, Math.max(0.05, t / (share + 0.02))) * Math.pow(0.15 + this.aptitude(i, j), 3) * Math.exp(4 * this.jobAppeal(w, j)) * (0.7 + 0.6 * this.random());
        if (j === fj) v *= 1.6; if (j === cur) v *= 1.5;
        sc[j] = v; sum += v;
      }
      let r = this.random() * sum; for (let j = 1; j < NJOB; j++) { r -= sc[j]; if (r <= 0 && sc[j] > 0) return j; }
      return cur;
    }
    // 欲求の重み（0〜1）：性格と、家族の状況・年齢から。保存しない
    needWeights(i, out = new Float32Array(NNEED)) {
      const g = (n) => this.genetic(i, SI[n]) / 255, a = this.age(i);
      const stab = g('感情安定性'), cau = g('慎重さ'), emp = g('共感性'), amb = g('野心'), soc = g('社交性'), cur = g('好奇心'), hon = g('誠実性'), fle = g('柔軟性');
      const fam = (this.spouse[i] !== NONE ? .25 : 0) + (a >= 20 && a < 45 ? .15 : 0);
      out[0] = Math.min(1, .45 + (1 - stab) * .3 + cau * .25);
      out[1] = Math.min(1, .2 + emp * .35 + fam);
      out[2] = Math.min(1, .15 + amb * .25 + cau * .2 + hon * .1);
      out[3] = Math.min(1, amb * .75 + soc * .2);
      out[4] = Math.min(1, .1 + (1 - fle) * .3 + emp * .15 + (a > 45 ? .15 : 0));
      out[5] = Math.min(1, cur * .6 + this.genetic(i, SI['学習力']) / 255 * .3);
      out[6] = Math.min(1, cur * .25 + (1 - hon) * .2 + (1 - cau) * .3 + (a < 30 ? .1 : 0));
      return out;
    }
    // 職業の魅力（0〜1）＝欲求の重みで平均した、仕事が満たす度合い
    // 魅力（正なら平均より魅力的）＝ Σ (欲求の重み−全体の平均) × (その職業が満たす度合い−職業全体の平均)
    jobAppeal(w, j) { const A = JOB_APPEAL[j]; let s = 0; for (let n = 0; n < NNEED; n++) s += (w[n] - NEED_MEAN[n]) * (A[n] - JOB_ABAR[n]); return s; }
    // いま一番強い欲求（重み×まだ満たされていない度合い。満たされ具合は呼び出し側が与える：民族ごとの状態、なければ中間）
    topNeed(i) { const w = this.needWeights(i), sat = this.satisfaction ? this.satisfaction(i) : null; let b = 0, bv = -1; for (let n = 0; n < NNEED; n++) { const v = w[n] / NEED_MEAN[n] * (1 - (sat ? sat[n] : .5)); if (v > bv) { bv = v; b = n; } } return b; }
    // 重要人物（資料の第3層）：詳細に考える人。民族・職業・出来事などの理由と、開始日を持つ。個人ID・経験・家族は維持する
    promote(i, reason) { this.focus.set(i, { reason, since: this.day, goal: this.topNeed(i) }); }
    demote(i) { this.focus.delete(i); }
    _avail(j, fl) { return j === J_FARM ? !!(fl & 1) : j === J_HERD ? !!(fl & 2) : j === J_TRADE ? !!(fl & 4) : true; }
    _setJob(i, j) {
      const g = this.group[i], old = this.job[i];
      if (old) { this.gcount[g * NJOB + old]--; this.gwork[g]--; }
      this.job[i] = j; if (j) { this.gcount[g * NJOB + j]++; this.gwork[g]++; }
    }
    // 技能を使った分だけ伸ばす（職業以外の活動でも使える：例えば農民が狩りをする）。months＝活動した月数
    practice(i, skill, months, intensity = 1) {
      const learn = this.stat(i, SI['学習力']), s = this.skills[i * NSKILL + skill], a = this.age(i);
      const x = months * intensity * (0.5 + learn / 255) * (1 - s / 255) * (a < 16 ? 0.5 : a < 50 ? 1 : 0.6);
      this.skills[i * NSKILL + skill] = Math.min(255, s + this._round(x));
    }
    // 世界の開始時：初期の人々が「それまでの人生」で身につけた職業・技能・訓練を、年齢から一括で決める（世界の生成中に1回だけ）。
    // 14歳から今までの月数ぶん、毎月の成長式を指数関数で積んだもの。引退済みの高齢者も含む
    initFounders() {
      const segs = [[14, 16, 0.5, 0.5, 1], [16, 30, 1, 1, 1], [30, 50, 1, 1, 0.6], [50, 60, 0.6, 1, 0.3]];   // [始め,終わり歳, 技能の速さ, 訓練の速さ, 訓練の年齢係数]
      for (let i = 0; i < this.n; i++) {
        if (this.death[i] !== ALIVE || this.flags[i] & 4) continue;
        const a = this.age(i); if (a < 14) continue;
        this._fillGen(i); this.flags[i] |= 4;
        const j = this.pickJob(i); if (!j) continue;
        this._setJob(i, j);
        const learn = this.base(i, SI['学習力']) / 255;
        // 今の職業に就いてからの年数：転職は年約2.4%（月0.2%）の確率で起こるので、勤続年数は指数分布
        const til = Math.min(a, 60, 14 + (a < 50 ? -Math.log(1 - this.random()) / 0.024 : 1e9));
        let u = 255;   // 技能の「伸びしろ」255−s
        for (const [s0, s1, rs] of segs) { if (til <= s0) break; const m = (Math.min(til, s1) - s0) * 12; u *= Math.exp(-rs * (0.5 + learn) * m / 255); }
        this.skills[i * NSKILL + j - 1] = Math.min(255, this._round(255 - u));
        for (const [k, w] of JOBS[j].train) {
          const ab = k - NP, b0 = this.base(i, k), pot = this.potential(i, ab);
          let uu = 255 - b0;
          for (const [s0, s1, , rt, ag] of segs) { if (til <= s0) break; const m = (Math.min(til, s1) - s0) * 12; uu *= Math.exp(-0.1 * w * rt * ag * (0.5 + pot / 255) * m / 255); }
          this.train[i * NABIL + ab] = Math.min(127, Math.max(0, this._round(255 - b0 - uu)));
        }
        if (a >= 60 && this.random() < 1 - Math.pow(0.97, (a - 60) * 12)) { this._setJob(i, 0); this.flags[i] |= 8; }   // 引退
      }
    }
    // 年間の死亡率（昔の社会のたたき台。乳児20%・成人は加齢で急上昇）
    static qDeath(a) { return a < 1 ? 0.20 : a < 5 ? 0.04 : a < 15 ? 0.008 : 0.005 + 0.0003 * Math.exp(0.09 * a); }
    _die(i) { this.death[i] = this.day; this.stats.deaths++; this._setJob(i, 0); const s = this.spouse[i]; if (s !== NONE && this.spouse[s] === i) this.spouse[s] = NONE; this.spouse[i] = NONE; }
    _work(i, a) {
      // 訓練：仕事で使う能力が伸びる（見習いの間は半分）
      const j = this.job[i], rate = a < 16 ? 0.5 : 1, ag = a < 30 ? 1 : a < 50 ? 0.6 : 0.3;
      for (const [k, w] of JOBS[j].train) {
        const ab = k - NP, cur = this.stat(i, k), pot = this.potential(i, ab);
        const x = this._round(growthExpected(cur, pot, 0.1 * w * rate * ag)), idx = i * NABIL + ab;
        if (x) this.train[idx] = Math.min(127, this.train[idx] + x);
      }
      this.practice(i, j - 1, 1, rate);
    }
    _visit(i) {
      if (this.death[i] !== ALIVE) return;
      const a = this.age(i);
      const q = Population.qDeath(a), qm = 1 - Math.pow(1 - q, 1 / 12);
      if (this.random() < qm) { this._die(i); return; }
      // 仕事：14歳で見習いとして職業を選ぶ／まれに転職／60歳以降に引退
      if (a >= 14 && !(this.flags[i] & 8)) {
        if (!(this.flags[i] & 2)) this._fillGen(i);
        if (!(this.flags[i] & 4)) { const j = this.pickJob(i); if (j) { this._setJob(i, j); } this.flags[i] |= 4; }
        else if (a >= 60 && this.random() < 0.03) { this._setJob(i, 0); this.flags[i] |= 8; this.stats.retired++; }
        else if (this.job[i] && a < 50 && this.random() < 0.003) { const j = this.pickJob(i); if (j && j !== this.job[i]) { this._setJob(i, j); this.stats.jobChanges++; } }
        if (this.job[i]) this._work(i, a);
      }
      if (a < 16) return;
      const g = this.group[i];
      if (this.sex[i] === 1) {   // 男性：結婚候補の列に入る
        if (!(this.flags[i] & 1) && this.spouse[i] === NONE) { this.flags[i] |= 1; this.pool[g].push(i); }
        return;
      }
      if (this.spouse[i] === NONE) {   // 女性：未婚なら候補から探す
        if (this.random() < 0.15) {
          const pl = this.pool[g];
          for (let t = 0; t < 4 && pl.length; t++) {
            const k = Math.floor(this.random() * pl.length), j = pl[k];
            if (this.death[j] !== ALIVE || this.spouse[j] !== NONE) { pl[k] = pl[pl.length - 1]; pl.pop(); this.flags[j] &= ~1; continue; }
            const kin = this.mother[i] !== NONE && (this.mother[i] === this.mother[j] || this.father[i] === this.father[j]);
            if (kin || Math.abs(this.birth[i] - this.birth[j]) > 15 * YEAR) continue;
            pl[k] = pl[pl.length - 1]; pl.pop(); this.flags[j] &= ~1;
            this.spouse[i] = j; this.spouse[j] = i; this.stats.marriages++; break;
          }
        }
        return;
      }
      if (a < 42) {   // 既婚女性：出産（年に約17%）
        if (this.random() < 1 - Math.pow(1 - 0.17, 1 / 12)) {
          this._add(g, this.random() < .5 ? 0 : 1, this.day, i, this.spouse[i]); this.stats.births++;
        }
      }
    }
    // 1日進める：人ごとに月に1回だけ判定する（id % 30 が日付と合う人）
    stepDay() {
      this.day++;
      for (let i = this.day % MONTH; i < this.n; i += MONTH) this._visit(i);
    }
    stepYear() { for (let d = 0; d < YEAR; d++) this.stepDay(); }
    livingCount() { let c = 0; for (let i = 0; i < this.n; i++) if (this.death[i] === ALIVE) c++; return c; }
    checksum() { let h = this.seed; for (let i = 0; i < this.n; i++) h = mix(h, this.birth[i], this.death[i], (this.mother[i] ^ this.spouse[i]) + this.job[i] * 65537 + this.skills[i * NSKILL + Math.max(0, this.job[i] - 1)]); return h; }
    // 保存：変化分だけ（性格の変化・訓練・技能は0でない所だけ）。技能は職業の技能のほか、実際に伸ばした技能すべて
    save() {
      const pairs = [], tr = [], sk = [];
      for (const [k, v] of this.delta) pairs.push(k, v);
      for (let i = 0; i < this.n; i++) {
        for (let a = 0; a < NABIL; a++) { const v = this.train[i * NABIL + a]; if (v) tr.push(i * 16 + a, v); }
        for (let s = 0; s < NSKILL; s++) { const v = this.skills[i * NSKILL + s]; if (v) sk.push(i * 16 + s, v); }
      }
      return { personality: Int32Array.from(pairs), train: Int32Array.from(tr), skills: Int32Array.from(sk) };
    }
  }
  const api = { NEEDS, JOB_APPEAL, Population, STAT_NAMES, PERSONALITY, COGNITIVE, PHYSICAL, NSTAT, NP, NABIL, NJOB, NSKILL, JOBS, SI, ageFactor, growthExpected, mix, bell, YEAR, MONTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohNpc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
