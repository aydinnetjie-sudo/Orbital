import { Cartesian3 as V } from "cesium";

export const G = 6.67430e-11;

export class GravityWorld {
    constructor() {
        this.bodies = [];
        this.time = 0;
        this.collision = null;
    }

    addBody({
        name,
        mass,
        radius = 0,
        position = new V(),
        velocity = new V()
    }) {
        if (!(mass > 0)) {
            throw new Error("Body mass must be positive");
        }

        const body = {
            name,
            mass,
            radius,
            position: V.clone(position),
            velocity: V.clone(velocity)
        };

        this.bodies.push(body);
        return body;
    }

    accelerations() {
        const accelerations = this.bodies.map(() => new V());

        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const a = this.bodies[i];
                const b = this.bodies[j];
                const difference = V.subtract(
                    b.position,
                    a.position,
                    new V()
                );

                const distanceSquared = V.magnitudeSquared(difference);

                if (!(distanceSquared > 0)) {
                    throw new Error("Overlapping point masses");
                }

                const scale =
                    G / (distanceSquared * Math.sqrt(distanceSquared));

                V.add(
                    accelerations[i],
                    V.multiplyByScalar(
                        difference,
                        scale * b.mass,
                        new V()
                    ),
                    accelerations[i]
                );

                V.subtract(
                    accelerations[j],
                    V.multiplyByScalar(
                        difference,
                        scale * a.mass,
                        new V()
                    ),
                    accelerations[j]
                );
            }
        }

        return accelerations;
    }

    verlet(dt, extra = null, constrain = null) {
        let acceleration = this.accelerations();

        if (extra) extra(acceleration, this);

        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];

            V.add(
                body.velocity,
                V.multiplyByScalar(acceleration[i], dt / 2, new V()),
                body.velocity
            );

            V.add(
                body.position,
                V.multiplyByScalar(body.velocity, dt, new V()),
                body.position
            );
        }

        this.time += dt;

        if (constrain) constrain(false);

        acceleration = this.accelerations();

        if (extra) extra(acceleration, this);

        for (let i = 0; i < this.bodies.length; i++) {
            const body = this.bodies[i];

            V.add(
                body.velocity,
                V.multiplyByScalar(acceleration[i], dt / 2, new V()),
                body.velocity
            );
        }

        if (constrain) constrain(true);
    }

    step(
        dt,
        {
            coast = false,
            extra = null,
            constrain = null,
            collisionFilter = null
        } = {}
    ) {
        if (this.collision) return false;

        if (!coast) {
            this.verlet(dt, extra, constrain);
            return this.checkCollisions(collisionFilter);
        }

        // Fourth-order symplectic integration for gravity-only coasting.
        const w = 1 / (2 - Math.cbrt(2));

        this.verlet(w * dt, null, constrain);
        this.verlet((1 - 2 * w) * dt, null, constrain);
        this.verlet(w * dt, null, constrain);

        return this.checkCollisions(collisionFilter);
    }

    checkCollisions(filter = null) {
        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const a = this.bodies[i];
                const b = this.bodies[j];

                if (filter && !filter(a, b)) continue;

                if (
                    a.radius + b.radius > 0 &&
                    V.distance(a.position, b.position) <=
                        a.radius + b.radius
                ) {
                    this.collision = {
                        a: a.name,
                        b: b.name
                    };

                    return false;
                }
            }
        }

        return true;
    }

    timestep(ignorePair = null) {
        let limit = 3600;

        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const a = this.bodies[i];
                const b = this.bodies[j];

                if (ignorePair?.(a, b)) continue;

                const distance = V.distance(a.position, b.position);
                const mu = G * (a.mass + b.mass);
                const speed = V.distance(a.velocity, b.velocity);

                limit = Math.min(
                    limit,
                    0.02 * Math.sqrt(distance ** 3 / mu),
                    0.02 * distance / Math.max(1, speed)
                );
            }
        }

        return Math.max(0.001, limit);
    }

    clone() {
        const copy = new GravityWorld();

        copy.time = this.time;
        copy.collision = this.collision
            ? { ...this.collision }
            : null;

        for (const body of this.bodies) {
            copy.addBody(body);
        }

        return copy;
    }

    momentum() {
        const total = new V();

        for (const body of this.bodies) {
            V.add(
                total,
                V.multiplyByScalar(
                    body.velocity,
                    body.mass,
                    new V()
                ),
                total
            );
        }

        return total;
    }

    energy() {
        let energy = 0;

        for (const body of this.bodies) {
            energy +=
                0.5 *
                body.mass *
                V.magnitudeSquared(body.velocity);
        }

        for (let i = 0; i < this.bodies.length; i++) {
            for (let j = i + 1; j < this.bodies.length; j++) {
                const a = this.bodies[i];
                const b = this.bodies[j];

                energy -=
                    G *
                    a.mass *
                    b.mass /
                    V.distance(a.position, b.position);
            }
        }

        return energy;
    }
}