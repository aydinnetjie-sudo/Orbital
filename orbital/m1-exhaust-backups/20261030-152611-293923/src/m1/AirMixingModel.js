import {calculateMethalox,METHALOX_DATA} from './MethaloxModel.js';
export const AIR_THERMO={"CH4":{"mw":16.043,"coeffs":[1000.0,1.63552643,0.0100842795,-3.36916254e-06,5.34958667e-10,-3.15518833e-14,-10005.6455,9.99313326,5.14987613,-0.0136709788,4.91800599e-05,-4.84743026e-08,1.66693956e-11,-10246.6476,-4.64130376]},"CO":{"mw":28.009999999999998,"coeffs":[1000.0,3.04848583,0.00135172818,-4.85794075e-07,7.88536486e-11,-4.69807489e-15,-14266.1171,6.0170979,3.57953347,-0.00061035368,1.01681433e-06,9.07005884e-10,-9.04424499e-13,-14344.086,3.50840928]},"CO2":{"mw":44.009,"coeffs":[1000.0,4.63659493,0.00274131991,-9.95828531e-07,1.60373011e-10,-9.16103468e-15,-49024.9341,-1.93534855,2.35677352,0.00898459677,-7.12356269e-06,2.45919022e-09,-1.43699548e-13,-48371.9697,9.90105222]},"H":{"mw":1.008,"coeffs":[1000.0,2.50000286,-5.65334214e-09,3.63251723e-12,-9.1994972e-16,7.95260746e-20,25473.6589,-0.446698494,2.5,0.0,0.0,0.0,0.0,25473.6599,-0.446682853]},"HO2":{"mw":33.006,"coeffs":[1000.0,4.17228728,0.00188117647,-3.46277408e-07,1.94657853e-11,1.76254294e-16,61.8102964,2.95767746,4.30179801,-0.00474912051,2.11582891e-05,-2.42763894e-08,9.29225124e-12,294.80804,3.71666245]},"H2":{"mw":2.016,"coeffs":[1000.0,2.93286579,0.000826607967,-1.46402335e-07,1.54100359e-11,-6.88804432e-16,-813.065597,-1.02432887,2.34433112,0.00798052075,-1.9478151e-05,2.01572094e-08,-7.37611761e-12,-917.935173,0.683010238]},"H2O":{"mw":18.015,"coeffs":[1000.0,2.67703787,0.00297318329,-7.7376969e-07,9.44336689e-11,-4.26900959e-15,-29885.8938,6.88255571,4.19864056,-0.0020364341,6.52040211e-06,-5.48797062e-09,1.77197817e-12,-30293.7267,-0.849032208]},"H2O2":{"mw":34.014,"coeffs":[1000.0,4.57333537,0.0040498407,-1.29479479e-06,1.9728171e-10,-1.13402846e-14,-18054.8121,0.704278488,4.27611269,-0.000542822417,1.67335701e-05,-2.15770813e-08,8.62454363e-12,-17754.2989,3.43505074]},"N2":{"mw":28.014,"coeffs":[1000.0,2.95257626,0.00139690057,-4.92631691e-07,7.86010367e-11,-4.60755321e-15,-923.948645,5.87189252,3.53100528,-0.000123660987,-5.02999437e-07,2.43530612e-09,-1.40881235e-12,-1046.97628,2.96747468]},"O":{"mw":15.999,"coeffs":[1000.0,2.54363697,-2.73162486e-05,-4.1902952e-09,4.95481845e-12,-4.79553694e-16,29226.012,4.92229457,3.1682671,-0.00327931884,6.64306396e-06,-6.12806624e-09,2.11265971e-12,29122.2592,2.05193346]},"OH":{"mw":17.007,"coeffs":[1000.0,2.83864607,0.00110725586,-2.93914978e-07,4.20524247e-11,-2.42169092e-15,3943.95852,5.84452662,3.99201543,-0.00240131752,4.61793841e-06,-3.88113333e-09,1.3641147e-12,3615.08056,-0.103925458]},"O2":{"mw":31.998,"coeffs":[1000.0,3.66096083,0.000656365523,-1.41149485e-07,2.05797658e-11,-1.29913248e-15,-1215.97725,3.41536184,3.78245636,-0.00299673415,9.847302e-06,-9.68129508e-09,3.24372836e-12,-1063.94356,3.65767573]}};
// Published coefficients at visible wavelengths; omitted species use air as an
// explicit proxy and their total mass fraction is reported in every result.
export const GLADSTONE_DALE={N2:2.38e-4,O2:1.90e-4,H2O:2.49e-4,CO2:2.27e-4,H2:15.4e-4,CO:2.67e-4};
const RA=8314.46261815324;
const AIR_Y={N2:.7670824885,O2:.2329175115};
const K_AIR=AIR_Y.N2*GLADSTONE_DALE.N2+AIR_Y.O2*GLADSTONE_DALE.O2;
function mixture(y){
 const list=[];let R=0,K=0,proxy=0;
 for(const [name,Y] of Object.entries(y)){
  if(Y<1e-15)continue;
  const d=AIR_THERMO[name];if(!d)throw new Error('Missing thermochemistry for '+name);
  const r=RA/d.mw;list.push({name,Y,r,c:d.coeffs});R+=Y*r;
  K+=Y*(GLADSTONE_DALE[name]??K_AIR);if(!(name in GLADSTONE_DALE))proxy+=Y;
 }
 return {list,R,K,proxy};
}
function hcp(T,m){
 let h=0,cp=0;
 for(const v of m.list){const a=v.c.slice(T>v.c[0]?1:8);const t2=T*T,t3=t2*T,t4=t3*T;
  cp+=v.Y*v.r*(a[0]+a[1]*T+a[2]*t2+a[3]*t3+a[4]*t4);
  h+=v.Y*v.r*(a[0]*T+a[1]*t2/2+a[2]*t3/3+a[3]*t4/4+a[4]*t4*T/5+a[5]);
 }return {h,cp};
}
function temperatureFromEnthalpy(target,m,guess){
 let T=Math.max(200,Math.min(6000,guess));
 for(let j=0;j<20;j++){const {h,cp}=hcp(T,m);const delta=(h-target)/cp;T=Math.max(200,Math.min(6000,T-delta));if(Math.abs(delta)<1e-7)break;}
 return T;
}
function sourceComposition(fraction){
 const rows=METHALOX_DATA.rows,v=(Math.max(.02,Math.min(1,fraction))-.02)/.02,i=Math.min(48,Math.floor(v)),t=Math.min(1,v-i);
 const a=rows[i].speciesMoleFractions,b=rows[i+1].speciesMoleFractions,x={};let mass=0;
 for(const n of new Set([...Object.keys(a),...Object.keys(b)])){x[n]=(1-t)*(a[n]||0)+t*(b[n]||0);mass+=x[n]*AIR_THERMO[n].mw;}
 return Object.fromEntries(Object.entries(x).map(([n,X])=>[n,X*AIR_THERMO[n].mw/mass]));
}

export function calculateAirProfile(fraction,pressure,{ambientTemperature=288.15,entrainmentCoefficient=.01,length=19.5,stations=65}={}){
 if(![fraction,pressure,ambientTemperature,entrainmentCoefficient,length].every(Number.isFinite))throw new TypeError('Air model inputs must be finite');
 if(ambientTemperature<200||ambientTemperature>350||entrainmentCoefficient<0||entrainmentCoefficient>.15||length<=0||!Number.isInteger(stations)||stations<3)throw new RangeError('Air model input outside declared range');
 const flow=calculateMethalox(fraction,pressure);
 if(!flow.valid||flow.separatedRisk||flow.rarefied||pressure<=0)return {available:false,status:pressure<=0?'Vacuum: no surrounding air':flow.separatedRisk?'Separation risk: downstream model unavailable':flow.rarefied?'Outside isentrope/continuum range':flow.regime||'Outside steady model',flow,stations:[]};
 const exhaustY=sourceComposition(fraction),exhaust=mixture(exhaustY),air=mixture(AIR_Y);
 const T0=flow.fullyExpandedTemperature,U0=flow.fullyExpandedSpeed,m0=flow.mdot;
 const J=m0*U0,H0=m0*(hcp(T0,exhaust).h+U0*U0/2),ha=hcp(ambientTemperature,air).h;
 const rhoAir=pressure/(air.R*ambientTemperature),nAir=1+K_AIR*rhoAir;
 function section(m,guess){
  const mAir=Math.max(0,m-m0),jetFraction=m0/m,y={};
  for(const [n,Y] of Object.entries(exhaustY))y[n]=Y*jetFraction;
  for(const [n,Y] of Object.entries(AIR_Y))y[n]=(y[n]||0)+Y*(1-jetFraction);
  const mix=mixture(y),U=J/m,target=(H0+mAir*ha)/m-U*U/2;
  const T=temperatureFromEnthalpy(target,mix,guess),rho=pressure/(mix.R*T),radius=Math.sqrt(m/(Math.PI*rho*U));
  return {m,mAir,U,T,rho,radius,jetFraction,K:mix.K,deltaN:mix.K*rho-K_AIR*rhoAir,proxyMassFraction:mix.proxy,
   momentumResidual:Math.abs(m*U/J-1),energyResidual:Math.abs((m*(hcp(T,mix).h+U*U/2)-H0-mAir*ha)/Math.max(Math.abs(H0),1)),massResidual:Math.abs(Math.PI*radius*radius*rho*U/m-1)};
 }
 function derivative(s){return 2*Math.PI*entrainmentCoefficient*s.radius*rhoAir*s.U;}
 let m=m0,current=section(m,T0);const dz=length/(stations-1),result=[];
 for(let i=0;i<stations;i++){
  result.push({z:i*dz,...current});
  if(i===stations-1)break;
  const middle=section(m+derivative(current)*dz/2,current.T);
  m+=derivative(middle)*dz;current=section(m,middle.T);
 }
 return {available:true,status:flow.linearShockApplicable?'Ideal fully-expanded reference + steady entrainment closure':'Strong pressure mismatch: ideal reference only; shock losses unresolved',flow,ambientTemperature,entrainmentCoefficient,rhoAir,nAir,length,stations:result,
  limits:['No afterburning or reactive mixing','No resolved turbulence or shocks','Gaussian optical radial reconstruction of top-hat bulk states','Entrainment coefficient is a selected closure, not measured M1 data','Unlisted-species refractivity uses an air proxy']};
}

export function refractivityAt(profile,r,z){
 if(!profile.available||z<0||z>profile.length)return 0;
 const a=profile.stations,x=z/profile.length*(a.length-1),i=Math.min(a.length-2,Math.floor(x)),t=x-i;
 const b=a[i].radius+(a[i+1].radius-a[i].radius)*t,A=a[i].deltaN+(a[i+1].deltaN-a[i].deltaN)*t;
 return A*Math.exp(-r*r/(b*b));
}
