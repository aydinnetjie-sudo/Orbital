import * as THREE from "three";

import { CelestialBody } from "./CelestialBody.js";

import { Clouds } from "../Clouds.js";
import { Atmosphere } from "../atmosphere/Atmosphere.js";
import { createEarthMaterial } from "../shaders/EarthMaterial.js";

export class Earth extends CelestialBody {

    constructor() {

        super({

            name: "Earth",

            // ---------- Physics (SI Units) ----------

            radius: 6371000,
            mass: 5.9722e26,

            // 1 AU from Sun

            position: new THREE.Vector3(
                149597870700,
                0,
                0
            ),

            // Circular orbital velocity

            velocity: new THREE.Vector3(
                0,
                0,
                29780
            ),

            // Earth's sidereal rotation

            rotationSpeed: 7.2921159e-5

        });


        // ---------- Surface ----------

        const renderRadius = this.radius / 1000;

        const geometry = new THREE.SphereGeometry(
            renderRadius,
            64,
            64
        );

        const material = createEarthMaterial();

        this.mesh = new THREE.Mesh(
            geometry,
            material
        );

        this.material = material;

        this.group.add(this.mesh);


        // ---------- Atmosphere ----------

        this.atmosphere = new Atmosphere(
            renderRadius
        );

        this.group.add(
            this.atmosphere.mesh
        );


        // ---------- Clouds ----------

        this.clouds = new Clouds(
            renderRadius
        );

        this.group.add(
            this.clouds.mesh
        );


        // ---------- Terrain ----------

       // this.terrain = new TerrainManager(this);

    }


    update(deltaTime) {

    super.update(deltaTime);

    if (this.clouds) {

        this.clouds.update(deltaTime);

    }

}

}