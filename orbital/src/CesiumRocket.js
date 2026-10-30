import {
    Cartesian3 as V,
    Cartographic,
    Ellipsoid,
    Matrix3,
    Matrix4,
    Quaternion,
    Transforms
} from "cesium";

const Z = new V(0, 0, 1);
const earth = Ellipsoid.WGS84;

const FEET = [
    [1.10,0,-15.5], [-1.10,0,-15.5], [0,1.10,-15.5], [0,-1.10,-15.5]
];
const BODY = [
    [0,0,-15.20], [1.12,0,-14.70], [-1.12,0,-14.70],
    [0,1.12,-14.70], [0,-1.12,-14.70], [0,0,14.80],
    [1.12,0,2.5], [-1.12,0,2.5]
];

export class CesiumRocket {
    constructor(longitude, latitude, groundHeight) {
        this.spawn = Cartographic.fromDegrees(
            longitude,
            latitude,
            groundHeight + 15.5
        );

        this.reset();
    }

    reset() {
        this.position = earth.cartographicToCartesian(
            this.spawn
        );

        this.velocity = new V();
        this.throttle = 0;
        this.landed = true;
        this.crashed = false;
        this.waitingForGround = false;
        this.reason = "Ready on landing legs";
        this.landing = null;

        this.align();
        this.universe?.resetRocket();
    }

    align() {
        const frame = Transforms.eastNorthUpToFixedFrame(
            this.position
        );

        this.attitude = Quaternion.fromRotationMatrix(
            Matrix4.getMatrix3(frame, new Matrix3())
        );

        if (this.universe) {
            this.universe.attitude = Quaternion.multiply(
                Quaternion.fromRotationMatrix(
                    this.universe.earthRotation()
                ),
                this.attitude,
                new Quaternion()
            );
        }
    }

    offset(x, y, z) {
        const point = Matrix3.multiplyByVector(
            Matrix3.fromQuaternion(this.attitude),
            new V(x, y, z),
            new V()
        );

        return V.add(this.position, point, point);
    }

    feet() {
        return FEET.map(point => this.offset(...point));
    }

    earthInspect(ground) {
        const up = earth.geodeticSurfaceNormal(
            this.position,
            new V()
        );

        const axis = Matrix3.multiplyByVector(
            Matrix3.fromQuaternion(this.attitude),
            Z,
            new V()
        );

        const vertical = V.dot(this.velocity, up);

        const horizontal = Math.sqrt(
            Math.max(
                0,
                V.magnitudeSquared(this.velocity) -
                    vertical * vertical
            )
        );

        const tilt =
            Math.acos(
                Math.min(
                    1,
                    Math.max(-1, V.dot(axis, up))
                )
            ) *
            180 /
            Math.PI;

        const points = this.feet();
        const heights = points.map(point =>
            ground.heightAt(point)
        );

        const known = heights.every(Number.isFinite);

        const result = {
            vertical,
            horizontal,
            tilt,
            known,
            clearance: Infinity,
            slope: 0,
            spread: 0,
            bodyStrike: false
        };

        if (!known) {
            result.canFly =
                earth.cartesianToCartographic(
                    this.position
                ).height > 15000;

            return result;
        }

        const clearances = points.map(
            (point, index) =>
                earth.cartesianToCartographic(point).height -
                heights[index]
        );

        result.clearance = Math.min(...clearances);

        result.spread =
            Math.max(...clearances) - result.clearance;

        result.precise = points.every(point =>
            ground.preciseAt(point)
        );

        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const a = earth.scaleToGeodeticSurface(
                    points[i],
                    new V()
                );

                const b = earth.scaleToGeodeticSurface(
                    points[j],
                    new V()
                );

                const distance = V.distance(a, b);

                if (distance > 0.1) {
                    result.slope = Math.max(
                        result.slope,
                        Math.atan2(
                            Math.abs(
                                heights[i] - heights[j]
                            ),
                            distance
                        ) *
                            180 /
                            Math.PI
                    );
                }
            }
        }

        result.bodyStrike = BODY.some(offset => {
            const point = this.offset(...offset);
            const height = ground.heightAt(point);

            return (
                Number.isFinite(height) &&
                earth.cartesianToCartographic(point).height <
                    height - 0.02
            );
        });

        result.canFly =
            result.clearance > 25 || result.precise;

        return result;
    }

    inspect(ground) {
        return this.universe
            ? this.universe.inspect(ground)
            : this.earthInspect(ground);
    }

    step(dt, keys, ground) {
        if (!this.universe) {
            throw new Error(
                "Rocket is not attached to the gravity simulation"
            );
        }

        return this.universe.step(dt, keys, ground);
    }
}