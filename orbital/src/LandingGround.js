import {
    Cartesian3 as V,
    Ellipsoid,
    Matrix4,
    Transforms,
    sampleTerrainMostDetailed
} from "cesium";

const earth = Ellipsoid.WGS84;
const SPACING = 8;

export class LandingGround {
    constructor(provider, globe, padPoint, padTop) {
        Object.assign(this, {
            provider,
            globe,
            padPoint,
            padTop
        });

        this.cache = null;
        this.pending = false;
        this.version = 0;
        this.failed = false;
        this.lastRequest = -Infinity;
    }

    surfaceDistance(a, b) {
        return V.distance(
            earth.scaleToGeodeticSurface(a, new V()),
            earth.scaleToGeodeticSurface(b, new V())
        );
    }

    onPad(point) {
        return this.surfaceDistance(
            point,
            this.padPoint
        ) <= 11.5;
    }

    coordinates(point) {
        if (!this.cache) return null;

        const surface =
            earth.scaleToGeodeticSurface(
                point,
                new V()
            );

        const local = Matrix4.multiplyByPoint(
            this.cache.inverse,
            surface,
            new V()
        );

        return (
            Math.abs(local.x) <= SPACING &&
            Math.abs(local.y) <= SPACING
        ) ? local : null;
    }

    preciseAt(point) {
        return (
            this.onPad(point) ||
            this.coordinates(point) !== null
        );
    }

    heightAt(point) {
        if (this.onPad(point)) {
            return this.padTop;
        }

        const local = this.coordinates(point);

        if (local) {
            const gx = Math.min(
                1.999999,
                Math.max(0, local.x / SPACING + 1)
            );

            const gy = Math.min(
                1.999999,
                Math.max(0, local.y / SPACING + 1)
            );

            const x = Math.floor(gx);
            const y = Math.floor(gy);

            const u = gx - x;
            const v = gy - y;

            const h = this.cache.heights;

            return (
                (1 - v) * (
                    (1 - u) * h[y * 3 + x] +
                    u * h[y * 3 + x + 1]
                ) +

                v * (
                    (1 - u) * h[(y + 1) * 3 + x] +
                    u * h[(y + 1) * 3 + x + 1]
                )
            );
        }

        return this.globe.getHeight(
            earth.cartesianToCartographic(point)
        );
    }

    reset() {
        this.version++;
        this.cache = null;
        this.failed = false;
    }

    async refresh(position) {
        if (
            this.pending ||
            performance.now() - this.lastRequest < 500
        ) {
            return;
        }

        const geo =
            earth.cartesianToCartographic(position);

        if (geo.height > 15000) return;

        if (
            this.onPad(position) &&
            this.surfaceDistance(
                position,
                this.padPoint
            ) < 6
        ) {
            return;
        }

        const surface =
            earth.scaleToGeodeticSurface(
                position,
                new V()
            );

        if (
            this.cache &&
            V.distance(
                surface,
                this.cache.anchor
            ) < 2
        ) {
            return;
        }

        this.pending = true;
        this.lastRequest = performance.now();

        const version = this.version;

        const frame =
            Transforms.eastNorthUpToFixedFrame(
                surface
            );

        const positions = [];

        for (const y of [-SPACING, 0, SPACING]) {
            for (const x of [-SPACING, 0, SPACING]) {
                const world = Matrix4.multiplyByPoint(
                    frame,
                    new V(x, y, 0),
                    new V()
                );

                positions.push(
                    earth.cartesianToCartographic(world)
                );
            }
        }

        try {
            const result =
                await sampleTerrainMostDetailed(
                    this.provider,
                    positions,
                    true
                );

            if (version !== this.version) return;

            if (
                !result.every(
                    point => Number.isFinite(point.height)
                )
            ) {
                throw new Error(
                    "Terrain heights unavailable"
                );
            }

            this.cache = {
                anchor: surface,

                inverse:
                    Matrix4.inverseTransformation(
                        frame,
                        new Matrix4()
                    ),

                heights: result.map(
                    point => point.height
                )
            };

            this.failed = false;
        } catch {
            if (version === this.version) {
                this.failed = true;
            }
        } finally {
            this.pending = false;
        }
    }
}