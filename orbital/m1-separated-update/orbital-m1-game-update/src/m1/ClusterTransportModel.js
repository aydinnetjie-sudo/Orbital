import {calculateMethalox} from './MethaloxModel.js';
// Source is the candidate M1 operating point, not a measured cluster firing.
// 0.0825(1+sqrt(rho_a/rho_j)) is a density-scaled incompressible growth
// reference. High-Mc damping is an explicit uncertain extrapolation here.
export function calculateClusterTransport(command,pressure,{exitRadius=.58/Math.sqrt(33),ambientTemperature=288.15,damping=.2}={}){
 if(![command,pressure,exitRadius,ambientTemperature,damping].every(Number.isFinite)||exitRadius<=0||ambientTemperature<=0||damping<=0)throw new RangeError('Invalid transport input');
 const flow=calculateMethalox(command,pressure);
 if(!flow.valid)return {available:false,exitRadius,flow,sigmaSlope:0,adaptedRadiusRatio:1,adaptationLength:exitRadius,expansionSlope:0,status:'Off / nozzle source unavailable'};
 const rhoAir=pressure/(287.05*ambientTemperature),aAir=Math.sqrt(1.4*287.05*ambientTemperature),aJet=flow.ue/flow.me;
 const mc=flow.ue/(aJet+aAir),incompressibleGrowth=.0825*(1+Math.sqrt(rhoAir/flow.rhoe));
 const dampingUsed=mc<=.6?1-mc*mc:damping;
 return {available:true,flow,exitRadius,convectiveMach:mc,incompressibleGrowth,dampingUsed,
 sigmaSlope:pressure>=1?incompressibleGrowth*dampingUsed/Math.sqrt(2*Math.PI):0,
 adaptedRadiusRatio:flow.fullyExpandedRadiusRatio||1,adaptationLength:exitRadius*Math.sqrt(Math.max(1,flow.me*flow.me-1)),expansionSlope:flow.spreadSlope||0,
 extrapolated:mc>.6,interactionSolved:false,status:pressure<1?'Ballistic expansion reference; vacuum approximation':flow.separatedRisk?'Separation risk: transport source uncertain':'Separate-axis scalar transport; jet interactions unresolved'};
}
export function transportSection(model,z){
 if(!Number.isFinite(z)||z<0)throw new RangeError('Downstream distance must be nonnegative');
 const r=model.exitRadius,a=model.expansionSlope>0?r+model.expansionSlope*z:r*(1+(model.adaptedRadiusRatio-1)*(1-Math.exp(-z/model.adaptationLength)));
 const sigma=model.sigmaSlope*z,b=Math.sqrt(a*a+4*sigma*sigma);return {diskRadius:a,sigma,b,q:sigma/b};
}
