from pathlib import Path
root=Path(__file__).resolve().parents[2]
template=(root/'tools/politics-military/assignment-sandbox.template.html').read_text()
npc=(root/'npc/npc-core.js').read_text()
reference=(root/'src/politics-military/person-reference.mjs').read_text()
ledger=(root/'src/politics-military/assignment-ledger.mjs').read_text()
expected="import {inspectRoster} from './person-reference.mjs';"
assert ledger.count(expected)==1
code=reference.replace('export function ','function ')+ '\n'+ledger.replace(expected,'').replace('export function ','function ')
ui=(root/'tools/politics-military/assignment-sandbox.js').read_text()
for source in [npc,code,ui]:assert '</script' not in source.lower()
html=template.replace('/*__NPC__*/',npc).replace('/*__LEDGER__*/',code).replace('/*__UI__*/',ui)
out=root/'tools/politics-military/assignment-sandbox.html';out.write_text(html)
print(f'{out}: {out.stat().st_size} bytes')
