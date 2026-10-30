
import {
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

// Matches the existing physical rocket dimensions.
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
        const b = profile[
            Math.min(profile.length - 1, j + 1)
        ];

        const slope = (b[1] - a[1]) / (b[0] - a[0]);
        const scale = Math.sqrt(1 + slope * slope);

        for (let i = 0; i <= slices; i++) {
            const angle = i / slices * Math.PI * 2;
            const x = Math.cos(angle);
            const y = Math.sin(angle);

            positions.push(r * x, r * y, z);

            normals.push(
                x / scale,
                y / scale,
                -slope / scale
            );

            uv.push(
                i / slices,
                (z - z0) / height
            );

            if (
                j < profile.length - 1 &&
                i < slices
            ) {
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
                componentDatatype:
                    ComponentDatatype.DOUBLE,
                componentsPerAttribute: 3,
                values: p
            }),
            normal: new GeometryAttribute({
                componentDatatype:
                    ComponentDatatype.FLOAT,
                componentsPerAttribute: 3,
                values: new Float32Array(normals)
            }),
            st: new GeometryAttribute({
                componentDatatype:
                    ComponentDatatype.FLOAT,
                componentsPerAttribute: 2,
                values: new Float32Array(uv)
            })
        },
        indices: new Uint16Array(indices),
        primitiveType: PrimitiveType.TRIANGLES,
        boundingSphere:
            BoundingSphere.fromVertices(p)
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
    v_positionEC =
        (czm_modelViewRelativeToEye * p).xyz;
    v_normalEC = czm_normal * normal;
    v_st = st;

    gl_Position =
        czm_modelViewProjectionRelativeToEye * p;
}
`;

export const PLUME_MATERIAL = `

in vec3 v_local;

float flowHash(vec3 p) {
    p=fract(p*.3183099+vec3(.13,.37,.71));
    p*=17.0;
    return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}

float flowNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p);
    f=f*f*(3.0-2.0*f);

    return mix(
        mix(
            mix(flowHash(i),flowHash(i+vec3(1,0,0)),f.x),
            mix(flowHash(i+vec3(0,1,0)),flowHash(i+vec3(1,1,0)),f.x),
            f.y
        ),
        mix(
            mix(flowHash(i+vec3(0,0,1)),flowHash(i+vec3(1,0,1)),f.x),
            mix(flowHash(i+vec3(0,1,1)),flowHash(i+vec3(1,1,1)),f.x),
            f.y
        ),
        f.z
    );
}

float jetRadius(float z) {
    float re=flowGas.x,matched=flowShape.x;

    float r=matched>re
        ? re+(matched-re)*
            (1.0-exp(-z*flowShape.y/max(.001,matched-re)))
        : matched+(re-matched)*exp(-z/(2.0*re));

    return r+flowShape.z*z;
}

vec3 sootRadiance(float temperature) {
    vec3 wavelength=vec3(.610,.550,.460);

    vec3 exponent=min(
        vec3(80.0),
        14387.77/(wavelength*max(temperature,300.0))
    );

    return flowOptics.x*1200000.0*
        pow(vec3(.55)/wavelength,vec3(5.0))/
        (exp(exponent)-1.0);
}

czm_material czm_getMaterial(czm_materialInput inputData) {
    czm_material m=czm_getDefaultMaterial(inputData);

    vec3 eye=(czm_inverseModelView*vec4(0,0,0,1)).xyz;
    vec3 ray=normalize(v_local-eye);

    vec3 safeRay=vec3(
        ray.x<0.0?min(ray.x,-.00001):max(ray.x,.00001),
        ray.y<0.0?min(ray.y,-.00001):max(ray.y,.00001),
        ray.z<0.0?min(ray.z,-.00001):max(ray.z,.00001)
    );

    vec3 a=(vec3(-1,-1,-.5)-eye)/safeRay;
    vec3 b=(vec3(1,1,.5)-eye)/safeRay;

    vec3 lo=min(a,b),hi=max(a,b);

    float begin=max(0.0,max(lo.x,max(lo.y,lo.z)));
    float end=min(hi.x,min(hi.y,hi.z));

    if(end<=begin)discard;

    float stepSize=(end-begin)/48.0;
    float ds=stepSize*length(ray*metric);

    float re=flowGas.x;
    float rhoExit=flowGas.y;
    float Te=flowGas.z;
    float gamma=flowGas.w;
    float ue=flowChemistry.w;

    float cp=gamma*flowChemistry.x/(gamma-1.0);
    float Me=ue/sqrt(gamma*flowChemistry.x*Te);
    float coreLength=re*sqrt(Me*Me-1.0);

    vec3 radiance=vec3(0.0);
    float transmission=1.0;

    vec3 localGlow=vec3(0.0);
    float glowDepth=0.0;

    for(int i=0;i<48;i++) {
        vec3 p=eye+ray*(begin+(float(i)+.5)*stepSize);

        float z=clamp(.5-p.z,0.0,1.0)*metric.z;
        vec2 xy=p.xy*metric.xy;
        float r=length(xy);

        // Optical glow, kept separate from the gas-temperature model.
        float glowWidth=re*1.20+z*.06;

        float glowDensity=
            exp(-r*r/(glowWidth*glowWidth))*
            exp(-z/(3.0*re));

        float glowGain=
            (flowOptics.x/16.0)*
            sqrt(max(0.0,rhoExit/.07537));

        localGlow+=
            ds*glowDensity*glowGain*
            vec3(.85,.55,.28);

        glowDepth+=ds*glowDensity*.04;

        float width=jetRadius(z);

        float cell=
            pow(
                max(0.0,cos(z*6.2831853/flowChemistry.z)),
                8.0
            )*
            exp(-z/(8.0*re));

        float shock=flowShape.w*cell;
        width*=1.0-.25*shock;

        float coreRadius=max(
            0.0,
            re*(1.0-z/coreLength)
        );

        float w2=max(
            .001,
            width*width-coreRadius*coreRadius
        );

        float redistributed=max(
            .001,
            re*re-coreRadius*coreRadius
        )/w2;

        float profile=exp(
            -max(0.0,r*r-coreRadius*coreRadius)/w2
        );

        float areaFactor=redistributed*profile;

        float expandedT=
            Te*pow(max(.00001,areaFactor),gamma-1.0);

        float speed=sqrt(
            ue*ue+2.0*cp*max(0.0,Te-expandedT)
        );

        float rho=rhoExit*areaFactor*ue/speed;

        expandedT=Te*pow(
            max(.00001,rho/rhoExit),
            gamma-1.0
        );

        // Smooth hot core, with no sharply pointed cone boundary.
        float hotWidth=re*(.8+.20*z/coreLength);

        float potential=
            exp(-1.6*r*r/(hotWidth*hotWidth))*
            exp(-z/(2.0*coreLength));

        rho=mix(rho,rhoExit,potential);

        float temperature=mix(
            expandedT,
            Te,
            potential
        );

        if(rho<.00001)continue;

        float mixing=
            flowChemistry.y*
            (1.0-exp(-z/(6.0*re)))*
            exp(-z/28.0);

        float annulus=
            .45+.55*smoothstep(
                .25,
                1.0,
                r/max(.01,width)
            );

        float eddy=.5;

        if(flowChemistry.y>.001) {
            eddy=flowNoise(
                vec3(xy*2.0,z*1.2-phase*10.0)
            );
        }

        mixing=clamp(
            mixing*(
                .45+.85*smoothstep(.15,.85,eddy)
            ),
            0.0,
            1.0
        );

        temperature=mix(
            temperature,
            max(temperature,flowOptics.z),
            mixing*annulus
        );

        temperature*=1.0+.18*shock;
        rho*=1.0+.65*shock;

        float noise=.5;

        if(flowChemistry.y>.001) {
            noise=flowNoise(
                vec3(xy*12.0,z*5.0-phase*35.0)
            );
        }

        rho*=.78+.44*noise;

        if(temperature<700.0||rho<.00001)continue;

        float absorption=flowOptics.y*rho;

        float cutoff=
            1.0-smoothstep(.87,1.0,z/metric.z);

        float opacity=
            1.0-exp(-absorption*ds*cutoff);

        radiance+=
            transmission*opacity*
            sootRadiance(temperature);

        transmission*=1.0-opacity;
    }

    float coverage=
        1.0-transmission*exp(-glowDepth);

    float alpha=coverage*power;

    // Preserve faint halo samples to avoid a hard glowing outline.
    if(alpha<.00000001)discard;

    m.diffuse=vec3(0.0);

    m.emission=
        (radiance+localGlow)/
        max(coverage,.00000001);

    m.alpha=min(.98,alpha);

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
                shine
            },
            source: `
                czm_material czm_getMaterial(
                    czm_materialInput i
                ) {
                    czm_material m =
                        czm_getDefaultMaterial(i);

                    float panel = pow(
                        abs(sin(i.st.s * 50.26548)),
                        80.0
                    );

                    float seam = pow(
                        abs(cos(i.st.t * 75.39822)),
                        70.0
                    );

                    m.diffuse = paint * (
                        1.0 -
                        .12 * panel -
                        .07 * seam
                    );

                    m.specular = shine;
                    m.shininess = 48.0;
                    m.emission = paint * .018;
                    m.alpha = 1.0;

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
    displayExposure: 144
});

export function pressureAtAltitude(height) {
    const altitude = Math.max(0, height);

    const h =
        6371000 * altitude /
        (6371000 + altitude);

    // Standard-atmosphere layers: geopotential height, K, Pa, K/m.
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

    // Simple continuation above the standard-atmosphere layers.
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
            -9.80665 * (h - hb) /
            (287.05287 * tb)
        )
        : pb * Math.pow(
            tb / (tb + lapse * (h - hb)),
            9.80665 / (287.05287 * lapse)
        );
}

export function areaMach(m, g = ENGINE.gamma) {
    return Math.pow(
        2 / (g + 1) *
        (1 + (g - 1) * m * m / 2),
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
        Math.atan(
            Math.sqrt((g - 1) / (g + 1)) * a
        ) -
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

// Calibrate this visual reference engine to 500 kN at sea level.
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
        prandtlMeyer(matchedMach) -
        prandtlMeyer(Me);

    // Representative expansion angle for a finite visual volume.
    // Rarefied exhaust outside this volume is not rendered.
    const angle = Math.max(
        .025,
        Math.min(
            1.05,
            .12 + .5 * Math.max(0, turn)
        )
    );

    const spread = Math.tan(angle);

    const confinement =
        Pa / (Pa + .04 * Pe + 1e-9);

    const shocks =
        Math.min(
            .55,
            .22 * Math.abs(
                Math.log(Math.max(1e-8, ratio))
            )
        ) * confinement;

    // Approximate circular supersonic-jet cell-length scaling.
    const spacing =
        1.306 * (2 * e.re) *
        Math.sqrt(
            Math.max(
                1,
                matchedMach * matchedMach - 1
            )
        );

    const airMix = Math.min(1, Math.sqrt(Pa / 101325));
    const length = 24;

    let radius;

    if (matchedRadius > e.re) {
        radius = e.re +
            (matchedRadius - e.re) *
            (
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
        Pa, Pc, Pe, Me, Te, ue,
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
            0
        ]
    };
}

export function plumeRadius(state, z) {
    const r0 = ENGINE.re;
    const target = state.matchedRadius;

    const r = target > r0
        ? r0 + (target - r0) * (
            1 - Math.exp(
                -z * state.spread /
                Math.max(.001, target - r0)
            )
        )
        : target + (r0 - target) *
            Math.exp(-z / (2 * r0));

    return r + state.shape[2] * z;
}

export function centreTemperature(state, z) {
    const a = Math.pow(
        ENGINE.re / plumeRadius(state, z),
        2
    );

    const cp =
        ENGINE.gamma * ENGINE.R /
        (ENGINE.gamma - 1);

    let T =
        state.Te *
        Math.pow(a, ENGINE.gamma - 1);

    const u = Math.sqrt(
        state.ue * state.ue +
        2 * cp * Math.max(0, state.Te - T)
    );

    const rhoRatio = a * state.ue / u;

    T = state.Te *
        Math.pow(rhoRatio, ENGINE.gamma - 1);

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

    // Finite luminous region; cold gas continues beyond it.
    s.length = Math.max(6 * ENGINE.re * Math.sqrt(s.Me * s.Me - 1), length);

    let bound = ENGINE.re;

    for (let z = 0; z <= s.length; z += .1) {
        bound = Math.max(bound, plumeRadius(s, z));
    }

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

export class RocketVisual {
    constructor(
        viewer,
        flight,
        visible = () => true
    ) {
        this.viewer = viewer;
        this.flight = flight;
        this.visible = visible;

        this.level = 0;
        this.last = performance.now();

        this.parts =
            viewer.scene.primitives.add(
                new PrimitiveCollection()
            );

        const support =
            MaterialAppearance
                .MaterialSupport.TEXTURED;

        const white = surface(
            "OrbitalHullPaint",
            [.73, .77, .79],
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
            [.8, .28, .075],
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
                vertexFormat:
                    support.vertexFormat
            }),
            Matrix4.fromTranslation(
                new V(x, y, z)
            )
        );

        const strut = (
            a,
            b,
            radius,
            material
        ) => {
            const d = V.subtract(a, b, new V());
            V.negate(d, d);

            const length = V.magnitude(d);
            V.normalize(d, d);

            const axis = V.cross(
                V.UNIT_Z,
                d,
                new V()
            );

            const q =
                V.magnitudeSquared(axis) < 1e-12
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
                            Math.max(
                                -1,
                                Math.min(1, d.z)
                            )
                        )
                    );

            put(
                material,
                new CylinderGeometry({
                    length,
                    topRadius: radius,
                    bottomRadius: radius,
                    slices: 12,
                    vertexFormat:
                        support.vertexFormat
                }),
                Matrix4.fromRotationTranslation(
                    Matrix3.fromQuaternion(q),
                    V.midpoint(a, b, new V())
                )
            );
        };

        // Main hull and smoothly tapered nose.
        put(
            white,
            lathe([
                [-3.72, .78],
                [-3.4, .89],
                [2.65, .89],
                [3.5, .83],
                [4.05, .77],
                [4.65, .64],
                [5.25, .49],
                [5.85, .32],
                [6.45, .15],
                [6.98, .001]
            ])
        );

        tube(-3.72, .34, .79, .74, dark);
        tube(-2.9, .14, .905, .905, metal);
        tube(.7, .10, .902, .902, metal);
        tube(2.55, .18, .905, .905, dark);
        tube(2.72, .055, .9, .9, copper);

        // Open engine bell and its darker inner lining.
        put(
            metal,
            lathe([
                [-4.50, .62],
                [-4.25, .51],
                [-3.98, .36],
                [-3.80, .25]
            ])
        );

        put(
            dark,
            lathe([
                [-4.499, .58],
                [-4.24, .47],
                [-3.98, .32],
                [-3.80, .22]
            ])
        );

        put(
            copper,
            lathe([
                [-4.50, .62],
                [-4.46, .625],
                [-4.425, .62]
            ])
        );

        for (let j = 0; j < 4; j++) {
            const angle = j * Math.PI / 2;
            const x = Math.cos(angle);
            const y = Math.sin(angle);

            // Landing pads match the existing contact points.
            tube(
                -5.44,
                .12,
                .29,
                .29,
                dark,
                x * 2.8,
                y * 2.8
            );

            strut(
                new V(x * .77, y * .77, -2.8),
                new V(x * 2.8, y * 2.8, -5.36),
                .065,
                metal
            );

            strut(
                new V(x * .73, y * .73, -3.65),
                new V(x * 2.0, y * 2.0, -4.45),
                .045,
                dark
            );

            // Raised equipment fairings.
            put(
                dark,
                new EllipsoidGeometry({
                    radii: new V(.12, .12, .85),
                    stackPartitions: 12,
                    slicePartitions: 16,
                    vertexFormat:
                        support.vertexFormat
                }),
                Matrix4.fromTranslation(
                    new V(
                        x * .85,
                        y * .85,
                        -1.8
                    )
                )
            );

            // Cockpit windows with dark surrounding trim.
            const q =
                Quaternion.fromAxisAngle(
                    V.UNIT_Z,
                    angle
                );

            const at = radius =>
                Matrix4.fromRotationTranslation(
                    Matrix3.fromQuaternion(q),
                    new V(
                        x * radius,
                        y * radius,
                        3.35
                    )
                );

            put(
                dark,
                new EllipsoidGeometry({
                    radii: new V(.105, .28, .39),
                    stackPartitions: 16,
                    slicePartitions: 24,
                    vertexFormat:
                        support.vertexFormat
                }),
                at(.82)
            );

            put(
                glass,
                new EllipsoidGeometry({
                    radii: new V(.055, .21, .30),
                    stackPartitions: 16,
                    slicePartitions: 24,
                    vertexFormat:
                        support.vertexFormat
                }),
                at(.9)
            );
        }

        // Batch parts by material.
        for (
            const [material, instances]
            of groups
        ) {
            this.parts.add(
                new Primitive({
                    geometryInstances: instances,
                    appearance:
                        new MaterialAppearance({
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

        this.plumeMaterial = new Material({
            translucent: true,
            fabric: {
                type: "OrbitalScientificKeroseneExhaust",
                uniforms: {
                    phase: 0,
                    power: 0,
                    metric: new V(1, 1, 1),
                    flowGas: {
                        x: .58, y: .07, z: 1700, w: 1.22
                    },
                    flowShape: {
                        x: .5, y: .1, z: .05, w: .1
                    },
                    flowChemistry: {
                        x: 355, y: 1, z: 4, w: 2648
                    },
                    flowOptics: {
                        x: 16, y: 5, z: 2400, w: 0
                    }
                },
                source: PLUME_MATERIAL
            }
        });



        this.plume =
            viewer.scene.primitives.add(
                new Primitive({
                    geometryInstances:
                        new GeometryInstance({
                            geometry:
                                BoxGeometry.fromDimensions({
                                    dimensions:
                                        new V(2, 2, 1),
                                    vertexFormat:
                                        support.vertexFormat
                                })
                        }),
                    appearance:
                        new MaterialAppearance({
                            material:
                                this.plumeMaterial,
                            materialSupport: support,
                            vertexShaderSource:
                                PLUME_VERTEX,
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
            );

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

        this.plume.show =
            this.parts.show && this.level > .003;

        if (!this.plume.show) return;

        const altitude =
            Ellipsoid.WGS84.cartesianToCartographic(
                f.position
            ).height;

        const state = visualExhaustState(
            this.level,
            altitude
        );

        // This supersonic-plume model requires choked flow.
        this.plume.show = state.choked;

        if (!this.plume.show) return;

        const length = state.length;
        const radius = state.radius;

        const local = Matrix4.fromTranslation(
            new V(0, 0, -4.5 - length / 2)
        );

        Matrix4.multiplyByScale(
            local,
            new V(radius, radius, length),
            local
        );

        Matrix4.multiply(
            root,
            local,
            this.plume.modelMatrix
        );

        const pack = a => ({
            x: a[0],
            y: a[1],
            z: a[2],
            w: a[3]
        });

        Object.assign(
            this.plumeMaterial.uniforms,
            {
                phase: (now / 1000) % 16,
                power: 1,
                metric: new V(radius, radius, length),
                flowGas: pack(state.gas),
                flowShape: pack(state.shape),
                flowChemistry: pack(state.chemistry),
                flowOptics: pack(state.optics)
            }
        );
    }

    destroy() {
        this.removeUpdate();

        this.viewer.scene.primitives.remove(
            this.parts
        );

        this.viewer.scene.primitives.remove(
            this.plume
        );
    }
}
