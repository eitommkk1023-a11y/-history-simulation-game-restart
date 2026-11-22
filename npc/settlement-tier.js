'use strict';
// 集落の階層（F5）：野営・半定住・村・町・都市・大都市。定住の段階（settle 0/1/2）と人口から決める。
// 町以上は、人口に加えて、水と衛生（g.san＝井戸・排水路の受け持つ割合）と統治（g.gov＝民族の持つ首長制・国家）も要る（M4）。市場などの条件は M5 で足す。閾値は game-config.js の tiers（minSan・gov）。
(function (root) {
const CFG = (typeof require !== 'undefined' ? require('./game-config.js') : root.WohConfig).CONFIG;
// 定住の段階（settle）が minSettle 以上で、人口が minPop 以上のうち、最も上の階層
function meets(g, t) { return (g.settle || 0) >= t.minSettle && (g.pop || 0) >= t.minPop && (g.san || 0) >= (t.minSan || 0) && (!t.gov || !!(g.gov && g.gov[t.gov])); }
function tierIndex(g, tiers) { tiers = tiers || CFG.tiers; let best = 0; for (let i = 0; i < tiers.length; i++) if (meets(g, tiers[i])) best = i; return best; }
// 次の階層に足りないもの（表示用）：人口・水と衛生・統治
function tierMissing(g, tiers) { tiers = tiers || CFG.tiers; const i = tierIndex(g, tiers); if (i >= tiers.length - 1) return []; const t = tiers[i + 1], out = []; if ((g.settle || 0) < t.minSettle) out.push('定住'); if ((g.pop || 0) < t.minPop) out.push('人口 ' + t.minPop + ' 以上'); if ((g.san || 0) < (t.minSan || 0)) out.push('水と衛生（井戸・排水路で人口の ' + Math.round((t.minSan || 0) * 100) + '% 以上を受け持つ）'); if (t.gov && !(g.gov && g.gov[t.gov])) out.push(t.gov === 'state' ? '国家（統治の技術）' : '首長制（統治の技術）'); return out; }
const tierOf = (g, tiers) => (tiers || CFG.tiers)[tierIndex(g, tiers)];
const tierLabel = (g) => tierOf(g).label;
const api = { tierIndex, tierOf, tierLabel, tierMissing };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohTier = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
