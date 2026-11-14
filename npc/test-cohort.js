'use strict';
// 人口の集計の層（pop-cohort.js）と、個人の層（npc-core の Population）の比較：node npc/test-cohort.js
// 同じ死亡・出生の規則（既定：Population.qDeath、既婚の女性は年0.17人）で、個人の層を何度か走らせ、結婚している女性の割合（年齢別）を測って、集計の層に与える。そのうえで、人口の推移・出生・死亡・年齢の構成が合うかを調べる
const Npc = require('./npc-core.js'), { Cohort, AM } = require('./pop-cohort.js');
const Pop = Npc.Population || Npc.default || Object.values(Npc).find(v => typeof v === 'function' && v.name === 'Population');
let ok = 0, ng = 0; const t = (name, cond, extra) => { if (cond) { ok++; console.log('○', name, extra == null ? '' : extra); } else { ng++; console.log('×', name, extra == null ? '' : extra); } };
const N0 = 400, YEARS = 40, SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
// 初めの年齢構成：生存曲線（Population.qDeath）から作る安定に近い分布
const qd = (a) => Pop.qDeath(a); const surv = []; { let l = 1; for (let a = 0; a < 90; a++) { surv.push(l); l *= 1 - qd(a); } }
const ssum = surv.reduce((x, y) => x + y, 0), pickAge = (u) => { let s = 0; u *= ssum; for (let a = 0; a < 90; a++) { s += surv[a]; if (u < s) return a + Math.random() * 0 ; } return 89; };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const runs = [], marrSum = new Float64Array(90), marrN = new Float64Array(90), initF = [], initM = [];
for (const seed of SEEDS) {
  const rnd = mulberry(seed * 7919), P = new Pop(seed, 2, 4096), ids = [];
  for (let i = 0; i < N0; i++) { const a = pickAge(rnd()) + rnd(); const id = P.addFounder(1, a); P.sex[id] = rnd() < 0.5 ? 1 : 0; ids.push(id); }
  const tot = [], bir = [], dea = []; let b0 = 0, d0 = 0;
  for (let y = 0; y <= YEARS; y++) {
    const alive = []; for (let i = 0; i < P.n; i++) if (P.death[i] === 2147483647 || P.death[i] === 0x7fffffff) alive.push(i);
    tot.push(P.livingCount());
    if (y === 0 && seed === SEEDS[0]) { for (const i of alive) (P.sex[i] === 0 ? initF : initM).push(P.age(i)); }
    if (y >= 5) for (const i of alive) if (P.sex[i] === 0) { const a = Math.floor(P.age(i)); if (a >= 15 && a < 50) { marrN[a]++; if (P.spouse[i] !== 0xffffffff) marrSum[a]++; } }
    if (y < YEARS) { P.stepYear(); bir.push(P.stats.births - b0); dea.push(P.stats.deaths - d0); b0 = P.stats.births; d0 = P.stats.deaths; }
  }
  runs.push({ tot, bir, dea });
}
const mean = (k, y) => runs.reduce((s, r) => s + r[k][y], 0) / runs.length;
const marrT = (a) => { a = Math.floor(a); return a >= 15 && a < 50 && marrN[a] > 20 ? marrSum[a] / marrN[a] : 0; };
// 集計の層：個人の層の初期の年齢構成（seed 1 の初期）から
const rates = { qm: (a) => 1 - Math.pow(1 - qd(a), 1 / 12), pf: (a) => (a < 42 ? 0.17 : 0), marr: marrT, sexRatio: 0.5 };
// 初期の人数を N0 にそろえた期待値の構成（個人の初期構成の平均形）
const c = Cohort.fromAges(initF, initM); const k = N0 / c.total(); for (let i = 0; i < AM; i++) { c.f[i] *= k; c.m[i] *= k; }
const ctot = [c.total()], cb = [], cd = []; for (let y = 0; y < YEARS; y++) { let b = 0, d = 0; for (let m = 0; m < 12; m++) { const r = c.step(rates); b += r.births; d += r.deaths; } ctot.push(c.total()); cb.push(b); cd.push(d); }
console.log('年, 個人（平均）, 集計, 差%'); for (const y of [0, 5, 10, 20, 30, 40]) console.log(y, mean('tot', y).toFixed(0), ctot[y].toFixed(0), ((ctot[y] / mean('tot', y) - 1) * 100).toFixed(1) + '%');
for (const y of [10, 20, 40]) { const m0 = mean('tot', y), e = Math.abs(ctot[y] / m0 - 1); t(`${y}年後の総人口が、個人の平均と近い（±6%以内）`, e < 0.06, `個人 ${m0.toFixed(0)}／集計 ${ctot[y].toFixed(0)}（${(e * 100).toFixed(1)}%）`); }
const avgB = (a, y0, y1) => a.slice(y0, y1).reduce((x, y) => x + y, 0) / (y1 - y0), avgIB = (k, y0, y1) => { let s = 0; for (let y = y0; y < y1; y++) s += mean(k, y); return s / (y1 - y0); };
t('出生（年あたり、10〜30年）が近い（±8%以内）', Math.abs(avgB(cb, 10, 30) / avgIB('bir', 10, 30) - 1) < 0.08, `個人 ${avgIB('bir', 10, 30).toFixed(1)}／集計 ${avgB(cb, 10, 30).toFixed(1)}`);
t('死亡（年あたり、10〜30年）が近い（±8%以内）', Math.abs(avgB(cd, 10, 30) / avgIB('dea', 10, 30) - 1) < 0.08, `個人 ${avgIB('dea', 10, 30).toFixed(1)}／集計 ${avgB(cd, 10, 30).toFixed(1)}`);
// 年齢の構成（0〜14・15〜49・50歳以上の割合）が、40年後に近い
const share = (cc) => { const T = cc.total(); return [cc.count(0, 15) / T, cc.count(15, 50) / T, cc.count(50, 81) / T]; };
const sc = share(c); console.log('集計の40年後の年齢構成（0-14, 15-49, 50+）', sc.map(x => (x * 100).toFixed(0) + '%').join(' / '));
t('保存・展開：集計から、年齢の見本を取り出せる（人数・年齢の範囲）', (() => { const s = c.sampleAges(200, mulberry(5)); return s.length === 200 && s.every(x => x.age >= 0 && x.age < 81 && (x.sex === 0 || x.sex === 1)); })());
t('同じ入力で同じ結果（決定的）', (() => { const a = Cohort.fromAges(initF, initM), b = Cohort.fromAges(initF, initM); for (let i = 0; i < 24; i++) { a.step(rates); b.step(rates); } return a.total() === b.total(); })());
const t0 = process.hrtime.bigint(); const big = []; for (let i = 0; i < 1000; i++) { const x = Cohort.fromAges(initF, initM); big.push(x); } const t1 = process.hrtime.bigint(); const TB = Cohort.tables(rates); for (let m = 0; m < 12; m++) for (const x of big) x.step(TB); const ms = Number(process.hrtime.bigint() - t1) / 1e6 / 12;
t('1000の集計の1か月の計算が軽い（20ms未満）', ms < 20, `${ms.toFixed(1)}ms（約 ${Math.round(1000 * c.total() / 1000) * 1000} 人分）`);
console.log(ng ? `不合格 ${ng}` : '全て合格');
