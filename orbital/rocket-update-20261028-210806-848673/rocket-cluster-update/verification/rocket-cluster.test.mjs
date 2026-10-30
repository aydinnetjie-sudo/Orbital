import assert from 'node:assert/strict';
import {Cartesian3 as V, Matrix3, Matrix4, Quaternion, PrimitiveCollection, Event, Geometry} from 'cesium';
import {ROCKET_ENGINES,sweptFin} from '../src/RocketDesign.js';
import {RocketVisual,lathe} from '../src/RocketVisual.js';
globalThis.HTMLCanvasElement=class {};
globalThis.HTMLImageElement=class {};
globalThis.HTMLVideoElement=class {};
globalThis.ImageBitmap=class {};
globalThis.OffscreenCanvas=class {};
const scene={primitives:new PrimitiveCollection(),preRender:new Event()};
const flight={position:V.fromDegrees(20,30,0),attitude:Quaternion.IDENTITY,landed:false,crashed:false,throttle:1};
flight.offset=(x,y,z)=>V.add(flight.position,new V(x,y,z),new V());
let visible=true;
const visual=new RocketVisual({scene},flight,()=>visible);
assert.equal(scene.primitives.length,4);assert.equal(visual.plumes.length,3);assert.equal(visual.parts.length,5);
let count=0,min=Infinity,max=-Infinity,radius=0;
for(let i=0;i<visual.parts.length;i++){
 const part=visual.parts.get(i);
 for(const instance of part.geometryInstances){
  const mesh=instance.geometry instanceof Geometry ? instance.geometry : instance.geometry.constructor.createGeometry(instance.geometry);
  const p=mesh.attributes.position.values;
  assert(mesh.attributes.normal&&mesh.attributes.st);
  for(let k=0;k<p.length;k+=3){
   const local=Matrix4.multiplyByPoint(instance.modelMatrix,new V(p[k],p[k+1],p[k+2]),new V());
   assert(Number.isFinite(local.x+local.y+local.z));
   min=Math.min(min,local.z);max=Math.max(max,local.z);radius=Math.max(radius,Math.hypot(local.x,local.y));
  }
  for(const index of mesh.indices)assert(index<p.length/3);
  count++;
 }
}
assert(min>=-5.500001&&max<=7.000001);assert(radius<3.13);assert(count>=33);
const tube=lathe([[-1,1],[1,1]],16),p=tube.attributes.position.values;
for(let k=0;k<tube.indices.length;k+=3){
 const at=n=>V.fromArray(p,n*3,new V());
 const a=at(tube.indices[k]),b=at(tube.indices[k+1]),c=at(tube.indices[k+2]);
 const normal=V.cross(V.subtract(b,a,new V()),V.subtract(c,a,new V()),new V());
 assert(V.dot(normal,new V(a.x,a.y,0))>0);
}
console.log('PASS: finite textured meshes, valid indices/outward winding; visual fits existing nose/engine/feet dimensions.',{parts:count,min,max,radius});
for(let i=0;i<8;i++){visual.last=performance.now()-100;visual.update();}
assert(visual.plume.show);assert(visual.plumeMaterial.uniforms.flowChemistry.y>.99);
const seaLength=V.magnitude(Matrix4.getColumn(visual.plume.modelMatrix,2,new V()));
const top=Matrix4.multiplyByPoint(visual.plume.modelMatrix,new V(0,0,.5),new V());
const firstEngine=ROCKET_ENGINES[0];
assert(V.distance(top,flight.offset(firstEngine.x,firstEngine.y,firstEngine.exitZ+.45*firstEngine.scale))<1e-7);
for(let i=0;i<3;i++){
 const e=ROCKET_ENGINES[i];
 const exit=Matrix4.multiplyByPoint(visual.plumes[i].modelMatrix,new V(0,0,.5-.45/visual.plumeMaterial.uniforms.metric.z),new V());
 assert(V.distance(exit,flight.offset(e.x,e.y,e.exitZ))<1e-7);
 for(let j=i+1;j<3;j++)assert(Math.hypot(e.x-ROCKET_ENGINES[j].x,e.y-ROCKET_ENGINES[j].y)> .62*(e.scale+ROCKET_ENGINES[j].scale));
}
assert(Math.abs(ROCKET_ENGINES.reduce((a,e)=>a+e.scale**2,0)-1)<1e-12);
flight.position=V.fromDegrees(20,30,100000);visual.update();
const vacuumLength=V.magnitude(Matrix4.getColumn(visual.plume.modelMatrix,2,new V()));assert(vacuumLength<seaLength);
assert(visual.plumeMaterial.uniforms.flowChemistry.y<.001);
for(let i=0;i<visual.parts.length;i++) assert(V.distance(Matrix4.getTranslation(visual.parts.get(i).modelMatrix,new V()),flight.position)<1e-8);
flight.throttle=.1;for(let i=0;i<8;i++){visual.last=performance.now()-100;visual.update();}
const lowLength=V.magnitude(Matrix4.getColumn(visual.plume.modelMatrix,2,new V()));assert(lowLength>0);assert(visual.plumeMaterial.uniforms.flowGas.y<.02);
visible=false;visual.update();assert(!visual.parts.show&&visual.plumes.every(p=>!p.show));
visible=true;flight.throttle=0;for(let i=0;i<8;i++){visual.last=performance.now()-100;visual.update();}assert(!visual.plume.show);
flight.throttle=1;flight.landed=true;visual.last=performance.now()-100;visual.update();assert(!visual.plume.show);
assert(flight.enginePresentation);assert(visual.surfaceMaterials.every(m=>m.uniforms.engineHeat>0));
visual.destroy();assert.equal(flight.enginePresentation,undefined);assert.equal(scene.primitives.length,0);assert.equal(scene.preRender.numberOfListeners,0);
console.log('PASS: exhaust attachment, pressure expansion, throttle response, cockpit hiding, cutoff/ground state, transforms and cleanup.');
scene.context={};flight.landed=false;flight.throttle=1;
const fallback=new RocketVisual({scene},flight,()=>true);
for(let i=0;i<8;i++){fallback.last=performance.now()-100;fallback.update();}
assert(fallback._profileUnavailable);assert.equal(fallback.plumeMaterial.uniforms.flowProfileEnabled,0);assert(fallback.plume.show);
fallback.destroy();assert.equal(scene.primitives.length,0);
console.log('PASS: unsupported lookup textures retain the original flame renderer and clean up safely.');

const fin=sweptFin();const fp=fin.attributes.position.values,fn=fin.attributes.normal.values;
for(let k=0;k<fin.indices.length;k+=3){
 const ia=fin.indices[k],ib=fin.indices[k+1],ic=fin.indices[k+2];
 const a=V.fromArray(fp,ia*3,new V()),b=V.fromArray(fp,ib*3,new V()),c=V.fromArray(fp,ic*3,new V());
 const n=V.cross(V.subtract(b,a,new V()),V.subtract(c,a,new V()),new V());
 assert(V.dot(n,V.fromArray(fn,ia*3,new V()))>0);
}
flight.attitude=Quaternion.fromAxisAngle(V.UNIT_Y,.8);flight.landed=false;flight.throttle=1;
const rotated=new RocketVisual({scene},flight);
for(let k=0;k<8;k++){rotated.last=performance.now()-100;rotated.update();}
for(let i=0;i<3;i++){
 const e=ROCKET_ENGINES[i],local=new V(e.x,e.y,e.exitZ+.45*e.scale);
 const expected=Matrix3.multiplyByVector(Matrix3.fromQuaternion(flight.attitude),local,new V());
 V.add(expected,flight.position,expected);
 const actual=Matrix4.multiplyByPoint(rotated.plumes[i].modelMatrix,new V(0,0,.5),new V());
 assert(V.distance(actual,expected)<1e-7);
}
rotated.destroy();assert.equal(scene.primitives.length,0);
console.log('PASS: all three bell attachments, area-preserving cluster, bell clearance, fin winding and rotated transforms.');
