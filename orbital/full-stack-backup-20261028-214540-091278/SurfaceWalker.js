import {
    Cartesian3 as V,
    Ellipsoid,
    Matrix4,
    Matrix3,
    Transforms,
    sampleTerrainMostDetailed
} from "cesium";

import { LandingGround } from "./LandingGround.js";

const earth = Ellipsoid.WGS84;

class WalkingGround extends LandingGround {
    onPad(point) {
        return this.surfaceDistance(
            point,
            this.padPoint
        ) <= 12;
    }
}

export class SurfaceWalker {
    constructor(provider, globe, padPoint, padTop) {
        this.ground = new WalkingGround(
            provider,
            globe,
            padPoint,
            padTop
        );

        this.position = null;
        this.active = false;

        this.running = false;
        this.actualSpeed = 0;

        this.yaw = 0;
        this.pitch = 0;
        this.verticalSpeed = 0;

        this.waiting = false;
        this.message = "";
        this.version = 0;
    }

    leave() {
        this.version++;
        this.active = false;
        this.verticalSpeed = 0;
        this.running = false;
        this.actualSpeed = 0;
    }

    async enter(rocket) {
        const version = ++this.version;

        const point = rocket.offset(0, 5, -5.5);

        const geo =
            earth.cartesianToCartographic(point);

        let height;

        if (this.ground.onPad(point)) {
            height = this.ground.padTop;
        } else {
            const [result] =
                await sampleTerrainMostDetailed(
                    this.ground.provider,
                    [geo],
                    true
                );

            height = result.height;
        }

        if (version !== this.version) {
            return false;
        }

        if (!Number.isFinite(height)) {
            throw new Error(
                "Ground height unavailable"
            );
        }

        geo.height = height;

        this.position =
            earth.cartographicToCartesian(geo);

        this.verticalSpeed = 0;
        this.pitch = 0;
        this.active = true;
        this.waiting = false;
        this.message = "";

        const frame =
            Transforms.eastNorthUpToFixedFrame(
                this.position
            );

        const inverse =
            Matrix4.inverseTransformation(
                frame,
                new Matrix4()
            );

        const target = Matrix4.multiplyByPoint(
            inverse,
            rocket.position,
            new V()
        );

        this.yaw = Math.atan2(
            target.x,
            target.y
        );

        void this.ground.refresh(this.position);

        return true;
    }

    distanceTo(rocket) {
        return this.ground.surfaceDistance(
            this.position,
            rocket.position
        );
    }

    canBoard(rocket) {
        const player =
            earth.cartesianToCartographic(
                this.position
            );

        const craft =
            earth.cartesianToCartographic(
                rocket.position
            );

        if (this.ground.onPad(rocket.position)) {
            return this.distanceTo(rocket) <= 16;
        }

        return (
            this.distanceTo(rocket) <= 8 &&
            Math.abs(
                player.height -
                (craft.height - 5.5)
            ) <= 3
        );
    }

    look(dx, dy) {
        this.yaw += dx * 0.002;

        this.pitch = Math.max(
            -1.55,
            Math.min(
                1.55,
                this.pitch - dy * 0.002
            )
        );
    }

    update(dt, keys, rocket, movementEnabled = true) {
        if (!this.active) return;

        void this.ground.refresh(this.position);

        this.waiting = false;
        this.message = "";

        const before = V.clone(this.position);

        const count = Math.max(
            1,
            Math.ceil(dt / 0.01)
        );

        for (let i = 0; i < count; i++) {
            this.step(
                dt / count,
                keys,
                rocket,
                movementEnabled
            );
        }

        this.actualSpeed = dt > 0
            ? this.ground.surfaceDistance(
                before,
                this.position
            ) / dt
            : 0;
    }

    step(dt, keys, rocket, movementEnabled) {
        const frame =
            Transforms.eastNorthUpToFixedFrame(
                this.position
            );

        const forward = movementEnabled
            ? Number(keys.has("KeyW")) -
              Number(keys.has("KeyS"))
            : 0;

        const right = movementEnabled
            ? Number(keys.has("KeyD")) -
              Number(keys.has("KeyA"))
            : 0;

        const running =
            this.running ||
            keys.has("ShiftLeft") ||
            keys.has("ShiftRight");

        const speed = running ? 7 : 3.5;

        const distance =
            speed *
            dt /
            (Math.hypot(forward, right) || 1);

        const x = (
            forward * Math.sin(this.yaw) +
            right * Math.cos(this.yaw)
        ) * distance;

        const y = (
            forward * Math.cos(this.yaw) -
            right * Math.sin(this.yaw)
        ) * distance;

        const candidate =
            Matrix4.multiplyByPoint(
                frame,
                new V(x, y, 0),
                new V()
            );

        if (
            this.ground.surfaceDistance(
                candidate,
                rocket.position
            ) < 1.8
        ) {
            this.message =
                "The rocket blocks the way.";

            return;
        }

        void this.ground.refresh(candidate);

        if (!this.ground.preciseAt(candidate)) {
            this.waiting = true;
            return;
        }

        const height =
            this.ground.heightAt(candidate);

        if (!Number.isFinite(height)) {
            this.waiting = true;
            return;
        }

        const old =
            earth.cartesianToCartographic(
                this.position
            );

        const next =
            earth.cartesianToCartographic(
                candidate
            );

        const currentGround =
            this.ground.heightAt(this.position);

        const horizontal = Math.hypot(x, y);

        if (
            horizontal > 0 &&
            Number.isFinite(currentGround) &&
            height - currentGround > horizontal + 0.01
        ) {
            this.message = "Too steep to climb.";
            return;
        }

        this.verticalSpeed -= 9.81 * dt;

        next.height =
            old.height +
            this.verticalSpeed * dt;

        if (next.height <= height) {
            next.height = height;
            this.verticalSpeed = 0;
        }

        this.position =
            earth.cartographicToCartesian(next);
    }

    applyCamera(camera) {
        const frame =
            Transforms.eastNorthUpToFixedFrame(
                this.position
            );

        const rotation =
            Matrix4.getMatrix3(
                frame,
                new Matrix3()
            );

        const c = Math.cos(this.pitch);
        const s = Math.sin(this.pitch);

        const direction = new V(
            Math.sin(this.yaw) * c,
            Math.cos(this.yaw) * c,
            s
        );

        const up = new V(
            -Math.sin(this.yaw) * s,
            -Math.cos(this.yaw) * s,
            c
        );

        camera.lookAtTransform(
            Matrix4.IDENTITY
        );

        camera.setView({
            destination: Matrix4.multiplyByPoint(
                frame,
                new V(0, 0, 1.75),
                new V()
            ),

            orientation: {
                direction:
                    Matrix3.multiplyByVector(
                        rotation,
                        direction,
                        new V()
                    ),

                up:
                    Matrix3.multiplyByVector(
                        rotation,
                        up,
                        new V()
                    )
            }
        });
    }
}