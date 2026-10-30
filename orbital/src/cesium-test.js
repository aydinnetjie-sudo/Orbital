import { RocketVisual, applyEngineCameraMotion } from "./RocketVisual.js";
import {
    Viewer,
    Ion,
    ImageryLayer,
    createWorldTerrainAsync,
    createWorldImageryAsync,
    IonWorldImageryStyle,
    Cartesian3,
    Cartographic,
    Ellipsoid,
    Matrix4,
    Transforms,
    Matrix3,
    Quaternion,
    CallbackPositionProperty,
    CallbackProperty,
    Color,
    HeadingPitchRange,
    JulianDate,
    sampleTerrainMostDetailed,
    Math as CMath
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";

import { CesiumRocket } from "./CesiumRocket.js";
import { LandingGround } from "./LandingGround.js";
import { SurfaceWalker } from "./SurfaceWalker.js";
import { FlightTimeWarp } from "./FlightTimeWarp.js";
import { OrbitalNavigation } from "./OrbitalNavigation.js";
import { NewtonianUniverse } from "./NewtonianUniverse.js";
import { PhysicalSky } from "./PhysicalSky.js";
import { cockpitView, applyChaseCamera, createAttitudeIndicator } from "./RocketControls.js";

const warp = new FlightTimeWarp();

const status =
    document.getElementById("status");

const telemetry =
    document.getElementById("telemetry");

const ellipsoid = Ellipsoid.WGS84;
const longitude = 86.83;
const latitude = 27.95;
const keys = new Set();
const clamp = CMath.clamp;

const view = {
    heading: 0,
    pitch: -0.35,
    range: 75,
    cockpit: false,
    yaw: 0,
    lookPitch: 0
};

let universe;
let physicalSky;
let navigation;
let warpLabel;
let flight;
let viewer;
let padTop;
let padPoint;
let terrain;
let landingGround;
let walker;
let walkButton;

let busy = false;
let modeVersion = 0;
let notice = "";
let noticeUntil = 0;

function inform(text) {
    notice = text;
    noticeUntil =
        performance.now() + 3000;

    status.textContent = text;
}

function addPart(
    offset,
    cylinder,
    show = () => !view.cockpit
) {
    return viewer.entities.add({
        position:
            new CallbackPositionProperty(
                () =>
                    flight.offset(
                        0,
                        0,
                        offset
                    ),
                false
            ),
        orientation:
            new CallbackProperty(
                () => flight.attitude,
                false
            ),
        cylinder: {
            ...cylinder,
            show:
                new CallbackProperty(
                    show,
                    false
                )
        }
    });
}

function makeRocket() {
    return new RocketVisual(viewer, flight, () => !view.cockpit);
}

function updateCamera() {
    if (walker?.active) {
        walker.applyCamera(viewer.camera);
        return;
    }

    if (navigation?.map) {
        navigation.applyCamera();
        return;
    }

    if (!view.cockpit) {
        applyChaseCamera(viewer,flight,view);
        applyEngineCameraMotion(viewer.camera,flight,false);
        return;
    }

    viewer.camera.lookAtTransform(Matrix4.IDENTITY);

    const { direction, up } = cockpitView(
        view.yaw,
        view.lookPitch
    );

    const rotation = Matrix3.fromQuaternion(
        flight.attitude
    );

    viewer.camera.setView({
        destination: flight.offset(0, 0, 17),
        orientation: {
            direction: Matrix3.multiplyByVector(
                rotation,
                direction,
                new Cartesian3()
            ),
            up: Matrix3.multiplyByVector(
                rotation,
                up,
                new Cartesian3()
            )
        }
    });
    applyEngineCameraMotion(viewer.camera,flight,true);
}


function setupControls() {
    viewer.scene
        .screenSpaceCameraController
        .enableInputs = false;

    let dragging = false;

    function captureMouse() {
        try {
            viewer.canvas
                .requestPointerLock()
                ?.catch(() => {});
        } catch {}
    }

    document.addEventListener(
        "mousemove",
        event => {
            if (
                walker.active &&
                document.pointerLockElement ===
                    viewer.canvas
            ) {
                walker.look(
                    event.movementX,
                    event.movementY
                );
            }
        }
    );

    document.addEventListener(
        "pointerlockchange",
        () => keys.clear()
    );

    viewer.canvas.addEventListener(
        "pointerdown",
        event => {
            if (
                event.button !== 0
            ) {
                return;
            }

            if (walker.active) {
                captureMouse();
                return;
            }

            dragging = true;

            viewer.canvas
                .setPointerCapture(
                    event.pointerId
                );
        }
    );

    viewer.canvas.addEventListener(
        "pointerup",
        () => dragging = false
    );

    viewer.canvas.addEventListener(
        "pointercancel",
        () => dragging = false
    );

    viewer.canvas.addEventListener(
        "pointermove",
        event => {
            if (
                walker.active ||
                !dragging
            ) {
                return;
            }

            if (navigation?.map) {
                navigation.drag(
                    event.movementX,
                    event.movementY
                );
                return;
            }

            if (view.cockpit) {
                view.yaw +=
                    event.movementX *
                    0.004;

                view.lookPitch = clamp(
                    view.lookPitch -
                        event.movementY *
                        0.004,
                    -1.55,
                    1.55
                );
            } else {
                view.heading -=
                    event.movementX *
                    0.005;

                view.pitch = clamp(
                    view.pitch +
                        event.movementY *
                        0.005,
                    -1.5,
                    -0.05
                );
            }
        }
    );

    viewer.canvas.addEventListener(
        "wheel",
        event => {
            event.preventDefault();

            if (walker.active) {
                return;
            }

            if (navigation?.map) {
                navigation.zoom(
                    event.deltaY
                );
                return;
            }

            view.range = clamp(
                view.range *
                    Math.exp(
                        event.deltaY *
                        0.001
                    ),
                15,
                30000000
            );
        },
        { passive: false }
    );

    window.addEventListener(
        "keydown",
        event => {
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
                    "KeyE",
                    "KeyC"
                ].includes(
                    event.code
                )
            ) {
                event.preventDefault();
            }

            keys.add(event.code);
            walker.running =
                event.shiftKey;

            if (
                event.code === "KeyM" &&
                !event.repeat &&
                !walker.active
            ) {
                navigation.toggle();
            }

            if (
                (
                    event.code ===
                        "BracketRight" ||
                    event.key === "]"
                ) &&
                !event.repeat
            ) {
                warp.increase();
            }

            if (
                (
                    event.code ===
                        "BracketLeft" ||
                    event.key === "["
                ) &&
                !event.repeat
            ) {
                warp.decrease();
            }

            if (
                event.code ===
                    "Backslash" &&
                !event.repeat
            ) {
                warp.normal();
            }

            if (
                event.code === "KeyF" &&
                !event.repeat
            ) {
                void toggleWalking();
            }

            if (
                event.code === "Space" &&
                !flight.crashed &&
                !walker.active &&
                !busy
            ) {
                flight.throttle = 1;
            }

            if (
                event.code === "KeyX"
            ) {
                flight.throttle = 0;
            }

            if (
                event.code === "KeyV" &&
                !event.repeat &&
                !walker.active
            ) {
                view.cockpit =
                    !view.cockpit;

                view.yaw = 0;
                view.lookPitch = 0;
            }

            if (
                event.code === "KeyR" &&
                !event.repeat
            ) {
                reset();
            }
        }
    );

    window.addEventListener(
        "keyup",
        event => {
            keys.delete(
                event.code
            );

            walker.running =
                event.shiftKey;
        }
    );

    window.addEventListener(
        "blur",
        () => {
            keys.clear();
            dragging = false;
            walker.running = false;

            warp.normal(
                "Window inactive"
            );
        }
    );

    document.getElementById(
        "launch"
    ).onclick = () => {
        if (
            !flight.crashed &&
            !walker.active &&
            !busy
        ) {
            flight.throttle = 1;
        }
    };

    document.getElementById(
        "cut"
    ).onclick = () => {
        flight.throttle = 0;
    };

    document.getElementById(
        "reset"
    ).onclick = reset;

    walkButton.onclick = () =>
        void toggleWalking();
}

async function toggleWalking() {
    if (busy) return;

    if (walker.active) {
        if (
            !walker.canBoard(flight)
        ) {
            inform(
                "Move closer to board: 8 m on terrain, " +
                "16 m beside the launch pad."
            );
            return;
        }

        walker.leave();
        keys.clear();

        if (
            document.pointerLockElement
        ) {
            document.exitPointerLock();
        }

        view.cockpit = false;
        view.range = 75;

        return;
    }

    if (
        flight.landedOn &&
        flight.landedOn !== "Earth"
    ) {
        inform(
            "Walking is currently supported on Earth only."
        );
        return;
    }

    if (
        !flight.landed ||
        flight.crashed
    ) {
        inform(
            "Land safely before getting out."
        );
        return;
    }

    busy = true;

    warp.normal(
        "Exiting rocket"
    );

    const version =
        ++modeVersion;

    flight.throttle = 0;
    keys.clear();

    status.textContent =
        "Checking the ground beside the rocket…";

    try {
        if (
            await walker.enter(
                flight
            )
        ) {
            view.cockpit = false;
        }
    } catch {
        inform(
            "Could not load the exit location. " +
            "Click Exit to retry."
        );
    } finally {
        if (
            version === modeVersion
        ) {
            busy = false;
        }
    }
}

function reset() {
    warp.reset();

    if (navigation) {
        navigation.map = false;
    }

    modeVersion++;
    busy = false;

    walker.leave();
    noticeUntil = 0;

    if (
        document.pointerLockElement
    ) {
        document.exitPointerLock();
    }

    landingGround.reset();
    flight.reset();
    keys.clear();

    view.range = 75;
    view.cockpit = false;
    view.heading = 0;
    view.pitch = -0.35;

    status.textContent =
        "Ready on the launch pad. " +
        "Space launches; X cuts the engine.";
}

async function start() {
    const token =
        import.meta.env
            .VITE_CESIUM_ION_TOKEN
            ?.trim();

    if (!token) {
        throw new Error(
            "Add your token to .env.local and restart Vite."
        );
    }

    Ion.defaultAccessToken =
        token;

    const results =
        await Promise.all([
            createWorldTerrainAsync({
                requestVertexNormals: true,
                requestWaterMask: true
            }),
            createWorldImageryAsync({
                style:
                    IonWorldImageryStyle
                        .AERIAL
            })
        ]);

    terrain = results[0];

    viewer = new Viewer(
        "cesiumContainer",
        {
            terrainProvider:
                terrain,
            baseLayer:
                new ImageryLayer(
                    results[1]
                ),
            baseLayerPicker: false,
            animation: false,
            timeline: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            fullscreenButton: false,
            selectionIndicator: false,
            infoBox: false,
            shouldAnimate: false,
            useDefaultRenderLoop: false
        }
    );

    viewer.scene.globe
        .enableLighting = true;

    viewer.scene.globe
        .depthTestAgainstTerrain = true;

    viewer.scene.globe
        .maximumScreenSpaceError = 2;

    viewer.scene
        .highDynamicRange = true;

    viewer.scene.sunBloom = true;

    viewer.clock.currentTime =
        JulianDate.fromDate(
            new Date(
                "2026-06-21T04:00:00Z"
            )
        );

    status.textContent =
        "Sampling the launch pad's terrain…";

    const locations = [];

    for (
        const east of
        [-12, 0, 12]
    ) {
        for (
            const north of
            [-12, 0, 12]
        ) {
            locations.push(
                Cartographic.fromDegrees(
                    longitude +
                        east /
                        (
                            111320 *
                            Math.cos(
                                CMath.toRadians(
                                    latitude
                                )
                            )
                        ),
                    latitude +
                        north / 111320
                )
            );
        }
    }

    const heights =
        await sampleTerrainMostDetailed(
            terrain,
            locations,
            true
        );

    if (
        heights.some(
            point =>
                !Number.isFinite(
                    point.height
                )
        )
    ) {
        throw new Error(
            "Launch terrain heights unavailable. " +
            "Reload to retry."
        );
    }

    padTop =
        Math.max(
            ...heights.map(
                point =>
                    point.height
            )
        ) + 0.5;

    padPoint =
        Cartesian3.fromDegrees(
            longitude,
            latitude,
            padTop
        );

    universe =
        new NewtonianUniverse(
            viewer.clock.currentTime
        );

    flight =
        new CesiumRocket(
            longitude,
            latitude,
            padTop
        );

    universe.attach(flight);

    physicalSky =
        new PhysicalSky(
            viewer,
            universe
        );

    landingGround =
        new LandingGround(
            terrain,
            viewer.scene.globe,
            padPoint,
            padTop
        );

    walker =
        new SurfaceWalker(
            terrain,
            viewer.scene.globe,
            padPoint,
            padTop
        );

    walkButton =
        document.createElement(
            "button"
        );

    walkButton.textContent =
        "Exit rocket (F)";

    document.getElementById(
        "reset"
    ).after(
        walkButton
    );

    const updateAttitude = createAttitudeIndicator(document.getElementById("panel"));

    const help = document.createElement("p");

    const flightHelp =
        document.createElement(
            "p"
        );

    flightHelp.textContent =
        "Flight: W/S pitch · A/D yaw · Q/E roll · SAS ON · " +
        "hold C for fine steering · release keys to brake rotation. " +
        "V: nose cockpit · drag: orbit the chase camera. " +
        "Turning redirects thrust; existing momentum remains.";

    document.getElementById(
        "panel"
    ).appendChild(
        flightHelp
    );

    help.textContent =
        "On foot: click to look · WASD walk · " +
        "Shift run · Esc release mouse · " +
        "F board near the rocket";

    document.getElementById(
        "panel"
    ).appendChild(
        help
    );

    const warpControls =
        document.createElement(
            "p"
        );

    const actions = [
        [
            "Warp −",
            () => warp.decrease()
        ],
        [
            "1×",
            () => warp.normal()
        ],
        [
            "Warp +",
            () => warp.increase()
        ]
    ];

    for (
        const [label, action]
        of actions
    ) {
        const button =
            document.createElement(
                "button"
            );

        button.textContent =
            label;

        button.onclick =
            action;

        warpControls.appendChild(
            button
        );
    }

    warpLabel =
        document.createElement(
            "p"
        );

    document.getElementById(
        "panel"
    ).append(
        warpControls,
        warpLabel
    );

    const warpHelp =
        document.createElement(
            "p"
        );

    warpHelp.textContent =
        "[ / ] time warp · \\ normal speed · " +
        "Flight warp up to 10× from the ground; " +
        "higher warp advances the shared gravity simulation";

    document.getElementById(
        "panel"
    ).appendChild(
        warpHelp
    );

    navigation =
        new OrbitalNavigation(
            viewer,
            universe
        );

    const panel =
        document.getElementById(
            "panel"
        );

    panel.style.maxHeight =
        "85vh";

    panel.style.overflowY =
        "auto";

    const padFrame =
        Transforms
            .eastNorthUpToFixedFrame(
                padPoint
            );

    const padDepth =
        padTop -
        Math.min(
            ...heights.map(
                point =>
                    point.height
            )
        ) +
        3;

    viewer.entities.add({
        position:
            Cartesian3.fromDegrees(
                longitude,
                latitude,
                padTop -
                    padDepth / 2
            ),
        orientation:
            Quaternion
                .fromRotationMatrix(
                    Matrix4.getMatrix3(
                        padFrame,
                        new Matrix3()
                    )
                ),
        cylinder: {
            length: padDepth,
            topRadius: 12,
            bottomRadius: 12,
            material:
                Color.DIMGRAY,
            slices: 48
        }
    });

    makeRocket();
    setupControls();
    reset();
    updateCamera();

    document
        .querySelectorAll("button")
        .forEach(
            button =>
                button.disabled =
                    false
        );

    let previous =
        performance.now();

    function updateFrame() {
        const now =
            performance.now();

        const realDt =
            Math.max(
                0,
                (now - previous) /
                    1000
            );

        const dt =
            Math.min(
                realDt,
                0.05
            );

        previous = now;

        if (
            !flight.crashed &&
            !walker.active &&
            !busy
        ) {
            const raise =
                keys.has(
                    "ShiftLeft"
                ) ||
                keys.has(
                    "ShiftRight"
                );

            const lower =
                keys.has(
                    "ControlLeft"
                ) ||
                keys.has(
                    "ControlRight"
                );

            flight.throttle =
                clamp(
                    flight.throttle +
                        (
                            Number(raise) -
                            Number(lower)
                        ) *
                        dt *
                        0.5,
                    0,
                    1
                );
        }

        void landingGround.refresh(
            flight.position
        );

        // Apply mouse movement before choosing steering axes.
        updateCamera();

        // Convert the visible camera axes into the inertial
        // frame used by the gravity simulation.

        warp.advance(
            realDt,
            flight,
            landingGround,
            keys,
            walker.active,
            busy
        );

        viewer.clock.currentTime =
            JulianDate.addSeconds(
                universe.epoch,
                universe.world.time,
                new JulianDate()
            );

        warpLabel.textContent =
            warp.text();

        if (walker.active) {
            walker.update(
                dt,
                keys,
                flight,
                document.pointerLockElement ===
                    viewer.canvas
            );
        }

        walkButton.disabled =
            busy ||
            (
                !walker.active &&
                (
                    !flight.landed ||
                    flight.crashed
                )
            );

        walkButton.textContent =
            walker.active
                ? "Board rocket (F)"
                : "Exit rocket (F)";

        document.getElementById(
            "launch"
        ).disabled =
            walker.active ||
            busy ||
            flight.crashed;

        updateAttitude(flight);
        physicalSky.update();

        navigation.update(
            flight,
            walker.active
        );

        updateCamera();

        if (walker.active) {
            const distance =
                walker.distanceTo(
                    flight
                );

            telemetry.textContent =
                `ON FOOT · ${walker.running ? "RUN" : "WALK"}` +
                ` · ${walker.actualSpeed.toFixed(1)} m/s` +
                ` · Rocket ${distance.toFixed(1)} m away` +
                ` · ${
                    walker.waiting
                        ? "Loading terrain…"
                        : "Eye height 1.75 m"
                }`;

            status.textContent =
                performance.now() <
                    noticeUntil
                    ? notice
                    : walker.waiting
                        ? walker.ground.failed
                            ? "Terrain lookup failed; check your connection."
                            : "Waiting for detailed ground ahead…"
                        : walker.message ||
                            (
                                document.pointerLockElement ===
                                    viewer.canvas
                                    ? "WASD walk · Shift run · F boards near the rocket · Esc releases mouse"
                                    : "Click the scene to look around and walk."
                            );

            return;
        }

        if (busy) return;

        if (
            universe.world.collision
        ) {
            status.textContent =
                "Simulation paused: " +
                `${universe.world.collision.a} collided with ` +
                `${universe.world.collision.b}. ` +
                "Reload to restart.";

            return;
        }

        const geo =
            ellipsoid
                .cartesianToCartographic(
                    flight.position
                );

        const report =
            flight.landing ||
            flight.inspect(
                landingGround
            );

        const clearance =
            report.known
                ? Math.max(
                    0,
                    report.clearance
                ).toFixed(1)
                : "—";

        const state =
            flight.crashed
                ? "CRASHED — R resets"
                : flight.waitingForGround
                    ? "WAITING FOR TERRAIN"
                    : flight.landed
                        ? "LANDED"
                        : "FLYING";

        telemetry.textContent =
            `${state}` +
            ` · Throttle ${Math.round(flight.throttle * 100)}%` +
            ` · Earth altitude ${(geo.height / 1000).toFixed(2)} km` +
            ` · Feet clearance ${clearance} m` +
            ` · Vertical ${report.vertical.toFixed(1)} m/s (+ up)` +
            ` · Horizontal ${report.horizontal.toFixed(1)} m/s` +
            ` · Tilt ${report.tilt.toFixed(1)}°` +
            ` · Slope ${
                report.known
                    ? report.slope.toFixed(1)
                    : "—"
            }°`;

        status.textContent =
            performance.now() <
                noticeUntil
                ? notice
                : flight.waitingForGround
                    ? landingGround.failed
                        ? "Terrain lookup failed. Flight paused; check connection, or R resets."
                        : "Loading terrain beneath the landing feet…"
                    : flight.landed
                        ? flight.reason
                        : "Touchdown targets: vertical ≤3 m/s, horizontal ≤2 m/s, tilt ≤12°, slope ≤10°.";
    }

    function renderFrame() {
        updateFrame();

        viewer.resize();
        viewer.render();

        requestAnimationFrame(
            renderFrame
        );
    }

    requestAnimationFrame(
        renderFrame
    );
}

start().catch(error => {
    console.error(
        "Cesium flight setup failed:",
        error
    );

    status.textContent =
        "Flight setup failed. Check your token, " +
        "terrain access and browser console, then reload.";
});