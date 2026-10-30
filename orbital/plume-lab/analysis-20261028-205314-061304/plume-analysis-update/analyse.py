from pathlib import Path
import zipfile, re, json, math
import xml.etree.ElementTree as ET
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
from matplotlib.colors import LogNorm
from scipy.spatial import ConvexHull

OUT=Path(__file__).resolve().parent
z=zipfile.ZipFile(OUT.parent/'cfd-results-review/orbital-nozzle-cfd-results.zip')
cases={}
for name in ['sea-level','thin-air']:
    pre=f'orbital-nozzle-cfd/cases/{name}/'
    vtk=next(n for n in z.namelist() if n.startswith(pre+'VTK') and n.endswith('/internal.vtu'))
    root=ET.fromstring(z.read(vtk))
    pts=np.fromstring(root.find('.//Points/DataArray').text,sep=' ').reshape(-1,3)
    arr={a.get('Name'):np.fromstring(a.text,sep=' ',dtype=int) for a in root.findall('.//Cells/DataArray')}
    polygons=[]; centers=[]
    for ids in np.split(arr['connectivity'],arr['offsets'][:-1]):
        p=pts[ids]; xy=np.unique(np.round(np.column_stack([p[:,0],np.hypot(p[:,1],p[:,2])]),7),axis=0)
        xy=xy[ConvexHull(xy).vertices];polygons.append(xy);centers.append(xy.mean(axis=0))
    centers=np.array(centers)
    f={a.get('Name'):np.fromstring(a.text,sep=' ') for a in root.findall('.//CellData/DataArray')}
    f['speed']=np.linalg.norm(f['U'].reshape(-1,3),axis=1)
    f['Mach']=f['speed']/np.sqrt(1.22*355*f['T'])
    monitor={}
    for key in ['mass_inlet','mass_outlet','mass_farfield','domainMass']:
        n=next(n for n in z.namelist() if n.startswith(pre+'postProcessing/'+key+'/') and n.endswith('.dat'))
        monitor[key]=np.array([[float(v) for v in line.split()] for line in z.read(n).decode().splitlines() if line.strip() and not line.startswith('#')])
    snapshots={}
    for t in ['0.005','0.01','0.015','0.02']:
        snapshots[t]={}
        for key in ['p','T','U','rho']:
            txt=z.read(pre+t+'/'+key).decode()
            match=re.search(r'internalField\s+nonuniform\s+List<\w+>\s+(\d+)\s*\((.*?)\)\s*;',txt,re.S)
            if not match:raise ValueError(key)
            v=np.fromstring(match.group(2).replace('(',' ').replace(')',' '),sep=' ')
            if key=='U':v=v.reshape(-1,3)
            snapshots[t][key]=v
    cases[name]=dict(polygons=polygons,centers=centers,fields=f,monitor=monitor,snapshots=snapshots)

fig,axs=plt.subplots(3,2,figsize=(13,9),layout='constrained')
for col,(name,c) in enumerate(cases.items()):
    for row,(key,label,norm,cmap) in enumerate([
        ('T','Temperature (K)',plt.Normalize(200,3200),'inferno'),
        ('speed','Speed (m/s)',plt.Normalize(0,3600),'viridis'),
        ('p','Static pressure (Pa)',LogNorm(300,1.4e6),'magma')]):
        ax=axs[row,col]
        pc=PolyCollection(c['polygons'],array=c['fields'][key],cmap=cmap,norm=norm,rasterized=True,edgecolors='none')
        ax.add_collection(pc);ax.set(xlim=(-.7,10),ylim=(0,3),xlabel='Downstream from nozzle exit (m)',ylabel='Radius (m)')
        if row==0:ax.set_title(name.replace('-',' ').title()+' — t = 0.020 s')
        ax.plot([-.7,-.52,-.26,0],[.22,.32,.47,.58],color='cyan',lw=1)
        fig.colorbar(pc,ax=ax,label=label)
fig.suptitle('Computed gas flow — not a rendered flame',fontsize=17)
fig.savefig(OUT/'flow-cross-sections.png',dpi=170);plt.close(fig)

fig,axs=plt.subplots(2,2,figsize=(12,7),layout='constrained')
summary={}
for col,(name,c) in enumerate(cases.items()):
    m=c['monitor'];t=m['domainMass'][:,0];mass=m['domainMass'][:,1]
    net=sum(m[k][:,1] for k in ['mass_inlet','mass_outlet','mass_farfield'])
    dt=np.diff(t);rate=np.diff(mass)/dt;res=rate+(net[1:]+net[:-1])/2
    axs[0,col].plot(t*1000,net,label='Net outward boundary flow')
    axs[0,col].plot((t[1:]+t[:-1])*500,-rate,'--',label='Decrease of stored mass')
    axs[0,col].set(title=name.replace('-',' ').title(),xlabel='Simulated time (ms)',ylabel='Wedge mass flow (kg/s)');axs[0,col].legend(fontsize=8)
    axs[1,col].plot(t*1000,mass)
    axs[1,col].set(xlabel='Simulated time (ms)',ylabel='Gas mass in simulated wedge (kg)')
    x=c['centers'][:,0];r=c['centers'][:,1];regions={'nozzle':x<0,'near_plume':(x>=0)&(x<4)&(r<1.5),'domain':np.ones(len(x),dtype=bool)}
    changes={}
    for region,mask in regions.items():
        changes[region]={}
        for key in ['p','T','U']:
            a=c['snapshots']['0.015'][key][mask];b=c['snapshots']['0.02'][key][mask]
            changes[region][key+'_relative_L2']=float(np.linalg.norm(b-a)/np.linalg.norm(b))
    summary[name]={'mesh_cells':len(x),'final_simulated_time_s':.02,'mass_initial_recorded_kg':float(mass[0]),'mass_last_recorded_kg':float(mass[-1]),'last_monitor_time_s':float(t[-1]),'last_net_outward_massflow_kgps':float(net[-1]),'last_inlet_massflow_kgps':float(m['mass_inlet'][-1,1]),'late_mean_normalized_mass_balance_residual':float(np.mean(abs(res[t[1:]>.015]))/abs(m['mass_inlet'][-1,1])),'snapshot_changes_15_to_20_ms':changes,'speed_max_mps':float(c['fields']['speed'].max()),'T_min_K':float(c['fields']['T'].min()),'T_max_K':float(c['fields']['T'].max()),'ideal_gas_R_max_relative_error':float(np.max(abs(c['fields']['p']/(c['fields']['rho']*c['fields']['T'])/355-1)))}
fig.suptitle('Mass accounting agrees, but the flow is still changing',fontsize=16)
fig.savefig(OUT/'flow-history.png',dpi=160);plt.close(fig)
(OUT/'analysis.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary,indent=2))
