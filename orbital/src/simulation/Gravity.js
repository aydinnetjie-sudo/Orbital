import * as THREE from "three";

export class Gravity {

    constructor() {

        // Universal Gravitational Constant (m³ kg⁻¹ s⁻²)
        this.G = 6.67430e-11;

        // Reused vectors to avoid garbage collection
        this.offset = new THREE.Vector3();
        this.force = new THREE.Vector3();

    }

    update(bodies) {

        const bodyCount = bodies.length;

        for(let i = 0; i < bodyCount - 1; i++) {

            const a = bodies[i];

            for(let j = i + 1; j < bodyCount; j++) {

                const b = bodies[j];

                this.offset.subVectors(
                    b.position,
                    a.position
                );

                const distanceSquared =
                    this.offset.lengthSq();

                if(distanceSquared === 0) continue;

                const forceMagnitude =

                    this.G *
                    a.mass *
                    b.mass /
                    distanceSquared;

                this.force
                    .copy(this.offset)
                    .normalize()
                    .multiplyScalar(forceMagnitude);

                a.applyForce(
                    this.force
                );

                b.applyForce(
                    this.force.clone().negate()
                );

            }

        }

    }

}