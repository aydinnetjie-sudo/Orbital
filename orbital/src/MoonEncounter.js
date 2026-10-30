import { Cartesian3 as V } from "cesium";
import { G } from "./GravityWorld.js";

export function bodyOrbit(position, velocity, mu, radius) {
    const r = V.magnitude(position);

    if (!(r > 0) || !(mu > 0)) return null;

    const speed = V.magnitude(velocity);
    const h = V.cross(position, velocity, new V());
    const p = V.magnitudeSquared(h) / mu;

    const e = V.magnitude(
        V.subtract(
            V.multiplyByScalar(
                V.cross(velocity, h, new V()),
                1 / mu,
                new V()
            ),
            V.multiplyByScalar(position, 1 / r, new V()),
            new V()
        )
    );

    const energy = speed * speed / 2 - mu / r;
    const bound = energy < 0;
    const a = bound ? -mu / (2 * energy) : Infinity;

    const periRadius = p / (1 + e);
    const apoRadius = bound ? a * (1 + e) : Infinity;

    return {
        speed,
        energy,
        bound,
        eccentricity: e,
        apoRadius,
        periapsis: periRadius - radius,
        apoapsis: apoRadius - radius,
        circularSpeed: Math.sqrt(mu / r),
        escapeSpeed: Math.sqrt(2 * mu / r),

        period: bound
            ? 2 * Math.PI * Math.sqrt(a ** 3 / mu)
            : Infinity
    };
}

export function moonState(universe) {
    const u = universe;

    const position = V.subtract(
        u.rocket.position,
        u.moon.position,
        new V()
    );

    const velocity = V.subtract(
        u.rocket.velocity,
        u.moon.velocity,
        new V()
    );

    const distance = V.magnitude(position);

    const influenceRadius =
        V.distance(u.moon.position, u.earth.position) *
        (u.moon.mass / u.earth.mass) ** 0.4;

    return {
        distance,
        altitude: distance - u.moon.radius,
        speed: V.magnitude(velocity),

        closing:
            -V.dot(position, velocity) /
            Math.max(1, distance),

        influenceRadius,
        inside: distance < influenceRadius,

        orbit: bodyOrbit(
            position,
            velocity,
            G * u.moon.mass,
            u.moon.radius
        )
    };
}

// Prediction operates on a copy of the shared gravity simulation.
export class MoonEncounter {
    constructor(
        universe,
        {
            horizon = 7 * 86400,
            maxSteps = 60000,
            atmosphereHeight = 160000
        } = {}
    ) {
        this.world = universe.world.clone();

        this.rocket = this.world.bodies.find(
            b => b.name === "Rocket"
        );

        this.earth = this.world.bodies.find(
            b => b.name === "Earth"
        );

        this.moon = this.world.bodies.find(
            b => b.name === "Moon"
        );

        if (!this.rocket || !this.earth || !this.moon) {
            throw new Error(
                "Encounter prediction needs Rocket, Earth and Moon"
            );
        }

        this.start = this.world.time;
        this.horizon = horizon;
        this.maxSteps = maxSteps;
        this.atmosphereHeight = atmosphereHeight;

        this.steps = 0;
        this.done = false;
        this.reason = "Computing";

        this.samples = [];
        this.sampleEvery = horizon / 256;
        this.closest = null;

        this.record(true);
    }

    get elapsed() {
        return this.world.time - this.start;
    }

    get progress() {
        return Math.min(1, this.elapsed / this.horizon);
    }

    state(world = this.world) {
        const rocket = world.bodies.find(
            b => b.name === "Rocket"
        );

        const earth = world.bodies.find(
            b => b.name === "Earth"
        );

        const moon = world.bodies.find(
            b => b.name === "Moon"
        );

        const sun = world.bodies.find(
            b => b.name === "Sun"
        );

        const moonRelative = V.subtract(
            rocket.position,
            moon.position,
            new V()
        );

        const velocity = V.subtract(
            rocket.velocity,
            moon.velocity,
            new V()
        );

        const distance = V.magnitude(moonRelative);

        return {
            time: world.time,
            distance,
            altitude: distance - moon.radius,
            speed: V.magnitude(velocity),
            radial: V.dot(moonRelative, velocity),

            earthRelative: V.subtract(
                rocket.position,
                earth.position,
                new V()
            ),

            moonRelative,

            moonEarth: V.subtract(
                moon.position,
                earth.position,
                new V()
            ),

            sunRelative: sun
                ? V.subtract(
                    rocket.position,
                    sun.position,
                    new V()
                )
                : new V(),

            moonSun: sun
                ? V.subtract(
                    moon.position,
                    sun.position,
                    new V()
                )
                : new V()
        };
    }

    record(force = false) {
        const state = this.state();

        if (
            !this.closest ||
            state.distance < this.closest.distance
        ) {
            this.closest = state;
        }

        const last = this.samples.at(-1);

        const curved = last && (
            V.angleBetween(
                last.earthRelative,
                state.earthRelative
            ) > 0.06 ||
            V.angleBetween(
                last.moonRelative,
                state.moonRelative
            ) > 0.06
        );

        if (
            force ||
            !last ||
            curved ||
            state.time - last.time >= this.sampleEvery
        ) {
            if (!last || state.time !== last.time) {
                this.samples.push(state);
            }

            if (this.samples.length > 1024) {
                this.samples = this.samples.filter(
                    (_, index) => index % 2 === 0
                );

                this.sampleEvery *= 2;
            }
        }

        return state;
    }

    refineClosest(dt) {
        let low = -dt;
        let high = 0;

        for (
            let i = 0;
            i < 14 && high - low > 0.05;
            i++
        ) {
            const offset = (low + high) / 2;
            const copy = this.world.clone();

            copy.step(offset, { coast: true });

            const state = this.state(copy);

            if (state.radial < 0) {
                low = offset;
            } else {
                high = offset;
            }

            if (state.distance < this.closest.distance) {
                this.closest = state;
            }
        }
    }

    finish(reason) {
        this.done = true;
        this.reason = reason;
        this.record(true);
    }

    advance(maxSteps = 96, budgetMs = 3) {
        const deadline = performance.now() + budgetMs;

        for (
            let i = 0;
            i < maxSteps && !this.done;
            i++
        ) {
            if (
                i > 0 &&
                i % 8 === 0 &&
                performance.now() >= deadline
            ) {
                break;
            }

            const before = this.state();

            const dt = Math.min(
                this.world.timestep(),
                this.horizon - this.elapsed
            );

            if (!(dt > 1e-7)) {
                this.finish("Window complete");
                break;
            }

            const ok = this.world.step(
                dt,
                { coast: true }
            );

            this.steps++;

            const after = this.record();

            if (
                ok &&
                before.radial < 0 &&
                after.radial >= 0
            ) {
                this.refineClosest(dt);
            }

            if (!ok) {
                const collision = this.world.collision;

                this.finish(
                    collision
                        ? `Collision: ${collision.a} / ${collision.b}`
                        : "Prediction stopped"
                );
            } else if (
                V.distance(
                    this.rocket.position,
                    this.earth.position
                ) <=
                this.earth.radius + this.atmosphereHeight
            ) {
                this.finish("Earth atmosphere entry");
            } else if (this.steps >= this.maxSteps) {
                this.finish(
                    "Computation limit: partial window"
                );
            } else if (
                this.elapsed >= this.horizon - 1e-7
            ) {
                this.finish("Window complete");
            }
        }

        return this.done;
    }
}