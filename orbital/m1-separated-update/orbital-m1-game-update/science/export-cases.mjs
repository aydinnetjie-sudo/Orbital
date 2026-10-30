import fs from 'node:fs';
const layout=JSON.parse(fs.readFileSync(new URL('./layout.json',import.meta.url)));const ROCKET_ENGINES=layout.layout,ENGINE_EXIT_Z=layout.exitZ;
import {calculateClusterTransport} from '../src/m1/ClusterTransportModel.js';
import {METHALOX_DATA} from '../src/m1/MethaloxModel.js';
const radius=.58*ROCKET_ENGINES[0].scale,cases=[];
for(const throttle of [.5,.75,1])for(const pressure of [101325,90073.6159,30000,10000,0]){
 const m=calculateClusterTransport(throttle,pressure,{exitRadius:radius});const mdotEach=m.flow.mdot*(radius/METHALOX_DATA.geometry.exitRadius)**2;
 cases.push({throttle,pressure,...m,mdotEach,totalMdot:33*mdotEach,sensitivity:[.1,.2,.25].map(damping=>({damping,...calculateClusterTransport(throttle,pressure,{exitRadius:radius,damping})}))});
}
fs.writeFileSync(new URL('./cases.json',import.meta.url),JSON.stringify({layout:ROCKET_ENGINES,exitZ:ENGINE_EXIT_Z,exitRadius:radius,cases},null,2));
