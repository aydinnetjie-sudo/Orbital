import * as THREE from "three";

import { CelestialBody } from "./CelestialBody.js";
import { orbitalVelocity } from "../../simulation/Orbit.js";


export class Moon extends CelestialBody {

    constructor() {

        const earthDistance =
            384400000;


        super({

            name: "Moon",

            radius: 1737400,

            mass: 7.342e22,


            // Earth position + Moon distance

            position: new THREE.Vector3(

                149597870700 + earthDistance,

                0,

                0

            ),


            // Earth orbital velocity +
            // Moon orbital velocity

            velocity: new THREE.Vector3(

                0,

                0,

                29780 +
                orbitalVelocity(
                    5.9722e24,
                    earthDistance
                )

            ),


            // Tidally locked rotation

            rotationSpeed:
                2.6617e-6

        });


        // ---------- Graphics ----------

        const renderRadius =
            this.radius / 1000;


        const geometry =
            new THREE.SphereGeometry(

                renderRadius,

                64,

                64

            );


        const material =
            new THREE.MeshStandardMaterial({

                color: 0x888888

            });


        this.mesh =
            new THREE.Mesh(

                geometry,

                material

            );


        this.group.add(
            this.mesh
        );


    }

}