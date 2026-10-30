from pathlib import Path
import numpy as np,json,base64
from scipy.stats import ncx2
B=Path(__file__).resolve().parent;U=B.parent/'src/m1';ns,nq=512,129;s=np.linspace(0,3.5,ns);qs=np.linspace(0,.5,nq);rows=[]
def integral(v):
 slope=np.diff(v)/np.diff(s)
 return 2*np.pi*np.sum(v[:-1]*(s[1:]**2-s[:-1]**2)/2+slope*((s[1:]**3-s[:-1]**3)/3-s[:-1]*(s[1:]**2-s[:-1]**2)/2))
for q in qs:
 a=np.sqrt(max(0,1-4*q*q))
 h=(s<1).astype(float)/np.pi if q==0 else 2/np.pi*np.exp(-2*s*s) if a<1e-8 else ncx2.cdf((a/q)**2,2,(s/q)**2)/(np.pi*a*a)
 rows.append(h/integral(h))
h=np.array(rows,dtype='<f4');data=np.zeros((nq,ns,4),dtype='<f4');data[:,:,0]=h
meta={'radialCount':ns,'diffusionCount':nq,'maxRadius':3.5,'maxDiffusionRatio':.5,'model':'Uniform disk convolved with a 2D Gaussian; conserved scalar flux, not interacting gas dynamics','layout':'RGBA float32 LE, radius along width, diffusion ratio along height'}
(U/'JetTransportKernel.js').write_text('// Conserved scalar-flux kernel.\nexport const JET_KERNEL_META='+json.dumps(meta)+';\nconst DATA='+json.dumps(base64.b64encode(data.tobytes()).decode())+';\nexport function createJetKernel(){const s=atob(DATA),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return {meta:JET_KERNEL_META,pixels:new Float32Array(b.buffer)};}\n')
(B/'kernel.f32').write_bytes(data.tobytes());(B/'kernel-meta.json').write_text(json.dumps(meta,indent=2))
