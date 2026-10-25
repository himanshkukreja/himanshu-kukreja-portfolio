import sys,json,subprocess,os
from PIL import Image, ImageChops, ImageStat
d=sys.argv[1]; q=os.path.basename(d.rstrip('/'))
items=json.load(open(f'{d}/items.json'))
ids=[os.path.basename(x['out']).replace('.raw.wav','') for x in items]
dur=lambda f: float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f]).decode())
D=[dur(f'{d}/audio/{i}.wav') for i in ids]
bad=0; t=0
for n,i in enumerate(ids):
    for off in (0.3, D[n]-0.3):
        subprocess.run(['ffmpeg','-y','-loglevel','error','-ss',f'{t+off:.3f}','-i',f'{d}/{q}.mp4','-frames:v','1','/tmp/_f.png'])
        a=Image.open('/tmp/_f.png').convert('L').resize((480,270)); b=Image.open(f'{d}/frames/{n:03d}.png').convert('L').resize((480,270))
        diff=ImageStat.Stat(ImageChops.difference(a,b)).mean[0]
        if diff>3: bad+=1; print('MISMATCH step',n,i,f'{t+off:.1f}s diff {diff:.1f}')
    t+=D[n]
print(q, len(ids),'steps checked at start and end;', bad,'mismatches')
