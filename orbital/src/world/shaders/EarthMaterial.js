import * as THREE from "three";

export function createEarthMaterial() {

    const loader = new THREE.TextureLoader();

    const day = loader.load("/textures/earth/day.jpg");
    const night = loader.load("/textures/earth/night.jpg");
    const normal = loader.load("/textures/earth/normal.png");

    day.colorSpace = THREE.SRGBColorSpace;
    night.colorSpace = THREE.SRGBColorSpace;

    return new THREE.ShaderMaterial({

        uniforms:{

            dayMap:{ value:day },

            nightMap:{ value:night },

            sunDirection:{
                value:new THREE.Vector3(1,0,0)
            }

        },

        vertexShader:`

    varying vec2 vUv;
    varying vec3 vWorldNormal;

    void main(){

        vUv = uv;

        vWorldNormal =
            normalize(
                mat3(modelMatrix) * normal
            );

        gl_Position =
            projectionMatrix *
            modelViewMatrix *
            vec4(position,1.0);

    }

`,

        fragmentShader:`

    uniform sampler2D dayMap;
    uniform sampler2D nightMap;

    uniform vec3 sunDirection;

    varying vec2 vUv;
    varying vec3 vWorldNormal;

    void main(){

        float light =
            max(
                dot(
                    normalize(vWorldNormal),
                    normalize(sunDirection)
                ),
                0.0
            );

        vec3 day =
            texture2D(dayMap,vUv).rgb;

        vec3 night =
            texture2D(nightMap,vUv).rgb;

        float nightAmount =
            smoothstep(
                0.05,
                0.0,
                light
            );

        vec3 color =
            mix(
                night,
                day,
                light
            );

        gl_FragColor =
            vec4(color,1.0);

    }

`

    });

}