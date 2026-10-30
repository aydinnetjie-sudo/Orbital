import { buildRocketDesign, ROCKET_ENGINES } from "./RocketDesign.js";
import {
    Texture as ExhaustTexture,
    Sampler as ExhaustSampler,
    PixelFormat as ExhaustPixelFormat,
    PixelDatatype as ExhaustPixelDatatype,
    TextureMinificationFilter as ExhaustMinFilter,
    TextureMagnificationFilter as ExhaustMagFilter,
    Cartesian3 as V,
    Matrix3,
    Matrix4,
    Quaternion,
    Ellipsoid,
    Geometry,
    GeometryAttribute,
    GeometryInstance,
    ComponentDatatype,
    PrimitiveType,
    BoundingSphere,
    CylinderGeometry,
    EllipsoidGeometry,
    BoxGeometry,
    Primitive,
    PrimitiveCollection,
    Material,
    MaterialAppearance,
    CullFace
} from "cesium";

export function lathe(profile, slices = 64) {
    const positions = [];
    const normals = [];
    const uv = [];
    const indices = [];

    const z0 = profile[0][0];
    const height = profile.at(-1)[0] - z0;

    for (let j = 0; j < profile.length; j++) {
        const [z, r] = profile[j];
        const a = profile[Math.max(0, j - 1)];
        const b = profile[Math.min(profile.length - 1, j + 1)];

        const slope = (b[1] - a[1]) / (b[0] - a[0]);
        const scale = Math.sqrt(1 + slope * slope);

        for (let i = 0; i <= slices; i++) {
            const angle = i / slices * Math.PI * 2;
            const x = Math.cos(angle);
            const y = Math.sin(angle);

            positions.push(r * x, r * y, z);
            normals.push(x / scale, y / scale, -slope / scale);
            uv.push(i / slices, (z - z0) / height);

            if (j < profile.length - 1 && i < slices) {
                const k = j * (slices + 1) + i;
                const n = k + slices + 1;

                indices.push(
                    k, k + 1, n,
                    k + 1, n + 1, n
                );
            }
        }
    }

    const p = new Float64Array(positions);

    return new Geometry({
        attributes: {
            position: new GeometryAttribute({
                componentDatatype: ComponentDatatype.DOUBLE,
                componentsPerAttribute: 3,
                values: p
            }),
            normal: new GeometryAttribute({
                componentDatatype: ComponentDatatype.FLOAT,
                componentsPerAttribute: 3,
                values: new Float32Array(normals)
            }),
            st: new GeometryAttribute({
                componentDatatype: ComponentDatatype.FLOAT,
                componentsPerAttribute: 2,
                values: new Float32Array(uv)
            })
        },
        indices: new Uint16Array(indices),
        primitiveType: PrimitiveType.TRIANGLES,
        boundingSphere: BoundingSphere.fromVertices(p)
    });
}

export const PLUME_VERTEX = `
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 st;
in float batchId;

out vec3 v_positionEC;
out vec3 v_normalEC;
out vec2 v_st;
out vec3 v_local;

void main() {
    vec4 p = czm_computePosition();

    v_local = position3DHigh + position3DLow;
    v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
    v_normalEC = czm_normal * normal;
    v_st = st;

    gl_Position = czm_modelViewProjectionRelativeToEye * p;
}
`;

export const PLUME_MATERIAL = `
in vec3 v_local;

vec4 profileRow(float z, float row) {
    float position=clamp(z/(metric.z-.45),0.0,1.0)*(flowProfileSize-1.0);
    float index=floor(position);
    vec4 a=texture(flowProfile,vec2((index+.5)/flowProfileSize,row));
    vec4 b=texture(flowProfile,vec2((min(index+1.0,flowProfileSize-1.0)+.5)/flowProfileSize,row));
    return mix(a,b,fract(position));
}

float flowHash(vec3 p) {
    // Periodic lattice permits a continuous, bounded animation offset.
    p=mod(p,256.0);
    p=fract(p*.3183099+vec3(.13,.37,.71));p*=17.0;
    return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}
float flowNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
    return mix(mix(mix(flowHash(i),flowHash(i+vec3(1,0,0)),f.x),
                   mix(flowHash(i+vec3(0,1,0)),flowHash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(flowHash(i+vec3(0,0,1)),flowHash(i+vec3(1,0,1)),f.x),
                   mix(flowHash(i+vec3(0,1,1)),flowHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float jetRadius(float z) {
    float re=flowGas.x,matched=flowShape.x;
    float r=matched>re
        ? re+(matched-re)*(1.0-exp(-z*flowShape.y/max(.001,matched-re)))
        : matched+(re-matched)*exp(-z/(2.0*re));
    return r+flowShape.z*z;
}
float areaForMach(float M, float g) {
    return pow(2.0/(g+1.0)*(1.0+.5*(g-1.0)*M*M),(g+1.0)/(2.0*(g-1.0)))/M;
}
vec4 meanGas(float core2,float w2) {
    // Analytic fallback for drivers without floating-point textures.
    float g=flowGas.w,R=flowChemistry.x,re=flowGas.x;
    float Me=flowChemistry.w/sqrt(g*R*flowGas.z);
    float fraction=max(0.0,1.0-core2/(re*re));
    if(fraction<.0000001)return vec4(flowGas.z,flowChemistry.w,0,0);
    float areaRatio=w2/(.22*.22*fraction);
    float low=1.0,high=30.0;
    for(int j=0;j<24;j++) {
        float M=.5*(low+high);
        if(areaForMach(M,g)<areaRatio)low=M;else high=M;
    }
    float M=.5*(low+high);
    float Tc=flowGas.z*(1.0+.5*(g-1.0)*Me*Me);
    float T=Tc/(1.0+.5*(g-1.0)*M*M);
    float u=M*sqrt(g*R*T);
    float rho=flowGas.y*re*re*flowChemistry.w*fraction/(w2*u);
    return vec4(T,u,rho,0.0);
}
vec3 sootRadiance(float T) {
    if(flowProfileEnabled>.5 && T>=700.0 && T<=4000.0) {
        float position=(T-700.0)/3300.0*(flowProfileSize-1.0);
        float index=floor(position);
        vec3 a=texture(flowProfile,vec2((index+.5)/flowProfileSize,.375)).rgb;
        vec3 b=texture(flowProfile,vec2((min(index+1.0,flowProfileSize-1.0)+.5)/flowProfileSize,.375)).rgb;
        return flowOptics.x*mix(a,b,fract(position));
    }
    vec3 wave=vec3(.610,.550,.460);
    vec3 exponent=min(vec3(80.0),14387.77/(wave*max(T,300.0)));
    return flowOptics.x*1200000.0*pow(vec3(.55)/wave,vec3(5.0))/(exp(exponent)-1.0);
}

czm_material czm_getMaterial(czm_materialInput inputData) {
    czm_material m=czm_getDefaultMaterial(inputData);
    vec3 eye=(czm_inverseModelView*vec4(0,0,0,1)).xyz;
    vec3 ray=normalize(v_local-eye);
    vec3 safeRay=vec3(ray.x<0.0?min(ray.x,-.00001):max(ray.x,.00001),
                      ray.y<0.0?min(ray.y,-.00001):max(ray.y,.00001),
                      ray.z<0.0?min(ray.z,-.00001):max(ray.z,.00001));
    vec3 a=(vec3(-1,-1,-.5)-eye)/safeRay,b=(vec3(1,1,.5)-eye)/safeRay;
    vec3 lo=min(a,b),hi=max(a,b);
    float begin=max(0.0,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));
    if(end<=begin)discard;
    float stepSize=(end-begin)/48.0,ds=stepSize*length(ray*metric);
    float re=flowGas.x,ue=flowChemistry.w,g=flowGas.w;
    float Me=ue/sqrt(g*flowChemistry.x*flowGas.z);
    float coreLength=re*sqrt(Me*Me-1.0);
    // Approximate shutter averaging of unresolved turbulent features.
    float travel=.6*ue*flowOptics.w;
    float largeDetail=inversesqrt(1.0+12.0*pow(travel*.45,2.0));
    float fineDetail=inversesqrt(1.0+12.0*pow(travel*1.8,2.0));
    vec3 radiance=vec3(0);float transmission=1.0;
    for(int i=0;i<48;i++) {
        vec3 p=eye+ray*(begin+(float(i)+.5)*stepSize);
        float axial=clamp(.5-p.z,0.0,1.0)*metric.z-.45;
        float z=max(0.0,axial);
        vec2 xy=p.xy*metric.xy;float r=length(xy);
        float bore=re+.49*min(axial,0.0);
        float aperture=1.0-smoothstep(bore*.85,bore,r);
        float attachment=smoothstep(-.44,-.30,axial)*mix(aperture,1.0,smoothstep(0.0,re*1.2,axial));
        float tail=1.0-smoothstep(.65, 1.0, z / (metric.z - .45));
        float envelope=attachment*tail;
        if(envelope<.00001)continue;
        vec4 shape;
        vec4 gas;
        if(flowProfileEnabled>.5) {
            shape=profileRow(z,.125);
            gas=profileRow(z,.625);
        } else {
            float width=jetRadius(z);
            float cell=pow(max(0.0,cos(z*6.2831853/flowChemistry.z)),8.0)*exp(-z/(8.0*re));
            float shock=flowShape.w*cell;
            width*=1.0-.25*shock;
            float core=max(0.0,re*(1.0-z/coreLength));
            float core2=core*core;
            float w2=max(max(.001,width*width-core2),.22*.22*1.01*max(0.0,1.0-core2/(re*re)));
            shape=vec4(width,shock,core2,w2);
            gas=meanGas(core2,w2);
        }
        // The unexpanded core retains its nozzle state until the expansion fan.
        // The outer Gaussian transports the remaining exhaust mass flow.
        float profile=exp(-max(0.0,r*r-shape.z)/shape.w);
        bool insideCore=shape.z>.0000001 && r*r<shape.z;
        float rho=insideCore?flowGas.y:gas.z*profile;
        float baseTemperature=insideCore?flowGas.z:gas.x;
        if(rho<.000001)continue;
        float downstream=smoothstep(3.0,10.0,z);
        float eddy=.5,fine=.5;
        if(flowChemistry.y>.001) {
            eddy=.5+largeDetail*(flowNoise(vec3(xy*mix(6.0,2.2,downstream),z*.45-phase))-.5);
            fine=.5+fineDetail*(flowNoise(vec3(xy*mix(12.0,3.0,downstream),z*1.8-phase*4.0))-.5);
        }
        // Empirical oxygen-entrainment/afterburn closure, not chemical CFD.
        float mixing=flowChemistry.y*(1.0-exp(-z/(6.0*re)))*exp(-z/28.0);
        float annulus=.45+.55*smoothstep(.25,1.0,r/max(.01,shape.x));
        mixing*=annulus*(.85+.30*eddy);
        float temperature=mix(baseTemperature,max(baseTemperature,flowOptics.z),clamp(mixing,0.0,1.0));
        // Refined plume shear detail
        float shear = smoothstep(.25, 1.25, r / max(.01, shape.x));
        float edgeDetail = shear * flowChemistry.y * smoothstep(1.5, 5.0, z);
        temperature *= 1.0 + .12 * edgeDetail * (eddy - .5);

        if (temperature < 700.0) continue;

        float sootDetail = max(
            .3,
            1.0 + edgeDetail * (.8 * (eddy - .5) + .4 * (fine - .5))
        );
        float absorption = flowOptics.y * rho * sootDetail;
        float opacity =1.0-exp(-absorption*ds*envelope);
        radiance+=transmission*opacity*sootRadiance(temperature);
        transmission*=1.0-opacity;
    }
    float coverage=1.0-transmission;
    if(coverage*power<.00000001)discard;
    m.diffuse=vec3(0);
    m.emission=radiance/max(coverage,.00000001);
    m.alpha=min(.98,coverage*power);
    return m;
}
`;

function surface(name, color, shine = .3) {
    return new Material({
        translucent: false,
        fabric: {
            type: name,
            uniforms: {
                paint: new V(...color),
                shine,
                engineLight: 0,
                engineHeat: 0
            },
            source: `
                czm_material czm_getMaterial(czm_materialInput i) {
                    czm_material m = czm_getDefaultMaterial(i);

                    float panel = pow(
                        abs(sin(i.st.s * 50.26548)),
                        80.0
                    );

                    float seam = pow(
                        abs(cos(i.st.t * 75.39822)),
                        70.0
                    );

                    m.diffuse = paint * (
                        1.0 - .12 * panel - .07 * seam
                    );

                    m.specular = shine;
                    m.shininess = 48.0;
                    m.emission = paint * .018;
                    m.alpha = 1.0;

                    if (engineLight > .001 || engineHeat > .001) {
                        vec3 point = (
                            czm_inverseModelView *
                            vec4(-i.positionToEyeEC, 1.0)
                        ).xyz;

                        vec3 normalLocal = normalize(
                            transpose(mat3(czm_modelView)) *
                            normalize(i.normalEC)
                        );

                        vec3 towardLight =
                            vec3(0.0, 0.0, -5.25) - point;

                        float distance2 = max(
                            .04,
                            dot(towardLight, towardLight)
                        );

                        float facing = max(
                            0.0,
                            dot(
                                normalLocal,
                                towardLight * inversesqrt(distance2)
                            )
                        );

                        m.emission +=
                            paint *
                            vec3(5.0, 2.0, .48) *
                            engineLight *
                            facing /
                            (1.0 + .32 * distance2);

                        float lip = exp(
                            -abs(point.z + 4.43) * 7.0
                        );

                        m.emission +=
                            vec3(1.8, .16, .012) *
                            engineHeat *
                            lip;
                    }

                    return m;
                }
            `
        }
    });
}

// BEGIN SCIENTIFIC EXHAUST

// Reduced near-field LOX/RP-1 visual model.
// Gas properties, soot content and exposure are assumptions.
export const ENGINE = Object.freeze({
    gamma: 1.22,
    R: 355,
    Tc: 3500,
    re: .58,
    rt: .22,
    thrust: 500000,
    sootFraction: .001,
    sootAbsorption: 5000,
    afterburnTemperature: 2400,
    displayExposure: 144,
    shutterSeconds: .00035
});

export function pressureAtAltitude(height) {
    const altitude = Math.max(0, height);
    const h = 6371000 * altitude / (6371000 + altitude);

    const layers = [
        [0, 288.15, 101325, -.0065],
        [11000, 216.65, 22632.06, 0],
        [20000, 216.65, 5474.889, .001],
        [32000, 228.65, 868.0187, .0028],
        [47000, 270.65, 110.9063, 0],
        [51000, 270.65, 66.93887, -.0028],
        [71000, 214.65, 3.956420, -.002],
        [84852, 186.946, .3734, 0]
    ];

    if (h > 84852) {
        return .3734 * Math.exp(-(h - 84852) / 5500);
    }

    let b = layers[0];

    for (const layer of layers) {
        if (h >= layer[0]) b = layer;
    }

    const [hb, tb, pb, lapse] = b;

    return lapse === 0
        ? pb * Math.exp(
            -9.80665 * (h - hb) / (287.05287 * tb)
        )
        : pb * Math.pow(
            tb / (tb + lapse * (h - hb)),
            9.80665 / (287.05287 * lapse)
        );
}

export function areaMach(m, g = ENGINE.gamma) {
    return Math.pow(
        2 / (g + 1) * (1 + (g - 1) * m * m / 2),
        (g + 1) / (2 * (g - 1))
    ) / m;
}

export function machForArea(area, g = ENGINE.gamma) {
    let low = 1;
    let high = 30;

    for (let i = 0; i < 48; i++) {
        const m = (low + high) / 2;

        if (areaMach(m, g) < area) low = m;
        else high = m;
    }

    return (low + high) / 2;
}

export function prandtlMeyer(m, g = ENGINE.gamma) {
    m = Math.max(1, m);

    const a = Math.sqrt(m * m - 1);

    return (
        Math.sqrt((g + 1) / (g - 1)) *
        Math.atan(Math.sqrt((g - 1) / (g + 1)) * a) -
        Math.atan(a)
    );
}

const e = ENGINE;
const g = e.gamma;

const At = Math.PI * e.rt * e.rt;
const Ae = Math.PI * e.re * e.re;
const Me = machForArea(Ae / At);

const temperatureRatio =
    1 / (1 + (g - 1) * Me * Me / 2);

const exitPressureRatio =
    Math.pow(temperatureRatio, g / (g - 1));

const Te = e.Tc * temperatureRatio;
const ue = Me * Math.sqrt(g * e.R * Te);

const massPerPc =
    At / Math.sqrt(e.Tc) *
    Math.sqrt(g / e.R) *
    Math.pow(
        2 / (g + 1),
        (g + 1) / (2 * (g - 1))
    );

const fullPc =
    (e.thrust + 101325 * Ae) /
    (massPerPc * ue + exitPressureRatio * Ae);

export function exhaustState(throttle, altitude) {
    const level = Math.max(.00001, Math.min(1, throttle));

    const Pa = pressureAtAltitude(altitude);
    const Pc = fullPc * level;
    const Pe = Pc * exitPressureRatio;
    const ratio = Pe / Math.max(Pa, 1e-12);

    const ma = Math.sqrt(
        Math.max(
            0,
            2 / (g - 1) * (
                Math.pow(
                    Pc / Math.max(Pa, 1e-9),
                    (g - 1) / g
                ) - 1
            )
        )
    );

    const matchedMach = Math.max(1.01, Math.min(30, ma));

    const matchedRadius =
        e.rt * Math.sqrt(areaMach(matchedMach));

    const turn =
        prandtlMeyer(matchedMach) - prandtlMeyer(Me);

    const angle = Math.max(
        .025,
        Math.min(1.05, .12 + .5 * Math.max(0, turn))
    );

    const spread = Math.tan(angle);
    const confinement = Pa / (Pa + .04 * Pe + 1e-9);

    const shocks =
        Math.min(
            .55,
            .22 * Math.abs(Math.log(Math.max(1e-8, ratio)))
        ) * confinement;

    const spacing =
        1.306 * (2 * e.re) *
        Math.sqrt(
            Math.max(1, matchedMach * matchedMach - 1)
        );

    const airMix = Math.min(1, Math.sqrt(Pa / 101325));
    const length = 24;

    let radius;

    if (matchedRadius > e.re) {
        radius = e.re +
            (matchedRadius - e.re) * (
                1 - Math.exp(
                    -length * spread /
                    Math.max(.001, matchedRadius - e.re)
                )
            );
    } else {
        radius = matchedRadius +
            (e.re - matchedRadius) *
            Math.exp(-length / (2 * e.re));
    }

    radius += .055 * airMix * length;

    return {
        Pa,
        Pc,
        Pe,
        Me,
        Te,
        ue,
        massFlow: massPerPc * Pc,
        rho: Pe / (e.R * Te),
        ratio,
        matchedRadius,
        spread,
        shocks,
        spacing,
        airMix,
        length,
        radius: Math.max(e.re * 1.25, radius * 1.3),
        gas: [
            e.re,
            Pe / (e.R * Te),
            Te,
            g
        ],
        shape: [
            matchedRadius,
            spread,
            .055 * airMix,
            shocks
        ],
        chemistry: [
            e.R,
            airMix,
            spacing,
            ue
        ],
        optics: [
            e.displayExposure,
            e.sootFraction * e.sootAbsorption,
            e.afterburnTemperature,
            e.shutterSeconds
        ]
    };
}

export function plumeRadius(state, z) {
    const r0 = ENGINE.re;
    const target = state.matchedRadius;

    const r = target > r0
        ? r0 + (target - r0) * (
            1 - Math.exp(
                -z * state.spread / Math.max(.001, target - r0)
            )
        )
        : target + (r0 - target) * Math.exp(-z / (2 * r0));

    return r + state.shape[2] * z;
}

export function centreTemperature(state, z) {
    const a = Math.pow(
        ENGINE.re / plumeRadius(state, z),
        2
    );

    const cp =
        ENGINE.gamma * ENGINE.R / (ENGINE.gamma - 1);

    let T = state.Te * Math.pow(a, ENGINE.gamma - 1);

    const u = Math.sqrt(
        state.ue * state.ue +
        2 * cp * Math.max(0, state.Te - T)
    );

    const rhoRatio = a * state.ue / u;

    T = state.Te * Math.pow(rhoRatio, ENGINE.gamma - 1);

    const mix =
        state.airMix *
        (1 - Math.exp(-z / (6 * ENGINE.re))) *
        Math.exp(-z / 28);

    return T + (ENGINE.afterburnTemperature - T) * mix;
}

export function visualExhaustState(throttle, altitude) {
    const s = exhaustState(throttle, altitude);

    let length = 32;

    for (let z = .4; z < 32; z += .1) {
        if (centreTemperature(s, z) < 1000) {
            length = z;
            break;
        }
    }

    s.length = Math.max(
        6 * ENGINE.re * Math.sqrt(s.Me * s.Me - 1),
        length
    );

    let bound = ENGINE.re;
    let lastZ = 0;

    for (let z = 0; z <= s.length; z += .1) {
        lastZ = z;
    }

    bound = Math.max(bound, plumeRadius(s, lastZ));
    s.radius = Math.min(6 * ENGINE.re, bound * 1.3);

    s.choked =
        s.Pc / Math.max(s.Pa, 1e-12) >
        Math.pow(
            (ENGINE.gamma + 1) / 2,
            ENGINE.gamma / (ENGINE.gamma - 1)
        );

    return s;
}

// END SCIENTIFIC EXHAUST

// BEGIN EXHAUST PROFILE CACHE

export const EXHAUST_PROFILE_SIZE = 1024;

// Quasi-one-dimensional ideal mean flow. Shock shape and mixing remain empirical.
export function meanPlumeFlow(s, coreRadius2, w2) {
    const fraction = Math.max(0, 1 - coreRadius2 / (ENGINE.re * ENGINE.re));
    const area = Math.PI * w2;
    if (fraction < 1e-10) return { area, fraction, mach:s.Me,
        temperature:s.Te, speed:s.ue, density:0, pressure:0 };
    const mach = machForArea(area / (At * fraction));
    const temperature = ENGINE.Tc / (1 + (ENGINE.gamma - 1) * mach * mach / 2);
    const speed = mach * Math.sqrt(ENGINE.gamma * ENGINE.R * temperature);
    const density = fraction * s.massFlow / (area * speed);
    return { area, fraction, mach, temperature, speed, density,
        pressure: density * ENGINE.R * temperature };
}

export function buildExhaustProfile(
    s,
    out = new Float32Array(EXHAUST_PROFILE_SIZE * 16)
) {
    const re = s.gas[0];
    const matched = s.shape[0];
    const spread = s.shape[1];
    const shear = s.shape[2];
    const strength = s.shape[3];

    const coreLength = re * Math.sqrt(s.Me * s.Me - 1);

    for (let i = 0; i < EXHAUST_PROFILE_SIZE; i++) {
        const z = s.length * i / (EXHAUST_PROFILE_SIZE - 1);

        let width = matched > re
            ? re + (matched - re) * (
                1 - Math.exp(
                    -z * spread / Math.max(.001, matched - re)
                )
            )
            : matched + (re - matched) * Math.exp(-z / (2 * re));

        width += shear * z;

        const cell =
            Math.pow(
                Math.max(
                    0,
                    Math.cos(z * 2 * Math.PI / s.chemistry[2])
                ),
                8
            ) *
            Math.exp(-z / (8 * re));

        const shock = strength * cell;
        width *= 1 - .25 * shock;

        const coreRadius = Math.max(
            0,
            re * (1 - z / coreLength)
        );

        out[i * 4] = width;
        out[i * 4 + 1] = shock;
        out[i * 4 + 2] = coreRadius * coreRadius;

        const w2 = Math.max(
            .001,
            width * width - coreRadius * coreRadius,
            ENGINE.rt * ENGINE.rt * 1.01 * Math.max(0, 1 - coreRadius * coreRadius / (re * re))
        );
        out[i * 4 + 3] = w2;
        const gas = meanPlumeFlow(s, coreRadius * coreRadius, w2);
        const offset = (2 * EXHAUST_PROFILE_SIZE + i) * 4;
        out[offset] = gas.temperature;
        out[offset + 1] = gas.speed;
        out[offset + 2] = gas.density;
        out[offset + 3] = gas.pressure;
    }

    if (!out._radianceReady) {
        const wave = [.610, .550, .460];

        for (let i = 0; i < EXHAUST_PROFILE_SIZE; i++) {
            const T = 700 + 3300 * i / (EXHAUST_PROFILE_SIZE - 1);
            const offset = (EXHAUST_PROFILE_SIZE + i) * 4;

            for (let c = 0; c < 3; c++) {
                out[offset + c] =
                    1200000 *
                    Math.pow(.55 / wave[c], 5) /
                    (
                        Math.exp(
                            Math.min(80, 14387.77 / (wave[c] * T))
                        ) - 1
                    );
            }

            out[offset + 3] = 1;
        }

        out._radianceReady = true;
    }

    return out;
}

function updateExhaustProfile(visual, state) {
    const material = visual.plumeMaterial;
    const context = visual.viewer.scene.context;

    if (!context || visual._profileUnavailable) return;

    const key = [
        state.length,
        state.Me,
        ...state.gas,
        ...state.shape,
        state.chemistry[2]
    ];

    const same =
        visual._profileKey &&
        key.every(
            (value, i) => value === visual._profileKey[i]
        );

    if (same) return;

    try {
        const data = buildExhaustProfile(
            state,
            visual._profileData
        );

        visual._profileData = data;

        const source = {
            width: EXHAUST_PROFILE_SIZE,
            height: 4,
            arrayBufferView: data
        };

        if (!visual._profileTexture) {
            visual._profileTexture = new ExhaustTexture({
                context,
                source,
                flipY: false,
                pixelFormat: ExhaustPixelFormat.RGBA,
                pixelDatatype: ExhaustPixelDatatype.FLOAT,
                sampler: new ExhaustSampler({
                    minificationFilter: ExhaustMinFilter.NEAREST,
                    magnificationFilter: ExhaustMagFilter.NEAREST
                })
            });
        } else {
            visual._profileTexture.copyFrom({ source });
        }

        material.uniforms.flowProfile = visual._profileTexture;
        material.uniforms.flowProfileSize = EXHAUST_PROFILE_SIZE;
        material.uniforms.flowProfileEnabled = 1;

        visual._profileKey = key;
    } catch (error) {
        material.uniforms.flowProfileEnabled = 0;
        visual._profileUnavailable = true;
    }
}

// END EXHAUST PROFILE CACHE

// BEGIN ENGINE PRESENTATION

export class EnginePresentation {
    constructor() {
        this.active = false;
        this.age = Infinity;
        this.heat = 0;
        this.power = 0;
        this.flash = 0;
        this.vibration = 0;
        this.uniform = { x: 0, y: 0, z: 0, w: 0 };
    }

    update(dt, command, power) {
        dt = Math.max(0, Math.min(.1, dt));

        const active = command > .02;

        if (active && !this.active) {
            this.age = 0;
        }

        this.active = active;
        this.age = active ? this.age + dt : Infinity;
        this.power = Math.max(0, Math.min(1, power));

        this.flash = active && this.age < .24
            ? Math.sin(Math.PI * this.age / .24) *
                Math.exp(-this.age / .35)
            : 0;

        const heatResponse = this.power > this.heat ? .45 : 2.2;

        this.heat +=
            (this.power - this.heat) *
            (1 - Math.exp(-dt / heatResponse));

        this.vibration = active
            ? Math.pow(this.power, .8)
            : 0;

        Object.assign(this.uniform, {
            x: this.power,
            y: this.flash,
            z: this.heat,
            w: this.vibration
        });

        return this;
    }
}

export function applyEngineCameraMotion(
    camera,
    flight,
    cockpit = false,
    seconds = performance.now() / 1000
) {
    const state = flight.enginePresentation;

    if (
        !state ||
        flight.landed ||
        flight.crashed ||
        flight.throttle <= 0
    ) {
        return;
    }

    const steady =
        (cockpit ? .00065 : .00028) * state.vibration;

    const kick = .0012 * state.flash;

    const pitch =
        steady * (
            Math.sin(seconds * 107) +
            .35 * Math.sin(seconds * 179)
        ) +
        kick * Math.sin(seconds * 57);

    const yaw =
        steady * (
            .65 * Math.sin(seconds * 137) +
            .25 * Math.sin(seconds * 211)
        );

    const roll =
        steady * .35 * Math.sin(seconds * 149) +
        kick * .25 * Math.sin(seconds * 71);

    camera.lookUp(pitch);
    camera.lookRight(yaw);
    camera.twistRight(roll);
}

// END ENGINE PRESENTATION

export class RocketVisual {
    constructor(viewer, flight, visible = () => true) {
        this.viewer = viewer;
        this.flight = flight;
        this.visible = visible;

        this.level = 0;
        this.presentation = new EnginePresentation();
        this.last = performance.now();

        this.parts = viewer.scene.primitives.add(
            new PrimitiveCollection()
        );

        const support = MaterialAppearance.MaterialSupport.TEXTURED;

        const white = surface(
            "OrbitalHullPaint",
            [.79, .82, .84],
            .4
        );

        const dark = surface(
            "OrbitalCeramic",
            [.045, .055, .070],
            .22
        );

        const metal = surface(
            "OrbitalBrushedMetal",
            [.33, .37, .41],
            .8
        );

        const copper = surface(
            "OrbitalCopperTrim",
            [.69, .25, .065],
            .6
        );

        const glass = surface(
            "OrbitalCockpitGlass",
            [.015, .14, .26],
            .95
        );

        const groups = new Map();

        const put = (
            material,
            geometry,
            matrix = Matrix4.IDENTITY
        ) => {
            if (!groups.has(material)) {
                groups.set(material, []);
            }

            groups.get(material).push(
                new GeometryInstance({
                    geometry,
                    modelMatrix: matrix
                })
            );
        };

        const tube = (
            z,
            length,
            top,
            bottom,
            material,
            x = 0,
            y = 0
        ) => put(
            material,
            new CylinderGeometry({
                length,
                topRadius: top,
                bottomRadius: bottom,
                slices: 48,
                vertexFormat: support.vertexFormat
            }),
            Matrix4.fromTranslation(new V(x, y, z))
        );

        const strut = (a, b, radius, material) => {
            const d = V.subtract(a, b, new V());
            V.negate(d, d);

            const length = V.magnitude(d);
            V.normalize(d, d);

            const axis = V.cross(V.UNIT_Z, d, new V());

            const q = V.magnitudeSquared(axis) < 1e-12
                ? (
                    d.z >= 0
                        ? Quaternion.IDENTITY
                        : Quaternion.fromAxisAngle(
                            V.UNIT_X,
                            Math.PI
                        )
                )
                : Quaternion.fromAxisAngle(
                    V.normalize(axis, axis),
                    Math.acos(
                        Math.max(-1, Math.min(1, d.z))
                    )
                );

            put(
                material,
                new CylinderGeometry({
                    length,
                    topRadius: radius,
                    bottomRadius: radius,
                    slices: 12,
                    vertexFormat: support.vertexFormat
                }),
                Matrix4.fromRotationTranslation(
                    Matrix3.fromQuaternion(q),
                    V.midpoint(a, b, new V())
                )
            );
        };

        buildRocketDesign({
            put, tube, strut, lathe, support, white, dark, metal, copper, glass
        });

        // Batch rocket geometry by material.
        for (const [material, instances] of groups) {
            this.parts.add(
                new Primitive({
                    geometryInstances: instances,
                    appearance: new MaterialAppearance({
                        material,
                        materialSupport: support,
                        closed: false,
                        translucent: false
                    }),
                    asynchronous: false,
                    allowPicking: false
                })
            );
        }

        this.surfaceMaterials = Array.from(groups.keys());

        this.plumeMaterial = new Material({
            translucent: true,
            fabric: {
                type: "OrbitalScientificKeroseneExhaust",
                uniforms: {
                    enginePresence: { x: 0, y: 0, z: 0, w: 0 },
                    flowProfile: Material.DefaultImageId,
                    flowProfileEnabled: 0,
                    flowProfileSize: EXHAUST_PROFILE_SIZE,
                    phase: 0,
                    power: 0,
                    metric: new V(1, 1, 1),
                    flowGas: {
                        x: .58,
                        y: .07,
                        z: 1700,
                        w: 1.22
                    },
                    flowShape: {
                        x: .5,
                        y: .1,
                        z: .05,
                        w: .1
                    },
                    flowChemistry: {
                        x: 355,
                        y: 1,
                        z: 4,
                        w: 2648
                    },
                    flowOptics: {
                        x: 16,
                        y: 5,
                        z: 2400,
                        w: 0
                    }
                },
                source: PLUME_MATERIAL
            }
        });

        this.plumes = ROCKET_ENGINES.map(() => viewer.scene.primitives.add(
            new Primitive({
                geometryInstances: new GeometryInstance({
                    geometry: BoxGeometry.fromDimensions({
                        dimensions: new V(2, 2, 1),
                        vertexFormat: support.vertexFormat
                    })
                }),
                appearance: new MaterialAppearance({
                    material: this.plumeMaterial,
                    materialSupport: support,
                    vertexShaderSource: PLUME_VERTEX,
                    flat: true,
                    closed: false,
                    translucent: true,
                    renderState: {
                        depthTest: {
                            enabled: true
                        },
                        depthMask: false,
                        cull: {
                            enabled: true,
                            face: CullFace.FRONT
                        }
                    }
                }),
                asynchronous: false,
                allowPicking: false,
                show: false
            })
        ));
        this.plume = this.plumes[0];

        this.removeUpdate =
            viewer.scene.preRender.addEventListener(
                () => this.update()
            );
    }

    update() {
        const f = this.flight;
        const now = performance.now();

        const dt = Math.max(
            0,
            Math.min(.1, (now - this.last) / 1000)
        );

        this.last = now;

        const target = !f.crashed && !f.landed
            ? Math.max(0, Math.min(1, f.throttle))
            : 0;

        this.level +=
            (target - this.level) *
            (1 - Math.exp(-dt * 18));

        const feel = this.presentation.update(
            dt,
            target,
            this.level
        );

        f.enginePresentation = feel;

        for (const material of this.surfaceMaterials) {
            material.uniforms.engineLight =
                feel.power * (1 + .35 * feel.flash);

            material.uniforms.engineHeat = feel.heat;
        }

        this.plumeMaterial.uniforms.enginePresence = feel.uniform;

        const root = Matrix4.fromRotationTranslation(
            Matrix3.fromQuaternion(f.attitude),
            f.position
        );

        for (let i = 0; i < this.parts.length; i++) {
            Matrix4.clone(
                root,
                this.parts.get(i).modelMatrix
            );
        }

        this.parts.show = this.visible();

        for (const plume of this.plumes) {
            plume.show = this.parts.show && this.level > .003;
        }

        if (!this.plume.show) return;

        const altitude =
            Ellipsoid.WGS84.cartesianToCartographic(
                f.position
            ).height;

        const state = visualExhaustState(
            this.level,
            altitude
        );

        for (const plume of this.plumes) plume.show = state.choked;

        if (!this.plume.show) return;

        updateExhaustProfile(this, state);

        // Each jet uses the reference flow in its own geometrically scaled frame.
        // The three nozzle exit areas sum to the original engine's exit area.
        // Jet interaction and independent engine/gimbal dynamics are not simulated.
        const length = state.length + .45;
        const radius = state.radius;
        for (let i = 0; i < this.plumes.length; i++) {
            const engine = ROCKET_ENGINES[i];
            const s = engine.scale;
            const local = Matrix4.fromTranslation(new V(
                engine.x, engine.y, engine.exitZ + .45*s - length*s/2
            ));
            Matrix4.multiplyByScale(local, new V(radius*s, radius*s, length*s), local);
            Matrix4.multiply(root, local, this.plumes[i].modelMatrix);
        }

        const pack = a => ({
            x: a[0],
            y: a[1],
            z: a[2],
            w: a[3]
        });

        // Smoothly introduce the visible plume above its pressure threshold.
        const criticalPressureRatio = Math.pow(
            (ENGINE.gamma + 1) / 2,
            ENGINE.gamma / (ENGINE.gamma - 1)
        );

        const minimumThrottle =
            this.level *
            criticalPressureRatio *
            state.Pa /
            Math.max(state.Pc, 1e-9);

        const ramp = Math.max(
            0,
            Math.min(
                1,
                (this.level - minimumThrottle) / .15
            )
        );

        const plumePower = ramp * ramp * (3 - 2 * ramp);

        Object.assign(this.plumeMaterial.uniforms, {
            phase: ((now / 1000) * .6 * state.ue * .45) % 256,
            power: plumePower,
            metric: new V(radius, radius, length),
            flowGas: pack(state.gas),
            flowShape: pack(state.shape),
            flowChemistry: pack(state.chemistry),
            flowOptics: pack(state.optics)
        });
    }

    destroy() {
        this.removeUpdate();

        if (this.flight.enginePresentation === this.presentation) {
            this.flight.enginePresentation = undefined;
        }

        const profileTexture = this._profileTexture;

        if (!this.plumeMaterial.isDestroyed()) {
            this.plumeMaterial.destroy();
        }

        if (profileTexture && !profileTexture.isDestroyed()) {
            profileTexture.destroy();
        }

        this.viewer.scene.primitives.remove(this.parts);
        for (const plume of this.plumes) this.viewer.scene.primitives.remove(plume);
    }
}