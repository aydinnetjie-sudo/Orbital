
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

float exhaustHash(vec3 p) {
    p = fract(
        p * 0.3183099 + vec3(.13, .37, .71)
    );

    p *= 17.0;

    return fract(
        p.x * p.y * p.z *
        (p.x + p.y + p.z)
    );
}

float exhaustNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(
            mix(
                exhaustHash(i),
                exhaustHash(i + vec3(1,0,0)),
                f.x
            ),
            mix(
                exhaustHash(i + vec3(0,1,0)),
                exhaustHash(i + vec3(1,1,0)),
                f.x
            ),
            f.y
        ),
        mix(
            mix(
                exhaustHash(i + vec3(0,0,1)),
                exhaustHash(i + vec3(1,0,1)),
                f.x
            ),
            mix(
                exhaustHash(i + vec3(0,1,1)),
                exhaustHash(i + vec3(1,1,1)),
                f.x
            ),
            f.y
        ),
        f.z
    );
}

czm_material czm_getMaterial(
    czm_materialInput inputData
) {
    czm_material material =
        czm_getDefaultMaterial(inputData);

    vec3 origin = (
        czm_inverseModelView *
        vec4(0, 0, 0, 1)
    ).xyz;

    vec3 ray = normalize(v_local - origin);

    vec3 safeRay = vec3(
        ray.x < 0.0
            ? min(ray.x, -.00001)
            : max(ray.x, .00001),
        ray.y < 0.0
            ? min(ray.y, -.00001)
            : max(ray.y, .00001),
        ray.z < 0.0
            ? min(ray.z, -.00001)
            : max(ray.z, .00001)
    );

    vec3 t0 = (
        vec3(-1, -1, -.5) - origin
    ) / safeRay;

    vec3 t1 = (
        vec3(1, 1, .5) - origin
    ) / safeRay;

    vec3 nearT = min(t0, t1);
    vec3 farT = max(t0, t1);

    float entry = max(
        0.0,
        max(nearT.x, max(nearT.y, nearT.z))
    );

    float end = min(
        farT.x,
        min(farT.y, farT.z)
    );

    if (end <= entry) discard;

    float stepLength = (end - entry) / 32.0;
    float optical = 0.0;
    vec3 light = vec3(0.0);

    for (int i = 0; i < 32; i++) {
        vec3 p = origin + ray * (
            entry +
            (float(i) + .5) * stepLength
        );

        float along = clamp(
            .5 - p.z,
            0.0,
            1.0
        );

        float width = mix(
            rootRadius,
            .94,
            pow(along, .8)
        );

        float n = exhaustNoise(
            vec3(
                p.xy * 8.0,
                along * 15.0 - phase * 6.0
            )
        );

        float ripple = sin(
            along * 75.0 -
            phase * 18.0 +
            p.x * 9.0
        ) * .025;

        float radial = length(p.xy) / (
            width * (.84 + .20 * n) +
            ripple +
            .001
        );

        float edge =
            1.0 - smoothstep(.54, 1.05, radial);

        float tail =
            1.0 - smoothstep(.60, 1.0, along);

        float start =
            smoothstep(0.0, .025, along);

        float turbulence = mix(.58, 1.0, n);

        float coreWidth = mix(
            rootRadius * .62,
            .10,
            pow(along, .65)
        );

        float coreRadius =
            length(p.xy) / max(.025, coreWidth);

        float core =
            exp(-coreRadius * coreRadius * 3.0) *
            (1.0 - smoothstep(.32, .88, along));

        float diamonds =
            pow(
                max(0.0, cos(along * 66.0)),
                12.0
            ) *
            exp(-radial * radial * 20.0) *
            exp(-along * 2.8) *
            air;

        float density = start * (
            edge *
            tail *
            turbulence *
            mix(.045, .40, air) +
            core * .8
        );

        vec3 cool = mix(
            vec3(.07, .30, 2.0),
            vec3(.12, .32, 1.8),
            1.0 - air
        );

        float warm =
            pow(
                clamp(radial, 0.0, 1.0),
                2.5
            ) *
            smoothstep(.20, .70, along) *
            air;

        vec3 color = mix(
            cool,
            vec3(2.0, .35, .025),
            warm
        );

        color +=
            core * vec3(3.2, 3.8, 4.2) +
            diamonds * vec3(7.0, 6.8, 6.5);

        float amount =
            density *
            stepLength *
            length(ray * metric) *
            1.8;

        light += color * amount;
        optical += amount;
    }

    float alpha =
        (1.0 - exp(-optical * 1.7)) *
        power;

    if (alpha < .004) discard;

    material.diffuse = vec3(0.0);

    material.emission =
        light / max(optical, .001) * 3.0;

    material.alpha = clamp(
        alpha,
        0.0,
        .96
    );

    return material;
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

        const length =
            (9 + 19 * (1 - air)) *
            (.35 + .65 * Math.sqrt(this.level));

        const radius =
            .52 +
            length * (
                .035 + .17 * (1 - air)
            );

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
