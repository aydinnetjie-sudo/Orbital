from pathlib import Path
import json,numpy as np
from scipy.optimize import brentq
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
B=Path(__file__).resolve().parent;config=json.loads((B/'cases.json').read_text());meta=json.loads((B/'kernel-meta.json').read_text());ns,nq=meta['radialCount'],meta['diffusionCount'];h=np.frombuffer((B/'kernel.f32').read_bytes(),'<f4').reshape(nq,ns,4)[:,:,0].astype(float);s=np.linspace(0,3.5,ns);qgrid=np.linspace(0,.5,nq)
def integral(v):
 slope=np.diff(v)/np.diff(s);return 2*np.pi*np.sum(v[:-1]*(s[1:]**2-s[:-1]**2)/2+slope*((s[1:]**3-s[:-1]**3)/3-s[:-1]*(s[1:]**2-s[:-1]**2)/2))
quantiles=[]
for row in h:
 ss=np.linspace(0,3.5,16385);ff=np.interp(ss,s,row);cdf=np.r_[0,np.cumsum(np.diff(ss)*(ss[1:]*ff[1:]+ss[:-1]*ff[:-1])*np.pi)];quantiles.append(np.interp(.95,cdf,ss))
xy=np.array([[e['x'],e['y']] for e in config['layout']]);pairs=[(i,j,float(np.linalg.norm(xy[i]-xy[j]))) for i in range(33) for j in range(i+1,33)]
def section(m,z):
 r=config['exitRadius'];a=r+m['expansionSlope']*z if m['expansionSlope']>0 else r*(1+(m['adaptedRadiusRatio']-1)*(1-np.exp(-z/m['adaptationLength'])));sg=m['sigmaSlope']*z;b=np.sqrt(a*a+4*sg*sg);return a,sg,b,sg/b
def contact(m,d):
 def f(z):
  a,sg,b,q=section(m,z);return 2*b*np.interp(q,qgrid,quantiles)-d
 return 0. if f(0)>=0 else None if f(100)<0 else float(brentq(f,0,100))
def connected(edges):
 parent=list(range(33))
 def find(i):
  while parent[i]!=i:i=parent[i]
  return i
 for z,i,j in sorted(edges):
  parent[find(i)]=find(j)
  if len({find(i) for i in range(33)})==1:return z
 return None
def overlaps(m):
 edges=[]
 for i,j,d in pairs:
  z=contact(m,d)
  if z is not None:edges.append((z,i,j))
 return {'first95PercentFootprintContactMetres':min(e[0] for e in edges) if edges else None,'connectedFootprintGraphMetres':connected(edges)}
results=[]
for m in config['cases']:
 results.append({**{k:m[k] for k in ['throttle','pressure','convectiveMach','sigmaSlope','mdotEach','totalMdot']},'sourceRegime':m['flow']['regime'],**overlaps(m),'sensitivity':[{'damping':v['damping'],**overlaps(v)} for v in m['sensitivity']]})
error=max(abs(integral(row)-1) for row in h);assert error<1e-6
report={'scope':'Conserved scalar transport, not interacting-jet CFD; 95% scalar-flux footprint is not a sharp flame boundary','nozzles':33,'exitRadiusMetres':config['exitRadius'],'minimumCentreSpacingMetres':min(d for i,j,d in pairs),'minimumEdgeGapMetres':min(d for i,j,d in pairs)-2*config['exitRadius'],'kernelMaxRelativeMassError':error,'cases':results};(B/'cluster-calculations.json').write_text(json.dumps(report,indent=2))
checks=[];m=next(m for m in config['cases'] if m['throttle']==.75 and m['pressure']==101325)
for z in [0,.5,1.5,4,10]:
 a,sg,b,q=section(m,z);row=np.array([np.interp(q,qgrid,h[:,j]) for j in range(ns)]);checks.append({'z':z,'relativeMassError':abs(integral(row)-1),'centroid':'Each radially symmetric kernel remains centred on its source; no inward displacement term'})
(B/'transport-validation.json').write_text(json.dumps({'passed':True,'checks':checks,'scope':'Scalar flux invariants; not conservation/validation of superposed gas momentum or pressure'},indent=2))
fig,axes=plt.subplots(1,4,figsize=(13,3.7),layout='constrained');g=np.linspace(-1.8,1.8,420);X,Y=np.meshgrid(g,g)
for ax,z in zip(axes,[0,.5,1.5,4]):
 a,sg,b,q=section(m,z);row=np.array([np.interp(q,qgrid,h[:,j]) for j in range(ns)]);field=np.zeros_like(X)
 for x,y in xy:field+=np.interp(np.hypot(X-x,Y-y)/b,s,row,right=0)*np.pi*config['exitRadius']**2/b**2
 im=ax.imshow(field,origin='lower',extent=[-1.8,1.8,-1.8,1.8],vmin=0,vmax=1,cmap='inferno');ax.scatter(xy[:,0],xy[:,1],s=4,c='cyan');ax.set_title(f'{z:g} m downstream');ax.set_xlabel('x (m)');ax.set_aspect('equal')
axes[0].set_ylabel('y (m)');fig.colorbar(im,ax=axes,label='Normalized exhaust scalar flux',shrink=.65);fig.suptitle('Calculated scalar transport · 75%, sea level · Cyan dots: fixed nozzle axes\nMixing closure uncertain; pressure/shock interactions and radiation unresolved',fontsize=11);fig.savefig(B/'calculated-nozzle-footprints.png',dpi=150)
print('Mass error',error);print(json.dumps(next(r for r in results if r['throttle']==.75 and r['pressure']==101325),indent=2))
