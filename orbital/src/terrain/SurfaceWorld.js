import * as THREE from "three";

export class SurfaceWorld {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x9bc6e1);
        this.scene.fog = new THREE.Fog(0x9bc6e1, 350, 1500);

        // Lighting
        this.scene.add(
            new THREE.HemisphereLight(
                0xc7e6ff,
                0x68563b,
                2
            )
        );

        const sun = new THREE.DirectionalLight(
            0xffefd1,
            3
        );

        sun.position.set(-300, 500, -200);
        this.scene.add(sun);

        // Local terrain dimensions, in metres
        this.size = 2400;
        this.segments = 240;
        this.cell = this.size / this.segments;

        const geometry = new THREE.PlaneGeometry(
            this.size,
            this.size,
            this.segments,
            this.segments
        );

        geometry.rotateX(-Math.PI / 2);

        const vertices = geometry.attributes.position;
        const colors = [];
        const color = new THREE.Color();

        for (let i = 0; i < vertices.count; i++) {
            const x = vertices.getX(i);
            const z = vertices.getZ(i);
            const height = this.height(x, z);

            vertices.setY(i, height);

            const slope = Math.hypot(
                this.height(x + 2, z) - height,
                this.height(x, z + 2) - height
            ) / 2;

            if (slope > 0.5) {
                color.set(0x817d6d);
            } else if (height > 90) {
                color.set(0x79815b);
            } else {
                color.set(0x638143);
            }

            color.multiplyScalar(
                0.88 +
                0.12 * Math.sin(x * 0.31 + z * 0.27)
            );

            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(colors, 3)
        );

        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 1,
            flatShading: true
        });

        this.scene.add(
            new THREE.Mesh(geometry, material)
        );

        // Rocks give the surface a visible sense of scale
        const rocks = new THREE.InstancedMesh(
            new THREE.DodecahedronGeometry(1, 0),

            new THREE.MeshStandardMaterial({
                color: 0x777568,
                roughness: 1,
                flatShading: true
            }),

            180
        );

        const dummy = new THREE.Object3D();

        for (let i = 0; i < 180; i++) {
            const x = Math.sin(i * 127.1) * 1000;
            const z = Math.sin(i * 311.7) * 1000;

            const size =
                0.6 + (Math.sin(i * 19.3) + 1) * 1.8;

            dummy.position.set(
                x,
                this.groundHeight(x, z) + size * 0.3,
                z
            );

            dummy.scale.set(
                size,
                size * 0.7,
                size * 1.3
            );

            dummy.rotation.set(i, i * 0.7, 0);
            dummy.updateMatrix();

            rocks.setMatrixAt(i, dummy.matrix);
        }

        this.scene.add(rocks);

        // Player
        this.keys = new Set();
        this.yaw = 0;
        this.pitch = 0;
        this.eyeHeight = 1.75;
        this.active = false;

        window.addEventListener("keydown", (event) => {
            if (
                !this.active ||
                document.pointerLockElement !== this.canvas
            ) {
                return;
            }

            if (
                [
                    "KeyW",
                    "KeyA",
                    "KeyS",
                    "KeyD",
                    "ShiftLeft",
                    "ShiftRight",
                    "Space"
                ].includes(event.code)
            ) {
                event.preventDefault();
            }

            this.keys.add(event.code);
        });

        window.addEventListener("keyup", (event) => {
            this.keys.delete(event.code);
        });

        window.addEventListener("blur", () => {
            this.keys.clear();
        });

        document.addEventListener(
            "pointerlockchange",
            () => this.keys.clear()
        );

        document.addEventListener("mousemove", (event) => {
            if (
                !this.active ||
                document.pointerLockElement !== this.canvas
            ) {
                return;
            }

            this.yaw -= event.movementX * 0.002;

            this.pitch = THREE.MathUtils.clamp(
                this.pitch - event.movementY * 0.002,
                -1.45,
                1.45
            );
        });

        this.canvas.addEventListener("click", () => {
            if (
                !this.active ||
                document.pointerLockElement === this.canvas
            ) {
                return;
            }

            try {
                const request =
                    this.canvas.requestPointerLock();

                request?.catch(() => {});
            } catch {
                // A later click can retry mouse capture.
            }
        });
    }

    // Procedural hills
    height(x, z) {
        return (
            35 * Math.sin(x / 180) * Math.cos(z / 210) +

            12 * Math.sin(x / 65 + z / 90) +

            5 * Math.cos(z / 32) * Math.sin(x / 42) +

            150 * Math.exp(
                -(
                    (x - 450) ** 2 +
                    (z + 400) ** 2
                ) / 180000
            )
        );
    }

    // Interpolate the actual terrain triangles so the
    // player's feet stay on the rendered ground.
    groundHeight(x, z) {
        const gx = THREE.MathUtils.clamp(
            (x + this.size / 2) / this.cell,
            0,
            this.segments - 0.000001
        );

        const gz = THREE.MathUtils.clamp(
            (z + this.size / 2) / this.cell,
            0,
            this.segments - 0.000001
        );

        const ix = Math.floor(gx);
        const iz = Math.floor(gz);

        const u = gx - ix;
        const v = gz - iz;

        const x0 = ix * this.cell - this.size / 2;
        const z0 = iz * this.cell - this.size / 2;

        const a = this.height(x0, z0);

        const b = this.height(
            x0,
            z0 + this.cell
        );

        const c = this.height(
            x0 + this.cell,
            z0
        );

        const d = this.height(
            x0 + this.cell,
            z0 + this.cell
        );

        if (u + v <= 1) {
            return (
                a +
                u * (c - a) +
                v * (b - a)
            );
        }

        return (
            d +
            (1 - u) * (b - d) +
            (1 - v) * (c - d)
        );
    }

    enter() {
        this.active = true;
        this.keys.clear();

        this.camera.near = 0.1;
        this.camera.far = 5000;
        this.camera.updateProjectionMatrix();

        this.camera.position.set(
            0,
            this.groundHeight(0, 100) + this.eyeHeight,
            100
        );

        this.yaw = 0;
        this.pitch = 0;

        this.camera.rotation.set(
            0,
            0,
            0,
            "YXZ"
        );
    }

    update(deltaTime) {
        if (
            document.pointerLockElement === this.canvas
        ) {
            const forward =
                Number(this.keys.has("KeyW")) -
                Number(this.keys.has("KeyS"));

            const right =
                Number(this.keys.has("KeyD")) -
                Number(this.keys.has("KeyA"));

            const length =
                Math.hypot(forward, right) || 1;

            const running =
                this.keys.has("ShiftLeft") ||
                this.keys.has("ShiftRight");

            const speed = running ? 10 : 4;
            const distance = speed * deltaTime;

            const dx = (
                right * Math.cos(this.yaw) -
                forward * Math.sin(this.yaw)
            ) / length * distance;

            const dz = (
                -forward * Math.cos(this.yaw) -
                right * Math.sin(this.yaw)
            ) / length * distance;

            const limit = this.size / 2 - 5;

            this.camera.position.x = THREE.MathUtils.clamp(
                this.camera.position.x + dx,
                -limit,
                limit
            );

            this.camera.position.z = THREE.MathUtils.clamp(
                this.camera.position.z + dz,
                -limit,
                limit
            );
        }

        this.camera.position.y = this.groundHeight(
            this.camera.position.x,
            this.camera.position.z
        ) + this.eyeHeight;

        this.camera.rotation.set(
            this.pitch,
            this.yaw,
            0,
            "YXZ"
        );
    }
}