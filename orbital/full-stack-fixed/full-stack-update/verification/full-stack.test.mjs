import assert from 'node:assert/strict';
import {Cartesian3 as V, Matrix3, Matrix4, Quaternion, PrimitiveCollection, Event, Geometry} from 'cesium';
import {ROCKET_ENGINES,SHIP_ENGINES,ENGINE_EXIT_Z,STACK_DIMENSIONS} from '../src/RocketDesign.js';
import {CesiumRocket} from '../src/CesiumRocket.js';
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
assert.equal(scene.primitives.length,2);assert.equal(visual.parts.length,4);
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
assert(min>=-15.500001&&max<=14.800001);assert(radius<3.13);assert(count>=33);
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
assert(V.distance(top,flight.offset(0,0,ENGINE_EXIT_Z+.45))<1e-7);
flight.position=V.fromDegrees(20,30,100000);visual.update();
const vacuumLength=V.magnitude(Matrix4.getColumn(visual.plume.modelMatrix,2,new V()));assert(vacuumLength<seaLength);
assert(visual.plumeMaterial.uniforms.flowChemistry.y<.001);
for(let i=0;i<visual.parts.length;i++) assert(V.distance(Matrix4.getTranslation(visual.parts.get(i).modelMatrix,new V()),flight.position)<1e-8);
flight.throttle=.1;for(let i=0;i<8;i++){visual.last=performance.now()-100;visual.update();}
const lowLength=V.magnitude(Matrix4.getColumn(visual.plume.modelMatrix,2,new V()));assert(lowLength>0);assert(visual.plumeMaterial.uniforms.flowGas.y<.02);
visible=false;visual.update();assert(!visual.parts.show&&!visual.plume.show);
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

assert.equal(ROCKET_ENGINES.length,33);assert.equal(SHIP_ENGINES.length,6);assert.equal(visual.plumes.length,1);
assert(Math.abs(ROCKET_ENGINES.reduce((n,e)=>n+e.scale**2,0)-1)<1e-12);
for(const engines of [ROCKET_ENGINES,SHIP_ENGINES])for(let i=0;i<engines.length;i++)for(let j=i+1;j<engines.length;j++){
 const a=engines[i],b=engines[j];assert(Math.hypot(a.x-b.x,a.y-b.y)>.62*(a.scale+b.scale));
}
const ground=new CesiumRocket(20,30,1000);
for(const foot of ground.feet())assert(Math.abs((await import('cesium')).Ellipsoid.WGS84.cartesianToCartographic(foot).height-1000)<.001);
assert(Math.abs((await import('cesium')).Ellipsoid.WGS84.cartesianToCartographic(ground.position).height-1015.5)<.001);
console.log('PASS: 33 booster + 6 ship engines, bell clearances and taller-stack ground contacts.');
const {SurfaceWalker}=await import('../src/SurfaceWalker.js');
const walker=new SurfaceWalker(null,{getHeight:()=>1000},V.fromDegrees(20,30,1000),1000);
walker.ground.refresh=async()=>{};
assert(await walker.enter(ground));
assert(walker.canBoard(ground));
walker.ground.onPad=()=>false;
assert(walker.canBoard(ground));
assert(Math.abs((await import('cesium')).Ellipsoid.WGS84.cartesianToCartographic(walker.position).height-1000)<.001);
console.log('PASS: exiting to ground level and boarding on/off pad with the taller stack.');
