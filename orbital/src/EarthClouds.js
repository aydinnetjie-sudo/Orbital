import {
    Cartesian2,
    Cartesian3 as V,
    Ellipsoid,
    Color,
    CloudCollection,
    Primitive,
    GeometryInstance,
    EllipsoidGeometry,
    Material,
    MaterialAppearance
} from "cesium";

const R = Ellipsoid.WGS84.maximumRadius;
const TAU = Math.PI * 2;
const CELL = Math.PI / 600;
const WIND = 2e-6;

const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, value));

const smooth = (minimum, maximum, value) => {
    const t = clamp(
        (value - minimum) / (maximum - minimum),
        0,
        1
    );

    return t * t * (3 - 2 * t);
};

const wrap = value =>
    ((value + Math.PI) % TAU + TAU) % TAU - Math.PI;

function random(x, y, seed) {
    let n =
        Math.imul(x, 374761393) ^
        Math.imul(y, 668265263) ^
        Math.imul(seed, 1442695041);

    n = Math.imul(n ^ (n >>> 13), 1274126177);

    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export class EarthClouds {
    constructor(
        viewer,
        universe,
        {
            count = 72,
            coverage = 0.58,
            baseAltitude = 12500
        } = {}
    ) {
        this.viewer = viewer;
        this.universe = universe;

        this.coverage = clamp(coverage, 0, 1);
        this.baseAltitude = baseAltitude;

        this.lastUpdate = -Infinity;
        this.destroyed = false;

        this.collection = viewer.scene.primitives.add(
            new CloudCollection({
                noiseDetail: 16,
                noiseOffset: new V(13, 7, 19)
            })
        );

        // Reuse a fixed pool instead of continually creating clouds.
        this.clouds = Array.from(
            { length: count },
            () => this.collection.add({
                show: false,

                position: V.fromDegrees(
                    86.83,
                    27.95,
                    baseAltitude
                ),

                scale: new Cartesian2(12000, 3500),
                maximumSize: new V(22, 11, 12),
                slice: 0.45,
                brightness: 0.95
            })
        );

        // A separate, lightweight layer supplies global cloud coverage
        // when Earth is viewed from high altitude or space.
        this.material = new Material({
            translucent: true,

            fabric: {
                type: "OrbitalEarthCloudLayer",

                uniforms: {
                    sunDirection: new V(1, 0, 0),
                    windAngle: 0.0,
                    opacity: 0.0,
                    coverage: this.coverage
                },

                source: `
                    float cloudHash(vec3 p)
                    {
                        p = fract(p * 0.1031);
                        p += dot(p, p.yzx + 33.33);
                        return fract((p.x + p.y) * p.z);
                    }

                    float cloudNoise(vec3 p)
                    {
                        vec3 i = floor(p);
                        vec3 f = fract(p);

                        f = f * f * (3.0 - 2.0 * f);

                        return mix(
                            mix(
                                mix(
                                    cloudHash(i),
                                    cloudHash(i + vec3(1,0,0)),
                                    f.x
                                ),
                                mix(
                                    cloudHash(i + vec3(0,1,0)),
                                    cloudHash(i + vec3(1,1,0)),
                                    f.x
                                ),
                                f.y
                            ),
                            mix(
                                mix(
                                    cloudHash(i + vec3(0,0,1)),
                                    cloudHash(i + vec3(1,0,1)),
                                    f.x
                                ),
                                mix(
                                    cloudHash(i + vec3(0,1,1)),
                                    cloudHash(i + vec3(1,1,1)),
                                    f.x
                                ),
                                f.y
                            ),
                            f.z
                        );
                    }

                    float cloudFbm(vec3 p)
                    {
                        float sum = 0.0;
                        float weight = 0.5;

                        for (int i = 0; i < 5; i++)
                        {
                            sum += weight * cloudNoise(p);
                            p = p * 2.03 + vec3(9.2, 4.1, 7.7);
                            weight *= 0.5;
                        }

                        return sum / 0.96875;
                    }

                    czm_material czm_getMaterial(
                        czm_materialInput inputData
                    )
                    {
                        czm_material material =
                            czm_getDefaultMaterial(inputData);

                        float lon =
                            inputData.st.x * 6.28318530718;

                        float lat =
                            (inputData.st.y - 0.5) *
                            3.14159265359;

                        vec3 normal = vec3(
                            cos(lat) * cos(lon),
                            cos(lat) * sin(lon),
                            sin(lat)
                        );

                        float c = cos(windAngle);
                        float s = sin(windAngle);

                        vec3 p = vec3(
                            c * normal.x + s * normal.y,
                            -s * normal.x + c * normal.y,
                            normal.z
                        );

                        vec3 warp = vec3(
                            cloudNoise(p * 4.0 + 11.0),
                            cloudNoise(p * 4.0 + 31.0),
                            cloudNoise(p * 4.0 + 61.0)
                        );

                        float weather =
                            cloudFbm(p * 9.0 + warp * 3.5);

                        float detail =
                            cloudFbm(p * 85.0 + warp * 2.0);

                        float bands = 0.5 + 0.5 * sin(
                            p.z * 14.0 +
                            cloudNoise(p * 5.0) * 8.0
                        );

                        float field =
                            weather * 0.85 +
                            bands * 0.15 +
                            (detail - 0.5) * 0.14;

                        float threshold =
                            mix(0.72, 0.30, coverage);

                        float density = smoothstep(
                            threshold,
                            threshold + 0.12,
                            field
                        ) * smoothstep(0.0, 0.05, coverage);

                        float sunlight = smoothstep(
                            -0.07,
                            0.16,
                            dot(normal, normalize(sunDirection))
                        );

                        vec3 shade = mix(
                            vec3(0.025, 0.035, 0.055),
                            vec3(1.15, 1.14, 1.11),
                            sunlight
                        );

                        material.diffuse =
                            shade * mix(0.72, 1.0, detail);

                        material.emission = vec3(0.0);

                        material.alpha =
                            density * opacity * 0.88;

                        return material;
                    }
                `
            }
        });

        const appearance = new MaterialAppearance({
            material: this.material,

            materialSupport:
                MaterialAppearance.MaterialSupport.TEXTURED,

            flat: true,
            translucent: true,
            closed: true
        });

        const radii = Ellipsoid.WGS84.radii;

        this.layer = viewer.scene.primitives.add(
            new Primitive({
                geometryInstances: new GeometryInstance({
                    geometry: new EllipsoidGeometry({
                        radii: new V(
                            radii.x + baseAltitude,
                            radii.y + baseAltitude,
                            radii.z + baseAltitude
                        ),

                        vertexFormat: appearance.vertexFormat,
                        stackPartitions: 96,
                        slicePartitions: 128
                    })
                }),

                appearance,
                asynchronous: false,
                allowPicking: false
            })
        );

        // Update after the flight camera has been positioned.
        this.removeListener =
            viewer.scene.preRender.addEventListener(
                () => this.update()
            );
    }

    update() {
        if (this.destroyed) return;

        const camera = this.viewer.camera.positionWC;

        const geo =
            Ellipsoid.WGS84.cartesianToCartographic(camera);

        if (!geo) return;

        const time = this.universe.world.time;
        const wind = ((time * WIND) % TAU + TAU) % TAU;

        const sun = V.normalize(
            this.universe.fixedPoint(
                this.universe.sun.position
            ),
            new V()
        );

        // Smooth transition between nearby clouds and orbital coverage.
        const farAlpha = smooth(20000, 90000, geo.height);

        this.material.uniforms.sunDirection = sun;
        this.material.uniforms.windAngle = wind;
        this.material.uniforms.opacity = farAlpha;

        this.layer.show = farAlpha > 0.001;

        const nearAlpha =
            1 - smooth(15000, 80000, geo.height);

        this.collection.show = nearAlpha > 0.001;

        if (
            !this.collection.show ||
            performance.now() - this.lastUpdate < 180
        ) {
            return;
        }

        this.lastUpdate = performance.now();

        const x = Math.floor(
            (wrap(geo.longitude - wind) + Math.PI) / CELL
        );

        const y = Math.floor(
            (geo.latitude + Math.PI / 2) / CELL
        );

        const cosLat = Math.max(
            0.15,
            Math.cos(geo.latitude)
        );

        const columns = Math.min(
            12,
            Math.ceil(
                110000 / (R * CELL * cosLat)
            ) + 1
        );

        const rows =
            Math.ceil(110000 / (R * CELL)) + 1;

        const candidates = [];

        for (let dy = -rows; dy <= rows; dy++) {
            for (
                let dx = -columns;
                dx <= columns;
                dx++
            ) {
                const iy = y + dy;

                if (iy < 0 || iy >= 600) continue;

                const ix =
                    ((x + dx) % 1200 + 1200) % 1200;

                if (
                    random(ix, iy, 1) > this.coverage
                ) {
                    continue;
                }

                const lon = wrap(
                    (
                        ix + 0.5 +
                        (random(ix, iy, 2) - 0.5) * 0.7
                    ) * CELL -
                    Math.PI +
                    wind
                );

                const lat =
                    (
                        iy + 0.5 +
                        (random(ix, iy, 3) - 0.5) * 0.7
                    ) * CELL -
                    Math.PI / 2;

                const distance = Math.hypot(
                    wrap(lon - geo.longitude) *
                        R * cosLat,

                    (lat - geo.latitude) * R
                );

                if (distance > 110000) continue;

                candidates.push({
                    ix,
                    iy,
                    lon,
                    lat,
                    distance
                });
            }
        }

        candidates.sort(
            (a, b) => a.distance - b.distance
        );

        let index = 0;

        for (const tile of candidates) {
            const {
                ix,
                iy,
                lon,
                lat,
                distance
            } = tile;

            const width =
                10000 + random(ix, iy, 4) * 9000;

            const height =
                2600 + random(ix, iy, 5) * 1800;

            // Overlapping puffs give each formation more depth.
            for (
                let puff = 0;
                puff < 2 && index < this.clouds.length;
                puff++
            ) {
                const cloud = this.clouds[index++];

                const localLon = wrap(
                    lon +
                    puff * width * 0.28 /
                    (
                        R *
                        Math.max(0.15, Math.cos(lat))
                    )
                );

                const localLat = clamp(
                    lat + puff * width * 0.07 / R,
                    -Math.PI / 2 + 0.0001,
                    Math.PI / 2 - 0.0001
                );

                const altitude =
                    this.baseAltitude +
                    random(ix, iy, 6) * 1800 +
                    puff * 400;

                const position = V.fromRadians(
                    localLon,
                    localLat,
                    altitude
                );

                const normal =
                    Ellipsoid.WGS84.geodeticSurfaceNormal(
                        position,
                        new V()
                    );

                const sunHeight = V.dot(normal, sun);

                const daylight = smooth(
                    -0.08,
                    0.18,
                    sunHeight
                );

                const sunset =
                    (
                        1 -
                        smooth(0.0, 0.3, sunHeight)
                    ) * daylight;

                const distanceFade =
                    1 -
                    smooth(75000, 110000, distance);

                const insideFade = smooth(
                    width * 0.1,
                    width * 0.4,
                    V.distance(position, camera)
                );

                cloud.position = position;

                cloud.scale = new Cartesian2(
                    width * (puff ? 0.7 : 1),
                    height * (puff ? 0.85 : 1)
                );

                cloud.maximumSize = new V(
                    20 + random(ix, iy, 7) * 8,
                    11,
                    10 + random(ix, iy, 8) * 5
                );

                cloud.slice =
                    0.34 +
                    random(ix, iy, 9 + puff) * 0.2;

                cloud.brightness =
                    0.87 +
                    random(ix, iy, 12 + puff) * 0.12;

                cloud.color = new Color(
                    0.035 + daylight * 0.965,

                    0.045 +
                        daylight * 0.955 -
                        sunset * 0.12,

                    0.075 +
                        daylight * 0.925 -
                        sunset * 0.25,

                    nearAlpha *
                        distanceFade *
                        insideFade *
                        0.92
                );

                cloud.show =
                    cloud.color.alpha > 0.005;
            }

            if (index >= this.clouds.length) break;
        }

        for (
            ;
            index < this.clouds.length;
            index++
        ) {
            this.clouds[index].show = false;
        }
    }

    destroy() {
        if (this.destroyed) return;

        this.destroyed = true;
        this.removeListener();

        this.viewer.scene.primitives.remove(
            this.collection
        );

        this.viewer.scene.primitives.remove(
            this.layer
        );

        if (!this.material.isDestroyed()) {
            this.material.destroy();
        }
    }
}