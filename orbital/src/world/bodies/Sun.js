import { createSunMaterial } from "../shaders/SunMaterial.js";
import * as THREE from "three";
import { CelestialBody } from "./CelestialBody.js";

export class Sun extends CelestialBody {

    constructor() {

        super({

            name: "Sun",

            // ---------- Physics (SI Units) ----------

            radius: 696340000,
            mass: 1.9885e30,

            position: new THREE.Vector3(
                0,
                0,
                0
            ),

            velocity: new THREE.Vector3(
                0,
                0,
                0
            ),

            rotationSpeed: 2.9e-6

        });

        // ---------- Graphics ----------

        const renderRadius = this.radius / 1000;

        const geometry = new THREE.SphereGeometry(
            renderRadius,
            64,
            64
        );

        const material = createSunMaterial();

        this.mesh = new THREE.Mesh(
            geometry,
            material
        );

        this.material = material;

        this.group.add(
            this.mesh
        );

        // ---------- Corona ----------

        const coronaGeometry = new THREE.SphereGeometry(
            renderRadius * 1.08,
            64,
            64
        );

        const coronaMaterial = new THREE.MeshBasicMaterial({

            color: 0xffddaa,

            transparent: true,

            opacity: 0.18,

            blending: THREE.AdditiveBlending,

            side: THREE.BackSide,

            depthWrite: false

        });

        this.corona = new THREE.Mesh(
            coronaGeometry,
            coronaMaterial
        );

        this.group.add(
            this.corona
        );

        // ---------- Sunlight ----------

        this.light = new THREE.DirectionalLight(
            0xffffff,
            5
        );

        this.light.position.set(
            0,
            0,
            0
        );

    }

    update(deltaTime) {

        super.update(deltaTime);

        this.material.uniforms.time.value += deltaTime;

        this.corona.rotation.y +=
            deltaTime * 0.00002;

    }

}