
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

float jetHash(vec3 p) {
    p = fract(p*.3183099 + vec3(.13,.37,.71));
    p *= 17.0;
    return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}

float jetNoise(vec3 p) {
    vec3 i=floor(p), f=fract(p);
    f=f*f*(3.0-2.0*f);

    return mix(
        mix(
            mix(jetHash(i),jetHash(i+vec3(1,0,0)),f.x),
            mix(jetHash(i+vec3(0,1,0)),jetHash(i+vec3(1,1,0)),f.x),
            f.y
        ),
        mix(
            mix(jetHash(i+vec3(0,0,1)),jetHash(i+vec3(1,0,1)),f.x),
            mix(jetHash(i+vec3(0,1,1)),jetHash(i+vec3(1,1,1)),f.x),
            f.y
        ),
        f.z
    );
}

czm_material czm_getMaterial(czm_materialInput inputData) {
    czm_material m=czm_getDefaultMaterial(inputData);

    vec3 eye=(czm_inverseModelView*vec4(0,0,0,1)).xyz;
    vec3 ray=normalize(v_local-eye);

    vec3 safeRay=vec3(
        ray.x<0.0 ? min(ray.x,-.00001) : max(ray.x,.00001),
        ray.y<0.0 ? min(ray.y,-.00001) : max(ray.y,.00001),
        ray.z<0.0 ? min(ray.z,-.00001) : max(ray.z,.00001)
    );

    vec3 a=(vec3(-1,-1,-.5)-eye)/safeRay;
    vec3 b=(vec3(1,1,.5)-eye)/safeRay;
    vec3 lo=min(a,b), hi=max(a,b);

    float begin=max(0.0,max(lo.x,max(lo.y,lo.z)));
    float end=min(hi.x,min(hi.y,hi.z));

    if(end<=begin) discard;

    float stepSize=(end-begin)/40.0;
    float ds=stepSize*length(ray*metric);
    float transmission=1.0;

    vec3 radiance=vec3(0.0);

    for(int i=0;i<40;i++) {
        vec3 p=eye+ray*(begin+(float(i)+.5)*stepSize);

        float along=clamp(.5-p.z,0.0,1.0);
        float z=along*metric.z;

        vec2 xy=p.xy*metric.xy;
        float r=length(xy);

        float n=jetNoise(
            vec3(xy*11.0,z*3.0-phase*25.0)
        );

        float fine=
            sin(z*24.0-phase*75.0+xy.x*16.0)*
            sin(z*17.0-phase*58.0+xy.y*19.0);

        float width=
            (.45+z*(.012+.06*(1.0-air)))*
            (1.0-.30*smoothstep(.62,1.0,along));

        width*=.92+.10*n+.025*fine;

        float radial=r/max(width,.008);
        float edge=1.0-smoothstep(.78,1.0,radial);
        float sheath=exp(-radial*radial*2.2)*edge;

        float coreWidth=.12+.022*z;

        float core=
            exp(-pow(r/coreWidth,2.0)*2.0)*
            exp(-z*.44);

        float cell=
            1.0-abs(
                fract(z/(.85+.35*(1.0-air)))*2.0-1.0
            );

        float diamondWidth=width*(.10+.70*cell);

        float diamond=
            exp(-pow(r/max(.025,diamondWidth),4.0)*3.0)*
            pow(cell,.8)*
            exp(-z*.30)*
            air;

        float endFade=1.0-smoothstep(.32,1.0,along);
        float ignition=smoothstep(0.0,.06,z);

        float streak=.35+.65*pow(
            .5+.5*sin(
                atan(xy.y,xy.x+.00001)*7.0+
                z*3.0-phase*16.0
            ),
            2.0
        );

        float density=(
            mix(.035,.22,air)*
            sheath*(.35+.65*n)*streak+
            1.8*core+
            .70*diamond
        )*endFade*ignition;

        float hot=clamp(
            core*2.0+diamond*1.2,
            0.0,
            1.0
        );

        float warm=smoothstep(.7,2.8,z)*air;

        vec3 blue=vec3(.10,.52,3.6);
        vec3 orange=vec3(5.0,.90,.035);

        vec3 color=mix(blue,orange,warm);

        color=mix(
            color,
            vec3(6.0,6.5,7.0),
            hot
        );

        float opacity=1.0-exp(-density*ds*2.5);

        radiance+=transmission*opacity*color;
        transmission*=1.0-opacity;
    }

    float alpha=(1.0-transmission)*power;

    if(alpha<.003) discard;

    m.diffuse=vec3(0.0);
    m.emission=radiance/max(1.0-transmission,.001);
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
                type: "OrbitalRaymarchedExhaust",
                uniforms: {
                    phase: 0,
                    rootRadius: .1,
                    air: 1,
                    power: 0,
                    metric: new V(1, 1, 1)
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
            Math.min(
                .1,
                (now - this.last) / 1000
            )
        );

        this.last = now;

        const target =
            !f.crashed && !f.landed
                ? Math.max(
                    0,
                    Math.min(1, f.throttle)
                )
                : 0;

        // Smooth ignition, throttle changes and shutdown.
        this.level +=
            (target - this.level) *
            (1 - Math.exp(-dt * 18));

        const show = this.visible();

        const root =
            Matrix4.fromRotationTranslation(
                Matrix3.fromQuaternion(f.attitude),
                f.position
            );

        for (
            let i = 0;
            i < this.parts.length;
            i++
        ) {
            Matrix4.clone(
                root,
                this.parts.get(i).modelMatrix
            );
        }

        this.parts.show = show;

        this.plume.show =
            show && this.level > .003;

        if (!this.plume.show) return;

        const altitude =
            Ellipsoid.WGS84
                .cartesianToCartographic(
                    f.position
                ).height;

        const air = Math.exp(
            -Math.max(0, altitude) / 8500
        );

        const length = (7 + 11 * (1 - air)) * (.25 + .75 * Math.sqrt(this.level));
        const radius = .52 + length * (.012 + .06 * (1 - air));


        const local =
            Matrix4.fromTranslation(
                new V(
                    0,
                    0,
                    -4.5 - length / 2
                )
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

        Object.assign(
            this.plumeMaterial.uniforms,
            {
                phase: now / 1000,
                rootRadius: .52 / radius,
                air,
                power: Math.sqrt(this.level),
                metric:
                    new V(radius, radius, length)
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
