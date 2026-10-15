"""One-time asset authoring. Not invoked by the build."""
import json, math, os, subprocess, colorsys
from pathlib import Path
ROOT=Path('public/assets'); TMP=Path('/tmp/facet-production'); TMP.mkdir(exist_ok=True)
def run(*a):
 r=subprocess.run(list(map(str,a)),capture_output=True,text=True)
 if r.returncode: raise RuntimeError(r.stderr+r.stdout)
def dump(p,o): Path(p).write_text(json.dumps(o))
def poly(ops,points,color):
 for y in range(max(0,int(min(p[1] for p in points))),min(64,int(max(p[1] for p in points))+1)):
  xs=[]
  for a,b in zip(points,points[1:]+points[:1]):
   if (a[1]<=y<b[1]) or (b[1]<=y<a[1]): xs.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
  if len(xs)>1: ops.append(dict(op='line',x0=round(min(xs)),y0=y,x1=round(max(xs)),y1=y,color=color))
def line(ops,a,b,c): ops.append(dict(op='line',x0=round(a[0]),y0=round(a[1]),x1=round(b[0]),y1=round(b[1]),color=c))
def emit(ops,path,w=64,h=64,sheet=False):
 path=ROOT/path; path.parent.mkdir(parents=True,exist_ok=True); dump(TMP/'ops.json',ops)
 run('draw-sheet' if sheet else 'draw','render','--actions',TMP/'ops.json','--out',path,'--width',w,'--height',h,'--no-layers')
hues=[.97,.075,.145,.39,.49,.61,.77]
names=['ruby','amber','citrine','jade','beryl','sapphire','amethyst','prism']
def col(h,l,s=.75): return '#'+''.join(f'{round(v*255):02x}' for v in colorsys.hls_to_rgb(h,l,s))
def gem(k,strain=0,turn=0,broken=0):
 ops=[]; n=[6,8,3,4,6,8,5,6][k]; angle=[0,math.pi/8,-math.pi/2,0,math.pi/6,0,-math.pi/2,0][k]+turn
 pts=[(32+27*math.cos(angle+i*math.tau/n),32+27*math.sin(angle+i*math.tau/n)) for i in range(n)]
 inner=[(32+(x-32)*.52,31+(y-32)*.52) for x,y in pts]
 for i in range(n):
  j=(i+1)%n; h=hues[k] if k<7 else i/n
  dx=math.cos(angle+i*math.tau/n)*broken*6; dy=math.sin(angle+i*math.tau/n)*broken*6
  points=[pts[i],pts[j],inner[j],inner[i]]
  poly(ops,[(x+dx,y+dy) for x,y in points],col(h,.24+(i%4)*.12))
  line(ops,pts[i],pts[j],col(h,.75)); line(ops,pts[i],inner[i],col(h,.65))
 
 if broken:
  for i in range(n):
   a=angle+i*math.tau/n; dx=math.cos(a)*broken*5; dy=math.sin(a)*broken*5
   poly(ops,[(32+dx,32+dy),(inner[i][0]+dx,inner[i][1]+dy),(inner[(i+1)%n][0]+dx,inner[(i+1)%n][1]+dy)],col(hues[k] if k<7 else i/n,.62))
 else: poly(ops,inner,col(hues[k] if k<7 else .52,.61))
 line(ops,(22,24),(31,19),'#f3fff1'); line(ops,(23,25),(23,29),'#ffffff')
 cracks=[[(30,7),(27,25),(36,34)],[(36,34),(22,44),(26,54)],[(36,34),(48,23),(52,39)]]
 for path in cracks[:strain]:
  for a,b in zip(path,path[1:]):
   line(ops,(a[0]+1,a[1]),(b[0]+1,b[1]),'#fff3cb'); line(ops,a,b,'#102231')
 if strain==3:
  for a,b in [((9,31),(20,32)),((44,47),(52,53)),((37,10),(42,16))]: line(ops,a,b,'#fff4c6')
 return ops
for k,name in enumerate(names):
 for s in range(4): emit(gem(k,s),Path('gems')/f'{name}-{s}.png')
 if k<7:
  for f in range(6): emit(gem(k,3,broken=f),Path('gems/break')/name/f'{f}.png',sheet=True)
for f in range(8): emit(gem(7,turn=f*.08),Path('gems/prism-turn')/f'{f}.png',sheet=True)
for name in ['brilliant','star']:
 o=[]
 if name=='brilliant':
  for i in range(8):
   a=i*math.tau/8; line(o,(32+24*math.cos(a),32+24*math.sin(a)),(32+28*math.cos(a),32+28*math.sin(a)),'#fff6be')
 else:
  p=[(32+(27 if i%2==0 else 9)*math.cos(i*math.pi/4-math.pi/2),32+(27 if i%2==0 else 9)*math.sin(i*math.pi/4-math.pi/2)) for i in range(8)]
  for a,b in zip(p,p[1:]+p[:1]): line(o,a,b,'#fff4cc')
 emit(o,Path('gems')/f'{name}.png')
o=[]
for inset,color in [(0,'#9f8c61'),(2,'#283b43'),(6,'#101f2a'),(12,'#59645a'),(14,'#142830')]: o.append(dict(op='stroke_rect',x=inset,y=inset,width=600-2*inset,height=600-2*inset,color=color))
for x in [0,580]:
 for y in [0,580]: o.append(dict(op='fill_rect',x=x+3,y=y+3,width=14,height=14,color='#c4b17c'))
emit(o,Path('board.png'),600,600)
# File-backed event voices, deliberately distinct envelopes and pitch gestures.
for i,name in enumerate(['select','swap','refuse','land','flaw','cut','levelup','gameover']+[f'clear-{i}' for i in range(1,9)]):
 out=ROOT/'audio'/f'{name}.wav'; out.parent.mkdir(exist_ok=True)
 cfg=dict(sample_rate=22050,channels='mono',max_duration_ms=700,seed=100+i,actions=str(TMP/'sound.json'),preview=str(TMP/'sound.png'),wav=str(out))
 dump(TMP/'s.json',cfg); base=['sfx-synth','--config',TMP/'s.json']; run(*base,'init')
 freq=[880,620,150,85,1200,1400,660,440][i] if i<8 else 440*2**((i-8)*2/12)
 run(*base,'add-voice','--name','bell','--wave','triangle' if i not in [2,4] else 'noise','--freq',freq,'--gain',-16,'--dur',120 if i<6 else 330)
 run(*base,'add-voice','--name','overtone','--wave','sine','--freq',freq*2.01,'--gain',-24,'--dur',250)
 run(*base,'set-pitch','--voice','bell','--slide-to',freq*(1.6 if i in [1,6] else .6),'--over',180)
 run(*base,'render')

# The sampled clear body, mixed under the ascending synth rung at playback.
cfg=dict(sample_rate=22050,channels='mono',max_duration_ms=600,seed=42,sample_pack='combat-core',actions=str(TMP/'shatter.json'),preview=str(TMP/'shatter.png'),wav=str(ROOT/'audio/shatter.wav'))
dump(TMP/'sample.json',cfg); b=['sfx-sample','--config',TMP/'sample.json']; run(*b,'init')
run(*b,'add-sample','--name','debris_glass','--t',0,'--gain',-12,'--fade-out',180)
run(*b,'add-sample','--name','snap_transient','--t',12,'--gain',-23,'--trim','0,160','--fade-out',100)
run(*b,'render')

# Sequenced original two-part loops.
for name,bpm in [('title',112),('play',82)]:
 cfg=dict(sample_rate=22050,channels='stereo',max_duration_ms=24000,seed=12,instrument_bank='gm-lite',actions=str(TMP/'notes.json'),preview=str(TMP/'notes.png'),wav=str(ROOT/'audio'/f'{name}.wav'),mid=str(ROOT/'audio'/f'{name}.mid'))
 dump(TMP/'m.json',cfg); b=['music','--config',TMP/'m.json']; run(*b,'init'); run(*b,'set-tempo','--bpm',bpm)
 for track,inst in [('lead','music_box'),('low','vibraphone')]: run(*b,'define-track','--name',track,'--instrument',inst)
 melody=[76,79,83,78,76,74,71,74,76,79,86,83,81,78,74,71]
 if name=='play': melody=[71,74,78,74,69,73,76,73,67,71,74,71,69,73,76,78]
 for i,p in enumerate(melody*2 if name=='title' else melody): run(*b,'add-note','--track','lead','--pitch',p,'--t',i*(.5 if name=='title' else 1),'--dur',.4 if name=='title' else .7,'--velocity',58 if name=='play' else 78)
 for i in range(16): run(*b,'add-note','--track','low','--pitch',[52,55,59,55,48,52,55,59][i%8],'--t',i,'--dur',.9,'--velocity',45)
 run(*b,'render')
# Authored live particle systems.
for name,count,speed in [('clear',14,65),('flawed',32,115),('cut',24,85),('aura',0,14)]:
 out=ROOT/'fx'/name; out.mkdir(parents=True,exist_ok=True)
 cfg=dict(width=128,height=128,duration_ms=1000,fps=30,seed=42,actions=str(TMP/'fx.json'),preview=str(TMP/'fx.gif'),system=str(out/'system.json'))
 dump(TMP/'p.json',cfg); b=['particle-2d','--config',TMP/'p.json']; run(*b,'init')
 run(*b,'add-emitter','--name','sparks','--shape','disc','--x',0,'--y',0,'--radius',18 if name=='aura' else 2,'--lifetime',650,'--speed',speed,'--cone-angle',180,'--rate' if name=='aura' else '--burst',12 if name=='aura' else count)
 run(*b,'set-particle','--emitter','sparks','--size-from',2 if name=='aura' else 4,'--size-to',0,'--opacity-from',.8,'--opacity-to',0,'--color-gradient','#fff5c3@0,#6ad8d0@1')
 if name=='aura': run(*b,'set-timeline','--loop','true')
 run(*b,'render')
print('Assets produced')
