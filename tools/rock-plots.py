from pathlib import Path
import json,numpy as np,matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap,TwoSlopeNorm
D=Path('validation/rocks');P=D/'images';P.mkdir(exist_ok=True)
cols=['A','B','C1','C2','D1','D2','D3'];kinds=['contact','alternating','limestone','fractures']
colors=[[((i*67+53)%192+32)/255,((i*107+29)%192+32)/255,((i*139+11)%192+32)/255] for i in range(24)]
for field,title,filename in [('delta','Elevation change from initial (source meters)','height-comparison.png'),('exposedId','Exposed bedrock IDs (same colors as in-game diagnostic)','geology-comparison.png')]:
 fig,axes=plt.subplots(4,7,figsize=(17,9),layout='constrained');fig.suptitle(title)
 for r,kind in enumerate(kinds):
  grids=[json.loads((D/f'{kind}-{c}-grid.json').read_text()) for c in cols];lim=max(abs(v) for g in grids for v in g['delta'])
  for c,(name,g) in enumerate(zip(cols,grids)):
   ax=axes[r,c];a=np.array(g[field]).reshape(g['height'],g['width']);kwargs=dict(origin='upper',interpolation='nearest',extent=[0,1.28,1.28,0])
   if field=='delta':im=ax.imshow(a,cmap='RdBu_r',vmin=-lim,vmax=lim,**kwargs)
   else:im=ax.imshow(a,cmap=ListedColormap(colors),vmin=-.5,vmax=23.5,**kwargs)
   ax.set_title(f'{kind} {name}',fontsize=9);ax.set_xticks([]);ax.set_yticks([])
  if field=='delta':fig.colorbar(im,ax=axes[r,:],shrink=.7,label='m')
 if field=='exposedId':fig.colorbar(im,ax=axes.ravel().tolist(),shrink=.7,ticks=np.arange(24),label='Rock ID: 0 granite ... 23 serpentinite')
 fig.savefig(P/filename,dpi=130);plt.close(fig)
fig,axes=plt.subplots(4,6,figsize=(16,9),layout='constrained');fig.suptitle('Elevation difference relative to A (source meters; NOT amplified)')
for r,kind in enumerate(kinds):
 gs={name:json.loads((D/f'{kind}-{name}-grid.json').read_text()) for name in cols};base=np.array(gs['A']['elevation']);diff=[np.array(gs[n]['elevation'])-base for n in cols[1:]];lim=max(max(abs(a)) for a in diff) or 1
 for c,(name,a) in enumerate(zip(cols[1:],diff)):
  ax=axes[r,c];im=ax.imshow(a.reshape(32,32),cmap='RdBu_r',vmin=-lim,vmax=lim,interpolation='nearest');ax.set_title(f'{kind}: {name} - A',fontsize=9);ax.set_xticks([]);ax.set_yticks([])
 fig.colorbar(im,ax=axes[r,:],shrink=.7,label='m')
fig.savefig(P/'height-difference-from-A.png',dpi=130);plt.close(fig)
fig,axes=plt.subplots(3,3,figsize=(12,11),layout='constrained');fig.suptitle('Full native world generation: 375 x 375 geological grid')
for r,seed in enumerate([12345,67890,314159]):
 g=json.loads((D/f'world-{seed}-map.json').read_text());h,w=g['height'],g['width']
 for c,field in enumerate(['elevation','delta','exposedId']):
  a=np.array(g[field]).reshape(h,w);ax=axes[r,c]
  if field=='exposedId':im=ax.imshow(a,cmap=ListedColormap(colors),vmin=-.5,vmax=23.5,interpolation='nearest')
  else:im=ax.imshow(a,cmap='terrain' if c==0 else 'RdBu_r',**({} if c==0 else {'vmin':-max(abs(a.min()),abs(a.max())),'vmax':max(abs(a.min()),abs(a.max()))}));fig.colorbar(im,ax=ax,shrink=.7,label='source m')
  ax.set_title(f'Seed {seed}: {field}');ax.set_xticks([]);ax.set_yticks([])
fig.savefig(P/'three-seeds.png',dpi=130);plt.close(fig)
print('saved',*[str(p) for p in P.glob('*.png')])
