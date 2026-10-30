import {
    Cartesian3 as V, Matrix3, Matrix4, Geometry, GeometryAttribute,
    ComponentDatatype, PrimitiveType, BoundingSphere, Material, BoxGeometry
} from "cesium";

export const ENGINE_EXIT_Z = -15.20;
const scale = 1 / Math.sqrt(33);
export const ENGINE_RINGS = Object.freeze([
    Object.freeze({ count: 3, radius: .14, phase: -Math.PI/2 }),
    Object.freeze({ count: 10, radius: .43, phase: Math.PI/10 }),
    Object.freeze({ count: 20, radius: .85, phase: 0 })
]);
export const ROCKET_ENGINES = Object.freeze(ENGINE_RINGS.flatMap(ring =>
    Array.from({length:ring.count}, (_,i) => {
        const a=ring.phase+i*2*Math.PI/ring.count;
        return Object.freeze({x:ring.radius*Math.cos(a),y:ring.radius*Math.sin(a),exitZ:ENGINE_EXIT_Z,scale});
    })
));

export function createShipSkin() {
    return new Material({translucent:false,fabric:{
        type:"OrbitalBrushedStainlessSteel",
        uniforms:{engineLight:0,engineHeat:0},
        source:`
czm_material czm_getMaterial(czm_materialInput i) {
    czm_material m=czm_getDefaultMaterial(i);
    vec3 point=(czm_inverseModelView*vec4(-i.positionToEyeEC,1.0)).xyz;
    vec3 n=normalize(transpose(mat3(czm_modelView))*normalize(i.normalEC));
    vec3 eye=normalize((czm_inverseModelView*vec4(i.positionToEyeEC,0.0)).xyz);
    vec3 reflection=reflect(-eye,n);
    float fresnel=.58+.42*pow(1.0-max(0.0,dot(n,eye)),5.0);
    // Procedural broad sky/ground reflection; no environment-map dependency.
    float sky=smoothstep(-.5,.55,reflection.z);
    vec3 environment=mix(vec3(.075,.065,.055),vec3(.31,.40,.49),sky);
    float broad=pow(max(0.0,dot(reflection,normalize(vec3(-.6,.8,.7)))),12.0);
    environment+=vec3(.42,.44,.45)*broad;
    float weld=exp(-pow(sin(point.z*3.14159265/.46)*75.0,2.0));
    float brush=sin(point.z*2100.0+sin(atan(point.y,point.x)*170.0))*.006;
    m.diffuse=vec3(.19,.205,.22)*(1.0-.20*weld+brush);
    m.specular=.95;m.shininess=180.0;
    m.emission=environment*fresnel*(.42+.03*brush);
    m.emission+=vec3(.12,.035,.006)*engineLight*exp(-abs(point.z+15.0)*6.0);
    m.alpha=1.0;return m;
}`}});
}

export function createHeatShieldSkin() {
    return new Material({translucent:false,fabric:{
        type:"OrbitalDarkThermalTiles",uniforms:{engineLight:0,engineHeat:0},
        source:`
czm_material czm_getMaterial(czm_materialInput i) {
    czm_material m=czm_getDefaultMaterial(i);
    vec3 p=(czm_inverseModelView*vec4(-i.positionToEyeEC,1.0)).xyz;
    float a=atan(p.y,p.x)*1.12;
    float row=floor(p.z/.065);
    vec2 tile=vec2(a/.065+mod(row,2.0)*.5,p.z/.065);
    vec2 edge=abs(fract(tile)-.5);
    float seam=smoothstep(.43,.49,max(edge.x,edge.y));
    float variation=fract(sin(floor(tile.x)*12.9898+row*78.233)*43758.5453);
    m.diffuse=vec3(.022,.025,.029)*(1.0+.15*variation-.35*seam);
    m.specular=.09;m.shininess=12.0;m.emission=vec3(.0015);m.alpha=1.0;
    return m;
}`}});
}

function hullSector(profile, from, to, slices=64) {
    const positions=[],normals=[],uv=[],indices=[];
    for(let j=0;j<profile.length;j++) {
        const [z,r]=profile[j],a=profile[Math.max(0,j-1)],b=profile[Math.min(profile.length-1,j+1)];
        const slope=(b[1]-a[1])/(b[0]-a[0]),n=Math.sqrt(1+slope*slope);
        for(let i=0;i<=slices;i++) {
            const t=from+(to-from)*i/slices,x=Math.cos(t),y=Math.sin(t);
            positions.push(r*x,r*y,z);normals.push(x/n,y/n,-slope/n);uv.push(i/slices,j/(profile.length-1));
            if(j<profile.length-1&&i<slices) {
                const k=j*(slices+1)+i,h=k+slices+1;indices.push(k,k+1,h,k+1,h+1,h);
            }
        }
    }
    const values=new Float64Array(positions);
    return new Geometry({attributes:{
        position:new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values}),
        normal:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:3,values:new Float32Array(normals)}),
        st:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array(uv)})
    },indices:new Uint16Array(indices),primitiveType:PrimitiveType.TRIANGLES,boundingSphere:BoundingSphere.fromVertices(values)});
}

function flap(outline, angle, thickness=.045) {
    const points=[];for(const y of [-thickness,thickness])for(const [x,z] of outline)points.push(new V(x,y,z));
    const center=points.reduce((s,p)=>V.add(s,p,s),new V());V.divideByScalar(center,8,center);
    const positions=[],normals=[],uv=[],indices=[];
    for(const f of [[0,1,2,3],[7,6,5,4],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]]) {
        const ids=f.slice();let a=points[ids[0]],b=points[ids[1]],c=points[ids[2]];
        const n=V.cross(V.subtract(b,a,new V()),V.subtract(c,a,new V()),new V());
        if(V.dot(n,V.subtract(a,center,new V()))<0){ids.reverse();V.negate(n,n);}V.normalize(n,n);
        const k=positions.length/3;
        for(let j=0;j<4;j++){const p=points[ids[j]];positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);uv.push(j===1||j===2?1:0,j>=2?1:0);}
        indices.push(k,k+1,k+2,k,k+2,k+3);
    }
    const values=new Float64Array(positions);
    return new Geometry({attributes:{
        position:new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values}),
        normal:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:3,values:new Float32Array(normals)}),
        st:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array(uv)})
    },indices:new Uint16Array(indices),primitiveType:PrimitiveType.TRIANGLES,boundingSphere:BoundingSphere.fromVertices(values)});
}

export const SHIP_ENGINES = Object.freeze([
    ...Array.from({length:3},(_,i)=>{
        const a=Math.PI/2+i*2*Math.PI/3;
        return Object.freeze({x:.23*Math.cos(a),y:.23*Math.sin(a),exitZ:1.65,scale:.31,vacuum:false});
    }),
    ...Array.from({length:3},(_,i)=>{
        const a=-Math.PI/2+i*2*Math.PI/3;
        return Object.freeze({x:.70*Math.cos(a),y:.70*Math.sin(a),exitZ:1.65,scale:.57,vacuum:true});
    })
]);
export const STACK_DIMENSIONS=Object.freeze({groundClearance:15.5,noseZ:14.8,shipBaseZ:2.5,radius:1.12});

export function buildRocketDesign({put,tube,strut,lathe,support,white,dark,metal,glass}) {
    const at=(x,y,z=0)=>Matrix4.fromTranslation(new V(x,y,z));
    const box=(x,y,z,dx,dy,dz,material,angle=0)=>put(material,
        BoxGeometry.fromDimensions({dimensions:new V(dx,dy,dz),vertexFormat:support.vertexFormat}),
        Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(angle),new V(x,y,z)));

    // First stage: long constant-diameter tank and recessed 33-engine skirt.
    put(white,lathe([[-14.90,1.12],[-13.7,1.12],[-2.0,1.12],[1.28,1.12]],96));
    tube(-14.90,.08,1.12,1.10,metal);
    tube(-15.00,.06,1.015,1.015,dark);
    for(const z of [-12.5,-8.5,-4.5,.90])tube(z,.025,1.124,1.124,metal);
    put(metal,hullSector([[-13.8,1.128],[.70,1.128]],Math.PI*.492,Math.PI*.508,4));

    // Open vented interstage. The upper engines are recessed behind these supports.
    tube(1.33,.10,1.128,1.128,metal);
    tube(2.46,.08,1.128,1.128,metal);
    for(let i=0;i<24;i++) {
        const a=i*2*Math.PI/24;
        box(1.103*Math.cos(a),1.103*Math.sin(a),1.895,.045,.065,1.03,metal,a);
    }
    // Stage two continues at the same diameter, then tapers smoothly into the nose.
    const ship=[[2.50,1.12],[9.15,1.12],[9.75,1.105],[10.35,1.065],
        [11.05,.995],[11.80,.875],[12.55,.69],[13.25,.46],
        [13.88,.255],[14.36,.105],[14.66,.027],[14.80,.001]];
    put(white,lathe(ship,96));
    put(dark,hullSector(ship.map(([z,r])=>[z,r+.006]),-Math.PI,0,64));
    tube(2.53,.04,1.125,1.125,metal);

    function engine(e) {
        const {x,y,scale:s,exitZ:z}=e,mount=at(x,y);
        tube(z+.70*s+.05,.11,.16*s,.16*s,metal,x,y);
        put(metal,lathe([[z,.62*s],[z+.25*s,.51*s],[z+.52*s,.36*s],[z+.70*s,.25*s]],32),mount);
        const inner=lathe([[z+.001,.58*s],[z+.26*s,.47*s],[z+.52*s,.32*s],[z+.70*s,.22*s]],32);
        for(let k=0;k<inner.attributes.normal.values.length;k++)inner.attributes.normal.values[k]*=-1;
        for(let k=0;k<inner.indices.length;k+=3){const a=inner.indices[k+1];inner.indices[k+1]=inner.indices[k+2];inner.indices[k+2]=a;}
        put(dark,inner,mount);
        put(metal,lathe([[z,.62*s],[z+.025*s,.635*s],[z+.06*s,.62*s]],32),mount);
    }
    for(const e of ROCKET_ENGINES)engine(e);
    for(const e of SHIP_ENGINES)engine(e);

    // Ship control surfaces: two broad aft flaps and two compact forward flaps.
    for(const a of [0,Math.PI]) {
        const rotation=Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(a),V.ZERO);
        put(white,flap([[1.08,5.6],[2.03,4.65],[1.97,2.90],[1.08,2.76]],a),rotation);
        put(white,flap([[1.01,11.65],[1.56,11.15],[1.56,10.18],[1.09,10.06]],a,.035),rotation);
        const c=Math.cos(a),s=Math.sin(a);
        strut(new V(1.09*c,1.09*s,3.05),new V(1.09*c,1.09*s,5.40),.03,metal);
    }
    // Four lattice booster fins just beneath the stage interface.
    for(let i=0;i<4;i++) {
        const a=i*Math.PI/2,c=Math.cos(a),s=Math.sin(a);
        for(let j=0;j<=5;j++) {
            const radial=1.13+j*.135;
            box(c*radial,s*radial,.30,.027,.58,.045,metal,a);
        }
        for(let j=0;j<=4;j++) {
            const tangent=-.29+j*.145;
            box(c*1.47-s*tangent,s*1.47+c*tangent,.30,.70,.025,.045,metal,a);
        }
        // Small base shoes preserve ground support without the old splayed legs.
        const x=1.10*c,y=1.10*s;
        strut(new V(x*.97,y*.97,-14.70),new V(x,y,-15.43),.045,metal);
        tube(-15.46,.08,.105,.105,dark,x,y);
    }
    // Small flush windows are confined to the leeward side of the upper ship.
    for(const a of [Math.PI*.38,Math.PI*.50,Math.PI*.62])
        put(glass,hullSector([[10.0,1.096],[10.23,1.080]],a-.045,a+.045,6));
}
