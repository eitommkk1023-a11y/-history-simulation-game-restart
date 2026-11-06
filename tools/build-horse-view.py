#!/usr/bin/env python3
"""Codex の馬・荷馬車（codex/prototype-horse-v1）のモジュールを、ゲームに埋め込める1つのスクリプトにまとめる。
使い方：Codex のブランチを展開した場所を引数に（例：python3 tools/build-horse-view.py /tmp/cx）→ npc/horse-view.js を出力。"""
import re, sys, os
src = sys.argv[1]
files = ['prototypes/horse/identity.mjs', 'prototypes/horse/motion.mjs', 'prototypes/horse/model.mjs', 'prototypes/horse/controller.mjs',
         'prototypes/horse-extras/rig-math.mjs', 'prototypes/horse-extras/motion.mjs', 'prototypes/horse-extras/renderer.mjs', 'prototypes/horse-extras/cart-renderer.mjs']
out = ['/* World of History: 馬と荷馬車の描画（Codex 試作11のモジュールをまとめたもの。tools/build-horse-view.py で生成。編集しない）。ブラウザでは WohHorseView */', '(function(root){const api={};']
for p in files:
    raw = open(os.path.join(src, p), encoding='utf8').read()
    names = re.findall(r'export (?:function|const) (\w+)', raw)
    s = re.sub(r'import\s*\{([^}]+)\}\s*from\s*[\'"][^\'"]+[\'"];?', lambda m: 'const {' + re.sub(r'\s+as\s+', ':', m.group(1)) + '}=api;', raw)
    s = re.sub(r'^export ', '', s, flags=re.M)
    out.append('(()=>{' + s + '\nObject.assign(api,{' + ','.join(names) + '});})();')
out.append('root.WohHorseView=api;})(typeof globalThis!=="undefined"?globalThis:this);')
open('npc/horse-view.js', 'w', encoding='utf8').write('\n'.join(out) + '\n')
print('ok', sum(len(x) for x in out))
