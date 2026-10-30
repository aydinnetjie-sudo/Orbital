import {
  Cartesian3, Cartesian4, Matrix3, Matrix4, Ellipsoid,
  Texture, Sampler, PixelFormat, PixelDatatype,
  TextureMinificationFilter, TextureMagnificationFilter,
  PostProcessStage, PostProcessStageSampleMode
} from 'cesium';
import {calculateMethalox,METHALOX_DATA} from './MethaloxModel.js';
import {calculateAirProfile} from './AirMixingModel.js';
import {createCFDAirField} from './CFDAirField.js';
import {createJetKernel} from './JetTransportKernel.js';
import {calculateClusterTransport,transportSection} from './ClusterTransportModel.js';
import {m1FragmentShader} from './CesiumM1Shaders.js';

const qualitySteps={low:40,balanced:64,high:96};
let instanceId=0;
// Matches the game's existing Earth drag model. No lunar atmosphere is invented.
export function gameAmbientPressure(flight){
  if(flight.universe?.nearestSurface){
    const near=flight.universe.nearestSurface();
    if(near.body!==flight.universe.earth)return 0;
  }
  const height=Ellipsoid.WGS84.cartesianToCartographic(flight.position)?.height;
  return Number.isFinite(height)&&height<160000?101325*Math.exp(-Math.max(0,height)/8500):0;
}

export class CesiumM1Exhaust {
  constructor(viewer,flight,{engines,exitZ,rings,innerBellRadius=.58}={}){
    if(!engines?.length||!Number.isFinite(exitZ))throw new TypeError('Actual engine layout and exitZ are required');
    this.viewer=viewer;this.flight=flight;this.exitZ=exitZ;this.engines=engines;
    this.exitRadius=Math.sqrt(engines.reduce((a,e)=>a+(innerBellRadius*e.scale)**2,0));
    this.sourceScale=this.exitRadius/METHALOX_DATA.geometry.exitRadius;
    this.cfdGeometryMatches=engines.length===1&&Math.abs(this.exitRadius-.65)<1e-4;
    this.airMode='off';this.quality='low';this.brightness=1;this.shutterSeconds=1/240;
    this.enabled=true;this.travel=0;this.elapsed=0;this.airProfile=null;this._airKey='';this._airTimer=1;this._id=++instanceId;
    this.cameraLocal=new Cartesian3();this.eyeToJet=new Matrix3();this._worldToRocket=new Matrix4();this._rotation=new Matrix3();
    this._pixelData=new Float32Array(65*4);
    this._profileTexture=this._texture(this._pixelData,65,1);
    const cfd=createCFDAirField();this.cfdMeta=cfd.meta;this._cfdTexture=this._texture(cfd.pixels,cfd.meta.nr+2,cfd.meta.nx+2);
    const ringData=(rings||[{count:1,radius:0,phase:0}]).map(r=>new Cartesian4(r.radius,r.count,-r.phase,innerBellRadius*engines[0].scale));
    while(ringData.length<3)ringData.push(ringData.at(-1));
    this.values={uTime:0,uThrottle:0,uAtmosphere:1,uLength:26,uExtent:2,uBrightness:1,
      uJetRadius:1,uExpand:0,uCell:8,uShock:0,uFlowSpeed:0,uFlowLevel:0,uSeparated:0,uTravel:0,uShutterTravel:0,
      uExitRadius:this.exitRadius,uPlumeVisible:0,uAirEnabled:0,uAirKind:0,uNAir:1,uAirWidth:1,uAirLength:19.5*this.sourceScale,uAirScale:this.sourceScale};
    this._uniforms={};for(const name of Object.keys(this.values))this._uniforms[name]=()=>this.values[name];
    Object.assign(this._uniforms,{uCameraLocal:()=>this.cameraLocal,uEyeToJet:()=>this.eyeToJet,
      uRingA:()=>ringData[0],uRingB:()=>ringData[1],uRingC:()=>ringData[2],
      uCFDGrid:()=>({x:cfd.meta.nr,y:cfd.meta.nx}),uCFDCell:()=>({x:cfd.meta.radius/cfd.meta.nr,y:cfd.meta.length/cfd.meta.nx}),
      uProfile:()=>this._profileTexture,uCFD:()=>this._cfdTexture});
    const kernel=createJetKernel();this._jetTexture=this._texture(kernel.pixels,kernel.meta.radialCount,kernel.meta.diffusionCount);
    if(engines.length>33)throw new RangeError('At most 33 nozzle sources are supported');
    this._engines=engines.map(e=>new Cartesian4(e.x,-e.y,innerBellRadius*e.scale,1));
    while(this._engines.length<33)this._engines.push(new Cartesian4(0,0,1,0));
    this._transport=new Cartesian4(0,1,1,0);this.damping=.2;
    Object.assign(this._uniforms,{uJetKernel:()=>this._jetTexture,uEngines:()=>this._engines,uTransport:()=>this._transport,uKernelSize:()=>({x:kernel.meta.radialCount,y:kernel.meta.diffusionCount})});
    this._makeStage();
  }
  _texture(data,width,height){return new Texture({context:this.viewer.scene.context,width,height,pixelFormat:PixelFormat.RGBA,pixelDatatype:PixelDatatype.FLOAT,
    sampler:new Sampler({minificationFilter:TextureMinificationFilter.NEAREST,magnificationFilter:TextureMagnificationFilter.NEAREST}),source:{width,height,arrayBufferView:data}});}
  _makeStage(){
    const enabled=this.stage?.enabled||false;if(this.stage)this.viewer.scene.postProcessStages.remove(this.stage);
    this.stage=this.viewer.scene.postProcessStages.add(new PostProcessStage({name:'M1_exhaust_'+this._id+'_'+this.quality,
      fragmentShader:m1FragmentShader(qualitySteps[this.quality],this.airMode==='cfd'?256:64),uniforms:this._uniforms,sampleMode:PostProcessStageSampleMode.LINEAR}));
    this.stage.enabled=enabled;
  }
  setQuality(value){if(!(value in qualitySteps))throw new RangeError('Unknown exhaust quality');if(this.quality!==value){this.quality=value;this._makeStage();}}
  setAirMode(value){if(!['off','reduced','cfd'].includes(value))throw new RangeError('Unknown air model');if(this.airMode!==value){this.airMode=value;this._airKey='';this._makeStage();}}
  update(deltaSeconds,root,level,visible=true){
    if(!Number.isFinite(deltaSeconds)||deltaSeconds<0)throw new RangeError('Invalid frame delta');
    const pressure=gameAmbientPressure(this.flight),flow=calculateMethalox(level,pressure);this.flow=flow;this.pressure=pressure;
    const v=this.values;v.uThrottle=level;v.uAtmosphere=pressure/101325;v.uBrightness=this.brightness;
    v.uPlumeVisible=visible&&this.enabled&&level>=.02&&flow.valid?1:0;
    const sourceRadius=METHALOX_DATA.geometry.exitRadius;
    v.uJetRadius=flow.fullyExpandedRadiusRatio||1;v.uExpand=flow.spreadSlope||0;v.uCell=flow.cellLengthMetres>0?flow.cellLengthMetres/sourceRadius:8;
    v.uShock=flow.shockStrength||0;v.uFlowSpeed=flow.ue ? .6*flow.ue/this.exitRadius : 0;
    this.travel=(this.travel+deltaSeconds*v.uFlowSpeed)%512;this.elapsed=(this.elapsed+deltaSeconds)%10000;
    v.uTravel=this.travel;v.uTime=this.elapsed;v.uShutterTravel=v.uFlowSpeed*Math.max(0,Math.min(1/30,this.shutterSeconds));
    v.uFlowLevel=flow.valid?flow.rhoe/METHALOX_DATA.rows.at(-1).rhoe:0;v.uSeparated=flow.separatedRisk?1:0;
    this.transport=calculateClusterTransport(level,pressure,{exitRadius:this._engines[0].z,damping:this.damping});
    this._transport.x=this.transport.sigmaSlope;this._transport.y=this.transport.adaptedRadiusRatio;this._transport.z=this.transport.adaptationLength/this._engines[0].z;this._transport.w=this.transport.expansionSlope;
    const endSection=transportSection(this.transport,26*this.exitRadius),outer=Math.max(...this.engines.map(e=>Math.hypot(e.x,e.y)));
    v.uExtent=(outer+3.5*endSection.b)/this.exitRadius;
    // Compute translations in JavaScript float64; shader only sees local metres.
    Matrix4.inverseTransformation(root,this._worldToRocket);
    Matrix4.multiplyByPoint(this._worldToRocket,this.viewer.camera.positionWC,this.cameraLocal);
    this.cameraLocal.y=-this.cameraLocal.y;this.cameraLocal.z=this.exitZ-this.cameraLocal.z;
    const worldToRocketRotation=Matrix4.getMatrix3(this._worldToRocket,this._rotation);
    const eyeToWorld=Matrix4.getMatrix3(this.viewer.camera.inverseViewMatrix,new Matrix3());
    Matrix3.multiply(worldToRocketRotation,eyeToWorld,this.eyeToJet);
    // local +Z points out of the nozzle; +Y is mirrored to keep a proper rotation.
    for(let column=0;column<3;column++){this.eyeToJet[column*3+1]*=-1;this.eyeToJet[column*3+2]*=-1;}
    this._airTimer+=deltaSeconds;
    this._updateAir(level,pressure);
    this.stage.enabled=!!v.uPlumeVisible;
    this.stats={engines:this.engines.length,equivalentExitRadius:this.exitRadius,pressurePa:pressure,command:level,quality:this.quality,
      airMode:this.airMode,airActive:!!v.uAirEnabled,airStatus:this.airStatus,flowRegime:flow.regime,
      source:'Separate axes and conserved scalar transport; gas interactions and emission unresolved',cfdGeometryMatches:this.cfdGeometryMatches,transportStatus:this.transport.status,sigmaSlope:this.transport.sigmaSlope,convectiveMach:this.transport.convectiveMach};
    if(this._status&&this._airTimerUI===undefined)this._airTimerUI=0;
    this._airTimerUI=(this._airTimerUI||0)+deltaSeconds;
    if(this._status&&this._airTimerUI>.25){this._airTimerUI=0;this._status.textContent=(pressure<1?'Vacuum':Math.round(pressure).toLocaleString()+' Pa')+' · '+this.airStatus;}
  }
  _updateAir(level,pressure){
    const v=this.values;v.uAirEnabled=0;
    if(this.airMode==='off'){this.airStatus='Air refraction off';return;}
    if(this.airMode==='cfd'){
      const valid=this.cfdGeometryMatches&&Math.abs(level-.75)<.0005&&Math.abs(pressure-101325)<1;
      this.airStatus=valid?'CFD early-transient mean · preliminary':'CFD bypassed: requires one 0.65 m nozzle at 75%, sea level';
      v.uAirEnabled=valid?1:0;v.uAirKind=1;v.uNAir=this.cfdMeta.nAir;v.uAirWidth=this.cfdMeta.radius;v.uAirLength=this.cfdMeta.length;return;
    }
    v.uAirKind=0;
    const key=[level.toFixed(3),pressure.toFixed(0)].join('/');
    if(this._airTimer>=.1&&key!==this._airKey){
      this._airKey=key;this._airTimer=0;
      this.airProfile=calculateAirProfile(level,pressure,{ambientTemperature:288.15,entrainmentCoefficient:.01});
      if(this.airProfile.available){
        let width=0;this.airProfile.stations.forEach((s,i)=>{this._pixelData.set([s.radius,s.deltaN,s.T,s.rho],i*4);width=Math.max(width,s.radius*3.5);});
        this._profileTexture.copyFrom({source:{width:65,height:1,arrayBufferView:this._pixelData}});
        v.uAirWidth=width*this.sourceScale;v.uAirLength=19.5*this.sourceScale;v.uNAir=this.airProfile.nAir;
      }
    }
    const available=!!this.airProfile?.available&&pressure>=1&&level>=.02&&this.flow?.valid&&!this.flow?.separatedRisk;
    v.uAirEnabled=available?1:0;
    this.airStatus=available?'Air: equivalent-jet approximation':pressure<1?'Vacuum: no surrounding air':!this.flow?.valid?this.flow?.regime:this.flow?.separatedRisk?'Separation risk: air model bypassed':this.airProfile?.status||'Air model unavailable';
  }
  mountControls(parent){
    const section=document.createElement('details');section.className='m1-exhaust-settings';
    section.innerHTML='<summary>Exhaust appearance</summary><p>33 fixed nozzle axes. Transport footprints spread and overlap without moving toward the centre. Interacting gas dynamics and light remain approximate.</p><label>Quality <select data-m1="quality"><option value="low">Low · 40 samples</option><option value="balanced">Balanced · 64</option><option value="high">High · 96</option></select></label><br><label>Air refraction <select data-m1="air"><option value="off">Off · cluster air unresolved</option><option value="reduced">Legacy equivalent-jet approximation</option><option value="cfd" disabled>Single-engine CFD · incompatible with this cluster</option></select></label><br><label>Brightness <input data-m1="brightness" type="range" min="0.3" max="2.5" step="0.1" value="1"></label><p data-m1="status">Engine off</p><p>The 75% sea-level CFD field applies to one full-size M1 nozzle. It is not used as a 33-engine prediction. The air approximation has 1× optical strength.</p>';
    section.querySelector('[data-m1="quality"]').onchange=e=>this.setQuality(e.target.value);
    section.querySelector('[data-m1="air"]').onchange=e=>this.setAirMode(e.target.value);
    section.querySelector('[data-m1="brightness"]').oninput=e=>this.brightness=Number(e.target.value);
    section.addEventListener('keydown',e=>e.stopPropagation());
    this._status=section.querySelector('[data-m1="status"]');parent.appendChild(section);this._controls=section;
  }
  destroy(){
    if(this.destroyed)return;this.destroyed=true;
    if(this.stage&&!this.stage.isDestroyed())this.viewer.scene.postProcessStages.remove(this.stage);
    for(const t of [this._profileTexture,this._cfdTexture,this._jetTexture])if(!t.isDestroyed())t.destroy();
    this._controls?.remove();
  }
}
