import {
    Cartesian3 as V,
    Matrix3,
    Quaternion,
    Ellipsoid,
    JulianDate,
    Simon1994PlanetaryPositions as Ephemeris,
    CelestialFrameTransforms
} from "cesium";

import { GravityWorld, G } from "./GravityWorld.js";
import { steerRocket } from "./RocketControls.js";

export const EARTH_RATE = 7.292115e-5;

const Z = new V(0, 0, 1);
const earthShape = Ellipsoid.WGS84;

export class NewtonianUniverse {
    constructor(
        epoch,
        {
            fixedToWorld = null,
            seeds = null
        } = {}
    ) {
        this.epoch = JulianDate.clone(epoch);
        this.world = new GravityWorld();

        if (fixedToWorld) {
            this.initialRotation = Matrix3.clone(
                fixedToWorld
            );
        } else {
            const inverse =
                CelestialFrameTransforms
                    .computeIcrfToFixedMatrix(
                        epoch,
                        new Matrix3()
                    ) ||
                CelestialFrameTransforms
                    .computeTemeToPseudoFixedMatrix(
                        epoch,
                        new Matrix3()
                    );

            this.initialRotation = Matrix3.transpose(
                inverse,
                new Matrix3()
            );
        }

        const initial = seeds || this.seed(epoch);

        for (const body of initial) {
            this.world.addBody(body);
        }

        this.sun = this.world.bodies.find(
            b => b.name === "Sun"
        );

        this.earth = this.world.bodies.find(
            b => b.name === "Earth"
        );

        this.moon = this.world.bodies.find(
            b => b.name === "Moon"
        );

        this.flight = null;
        this.rocket = null;
        this.anchor = null;
        this.landedOn = "Earth";
    }

    seed(time) {
        const at = (method, seconds) =>
            Ephemeris[method](
                JulianDate.addSeconds(
                    time,
                    seconds,
                    new JulianDate()
                ),
                new V()
            );

        const derivative = method =>
            V.multiplyByScalar(
                V.subtract(
                    at(method, 30),
                    at(method, -30),
                    new V()
                ),
                1 / 60,
                new V()
            );

        // Ephemerides establish the initial state only.
        // All subsequent movement comes from gravity.
        const sun = at(
            "computeSunPositionInEarthInertialFrame",
            0
        );

        const moon = at(
            "computeMoonPositionInEarthInertialFrame",
            0
        );

        const earthPosition = V.negate(
            sun,
            new V()
        );

        const earthVelocity = V.negate(
            derivative(
                "computeSunPositionInEarthInertialFrame"
            ),
            new V()
        );

        const bodies = [
            {
                name: "Sun",
                mass: 1.3271244004127942e20 / G,
                radius: 696340000,
                position: new V(),
                velocity: new V()
            },
            {
                name: "Earth",
                mass: 3.98600435507e14 / G,
                radius: 6378137,
                position: earthPosition,
                velocity: earthVelocity
            },
            {
                name: "Moon",
                mass: 4.902800118e12 / G,
                radius: 1737400,
                position: V.add(
                    earthPosition,
                    moon,
                    new V()
                ),
                velocity: V.add(
                    earthVelocity,
                    derivative(
                        "computeMoonPositionInEarthInertialFrame"
                    ),
                    new V()
                )
            }
        ];

        const totalMass = bodies.reduce(
            (sum, body) => sum + body.mass,
            0
        );

        const center = new V();
        const velocity = new V();

        for (const body of bodies) {
            V.add(
                center,
                V.multiplyByScalar(
                    body.position,
                    body.mass / totalMass,
                    new V()
                ),
                center
            );

            V.add(
                velocity,
                V.multiplyByScalar(
                    body.velocity,
                    body.mass / totalMass,
                    new V()
                ),
                velocity
            );
        }

        for (const body of bodies) {
            V.subtract(
                body.position,
                center,
                body.position
            );

            V.subtract(
                body.velocity,
                velocity,
                body.velocity
            );
        }

        return bodies;
    }

    earthRotation(time = this.world.time) {
        return Matrix3.multiply(
            this.initialRotation,
            Matrix3.fromRotationZ(
                EARTH_RATE * time,
                new Matrix3()
            ),
            new Matrix3()
        );
    }

    fixedVector(vector, time = this.world.time) {
        return Matrix3.multiplyByVector(
            Matrix3.transpose(
                this.earthRotation(time),
                new Matrix3()
            ),
            vector,
            new V()
        );
    }

    worldVector(vector, time = this.world.time) {
        return Matrix3.multiplyByVector(
            this.earthRotation(time),
            vector,
            new V()
        );
    }

    fixedPoint(position) {
        return this.fixedVector(
            V.subtract(
                position,
                this.earth.position,
                new V()
            )
        );
    }

    worldPoint(position) {
        return V.add(
            this.earth.position,
            this.worldVector(position),
            new V()
        );
    }

    fixedVelocity(position, velocity) {
        const point = this.fixedPoint(position);

        const relative = this.fixedVector(
            V.subtract(
                velocity,
                this.earth.velocity,
                new V()
            )
        );

        return V.subtract(
            relative,
            new V(
                -EARTH_RATE * point.y,
                EARTH_RATE * point.x,
                0
            ),
            relative
        );
    }

    worldVelocity(position, velocity) {
        return V.add(
            this.earth.velocity,
            this.worldVector(
                V.add(
                    velocity,
                    new V(
                        -EARTH_RATE * position.y,
                        EARTH_RATE * position.x,
                        0
                    ),
                    new V()
                )
            ),
            new V()
        );
    }

    attach(flight) {
        this.flight = flight;
        flight.universe = this;

        this.rocket = this.world.addBody({
            name: "Rocket",
            mass: 20000,
            radius: 7,
            position: this.worldPoint(
                flight.position
            ),
            velocity: this.worldVelocity(
                flight.position,
                flight.velocity
            )
        });

        this.resetRocket();
    }

    resetRocket() {
        this.landedOn = "Earth";

        this.anchor = V.clone(
            this.flight.position
        );

        this.anchorAttitude = Quaternion.clone(
            this.flight.attitude
        );

        this.rocket.position = this.worldPoint(
            this.flight.position
        );

        this.rocket.velocity = this.worldVelocity(
            this.flight.position,
            new V()
        );

        this.attitude = Quaternion.multiply(
            Quaternion.fromRotationMatrix(
                this.earthRotation()
            ),
            this.flight.attitude,
            new Quaternion()
        );

        this.sync();
    }

    sync() {
        const flight = this.flight;

        if (!flight) return;

        flight.position = this.fixedPoint(
            this.rocket.position
        );

        flight.velocity = this.fixedVelocity(
            this.rocket.position,
            this.rocket.velocity
        );

        flight.attitude = Quaternion.multiply(
            Quaternion.conjugate(
                Quaternion.fromRotationMatrix(
                    this.earthRotation()
                ),
                new Quaternion()
            ),
            this.attitude,
            new Quaternion()
        );

        flight.landedOn = this.landedOn;
    }

    constrain(velocityPhase) {
        if (!this.flight?.landed) return;

        const body =
            this.landedOn === "Moon"
                ? this.moon
                : this.landedOn === "Sun"
                    ? this.sun
                    : this.earth;

        const rotation = this.bodyRotation(body);

        const offset = Matrix3.multiplyByVector(
            rotation,
            this.anchor,
            new V()
        );

        const ratio = this.rocket.mass / body.mass;

        if (!velocityPhase) {
            const target = V.add(
                body.position,
                offset,
                new V()
            );

            const delta = V.subtract(
                target,
                this.rocket.position,
                new V()
            );

            V.add(
                this.rocket.position,
                V.multiplyByScalar(
                    delta,
                    1 / (1 + ratio),
                    new V()
                ),
                this.rocket.position
            );

            V.subtract(
                body.position,
                V.multiplyByScalar(
                    delta,
                    ratio / (1 + ratio),
                    new V()
                ),
                body.position
            );
        } else {
            const desired = V.add(
                body.velocity,
                V.cross(
                    this.bodySpin(body),
                    offset,
                    new V()
                ),
                new V()
            );

            const delta = V.multiplyByScalar(
                V.subtract(
                    desired,
                    this.rocket.velocity,
                    new V()
                ),
                1 / (1 + ratio),
                new V()
            );

            V.add(
                this.rocket.velocity,
                delta,
                this.rocket.velocity
            );

            V.subtract(
                body.velocity,
                V.multiplyByScalar(
                    delta,
                    ratio,
                    new V()
                ),
                body.velocity
            );
        }

        this.attitude = Quaternion.multiply(
            Quaternion.fromRotationMatrix(
                rotation
            ),
            this.anchorAttitude ||
                Quaternion.IDENTITY,
            new Quaternion()
        );
    }

    bodyRotation(body) {
        if (body === this.earth) {
            return this.earthRotation();
        }

        if (body === this.sun) {
            return Matrix3.IDENTITY;
        }

        const x = V.normalize(
            V.subtract(
                this.earth.position,
                this.moon.position,
                new V()
            ),
            new V()
        );

        const orbitVelocity = V.subtract(
            this.moon.velocity,
            this.earth.velocity,
            new V()
        );

        let z = V.normalize(
            V.cross(
                V.subtract(
                    this.moon.position,
                    this.earth.position,
                    new V()
                ),
                orbitVelocity,
                new V()
            ),
            new V()
        );

        const y = V.normalize(
            V.cross(z, x, new V()),
            new V()
        );

        z = V.cross(x, y, z);

        const result = new Matrix3();

        Matrix3.setColumn(
            result, 0, x, result
        );

        Matrix3.setColumn(
            result, 1, y, result
        );

        Matrix3.setColumn(
            result, 2, z, result
        );

        return result;
    }

    bodySpin(body) {
        if (body === this.earth) {
            return this.worldVector(
                new V(0, 0, EARTH_RATE)
            );
        }

        if (body === this.sun) {
            return new V();
        }

        const position = V.subtract(
            this.moon.position,
            this.earth.position,
            new V()
        );

        const velocity = V.subtract(
            this.moon.velocity,
            this.earth.velocity,
            new V()
        );

        return V.multiplyByScalar(
            V.cross(
                position,
                velocity,
                new V()
            ),
            1 / V.magnitudeSquared(position),
            new V()
        );
    }

    nearestSurface() {
        let closest = this.earth;
        let best = Infinity;

        for (const body of [
            this.earth,
            this.moon,
            this.sun
        ]) {
            const altitude =
                body === this.earth
                    ? earthShape
                        .cartesianToCartographic(
                            this.fixedPoint(
                                this.rocket.position
                            )
                        ).height
                    : V.distance(
                        this.rocket.position,
                        body.position
                    ) - body.radius;

            if (altitude < best) {
                closest = body;
                best = altitude;
            }
        }

        return {
            body: closest,
            altitude: best
        };
    }

    captureAnchor(body) {
        this.landedOn = body.name;

        const inverse = Matrix3.transpose(
            this.bodyRotation(body),
            new Matrix3()
        );

        this.anchor = Matrix3.multiplyByVector(
            inverse,
            V.subtract(
                this.rocket.position,
                body.position,
                new V()
            ),
            new V()
        );

        this.anchorAttitude = Quaternion.multiply(
            Quaternion.conjugate(
                Quaternion.fromRotationMatrix(
                    this.bodyRotation(body)
                ),
                new Quaternion()
            ),
            this.attitude,
            new Quaternion()
        );
    }

    extra(accelerations) {
        const flight = this.flight;

        if (
            !flight ||
            flight.landed ||
            flight.crashed
        ) {
            return;
        }

        const index =
            this.world.bodies.indexOf(
                this.rocket
            );

        const direction =
            Matrix3.multiplyByVector(
                Matrix3.fromQuaternion(
                    this.attitude
                ),
                Z,
                new V()
            );

        V.add(
            accelerations[index],
            V.multiplyByScalar(
                direction,
                500000 *
                    flight.throttle /
                    this.rocket.mass,
                new V()
            ),
            accelerations[index]
        );

        const local = this.fixedPoint(
            this.rocket.position
        );

        const altitude =
            earthShape
                .cartesianToCartographic(local)
                .height;

        if (altitude < 160000) {
            const velocity = this.fixedVelocity(
                this.rocket.position,
                this.rocket.velocity
            );

            const factor =
                -0.5 *
                1.225 *
                Math.exp(
                    -Math.max(0, altitude) / 8500
                ) *
                V.magnitude(velocity) *
                0.35 *
                Math.PI /
                this.rocket.mass;

            V.add(
                accelerations[index],
                this.worldVector(
                    V.multiplyByScalar(
                        velocity,
                        factor,
                        new V()
                    )
                ),
                accelerations[index]
            );
        }
    }

    canLift() {
        const body =
            this.landedOn === "Moon"
                ? this.moon
                : this.earth;

        const accelerations =
            this.world.accelerations();

        const rocketIndex =
            this.world.bodies.indexOf(
                this.rocket
            );

        const planetIndex =
            this.world.bodies.indexOf(body);

        const radial = V.subtract(
            this.rocket.position,
            body.position,
            new V()
        );

        const up = V.normalize(
            radial,
            new V()
        );

        const spin = this.bodySpin(body);

        const surfaceAcceleration = V.add(
            accelerations[planetIndex],
            V.cross(
                spin,
                V.cross(
                    spin,
                    radial,
                    new V()
                ),
                new V()
            ),
            new V()
        );

        const direction =
            Matrix3.multiplyByVector(
                Matrix3.fromQuaternion(
                    this.attitude
                ),
                Z,
                new V()
            );

        const freeAcceleration = V.add(
            accelerations[rocketIndex],
            V.multiplyByScalar(
                direction,
                500000 *
                    this.flight.throttle /
                    this.rocket.mass,
                new V()
            ),
            new V()
        );

        return V.dot(
            V.subtract(
                freeAcceleration,
                surfaceAcceleration,
                new V()
            ),
            up
        ) > 0.01;
    }

    step(
        dt,
        keys,
        ground,
        { coast = false } = {}
    ) {
        const flight = this.flight;

        if (this.world.collision) {
            return false;
        }

        this.sync();

        flight.landing =
            flight.inspect(ground);

        flight.waitingForGround =
            !flight.landing.canFly;

        if (flight.waitingForGround) {
            return false;
        }

        if (
            flight.landed &&
            !flight.crashed &&
            flight.throttle > 0 &&
            this.canLift()
        ) {
            flight.landed = false;
            flight.reason = "In flight";
        }

        if (!flight.landed && !coast) {
            steerRocket(
                this.attitude,
                keys,
                dt,
                this.steeringFrame
            );

            if (keys.has("KeyL")) {
                this.sync();
                flight.align();
            }
        }

        if (
            flight.landed &&
            !this.anchorAttitude
        ) {
            this.captureAnchor(
                this.landedOn === "Earth"
                    ? this.earth
                    : this.moon
            );
        }

        const snapshot =
            this.world.clone();

        const orientation =
            Quaternion.clone(
                this.attitude
            );

        this.world.step(dt, {
            coast,
            extra: acceleration =>
                this.extra(acceleration),
            constrain: phase =>
                this.constrain(phase),
            collisionFilter: (a, b) =>
                a !== this.rocket &&
                b !== this.rocket
        });

        if (this.world.collision) {
            this.sync();
            return false;
        }

        Quaternion.normalize(
            this.attitude,
            this.attitude
        );

        this.sync();

        const after =
            flight.inspect(ground);

        if (!after.canFly) {
            this.world.time =
                snapshot.time;

            this.world.bodies.forEach(
                (body, index) => {
                    body.position =
                        snapshot.bodies[index]
                            .position;

                    body.velocity =
                        snapshot.bodies[index]
                            .velocity;
                }
            );

            this.attitude =
                orientation;

            this.sync();

            flight.waitingForGround = true;

            return false;
        }

        if (!flight.landed) {
            this.contact(ground);
        }

        flight.landing =
            flight.inspect(ground);

        return true;
    }

    inspect(ground) {
        const near =
            this.nearestSurface();

        const body = near.body;

        if (body === this.earth) {
            return this.flight
                .earthInspect(ground);
        }

        const radial = V.subtract(
            this.rocket.position,
            body.position,
            new V()
        );

        const up = V.normalize(
            radial,
            new V()
        );

        const surfaceVelocity = V.add(
            body.velocity,
            V.cross(
                this.bodySpin(body),
                radial,
                new V()
            ),
            new V()
        );

        const velocity = V.subtract(
            this.rocket.velocity,
            surfaceVelocity,
            new V()
        );

        const vertical =
            V.dot(velocity, up);

        const axis =
            Matrix3.multiplyByVector(
                Matrix3.fromQuaternion(
                    this.attitude
                ),
                Z,
                new V()
            );

        const clearance = Math.min(
            ...this.flight.feet().map(
                point =>
                    V.distance(
                        this.worldPoint(point),
                        body.position
                    ) - body.radius
            )
        );

        return {
            known: true,
            precise: true,
            canFly: true,
            clearance,
            slope: 0,
            spread: 0,
            bodyStrike: false,
            vertical,
            horizontal: Math.sqrt(
                Math.max(
                    0,
                    V.magnitudeSquared(
                        velocity
                    ) -
                    vertical * vertical
                )
            ),
            tilt:
                Math.acos(
                    Math.min(
                        1,
                        Math.max(
                            -1,
                            V.dot(up, axis)
                        )
                    )
                ) *
                180 /
                Math.PI
        };
    }

    contact(ground) {
        const flight = this.flight;
        const near =
            this.nearestSurface();

        if (near.body === this.earth) {
            const contact =
                flight.earthInspect(ground);

            if (
                !contact.known ||
                !contact.canFly
            ) {
                flight.waitingForGround =
                    !contact.canFly;
                return;
            }

            if (
                contact.clearance > 0 &&
                !contact.bodyStrike
            ) {
                return;
            }

            let reason =
                "Soft touchdown";

            if (contact.bodyStrike) {
                reason =
                    "Body struck the ground";
            } else if (
                Math.abs(
                    contact.vertical
                ) > 3
            ) {
                reason =
                    "Vertical speed too high";
            } else if (
                contact.horizontal > 2
            ) {
                reason =
                    "Horizontal speed too high";
            } else if (
                contact.tilt > 12
            ) {
                reason =
                    "Rocket tilted too far";
            } else if (
                contact.slope > 10
            ) {
                reason =
                    "Ground slope too steep";
            } else if (
                contact.spread > 0.5
            ) {
                reason =
                    "Uneven footing";
            }

            const up =
                earthShape
                    .geodeticSurfaceNormal(
                        flight.position,
                        new V()
                    );

            V.add(
                this.rocket.position,
                this.worldVector(
                    V.multiplyByScalar(
                        up,
                        Math.max(
                            0,
                            -contact.clearance
                        ),
                        new V()
                    )
                ),
                this.rocket.position
            );

            flight.crashed =
                reason !== "Soft touchdown";

            flight.reason = reason;
            flight.throttle = 0;
            flight.landed = true;

            this.captureAnchor(
                this.earth
            );

            this.constrain(true);
            this.sync();

            return;
        }

        if (near.altitude > 7) {
            return;
        }

        flight.throttle = 0;
        flight.landed = true;
        flight.crashed = true;

        flight.reason =
            `Impact with ${near.body.name}`;

        const normal = V.normalize(
            V.subtract(
                this.rocket.position,
                near.body.position,
                new V()
            ),
            new V()
        );

        this.rocket.position = V.add(
            near.body.position,
            V.multiplyByScalar(
                normal,
                near.body.radius + 7,
                new V()
            ),
            new V()
        );

        this.captureAnchor(
            near.body
        );

        this.constrain(true);
        this.sync();
    }

    preview(
        steps = 256,
        horizon = 21600
    ) {
        const copy =
            this.world.clone();

        const rocket =
            copy.bodies.find(
                body =>
                    body.name === "Rocket"
            );

        const earth =
            copy.bodies.find(
                body =>
                    body.name === "Earth"
            );

        const result = [];

        let elapsed = 0;
        let next = 0;

        for (
            let i = 0;
            i < steps;
            i++
        ) {
            if (elapsed >= next) {
                result.push(
                    this.fixedVector(
                        V.subtract(
                            rocket.position,
                            earth.position,
                            new V()
                        )
                    )
                );

                next += horizon / 128;
            }

            const altitude =
                V.distance(
                    rocket.position,
                    earth.position
                ) - earth.radius;

            if (altitude < 0) {
                break;
            }

            const dt = Math.min(
                copy.timestep(),
                horizon - elapsed
            );

            if (!(dt > 0)) {
                break;
            }

            if (
                !copy.step(
                    dt,
                    { coast: true }
                )
            ) {
                break;
            }

            elapsed += dt;
        }

        return result;
    }
}