import {
    Cartesian3 as V,
    Matrix3,
    Matrix4,
    DirectionalLight,
    buildModuleUrl,
    DynamicAtmosphereLightingType,
    Primitive,
    GeometryInstance,
    EllipsoidGeometry,
    Material,
    MaterialAppearance
} from "cesium";

import { EarthClouds } from "./EarthClouds.js";

export class PhysicalSky {
    constructor(viewer, universe) {
        this.viewer = viewer;
        this.universe = universe;

        if (viewer.scene.sun) {
            viewer.scene.sun.show = false;
        }

        if (viewer.scene.moon) {
            viewer.scene.moon.show = false;
        }

        viewer.camera.frustum.far = 1e13;

        viewer.scene.light = new DirectionalLight({
            direction: new V(1, 0, 0),
            intensity: 4.0
        });

        viewer.scene.globe.dynamicAtmosphereLighting = true;

        viewer.scene.globe.dynamicAtmosphereLightingFromSun =
            false;

        viewer.scene.atmosphere.dynamicLighting =
            DynamicAtmosphereLightingType.SCENE_LIGHT;

        this.sun = this.makeSphere(
            universe.sun.radius,
            new Material({
                translucent: false,
                fabric: {
                    type: "OrbitalSunSurface",
                    components: {
                        diffuse: "vec3(0.0)",
                        emission: "vec3(12.0, 10.0, 6.0)",
                        alpha: "1.0"
                    }
                }
            }),
            false
        );

        this.corona = this.makeSphere(
            universe.sun.radius * 1.08,
            new Material({
                translucent: true,
                fabric: {
                    type: "OrbitalSunCorona",
                    source: `
                        czm_material czm_getMaterial(
                            czm_materialInput inputData
                        )
                        {
                            czm_material material =
                                czm_getDefaultMaterial(inputData);

                            float facing = abs(dot(
                                normalize(inputData.normalEC),
                                normalize(inputData.positionToEyeEC)
                            ));

                            material.diffuse = vec3(0.0);
                            material.emission =
                                vec3(3.0, 1.8, 0.6);

                            material.alpha =
                                0.22 * pow(1.0 - facing, 2.0);

                            return material;
                        }
                    `
                }
            }),
            true
        );

        // A usable surface even if the detailed texture fails.
        const fallback = document.createElement("canvas");
        fallback.width = 2;
        fallback.height = 2;

        const context = fallback.getContext("2d");
        context.fillStyle = "#999999";
        context.fillRect(0, 0, 2, 2);

        this.moonMaterial = new Material({
            translucent: false,
            fabric: {
                type: "OrbitalMoonReflectedLightUV",

                uniforms: {
                    image: fallback,
                    hasTexture: 0.0,
                    sunDirectionMC: new V(1, 0, 0),
                    brightness: 2.5
                },

                source: `
                    czm_material czm_getMaterial(
                        czm_materialInput inputData
                    )
                    {
                        czm_material material =
                            czm_getDefaultMaterial(inputData);

                        // Reconstruct the surface normal directly
                        // in the Moon's local coordinates.
                        float longitude =
                            inputData.st.x * 6.28318530718;

                        float latitude =
                            (inputData.st.y - 0.5) *
                            3.14159265359;

                        vec3 normalMC = vec3(
                            cos(latitude) * cos(longitude),
                            cos(latitude) * sin(longitude),
                            sin(latitude)
                        );

                        // Both vectors are in the same coordinates.
                        float illumination = max(
                            dot(
                                normalMC,
                                normalize(sunDirectionMC)
                            ),
                            0.0
                        );

                        vec3 surfaceColor = mix(
                            vec3(0.6),
                            texture(image, inputData.st).rgb,
                            hasTexture
                        );

                        material.diffuse =
                            surfaceColor *
                            illumination *
                            brightness;

                        material.emission = vec3(0.0);
                        material.alpha = 1.0;

                        return material;
                    }
                `
            }
        });

        this.moon = this.makeSphere(
            universe.moon.radius,
            this.moonMaterial,
            false,
            MaterialAppearance.MaterialSupport.TEXTURED
        );

        this.moonTexture = new Image();

        this.moonTexture.onload = () => {
            this.moonMaterial.uniforms.image =
                this.moonTexture;

            this.moonMaterial.uniforms.hasTexture = 1.0;
        };

        this.moonTexture.onerror = () => {
            console.warn(
                "Moon texture unavailable; " +
                "using a grey sunlit sphere."
            );
        };

      this.moonTexture.src = buildModuleUrl(
    "Assets/Textures/moonSmall.jpg"
);

this.clouds = new EarthClouds(viewer, universe, {
    count: 72,
    coverage: 0.58,
    baseAltitude: 12500
});

this.update();
    }

    makeSphere(
        radius,
        material,
        translucent,
        support = MaterialAppearance.MaterialSupport.BASIC
    ) {
        const appearance = new MaterialAppearance({
            material,
            materialSupport: support,

            // Brightness is calculated by our materials.
            flat: true,

            closed: true,
            translucent
        });

        return this.viewer.scene.primitives.add(
            new Primitive({
                geometryInstances: new GeometryInstance({
                    geometry: new EllipsoidGeometry({
                        radii: new V(radius, radius, radius),
                        stackPartitions: 64,
                        slicePartitions: 64,
                        vertexFormat: appearance.vertexFormat
                    })
                }),

                appearance,
                asynchronous: false,
                allowPicking: false
            })
        );
    }

    update() {
        const universe = this.universe;

        const sunPosition = universe.fixedPoint(
            universe.sun.position
        );

        Matrix4.fromTranslation(
            sunPosition,
            this.sun.modelMatrix
        );

        Matrix4.fromTranslation(
            sunPosition,
            this.corona.modelMatrix
        );

        const moonPosition = universe.fixedPoint(
            universe.moon.position
        );

        const worldToFixed = Matrix3.transpose(
            universe.earthRotation(),
            new Matrix3()
        );

        const moonRotation = Matrix3.multiply(
            worldToFixed,
            universe.bodyRotation(universe.moon),
            new Matrix3()
        );

        Matrix4.fromRotationTranslation(
            moonRotation,
            moonPosition,
            this.moon.modelMatrix
        );

        const toSun = V.subtract(
            sunPosition,
            moonPosition,
            new V()
        );

        const distance = V.magnitude(toSun);
        const direction = V.normalize(toSun, new V());

        const localDirection = Matrix3.multiplyByVector(
            Matrix3.transpose(
                moonRotation,
                new Matrix3()
            ),
            direction,
            new V()
        );

        this.moonMaterial.uniforms.sunDirectionMC =
            localDirection;

        // Display exposure, with inverse-square sunlight falloff.
        this.moonMaterial.uniforms.brightness =
            2.5 * (149597870700 / distance) ** 2;

        this.viewer.scene.light.direction = V.normalize(
            V.negate(sunPosition, new V()),
            new V()
        );
    }
}