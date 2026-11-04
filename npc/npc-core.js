'use strict';
/* World of History NPC システム：段階1（個人ID・ID から決まる能力値・変化だけ保存・出生/結婚/死亡）
 * - 全住民に個人ID（配列の添字）。生まれつきの性格・能力・潜在能力は「Seed＋ID（＋両親）」から計算し、保存しない。
 * - 保存するのは人生で変わった分（delta）だけ。重要人物は将来、全項目を実体として持つ。
 * - 判定は月に1回（人ごとに日がずれる）、記録は日付つき。同じ Seed なら同じ結果（整数ハッシュのみ）。
 * ブラウザでも Node でも動く（外部依存なし）。 */
(function (root) {
  const NONE = 0xffffffff, ALIVE = 0x7fffffff, YEAR = 360, MONTH = 30;
  // 項目（たたき台）。性格は反対の傾向を1本の軸にした（0＝一方の端、255＝もう一方の端）
  const PERSONALITY = ['社交性', '協調性', '共感性', '感情安定性', '慎重さ', '積極性', '好奇心', '誠実性', '野心', '柔軟性'];
  const COGNITIVE = ['理解力', '学習力', '計画力', '判断力', '記憶力', '発想力', '洞察力', '注意力'];
  const PHYSICAL = ['筋力', '持久力', '瞬発力', '敏捷性', '器用さ'];
  const STAT_NAMES = [...PERSONALITY, ...COGNITIVE, ...PHYSICAL];
  const NP = PERSONALITY.length, NC = COGNITIVE.length, NPH = PHYSICAL.length;
  const NABIL = NC + NPH, NSTAT = NP + NABIL, NPOT = NABIL, NALL = NSTAT + NPOT;   // 潜在能力は能力ごとに1つ
  const S_COG = NP, S_PHY = NP + NC, S_POT = NSTAT;

  function mix(a, b, c, d) {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x7f4a7c15) | 0, 0xc2b2ae35);
    h ^= h >>> 15; h = Math.imul(h ^ ((c + 0x165667b1) | 0), 0x27d4eb2f); h ^= h >>> 13;
    h = Math.imul(h ^ ((d + 0x1b873593) | 0), 0x85ebca6b); h ^= h >>> 16; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13;
    return h >>> 0;
  }
  // 0..255 の釣鐘型（一様3つの平均）
  function bell(h) { return Math.round(((h & 255) + ((h >>> 8) & 255) + ((h >>> 16) & 255)) / 3); }
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;

  class Population {
    constructor(seed, groups, cap = 1024) {
      this.seed = seed >>> 0; this.groups = groups; this.n = 0; this.cap = 0; this.day = 0;
      this.rng = (this.seed ^ 0xa5a5a5a5) >>> 0 || 1;
      this.delta = new Map();          // key = id*64+項目 → 変化量（-128..127、保存対象）
      this.pool = Array.from({ length: groups }, () => []);   // 結婚相手候補の男性（遅延削除）
      this.stats = { births: 0, deaths: 0, marriages: 0 };
      this._alloc(cap);
    }
    _alloc(cap) {
      const old = this.birth;
      const mk = (T, fill) => { const a = new T(cap); if (fill !== undefined) a.fill(fill); return a; };
      const grow = (name, T, fill) => { const a = mk(T, fill); if (this[name]) a.set(this[name].subarray(0, this.n)); this[name] = a; };
      grow('birth', Int32Array); grow('death', Int32Array, ALIVE); grow('sex', Uint8Array); grow('group', Uint16Array);
      grow('mother', Uint32Array, NONE); grow('father', Uint32Array, NONE); grow('spouse', Uint32Array, NONE);
      grow('job', Uint8Array); grow('flags', Uint8Array);   // flags bit0: 結婚候補の列に入っている
      this.cap = cap;
    }
    random() { let x = this.rng; x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; this.rng = x; return x / 4294967296; }
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
    // 現在値＝生まれつき＋人生での変化
    stat(id, k) { const d = this.delta.get(id * 64 + k); return clamp(this.genetic(id, k) + (d || 0)); }
    addDelta(id, k, amount) { const key = id * 64 + k; const v = Math.max(-128, Math.min(127, (this.delta.get(key) || 0) + amount)); if (v) this.delta.set(key, v); else this.delta.delete(key); }
    age(id) { return ((this.day - this.birth[id]) / YEAR); }
    alive(id) { return this.death[id] === ALIVE; }
    // 年間の死亡率（昔の社会のたたき台。乳児20%・成人は加齢で急上昇）
    static qDeath(a) { return a < 1 ? 0.20 : a < 5 ? 0.04 : a < 15 ? 0.008 : 0.005 + 0.0003 * Math.exp(0.09 * a); }
    _die(i) { this.death[i] = this.day; this.stats.deaths++; const s = this.spouse[i]; if (s !== NONE && this.spouse[s] === i) this.spouse[s] = NONE; this.spouse[i] = NONE; }
    _visit(i) {
      if (this.death[i] !== ALIVE) return;
      const a = this.age(i);
      const q = Population.qDeath(a), qm = 1 - Math.pow(1 - q, 1 / 12);
      if (this.random() < qm) { this._die(i); return; }
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
    checksum() { let h = this.seed; for (let i = 0; i < this.n; i++) h = mix(h, this.birth[i], this.death[i], this.mother[i] ^ this.spouse[i]); return h; }
    // 保存：変化分だけ（deltaの上限 64項目/人）
    saveDelta() { const keys = [...this.delta.keys()], out = new Int32Array(keys.length * 2); keys.forEach((k, x) => { out[x * 2] = k; out[x * 2 + 1] = this.delta.get(k); }); return out; }
  }
  const api = { Population, STAT_NAMES, PERSONALITY, COGNITIVE, PHYSICAL, NSTAT, NALL, S_COG, S_PHY, S_POT, mix, bell, YEAR, MONTH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohNpc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
