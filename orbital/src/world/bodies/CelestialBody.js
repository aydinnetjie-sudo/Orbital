import * as THREE from "three";

export class CelestialBody {

    constructor({

        name,
        radius,
        mass,

        position = new THREE.Vector3(),
        velocity = new THREE.Vector3(),

        rotationSpeed = 0

    }) {


        // ---------- Identity ----------

        this.name = name;


        // ---------- Physics (SI Units) ----------

        this.radius = radius; // meters
        this.mass = mass;     // kilograms

        this.position =
            position.clone();

        this.velocity =
            velocity.clone();

        this.acceleration =
            new THREE.Vector3();


        // ---------- Rotation ----------

        this.rotationSpeed =
            rotationSpeed;


        this.rotation =
            new THREE.Euler();


        // ---------- Rendering ----------

        this.group =
            new THREE.Group();

    }


    applyForce(force) {

        // F = ma

        this.acceleration.add(

            force.clone()
            .divideScalar(this.mass)

        );

    }


    update(deltaTime) {


        // ---------- Physics ----------

        this.velocity.addScaledVector(
    this.acceleration,
    deltaTime
);


this.position.addScaledVector(
    this.velocity,
    deltaTime
);


        // ---------- Rotation ----------

        this.rotation.y +=

            this.rotationSpeed *
            deltaTime;


        this.group.rotation.copy(
            this.rotation
        );


        // ---------- Reset ----------

        this.acceleration.set(
            0,
            0,
            0
        );

    }


}