import {
    Cartesian3 as V,
    Matrix3,
    Quaternion
} from "cesium";

// Nose: local +Z.
// Cockpit up: local +Y.
// Cockpit right: local -X.
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

// Outside view supplies camera right/up in inertial coordinates.
// Cockpit and map use the rocket's own axes.
export function steerRocket(
    attitude,
    keys,
    dt,
    frame = null
) {
    if (!(dt > 0)) return attitude;

    const input = (positive, negative) =>
        Number(keys.has(positive)) -
        Number(keys.has(negative));

    const horizontal = input("KeyD", "KeyA");
    const vertical = input("KeyW", "KeyS");
    const roll = input("KeyE", "KeyQ");

    if (!horizontal && !vertical && !roll) {
        return attitude;
    }

    const rotation = Matrix3.fromQuaternion(attitude);

    const transform = vector =>
        Matrix3.multiplyByVector(
            rotation,
            vector,
            new V()
        );

    const nose = transform(V.UNIT_Z);

    let angular;

    if (frame) {
        const desired = V.add(
            V.multiplyByScalar(
                frame.right,
                horizontal,
                new V()
            ),
            V.multiplyByScalar(
                frame.up,
                vertical,
                new V()
            ),
            new V()
        );

        angular = V.cross(nose, desired, new V());
    } else {
        angular = transform(
            new V(-vertical, -horizontal, 0)
        );
    }

    V.add(
        angular,
        V.multiplyByScalar(nose, roll, new V()),
        angular
    );

    const magnitude = V.magnitude(angular);

    if (magnitude < 1e-12) return attitude;

    const rate = keys.has("KeyC") ? 0.07 : 0.30;

    const delta = Quaternion.fromAxisAngle(
        V.divideByScalar(
            angular,
            magnitude,
            new V()
        ),
        Math.min(1, magnitude) * rate * dt
    );

    Quaternion.multiply(delta, attitude, attitude);

    return Quaternion.normalize(attitude, attitude);
}