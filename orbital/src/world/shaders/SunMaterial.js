import * as THREE from "three";

export function createSunMaterial() {

    return new THREE.ShaderMaterial({

        uniforms: {

            time: { value: 0 }

        },

        vertexShader: `

            varying vec3 vNormal;
            varying vec3 vViewDirection;

            void main() {

                vec4 worldPosition =
                    modelMatrix *
                    vec4(position, 1.0);

                vNormal =
                    normalize(
                        mat3(modelMatrix) *
                        normal
                    );

                vViewDirection =
                    normalize(
                        cameraPosition -
                        worldPosition.xyz
                    );

                gl_Position =
                    projectionMatrix *
                    modelViewMatrix *
                    vec4(position, 1.0);

            }

        `,

        fragmentShader: `

            uniform float time;

            varying vec3 vNormal;
            varying vec3 vViewDirection;


            // --------------------------------
            // Simple procedural noise
            // --------------------------------

            float hash(vec2 p) {

                return fract(
                    sin(
                        dot(
                            p,
                            vec2(127.1, 311.7)
                        )
                    )
                    * 43758.5453
                );

            }


            float noise(vec2 p) {

                vec2 i = floor(p);
                vec2 f = fract(p);

                f =
                    f * f *
                    (3.0 - 2.0 * f);

                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));

                return mix(
                    mix(a, b, f.x),
                    mix(c, d, f.x),
                    f.y
                );

            }


            void main() {

                // --------------------------------
                // Surface angle
                // --------------------------------

                float facing =
                    max(
                        dot(
                            normalize(vNormal),
                            normalize(vViewDirection)
                        ),
                        0.0
                    );


                // --------------------------------
                // Solar surface turbulence
                // --------------------------------

                vec2 uv =
                    vNormal.xy * 8.0;

                float n1 =
                    noise(
                        uv +
                        time * 0.015
                    );

                float n2 =
                    noise(
                        uv * 3.0 -
                        time * 0.025
                    );

                float turbulence =
                    mix(
                        n1,
                        n2,
                        0.35
                    );


                // --------------------------------
                // Hot surface colors
                // --------------------------------

                vec3 deepOrange =
                    vec3(
                        1.0,
                        0.18,
                        0.015
                    );

                vec3 orange =
                    vec3(
                        1.0,
                        0.48,
                        0.04
                    );

                vec3 yellow =
                    vec3(
                        1.0,
                        0.78,
                        0.20
                    );

                vec3 whiteHot =
                    vec3(
                        1.0,
                        0.98,
                        0.82
                    );


                // --------------------------------
                // Build hot surface
                // --------------------------------

                vec3 color =
                    mix(
                        deepOrange,
                        orange,
                        turbulence
                    );

                color =
                    mix(
                        color,
                        yellow,
                        turbulence * turbulence
                    );


                // Make the center of the visible disk
                // much hotter and brighter.

                float hotCenter =
                    pow(
                        facing,
                        1.5
                    );

                color =
                    mix(
                        color,
                        whiteHot,
                        hotCenter * 0.75
                    );


                // --------------------------------
                // Brightness
                // --------------------------------

                // HDR value.
                // This is what allows the bloom effect
                // to actually make the Sun glow.

                float brightness =
                    3.0 +
                    hotCenter * 8.0;


                color *= brightness;


                // --------------------------------
                // Final output
                // --------------------------------

                gl_FragColor =
                    vec4(
                        color,
                        1.0
                    );

            }

        `

    });

}