
import {
    Cartesian3 as V,
    Matrix3,
    Quaternion,
    Matrix4,
    HeadingPitchRange,
    Ellipsoid
} from "cesium";

export function cockpitView(yaw = 0, pitch = 0) {
    const c = Math.cos(pitch);
    const s = Math.sin(pitch);

    return {
        direction: new V(
            -Math.sin(yaw) * c,
            s,
            Math.cos(yaw) * c
        ),
        up: new V(
            Math.sin(yaw) * s,
            c,
            -Math.cos(yaw) * s
        )
    };
}

// Approximate cylindrical inertia and bounded reaction-wheel torque.
// Stabilization brakes rotation when the steering keys are released.
export class RocketControls {
    constructor() {
        this.reset();
    }

    reset() {
        this.angularVelocity = new V();
    }

    get settling() {
        return V.magnitude(this.angularVelocity) > 1e-5;
    }

    step(attitude, keys, dt, mass = 20000) {
        const input = (a, b) =>
            Number(keys.has(a)) - Number(keys.has(b));

        const pitch = input("KeyW", "KeyS");
        const yaw = input("KeyD", "KeyA");
        const roll = input("KeyE", "KeyQ");

        if (!pitch && !yaw && !roll && !this.settling) {
            return attitude;
        }

        const fine = keys.has("KeyC") ? 0.2 : 1;

        // Angular speeds in radians per second.
        const target = new V(
            -pitch * 0.45 * fine,
            -yaw * 0.45 * fine,
            roll * 0.65 * fine
        );

        // Approximate rocket: length 14 m, radius 1 m.
        const transverse = mass * (14 * 14 / 12 + 0.25);

        const inertia = new V(
            transverse,
            transverse,
            0.5 * mass
        );

        // Available torque in newton-metres.
        const limits = new V(
            200000,
            200000,
            12000
        );

        const w = this.angularVelocity;

        let remaining = Math.max(0, dt);

        while (remaining > 1e-10) {
            const h = Math.min(0.01, remaining);
            const before = V.clone(w);

            const momentum = new V(
                inertia.x * w.x,
                inertia.y * w.y,
                inertia.z * w.z
            );

            const gyro = V.cross(
                w,
                momentum,
                new V()
            );

            for (const axis of ["x", "y", "z"]) {
                const requested =
                    inertia[axis] *
                    5 *
                    (target[axis] - w[axis]) +
                    gyro[axis];

                const torque = Math.max(
                    -limits[axis],
                    Math.min(limits[axis], requested)
                );

                w[axis] +=
                    (torque - gyro[axis]) /
                    inertia[axis] *
                    h;
            }

            if (
                !pitch &&
                !yaw &&
                !roll &&
                V.magnitude(w) < 1e-5
            ) {
                V.clone(V.ZERO, w);
            }

            const average = V.multiplyByScalar(
                V.add(before, w, new V()),
                0.5,
                new V()
            );

            const speed = V.magnitude(average);

            if (speed > 1e-12) {
                const delta = Quaternion.fromAxisAngle(
                    V.divideByScalar(
                        average,
                        speed,
                        new V()
                    ),
                    speed * h
                );

                // Rotate around the rocket's own axes.
                Quaternion.multiply(
                    attitude,
                    delta,
                    attitude
                );

                Quaternion.normalize(
                    attitude,
                    attitude
                );
            }

            remaining -= h;
        }

        return attitude;
    }
}

export function applyChaseCamera(viewer, flight, view) {
    const body = Matrix3.fromQuaternion(flight.attitude);

    const basis = new Matrix3(
        -1, 0, 0,
         0, 0, 1,
         0, 1, 0
    );

    const frame = Matrix4.fromRotationTranslation(
        Matrix3.multiply(
            body,
            basis,
            new Matrix3()
        ),
        flight.position
    );

    viewer.camera.lookAtTransform(
        frame,
        new HeadingPitchRange(
            view.heading,
            view.pitch,
            view.range
        )
    );

    // Prevent the chase camera from going below available terrain.
    const destination = V.clone(viewer.camera.positionWC);
    const shape = Ellipsoid.WGS84;
    const geo = shape.cartesianToCartographic(destination);

    if (!geo) return;

    const terrain = viewer.scene.globe.getHeight(geo);

    const rocketGeo = shape.cartesianToCartographic(
        flight.position
    );

    const floor = Number.isFinite(terrain)
        ? terrain
        : flight.landed
            ? rocketGeo.height - 15.5
            : 0;

    if (geo.height >= floor + 3) return;

    geo.height = floor + 3;

    const safe = shape.cartographicToCartesian(geo);

    const direction = V.normalize(
        V.subtract(
            flight.position,
            safe,
            new V()
        ),
        new V()
    );

    let up = Matrix3.multiplyByVector(
        body,
        V.UNIT_Y,
        new V()
    );

    if (Math.abs(V.dot(up, direction)) > 0.97) {
        up = Matrix3.multiplyByVector(
            body,
            V.UNIT_Z,
            new V()
        );
    }

    const right = V.normalize(
        V.cross(direction, up, new V()),
        new V()
    );

    up = V.normalize(
        V.cross(right, direction, new V()),
        new V()
    );

    viewer.camera.lookAtTransform(Matrix4.IDENTITY);

    viewer.camera.setView({
        destination: safe,
        orientation: {
            direction,
            up
        }
    });
}

// Nose-view sphere.
// Blue: above Earth's local horizon.
// Brown: below Earth's local horizon.
// Yellow cross: where the rocket's nose points.
export function createAttitudeIndicator(panel) {
    const box = document.createElement("div");
    const label = document.createElement("div");

    label.style.cssText =
        "font-size:11px;margin:6px 0";

    const canvas = document.createElement("canvas");

    canvas.width = 112;
    canvas.height = 112;

    canvas.style.cssText =
        "width:112px;height:112px;" +
        "border-radius:50%;" +
        "border:1px solid #ffffff60";

    box.append(label, canvas);
    panel.appendChild(box);

    const ctx = canvas.getContext("2d");
    const pixels = ctx.createImageData(112, 112);

    let last = -Infinity;

    return flight => {
        if (performance.now() - last < 50) return;

        last = performance.now();

        const worldUp =
            Ellipsoid.WGS84.geodeticSurfaceNormal(
                flight.position,
                new V()
            );

        const up = Matrix3.multiplyByVector(
            Matrix3.transpose(
                Matrix3.fromQuaternion(flight.attitude),
                new Matrix3()
            ),
            worldUp,
            new V()
        );

        for (let y = 0; y < 112; y++) {
            for (let x = 0; x < 112; x++) {
                const sx = (x - 55.5) / 55;
                const sy = (55.5 - y) / 55;
                const r = sx * sx + sy * sy;
                const i = (y * 112 + x) * 4;

                if (r > 1) {
                    pixels.data[i + 3] = 0;
                    continue;
                }

                const altitude =
                    -sx * up.x +
                    sy * up.y +
                    Math.sqrt(1 - r) * up.z;

                const color =
                    Math.abs(altitude) < 0.025
                        ? [235, 235, 220]
                        : altitude > 0
                            ? [42, 113, 174]
                            : [126, 80, 47];

                pixels.data[i] = color[0];
                pixels.data[i + 1] = color[1];
                pixels.data[i + 2] = color[2];
                pixels.data[i + 3] = 255;
            }
        }

        ctx.putImageData(pixels, 0, 0);

        ctx.strokeStyle = "#ffda55";
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(33, 56);
        ctx.lineTo(48, 56);
        ctx.lineTo(56, 61);
        ctx.lineTo(64, 56);
        ctx.lineTo(79, 56);
        ctx.stroke();

        const rate =
            V.magnitude(
                flight.universe.controls.angularVelocity
            ) *
            180 /
            Math.PI;

        label.textContent =
            `EARTH HORIZON · SAS ON · ${rate.toFixed(1)}°/s`;
    };
}
