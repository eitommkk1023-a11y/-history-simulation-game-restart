'use strict';
// 集落の階層（F5）：野営・半定住・村・町・都市・大都市。定住の段階（settle 0/1/2）と人口から決める。
// 町以上の条件は、今は人口だけ（M4 で、水・衛生・統治・市場などの条件を足す）。閾値は game-config.js の tiers。
(function (root) {
const CFG = (typeof require !== 'undefined' ? require('./game-config.js') : root.WohConfig).CONFIG;
// 定住の段階（settle）が minSettle 以上で、人口が minPop 以上のうち、最も上の階層
function tierIndex(g, tiers) { tiers = tiers || CFG.tiers; let best = 0; for (let i = 0; i < tiers.length; i++) { const t = tiers[i]; if ((g.settle || 0) >= t.minSettle && (g.pop || 0) >= t.minPop) best = i; } return best; }
const tierOf = (g, tiers) => (tiers || CFG.tiers)[tierIndex(g, tiers)];
const tierLabel = (g) => tierOf(g).label;
const api = { tierIndex, tierOf, tierLabel };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WohTier = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
