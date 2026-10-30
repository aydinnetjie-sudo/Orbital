import * as THREE from "three";

export class Clouds {

    constructor(radius) {

        const geometry = new THREE.SphereGeometry(
            radius * 1.003,
            128,
            128
        );

        const loader = new THREE.TextureLoader();

        const texture = loader.load(
            "/textures/earth/clouds.jpg"
        );

        texture.colorSpace =
            THREE.SRGBColorSpace;

       const material = new THREE.MeshPhongMaterial({

    map: texture,

    transparent: true,

    opacity: 0.45,

    depthWrite: false,

    side: THREE.FrontSide,

    shininess: 8

});

        this.mesh = new THREE.Mesh(
            geometry,
            material
        );

        // Clouds rotate slightly faster than Earth
        this.rotationSpeed = 1.1e-5;

    }

    update(deltaTime){

        this.mesh.rotation.y +=
            this.rotationSpeed * deltaTime;

    }

}