import * as THREE from "three";

export class Atmosphere {

    constructor(radius) {

        const geometry = new THREE.SphereGeometry(
            radius * 1.012,
            128,
            128
        );

        const material = new THREE.ShaderMaterial({

            uniforms: {

                sunDirection: {
                    value: new THREE.Vector3(-1, 0, 0)
                },

                atmosphereColor: {
                    value: new THREE.Color(0x4aa9ff)
                }

            },

            vertexShader: `

                varying vec3 vWorldNormal;
                varying vec3 vWorldPosition;

                void main() {

                    vec4 worldPosition =
                        modelMatrix *
                        vec4(position, 1.0);

                    vWorldPosition = worldPosition.xyz;

                    vWorldNormal =
                        normalize(
                            mat3(modelMatrix) * normal
                        );

                    gl_Position =
                        projectionMatrix *
                        viewMatrix *
                        worldPosition;

                }

            `,

            fragmentShader: `

                uniform vec3 sunDirection;
                uniform vec3 atmosphereColor;

                varying vec3 vWorldNormal;
                varying vec3 vWorldPosition;

                void main() {

                    vec3 viewDirection =
                        normalize(
                            cameraPosition -
                            vWorldPosition
                        );

                    float fresnel = pow(

                        1.0 -

                        max(
                            dot(
                                normalize(vWorldNormal),
                                viewDirection
                            ),
                            0.0
                        ),

                        5.0

                    );

                    float sunlight = max(

                        dot(

                            normalize(vWorldNormal),
                            normalize(sunDirection)

                        ),

                        0.0

                    );

                    float intensity =

                        fresnel *
                        sunlight *
                        0.35;

                    if(intensity < 0.01)
                        discard;

                    gl_FragColor = vec4(

                        atmosphereColor,
                        intensity

                    );

                }

            `,

            transparent: true,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false

        });

        this.mesh = new THREE.Mesh(
            geometry,
            material
        );

    }

    update(sunDirection) {

        this.mesh.material.uniforms.sunDirection.value
            .copy(sunDirection)
            .normalize();

    }

}