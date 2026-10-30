import { Cartesian3 as V } from "cesium";

const LEVELS = [
    1,
    10,
    100,
    1000,
    10000,
    100000,
    1000000
];

export function moonApproachLimit(universe) {
    const u = universe;

    if (
        !u.moon ||
        !u.rocket ||
        u.flight?.landed
    ) {
        return null;
    }

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

    const closing =
        -V.dot(position, velocity) /
        Math.max(1, distance);

    if (closing <= 0.5) return null;

    const altitude =
        distance - u.moon.radius;

    const rate =
        altitude < 200000
            ? 1
            : altitude < 2000000
                ? 10
                : altitude < 5000000
                    ? 100
                    : altitude < 20000000
                        ? 1000
                        : Infinity;

    return Number.isFinite(rate)
        ? {
            rate,
            reason: `Moon approach (max ${rate}×)`
        }
        : null;
}

export class FlightTimeWarp {
    constructor() {
        this.reset();
    }

    reset() {
        this.index = 0;
        this.actual = 1;
        this.reason = "Normal speed";
    }

    get selected() {
        return LEVELS[this.index];
    }

    increase() {
        this.index = Math.min(
            this.index + 1,
            LEVELS.length - 1
        );
    }

    decrease() {
        this.index = Math.max(
            0,
            this.index - 1
        );
    }

    normal(reason = "Normal speed") {
        this.index = 0;
        this.reason = reason;
    }

    advance(
        realDt,
        flight,
        ground,
        keys,
        walking = false,
        busy = false
    ) {
        if (!(realDt > 0)) {
            this.actual = 1;
            return 0;
        }

        const universe = flight.universe;

        if (!universe) {
            throw new Error(
                "Gravity simulation is not connected"
            );
        }

        if (universe.world.collision) {
            this.actual = 0;

            this.reason =
                `Collision: ${universe.world.collision.a}` +
                ` / ${universe.world.collision.b}`;

            return 0;
        }

        if (busy) {
            this.actual = 0;
            this.reason = "Boarding / exiting";
            return 0;
        }

        const steering = [
            "KeyW",
            "KeyS",
            "KeyA",
            "KeyD",
            "KeyQ",
            "KeyE",
            "KeyL"
        ].some(key => keys.has(key)) || !!flight.universe.controls?.settling;

        const near = universe.nearestSurface();
        const powered = flight.throttle > 0.00001;

        let rate = this.selected;

        this.reason = walking
            ? "On foot"
            : steering
                ? "Steering"
                : powered
                    ? "Powered flight (max 10×)"
                    : flight.landed
                        ? "All bodies advancing; rocket grounded"
                        : "All-body gravity";

        if (
            walking ||
            steering ||
            flight.crashed
        ) {
            rate = 1;
        } else if (
            powered ||
            (!flight.landed && near.altitude < 200000)
        ) {
            rate = Math.min(rate, 10);
        }

        const lunarLimit =
            moonApproachLimit(universe);

        if (
            lunarLimit &&
            rate > lunarLimit.rate
        ) {
            rate = lunarLimit.rate;
            this.reason = lunarLimit.reason;
        }

        const approach = flight.inspect(ground);

        if (
            !flight.landed &&
            approach.known &&
            approach.vertical < -0.5 &&
            approach.clearance < 500
        ) {
            this.normal("Landing approach");
            rate = 1;
        }

        const needsSmallFrame =
            powered ||
            steering ||
            walking ||
            (!flight.landed && near.altitude < 200000);

        const requested =
            (
                needsSmallFrame
                    ? Math.min(realDt, 0.05)
                    : realDt
            ) * rate;

        let elapsed = 0;
        let safetyStop = false;

        for (
            let i = 0;
            i < 256 && elapsed < requested - 1e-10;
            i++
        ) {
            const limitNow =
                moonApproachLimit(universe);

            if (
                limitNow &&
                limitNow.rate < rate
            ) {
                this.reason = limitNow.reason;
                safetyStop = true;
                break;
            }

            const surface =
                universe.nearestSurface();

            const coast =
                !powered &&
                !steering &&
                (
                    flight.landed ||
                    surface.altitude > 200000
                );

            const limit = coast
                ? universe.world.timestep(
                    (a, b) =>
                        flight.landed &&
                        (
                            a === universe.rocket ||
                            b === universe.rocket
                        )
                )
                : 0.01;

            const dt = Math.min(
                limit,
                requested - elapsed
            );

            if (
                !universe.step(
                    dt,
                    keys,
                    ground,
                    { coast }
                )
            ) {
                this.reason =
                    universe.world.collision
                        ? `Collision: ${universe.world.collision.a} / ${universe.world.collision.b}`
                        : "Waiting for terrain";

                safetyStop = true;
                break;
            }

            elapsed += dt;

            const next =
                universe.nearestSurface();

            if (
                coast &&
                !flight.landed &&
                next.altitude < 200000
            ) {
                if (next.body === universe.moon) {
                    this.reason =
                        "Moon approach (max 1×)";
                } else {
                    this.normal(
                        "Body approach: normal speed"
                    );
                }

                safetyStop = true;
                break;
            }

            const report = flight.landing;

            if (
                rate > 1 &&
                !flight.landed &&
                report?.known &&
                report.vertical < -0.5 &&
                report.clearance < 500
            ) {
                this.normal("Landing approach");
                safetyStop = true;
                break;
            }
        }

        this.actual = elapsed / realDt;

        if (
            !safetyStop &&
            elapsed < requested - 1e-8 &&
            this.selected > 1 &&
            !flight.waitingForGround &&
            !universe.world.collision
        ) {
            this.reason = "Physics step budget";
        }

        return elapsed;
    }

    text() {
        return (
            `Warp ${
                this.actual.toFixed(
                    this.actual < 10 ? 1 : 0
                )
            }× / selected ${this.selected}×` +
            ` · ${this.reason}`
        );
    }
}