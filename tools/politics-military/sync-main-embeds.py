from pathlib import Path
import subprocess,sys
root=Path(__file__).resolve().parents[2]
subprocess.run([sys.executable,str(root/'tools/politics-military/build-main-bundle.py')],check=True)
p=root/'World-of-History-v30-development.html';s=p.read_text()
for tag,source in [('npc-core','npc/npc-core.js'),('people-core','npc/people-core.js'),('politics-main-bundle','tools/politics-military/main-military.bundle.js')]:
 marker=f'<script id="{tag}">';assert s.count(marker)==1
 a=s.index(marker)+len(marker);b=s.index('</script>',a);body=(root/source).read_text();assert '</script' not in body.lower();s=s[:a]+'\n'+body+'\n'+s[b:]
p.write_text(s)
