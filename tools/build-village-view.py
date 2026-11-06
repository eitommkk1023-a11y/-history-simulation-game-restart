#!/usr/bin/env python3
"""Codex の村の造形（prototypes/village/*.mjs）を、本編に埋め込める1ファイル（npc/village-view.js、グローバル WohVillageView）に変換する。
使い方：python3 tools/build-village-view.py <Codexの抽出ディレクトリ>   （<dir>/prototypes/village/ に geometry/fields/livestock-model/livestock/facilities の .mjs がある）
各ファイルは別々の関数スコープに入れ、名前の衝突を避ける。import は先に作った部品の分解代入に、export は戻り値にする。"""
import re, sys, os
src = os.path.join(sys.argv[1], 'prototypes', 'village')
ORDER = ['geometry', 'fields', 'livestock-model', 'livestock', 'facilities']
out = ["/* World of History: 村の造形（畑・家畜・施設）。Codex の prototypes/village/*.mjs を tools/build-village-view.py で変換。手で編集しない。\n * THREE（r128）を渡して使う：createFields / createLivestock / createFacilities（使い方は docs の village 受け渡し仕様）。 */",
       "(function (root) {", "'use strict';", "const M = {};"]
for name in ORDER:
    t = open(os.path.join(src, name + '.mjs'), encoding='utf-8').read()
    exports = []
    def imp(m):
        names = [n.strip() for n in m.group(1).split(',') if n.strip()]
        mod = os.path.basename(m.group(2)).replace('.mjs', '')
        return 'const {' + ','.join(names) + '}=M[' + repr(mod) + '];'
    t = re.sub(r"import\s*\{([^}]*)\}\s*from\s*'([^']+)';?", imp, t)
    def exp(m):
        exports.append(m.group(2)); return m.group(1)
    t = re.sub(r"export\s+((?:async\s+)?(?:function|const|class)\s+)([A-Za-z_0-9]+)", lambda m: (exports.append(m.group(2)) or m.group(1) + m.group(2)), t)
    assert 'export ' not in t.replace('exports', ''), name
    out.append("M[%r] = (function () {\n%s\nreturn {%s};\n})();" % (name, t.rstrip(), ','.join(exports)))
out.append("root.WohVillageView = { createFields: M.fields.createFields, plotWorldPoint: M.fields.plotWorldPoint, createLivestock: M.livestock.createLivestock, createFacilities: M.facilities.createFacilities, FACILITY_ROLES: M.facilities.FACILITY_ROLES, FACILITY_LABELS: M.facilities.FACILITY_LABELS };")
out.append("})(typeof globalThis !== 'undefined' ? globalThis : this);")
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'npc', 'village-view.js'), 'w', encoding='utf-8').write('\n'.join(out) + '\n')
print('wrote npc/village-view.js')
