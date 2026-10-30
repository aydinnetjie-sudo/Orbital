import * as THREE from "three";

import { Engine } from "./Engine.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import { Sun } from "../world/bodies/Sun.js";
import { Earth } from "../world/bodies/Earth.js";
import { Moon } from "../world/bodies/Moon.js";

import { Gravity } from "../simulation/Gravity.js";
import { Time } from "../simulation/Time.js";
import { Stars } from "../world/Stars.js";

const SCALE = 1000;
const Y = new THREE.Vector3(0, 1, 0);


// ------------------------------------------------------------
// Depth support for custom Sun and atmosphere shaders
// ------------------------------------------------------------

function enableDepth(material) {
    if (
        material.vertexShader.includes(
            "logdepthbuf_pars_vertex"
        )
    ) {
        return;
    }

    material.vertexShader =
        "#include <logdepthbuf_pars_vertex>\n" +
        material.vertexShader;

    const end = material.vertexShader.lastIndexOf("}");

    material.vertexShader =
        material.vertexShader.slice(0, end) +
        "\n#include <logdepthbuf_vertex>\n" +
        material.vertexShader.slice(end);

    material.fragmentShader =
        "#include <logdepthbuf_pars_fragment>\n" +
        material.fragmentShader;

    material.fragmentShader =
        material.fragmentShader.replace(
            /void\s+main\s*\(\s*\)\s*\{/,
            "$&\n#include <logdepthbuf_fragment>\n"
        );

    material.needsUpdate = true;
}


// ------------------------------------------------------------
// Temporary procedural terrain
// ------------------------------------------------------------

class Ground {
    constructor(scene, earth) {
        this.earth = earth;
        this.radius = earth.radius;

        this.center = null;
        this.base = new THREE.Vector3();

        this.mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(
                20000,
                20000,
                160,
                160
            ),

            new THREE.MeshStandardMaterial({
                vertexColors: true,
                roughness: 1,
                flatShading: true,
                transparent: true
            })
        );

        this.mesh.frustumCulled = false;

        scene.add(this.mesh);
    }

    height(normal) {
        const x = normal.x * this.radius;
        const y = normal.y * this.radius;
        const z = normal.z * this.radius;

        return (
            180 +

            70 *
            Math.sin(x / 1600) *
            Math.cos(z / 1900) +

            45 *
            Math.sin(z / 750 + y / 1100) +

            20 *
            Math.cos(x / 420 - y / 670)
        );
    }

    rebuild(center) {
        this.center = center.clone();

        this.base
            .copy(center)
            .multiplyScalar(this.radius);

        const reference =
            Math.abs(center.y) > 0.9
                ? new THREE.Vector3(1, 0, 0)
                : Y;

        const east = new THREE.Vector3()
            .crossVectors(reference, center)
            .normalize();

        const north = new THREE.Vector3()
            .crossVectors(center, east)
            .normalize();

        const geometry = this.mesh.geometry;
        const positions = geometry.attributes.position;

        const colors = [];
        const color = new THREE.Color();

        for (let i = 0; i < positions.count; i++) {
            const x =
                (i % 161) / 160 * 20000 - 10000;

            const z =
                Math.floor(i / 161) / 160 * 20000 - 10000;

            const normal = center.clone()
                .addScaledVector(
                    east,
                    x / this.radius
                )
                .addScaledVector(
                    north,
                    -z / this.radius
                )
                .normalize();

            const height = this.height(normal);

            const position = normal
                .multiplyScalar(this.radius + height)
                .sub(this.base)
                .divideScalar(SCALE);

            positions.setXYZ(
                i,
                position.x,
                position.y,
                position.z
            );

            color.set(
                height > 240
                    ? 0x8b8971
                    : height > 170
                        ? 0x7b884f
                        : 0x587940
            );

            color.multiplyScalar(
                0.9 + 0.1 * Math.sin(x / 75 + z / 90)
            );

            colors.push(color.r, color.g, color.b);
        }

        positions.needsUpdate = true;

        geometry.setAttribute(
            "color",
            new THREE.Float32BufferAttribute(colors, 3)
        );

        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
    }

    update(localNormal, altitude, rotation, origin) {
        this.mesh.visible = altitude < 30000;

        if (!this.mesh.visible) return;

        const movedDistance = this.center
            ? this.center.distanceTo(localNormal) *
              this.radius
            : Infinity;

        if (movedDistance > 2000) {
            this.rebuild(localNormal);
        }

        this.mesh.quaternion.copy(rotation);

        this.mesh.position
            .copy(this.base)
            .applyQuaternion(rotation)
            .add(this.earth.position)
            .sub(origin)
            .divideScalar(SCALE);

        this.mesh.material.opacity =
            1 - THREE.MathUtils.smoothstep(
                altitude,
                10000,
                30000
            );
    }
}


// ------------------------------------------------------------
// Game
// ------------------------------------------------------------

export class Game {
    constructor() {
        this.engine = new Engine();

        const {
            scene,
            camera,
            controls
        } = this.engine;

        this.scene = scene;
        this.camera = camera;
        this.controls = controls;
        this.canvas = this.engine.renderer.domElement;

        this.engine.world = this;

        // Bloom and final colour conversion.
        if (this.engine.bloomPass) {
    this.engine.bloomPass.enabled = true;
    this.engine.bloomPass.strength = 2.0;
    this.engine.bloomPass.radius = 0.4;
    this.engine.bloomPass.threshold = 2.0;
        }

        const hasOutputPass =
            this.engine.composer.passes.some(
                pass => pass.isOutputPass
            );

        if (!hasOutputPass) {
            this.engine.composer.addPass(
                new OutputPass()
            );
        }

        // Kilometre render scale; physics remain in metres.
        camera.near = 0.0001;
        camera.far = 1e9;
        camera.updateProjectionMatrix();

        controls.minDistance = 0.012;
        controls.maxDistance = 100000;
        controls.enablePan = false;

        // Celestial bodies.
        this.sun = new Sun();
        // Increase the Sun's HDR brightness before bloom.
this.sun.material.fragmentShader =
    this.sun.material.fragmentShader.replace(
        /gl_FragColor\s*=\s*vec4\(\s*color\s*,\s*1\.0\s*\)\s*;/,
        "gl_FragColor = vec4(color * 8.0, 1.0);"
    );

this.sun.material.needsUpdate = true;
        this.earth = new Earth();
        this.moon = new Moon();

        this.earth.mass = 5.9722e24;

        this.bodies = [
            this.sun,
            this.earth,
            this.moon
        ];

        this.gravity = new Gravity();
        this.time = new Time();
        this.effectiveWarp = 1;

        // Star field.
        this.stars = new Stars(camera);

        this.stars.mesh.material.size = 1.5;
        this.stars.mesh.material.sizeAttenuation = false;
        this.stars.mesh.material.transparent = true;
        this.stars.mesh.material.depthWrite = false;

        this.stars.mesh.renderOrder = -900;

        scene.add(this.stars.mesh);

        for (const body of this.bodies) {
            body.group.traverse(object => {
                if (object.material?.isShaderMaterial) {
                    enableDepth(object.material);
                }
            });

            scene.add(body.group);
        }

        scene.add(
            this.sun.light,
            this.sun.light.target
        );

        // Use standard lighting for Earth's surface.
        const oldMaterial = this.earth.mesh.material;
        const loader = new THREE.TextureLoader();

        const day =
            oldMaterial.uniforms?.dayMap?.value ??
            oldMaterial.map ??
            loader.load("/textures/earth/day.jpg");

        const night =
            oldMaterial.uniforms?.nightMap?.value ??
            oldMaterial.emissiveMap ??
            loader.load("/textures/earth/night.jpg");

        day.colorSpace = THREE.SRGBColorSpace;
        night.colorSpace = THREE.SRGBColorSpace;

        this.earth.material =
            new THREE.MeshPhongMaterial({
                map: day,
                emissiveMap: night,
                emissive: 0xffffff,
                emissiveIntensity: 0.35,
                color: 0xffffff,
                shininess: 8
            });

        this.earth.mesh.material =
            this.earth.material;

        oldMaterial.dispose();

        this.ground = new Ground(
            scene,
            this.earth
        );

        // Flight state.
        this.keys = new Set();

        this.throttle = 0;
        this.landed = true;

        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        this.attitude = new THREE.Quaternion();
        this.origin = new THREE.Vector3();

        // Daylight starting position.
        this.spawnNormal = new THREE.Vector3(
            -Math.sqrt(0.75),
            0,
            0.5
        );

        // Camera modes.
        this.cockpit = false;
        this.lookYaw = 0;
        this.lookPitch = 0;

        this.onFoot = false;
        this.walkYaw = 0;
        this.walkPitch = 0;
        this.walkNormal = this.spawnNormal.clone();

        this.rocket = this.makeRocket();

        scene.add(this.rocket);

        this.makeSky();
        this.makeHUD();
        this.setupInput();

        this.reset();
    }

    makeHUD() {
        const hud = document.createElement("div");

        hud.className = "surface-hud";

        hud.innerHTML = `
            <strong>ORBITAL · FLIGHT TEST</strong>

            <p id="telemetry"></p>

            <p>
                Space: full thrust<br>
                Shift / Ctrl: throttle<br>
                W/S: pitch · A/D: yaw · Q/E: roll<br>
                V: cockpit / external camera<br>
                F: exit / board on ground<br>
                [ / ]: time warp · R: reset<br>
                On foot: click to look, WASD to walk
            </p>
        `;

        document.body.appendChild(hud);

        this.telemetry =
            hud.querySelector("#telemetry");
    }

    setupInput() {
        this.canvas.addEventListener("click", () => {
            if (
                (this.onFoot || this.cockpit) &&
                document.pointerLockElement !== this.canvas
            ) {
                this.captureMouse();
            }
        });

        document.addEventListener("mousemove", event => {
            if (
                document.pointerLockElement !== this.canvas
            ) {
                return;
            }

            const limit = Math.PI / 2 - 0.01;

            if (this.onFoot) {
                this.walkYaw +=
                    event.movementX * 0.002;

                this.walkPitch = THREE.MathUtils.clamp(
                    this.walkPitch -
                    event.movementY * 0.002,
                    -limit,
                    limit
                );
            } else if (this.cockpit) {
                this.lookYaw -=
                    event.movementX * 0.002;

                this.lookPitch = THREE.MathUtils.clamp(
                    this.lookPitch -
                    event.movementY * 0.002,
                    -limit,
                    limit
                );
            }
        });

        document.addEventListener(
            "pointerlockchange",
            () => this.keys.clear()
        );

        window.addEventListener("keydown", event => {
            if (
                [
                    "Space",
                    "ControlLeft",
                    "ControlRight",
                    "KeyW",
                    "KeyS",
                    "KeyA",
                    "KeyD",
                    "KeyQ",
                    "KeyE"
                ].includes(event.code)
            ) {
                event.preventDefault();
            }

            this.keys.add(event.code);

            if (
                event.code === "BracketRight" &&
                !event.repeat
            ) {
                this.time.increase();
            }

            if (
                event.code === "BracketLeft" &&
                !event.repeat
            ) {
                this.time.decrease();
            }

            if (
                event.code === "Space" &&
                !this.onFoot
            ) {
                this.throttle = 1;
            }

            if (
                event.code === "KeyV" &&
                !event.repeat
            ) {
                this.toggleCockpit();
            }

            if (
                event.code === "KeyF" &&
                !event.repeat
            ) {
                this.toggleWalking();
            }

            if (
                event.code === "KeyR" &&
                !event.repeat
            ) {
                this.reset();
            }
        });

        window.addEventListener("keyup", event => {
            this.keys.delete(event.code);
        });

        window.addEventListener("blur", () => {
            this.keys.clear();
        });
    }

    captureMouse() {
        try {
            this.canvas
                .requestPointerLock()
                ?.catch(() => {});
        } catch {
            // Clicking again can retry.
        }
    }

    makeRocket() {
        const group = new THREE.Group();

        const white = new THREE.MeshStandardMaterial({
            color: 0xe6e8e9,
            roughness: 0.45,
            metalness: 0.2
        });

        const body = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 8, 20),
            white
        );

        const nose = new THREE.Mesh(
            new THREE.ConeGeometry(1, 3, 20),
            white
        );

        nose.position.y = 5.5;

        group.add(body, nose);

        const engine = new THREE.Mesh(
            new THREE.CylinderGeometry(
                0.6,
                0.8,
                1,
                16
            ),

            new THREE.MeshStandardMaterial({
                color: 0x30343b,
                metalness: 0.7,
                roughness: 0.4
            })
        );

        engine.position.y = -4;

        group.add(engine);

        this.flame = new THREE.Mesh(
            new THREE.ConeGeometry(0.65, 6, 12),

            new THREE.MeshBasicMaterial({
                color: 0xffb33d
            })
        );

        this.flame.rotation.z = Math.PI;
        this.flame.position.y = -7.5;

        group.add(this.flame);

        group.scale.setScalar(1 / SCALE);

        return group;
    }

    makeSky() {
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            depthWrite: false,
            depthTest: false,

            uniforms: {
                up: {
                    value: new THREE.Vector3()
                },

                sun: {
                    value: new THREE.Vector3()
                },

                air: {
                    value: 1
                }
            },

            vertexShader: `
                varying vec3 direction;

                void main() {
                    direction = position;

                    gl_Position =
                        projectionMatrix *
                        modelViewMatrix *
                        vec4(position, 1.0);
                }
            `,

            fragmentShader: `
                varying vec3 direction;

                uniform vec3 up;
                uniform vec3 sun;
                uniform float air;

                void main() {
                    vec3 d = normalize(direction);

                    float day = smoothstep(
                        -0.15,
                        0.1,
                        dot(up, sun)
                    );

                    float elevation = max(
                        dot(d, up),
                        0.0
                    );

                    vec3 blue = mix(
                        vec3(0.55, 0.72, 0.85),
                        vec3(0.10, 0.32, 0.65),
                        pow(elevation, 0.4)
                    );

                    float glow = pow(
                        max(dot(d, sun), 0.0),
                        80.0
                    );

                    vec3 color = mix(
                        vec3(0.001, 0.002, 0.006),
                        blue,
                        day * air
                    );

                    color +=
                        vec3(0.3, 0.2, 0.08) *
                        glow *
                        air *
                        day;

                    gl_FragColor = vec4(color, 1.0);
                }
            `
        });

        this.sky = new THREE.Mesh(
            new THREE.SphereGeometry(5e8, 24, 16),
            material
        );

        this.sky.frustumCulled = false;
        this.sky.renderOrder = -1000;

        this.scene.add(this.sky);
    }

    rotation() {
        return new THREE.Quaternion()
            .setFromEuler(this.earth.rotation);
    }

    groundVelocity(radial) {
        const rotationalVelocity =
            new THREE.Vector3(
                0,
                this.earth.rotationSpeed,
                0
            ).cross(radial);

        return this.earth.velocity
            .clone()
            .add(rotationalVelocity);
    }

    toggleCockpit() {
        if (this.onFoot) return;

        this.cockpit = !this.cockpit;

        this.controls.enabled = !this.cockpit;

        // No interior model exists yet.
        this.rocket.visible = !this.cockpit;

        this.lookYaw = 0;
        this.lookPitch = 0;

        if (this.cockpit) {
            this.captureMouse();
        } else {
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }

            const up = Y.clone()
                .applyQuaternion(this.attitude);

            const back = new THREE.Vector3(0, 0, 1)
                .applyQuaternion(this.attitude);

            this.camera.up.copy(up);

            this.camera.position
                .copy(up)
                .multiplyScalar(0.018)
                .addScaledVector(back, 0.035);

            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }

    updateCockpit() {
        if (!this.cockpit || this.onFoot) return;

        this.camera.position
            .set(0, 3, 0)
            .applyQuaternion(this.attitude)
            .divideScalar(SCALE);

        const look = new THREE.Quaternion()
            .setFromEuler(
                new THREE.Euler(
                    this.lookPitch,
                    this.lookYaw,
                    0,
                    "YXZ"
                )
            );

        this.camera.quaternion
            .copy(this.attitude)
            .multiply(look);

        this.camera.up
            .copy(Y)
            .applyQuaternion(this.attitude);
    }

    toggleWalking() {
        if (!this.landed) return;

        this.cockpit = false;
        this.rocket.visible = true;

        if (!this.onFoot) {
            this.onFoot = true;
            this.throttle = 0;

            const reference =
                Math.abs(this.spawnNormal.y) > 0.9
                    ? new THREE.Vector3(1, 0, 0)
                    : Y;

            const east = new THREE.Vector3()
                .crossVectors(
                    reference,
                    this.spawnNormal
                )
                .normalize();

            this.walkNormal
                .copy(this.spawnNormal)
                .addScaledVector(
                    east,
                    8 / this.earth.radius
                )
                .normalize();

            this.walkYaw = 0;
            this.walkPitch = 0;

            this.controls.enabled = false;
        } else {
            const distance =
                this.walkNormal.distanceTo(
                    this.spawnNormal
                ) * this.earth.radius;

            if (distance > 15) return;

            this.onFoot = false;

            if (document.pointerLockElement) {
                document.exitPointerLock();
            }

            const normal = this.spawnNormal
                .clone()
                .applyQuaternion(this.rotation());

            const reference =
                Math.abs(normal.y) > 0.9
                    ? new THREE.Vector3(1, 0, 0)
                    : Y;

            const tangent = new THREE.Vector3()
                .crossVectors(normal, reference)
                .normalize();

            this.camera.up.copy(normal);

            this.camera.position
                .copy(normal)
                .multiplyScalar(0.018)
                .addScaledVector(tangent, 0.035);

            this.controls.target.set(0, 0, 0);
            this.controls.enabled = true;
            this.controls.update();
        }

        this.keys.clear();
    }

    walk(deltaTime) {
        const reference =
            Math.abs(this.walkNormal.y) > 0.9
                ? new THREE.Vector3(1, 0, 0)
                : Y;

        const east = new THREE.Vector3()
            .crossVectors(
                reference,
                this.walkNormal
            )
            .normalize();

        const north = new THREE.Vector3()
            .crossVectors(
                this.walkNormal,
                east
            )
            .normalize();

        const forward = north.clone()
            .multiplyScalar(
                Math.cos(this.walkYaw)
            )
            .addScaledVector(
                east,
                Math.sin(this.walkYaw)
            );

        const right = new THREE.Vector3()
            .crossVectors(
                forward,
                this.walkNormal
            )
            .normalize();

        if (
            document.pointerLockElement === this.canvas
        ) {
            const f =
                Number(this.keys.has("KeyW")) -
                Number(this.keys.has("KeyS"));

            const r =
                Number(this.keys.has("KeyD")) -
                Number(this.keys.has("KeyA"));

            const running =
                this.keys.has("ShiftLeft") ||
                this.keys.has("ShiftRight");

            const speed = running ? 8 : 3;

            const distance =
                speed *
                deltaTime /
                (Math.hypot(f, r) || 1) /
                this.earth.radius;

            this.walkNormal
                .addScaledVector(
                    forward,
                    f * distance
                )
                .addScaledVector(
                    right,
                    r * distance
                )
                .normalize();
        }

        const rotation = this.rotation();

        const up = this.walkNormal
            .clone()
            .applyQuaternion(rotation);

        forward
            .multiplyScalar(
                Math.cos(this.walkPitch)
            )
            .addScaledVector(
                this.walkNormal,
                Math.sin(this.walkPitch)
            )
            .applyQuaternion(rotation);

        this.camera.position.set(0, 0, 0);
        this.camera.up.copy(up);
        this.camera.lookAt(forward);
    }

    reset() {
        this.time.setWarp(1);
        this.keys.clear();

        this.cockpit = false;
        this.rocket.visible = true;

        this.onFoot = false;
        this.controls.enabled = true;

        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        this.throttle = 0;
        this.landed = true;

        const rotation = this.rotation();

        const normal = this.spawnNormal
            .clone()
            .applyQuaternion(rotation);

        const radius =
            this.earth.radius +
            this.ground.height(this.spawnNormal) +
            4.5;

        const radial = normal
            .clone()
            .multiplyScalar(radius);

        this.position
            .copy(this.earth.position)
            .add(radial);

        this.velocity.copy(
            this.groundVelocity(radial)
        );

        this.attitude.setFromUnitVectors(
            Y,
            normal
        );

        this.origin.copy(this.position);
        this.camera.up.copy(normal);

        const reference =
            Math.abs(normal.y) > 0.9
                ? new THREE.Vector3(1, 0, 0)
                : Y;

        const tangent = new THREE.Vector3()
            .crossVectors(normal, reference)
            .normalize();

        this.camera.position
            .copy(normal)
            .multiplyScalar(0.018)
            .addScaledVector(tangent, 0.035);

        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.update(0);
    }

    update(realDeltaTime) {
        const raise =
            this.keys.has("ShiftLeft") ||
            this.keys.has("ShiftRight");

        const lower =
            this.keys.has("ControlLeft") ||
            this.keys.has("ControlRight");

        if (!this.onFoot) {
            this.throttle = THREE.MathUtils.clamp(
                this.throttle +
                (Number(raise) - Number(lower)) *
                realDeltaTime *
                0.5,
                0,
                1
            );
        }

        const altitude =
            this.position.distanceTo(
                this.earth.position
            ) - this.earth.radius;

        const steering =
            !this.onFoot &&
            [
                "KeyW",
                "KeyS",
                "KeyA",
                "KeyD",
                "KeyQ",
                "KeyE"
            ].some(key => this.keys.has(key));

        const powered =
            this.throttle > 0.001 ||
            steering;

        const allowWarp =
            !powered &&
            (
                this.landed ||
                altitude > 100000
            );

        const requestedDuration =
            this.time.update(realDeltaTime);

        let maxStep;

        if (this.landed && !powered) {
            maxStep = 60;
        } else if (powered || altitude < 100000) {
            maxStep = 0.01;
        } else {
            maxStep = 5;
        }

        const duration = Math.min(
            allowWarp
                ? requestedDuration
                : realDeltaTime,
            maxStep * 256
        );

        const steps = Math.max(
            1,
            Math.ceil(duration / maxStep)
        );

        const deltaTime = duration / steps;

        let elapsed = 0;

        for (let i = 0; i < steps; i++) {
            this.step(deltaTime);

            elapsed += deltaTime;

            const currentAltitude =
                this.position.distanceTo(
                    this.earth.position
                ) - this.earth.radius;

            if (
                allowWarp &&
                !this.landed &&
                currentAltitude < 100000
            ) {
                break;
            }
        }

        this.effectiveWarp = realDeltaTime > 0
            ? elapsed / realDeltaTime
            : 1;

        if (this.onFoot) {
            this.walk(realDeltaTime);
        }

        this.updateCockpit();
        this.renderWorld();
    }

    step(deltaTime) {
        this.gravity.update(this.bodies);

        for (const body of this.bodies) {
            body.update(deltaTime);
        }

        const rotation = this.rotation();

        if (this.landed) {
            const normal = this.spawnNormal
                .clone()
                .applyQuaternion(rotation);

            const radial = normal
                .clone()
                .multiplyScalar(
                    this.earth.radius +
                    this.ground.height(this.spawnNormal) +
                    4.5
                );

            this.position
                .copy(this.earth.position)
                .add(radial);

            this.velocity.copy(
                this.groundVelocity(radial)
            );

            this.attitude.setFromUnitVectors(
                Y,
                normal
            );

            if (this.throttle > 0.42) {
                this.landed = false;
            }

            return;
        }

        const pitch =
            Number(this.keys.has("KeyW")) -
            Number(this.keys.has("KeyS"));

        const yaw =
            Number(this.keys.has("KeyA")) -
            Number(this.keys.has("KeyD"));

        const roll =
            Number(this.keys.has("KeyQ")) -
            Number(this.keys.has("KeyE"));

        const rotations = [
            [new THREE.Vector3(1, 0, 0), pitch],
            [new THREE.Vector3(0, 0, 1), yaw],
            [Y, roll]
        ];

        for (const [axis, amount] of rotations) {
            this.attitude.multiply(
                new THREE.Quaternion()
                    .setFromAxisAngle(
                        axis,
                        amount * deltaTime * 0.6
                    )
            );
        }

        this.attitude.normalize();

        const acceleration =
            new THREE.Vector3();

        for (const body of this.bodies) {
            const offset = body.position
                .clone()
                .sub(this.position);

            const distanceSquared =
                offset.lengthSq();

            if (distanceSquared > 1) {
                acceleration.addScaledVector(
                    offset.normalize(),
                    this.gravity.G *
                    body.mass /
                    distanceSquared
                );
            }
        }

        const thrustDirection = Y
            .clone()
            .applyQuaternion(this.attitude);

        acceleration.addScaledVector(
            thrustDirection,
            25 * this.throttle
        );

        // Atmospheric drag.
        const radial = this.position
            .clone()
            .sub(this.earth.position);

        const relativeVelocity = this.velocity
            .clone()
            .sub(this.groundVelocity(radial));

        const altitude =
            radial.length() - this.earth.radius;

        const density =
            1.225 *
            Math.exp(
                -Math.max(altitude, 0) / 8500
            );

        acceleration.addScaledVector(
            relativeVelocity,
            -0.5 *
            density *
            relativeVelocity.length() *
            0.35 *
            3.14 /
            20000
        );

        this.velocity.addScaledVector(
            acceleration,
            deltaTime
        );

        this.position.addScaledVector(
            this.velocity,
            deltaTime
        );

        // Simplified ground contact.
        const next = this.position
            .clone()
            .sub(this.earth.position);

        const localNormal = next
            .clone()
            .normalize()
            .applyQuaternion(
                rotation.clone().invert()
            );

        const floor =
            this.earth.radius +
            this.ground.height(localNormal) +
            4.5;

        if (next.length() < floor) {
            this.spawnNormal.copy(localNormal);

            next
                .normalize()
                .multiplyScalar(floor);

            this.position
                .copy(this.earth.position)
                .add(next);

            this.velocity.copy(
                this.groundVelocity(next)
            );

            this.attitude.setFromUnitVectors(
                Y,
                next.clone().normalize()
            );

            this.landed = true;
            this.throttle = 0;
        }
    }

    renderWorld() {
        // Floating render origin.
        this.origin.copy(this.position);

        if (this.onFoot) {
            this.origin
                .copy(this.walkNormal)
                .multiplyScalar(
                    this.earth.radius +
                    this.ground.height(this.walkNormal) +
                    1.75
                )
                .applyQuaternion(this.rotation())
                .add(this.earth.position);
        }

        for (const body of this.bodies) {
            body.group.position
                .copy(body.position)
                .sub(this.origin)
                .divideScalar(SCALE);
        }

        this.rocket.position
            .copy(this.position)
            .sub(this.origin)
            .divideScalar(SCALE);

        this.rocket.quaternion.copy(
            this.attitude
        );

        this.flame.visible =
            this.throttle > 0 &&
            !this.landed;

        this.flame.scale.y =
            0.3 + this.throttle * 0.7;

        const radial = this.origin
            .clone()
            .sub(this.earth.position);

        const normal = radial
            .clone()
            .normalize();

        const rotation = this.rotation();

        const localNormal = normal
            .clone()
            .applyQuaternion(
                rotation.clone().invert()
            );

        const altitude =
            radial.length() - this.earth.radius;

        this.ground.update(
            localNormal,
            altitude,
            rotation,
            this.origin
        );

        const sunlight = this.sun.position
            .clone()
            .sub(this.position)
            .normalize();

        this.sun.light.position.copy(
            this.sun.group.position
        );

        this.sun.light.target.position.set(
            0,
            0,
            0
        );

        this.sun.light.target.updateMatrixWorld();

        this.earth.atmosphere.mesh.material.uniforms
            .sunDirection.value.copy(sunlight);

        this.sky.position.copy(
            this.camera.position
        );

        this.sky.material.uniforms
            .up.value.copy(normal);

        this.sky.material.uniforms
            .sun.value.copy(sunlight);

        this.sky.material.uniforms.air.value =
            1 - THREE.MathUtils.smoothstep(
                altitude,
                3000,
                100000
            );

        this.stars.update();

        const daylight = THREE.MathUtils.smoothstep(
            normal.dot(sunlight),
            -0.15,
            0.1
        );

        this.stars.mesh.material.opacity =
            1 -
            daylight *
            this.sky.material.uniforms.air.value;

        this.stars.mesh.visible =
            this.stars.mesh.material.opacity > 0.01;

        if (!this.cockpit) {
            this.camera.up.copy(normal);
        }

        const speed = this.velocity
            .clone()
            .sub(this.groundVelocity(radial))
            .length();

        const height = Math.max(
            0,
            altitude -
            this.ground.height(localNormal) -
            4.5
        );

        const state = this.onFoot
            ? "ON FOOT"
            : this.landed
                ? "LANDED"
                : "FLYING";

        this.telemetry.textContent =
            `${state} · ` +
            `Throttle ${Math.round(this.throttle * 100)}% · ` +
            `Height ${height.toFixed(0)} m · ` +
            `Speed ${speed.toFixed(0)} m/s · ` +
            `Warp ${this.effectiveWarp.toFixed(0)}x ` +
            `(selected ${this.time.timeWarp}x)`;
    }

    start() {
        this.engine.start();
    }
}