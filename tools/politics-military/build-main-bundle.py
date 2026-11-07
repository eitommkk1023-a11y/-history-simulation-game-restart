from pathlib import Path
import re
root=Path(__file__).resolve().parents[2]
mods={};ordered=[]
def module(path):
 path=path.resolve();key=str(path.relative_to(root));
 if key in mods:return key
 src=path.read_text();imports=[]
 for m in re.finditer(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?",src):
  dep=module(path.parent/m[2]);imports.append('const {'+m[1]+'}=mods['+repr(dep)+'];')
 src=re.sub(r"import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];?",'',src)
 exports=re.findall(r'export\s+(?:function|const)\s+(\w+)',src)
 src=re.sub(r'export\s+(function|const)\s+',r'\1 ',src)
 assert '</script' not in src.lower()
 mods[key]=True;ordered.append('mods['+repr(key)+']=(()=>{'+''.join(imports)+'\n'+src+'\nreturn {'+','.join(exports)+'};})();')
 return key
keys=[module(root/'src/integration/main-military.mjs'),module(root/'src/integration/main-save.mjs')]
code='(()=>{const mods={};\n'+'\n'.join(ordered)+'\nwindow.WohMainMilitary={'+','.join('...mods['+repr(k)+']' for k in keys)+'};})();'
(root/'tools/politics-military/main-military.bundle.js').write_text(code+'\n')
print('bundle bytes',len(code))
