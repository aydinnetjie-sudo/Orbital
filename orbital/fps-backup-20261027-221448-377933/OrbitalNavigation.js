import {
    Cartesian3 as V,
    Matrix3,
    Matrix4,
    Ellipsoid,
    Color,
    ArcType,
    LabelStyle,
    Cartesian2,
    PolylineGlowMaterialProperty,
    PolylineDashMaterialProperty
} from "cesium";

import { G } from "./GravityWorld.js";

import {
    MoonEncounter,
    bodyOrbit,
    moonState
} from "./MoonEncounter.js";

const RE = Ellipsoid.WGS84.maximumRadius;
const DAY = 86400;

const difference = (a, b) =>
    V.subtract(a, b, new V());

const km = value =>
    Number.isFinite(value)
        ? `${(value / 1000).toLocaleString(
            undefined,
            { maximumFractionDigits: 1 }
        )} km`
        : "unbound";

const speed = value =>
    `${(value / 1000).toFixed(3)} km/s`;

function duration(value) {
    if (!Number.isFinite(value)) return "—";

    value = Math.max(0, value);

    if (value < 60) {
        return `${value.toFixed(1)} s`;
    }

    if (value < 3600) {
        return `${(value / 60).toFixed(1)} min`;
    }

    if (value < DAY) {
        return `${(value / 3600).toFixed(2)} h`;
    }

    return `${(value / DAY).toFixed(2)} days`;
}

// Earth-fixed inputs. These elements never drive the simulation.
export function orbitalElements(
    position,
    velocity,
    mu = 3.98600435507e14
) {
    const inertial = V.add(
        velocity,
        new V(
            -7.292115e-5 * position.y,
            7.292115e-5 * position.x,
            0
        ),
        new V()
    );

    const orbit = bodyOrbit(
        position,
        inertial,
        mu,
        RE
    );

    if (!orbit) return null;

    return {
        ...orbit,
        inertial,

        status: !orbit.bound
            ? "Earth escape trajectory"
            : orbit.periapsis < 0
                ? "Earth-intersecting trajectory"
                : orbit.periapsis < 160000
                    ? "Atmosphere-crossing orbit"
                    : "Earth orbit"
    };
}

export class OrbitalNavigation {
    constructor(viewer, universe) {
        this.viewer = viewer;
        this.universe = universe;

        this.map = false;
        this.solar = false;
        this.moonCentered = false;

        this.range = 25000000;
        this.heading = 0;
        this.pitch = 0.5;

        this.moon = new V();
        this.elements = null;

        this.job = null;
        this.result = null;
        this.burning = false;

        this.lastStart = -Infinity;
        this.lastReadout = -Infinity;
        this.lastDraw = -Infinity;
        this.lastTrail = -Infinity;
        this.lastEarthTrail = -Infinity;

        this.earthTrail = [];
        this.moonTrail = [];

        this.predictionMessage =
            "Launch and clear the atmosphere to predict a coast.";

        this.path = this.line(Color.CYAN, 3);

        this.path.polyline.material =
            new PolylineGlowMaterialProperty({
                color: Color.CYAN,
                glowPower: 0.12
            });

        this.path.polyline.depthFailMaterial =
            Color.CYAN.withAlpha(0.22);

        this.futureMoonPath = this.line(Color.GOLD, 1);

        this.futureMoonPath.polyline.material =
            new PolylineDashMaterialProperty({
                color: Color.GOLD.withAlpha(0.7),
                dashLength: 14
            });

        this.earthPath = this.line(Color.GOLD, 2);
        this.moonPath = this.line(Color.LIGHTGRAY, 1);
        this.closestLink = this.line(Color.ORANGE, 1);

        this.target = this.marker("Moon", Color.GOLD);
        this.earthMarker = this.marker("Earth", Color.CYAN);
        this.rocketMarker = this.marker("Rocket", Color.WHITE);

        this.closestMarker = this.marker(
            "Closest in forecast",
            Color.ORANGE
        );

        this.arrivalMarker = this.marker(
            "Moon at that time",
            Color.GOLD
        );

        this.endMarker = this.marker(
            "Forecast end",
            Color.CYAN
        );

        this.endMarker.label.pixelOffset =
            new Cartesian2(0, 18);

        this.panel = document.createElement("div");
        this.panel.style.borderTop = "1px solid #ffffff30";
        this.panel.style.marginTop = "12px";

        const title = document.createElement("p");
        title.textContent = "ORBIT & MOON NAVIGATION";
        title.style.fontWeight = "bold";

        this.readout = document.createElement("p");
        this.moonReadout = document.createElement("p");
        this.forecastReadout = document.createElement("p");

        this.mapButton = this.button(
            "Orbit map (M)",
            () => this.toggle()
        );

        this.earthButton = this.button(
            "Earth map",
            () => this.openMap("Earth")
        );

        this.moonButton = this.button(
            "Moon map",
            () => this.openMap("Moon")
        );

        this.solarButton = this.button(
            "Solar system",
            () => this.openMap("Sun")
        );

        this.fitButton = this.button(
            "Fit path",
            () => this.fitPath()
        );

        const legend = document.createElement("p");
        legend.style.fontSize = "11px";

        legend.textContent =
            "Cyan: your predicted coast · " +
            "dashed gold: Moon's future path · " +
            "orange: closest approach.";

        const note = document.createElement("p");
        note.style.fontSize = "11px";

        note.textContent =
            "Cyan shows the path if the engine is cut now; " +
            "future steering and burns change it. " +
            "Forecast begins above 160 km. Its time window is shown; " +
            "atmosphere entry or collision ends it. " +
            "Orbit readings are instantaneous estimates. " +
            "The Moon still has a smooth collision surface, " +
            "without walkable terrain.";

        this.panel.append(
            title,
            this.readout,
            this.moonReadout,
            this.forecastReadout,
            this.mapButton,
            this.earthButton,
            this.moonButton,
            this.solarButton,
            this.fitButton,
            legend,
            note
        );

        document.getElementById("panel").appendChild(
            this.panel
        );
    }

    button(text, action) {
        const button = document.createElement("button");
        button.textContent = text;
        button.onclick = action;
        return button;
    }

    line(color, width) {
        return this.viewer.entities.add({
            polyline: {
                positions: [],
                width,
                arcType: ArcType.NONE,
                material: color,
                show: false
            }
        });
    }

    marker(text, color) {
        return this.viewer.entities.add({
            position: new V(),

            point: {
                pixelSize: 6,
                color,
                disableDepthTestDistance: Infinity,
                show: false
            },

            label: {
                text,
                font: "12px sans-serif",
                fillColor: color,
                style: LabelStyle.FILL_AND_OUTLINE,
                outlineColor: Color.BLACK,
                outlineWidth: 3,
                pixelOffset: new Cartesian2(0, -18),
                disableDepthTestDistance: Infinity,
                show: false
            }
        });
    }

    showMarker(entity, position, show) {
        entity.position = position;
        entity.point.show = show;
        entity.label.show = show;
    }

    fit(radius) {
        const frustum = this.viewer.camera.frustum;

        const halfY =
            (frustum.fovy || Math.PI / 3) / 2;

        const halfX = Math.atan(
            Math.tan(halfY) *
            (frustum.aspectRatio || 1)
        );

        return radius * 1.15 / Math.sin(
            Math.max(
                0.05,
                Math.min(halfX, halfY)
            )
        );
    }

    openMap(body) {
        const universe = this.universe;

        this.map = true;
        this.solar = body === "Sun";
        this.moonCentered = body === "Moon";

        if (this.solar) {
            this.range = this.fit(
                Math.max(
                    1.7e11,
                    V.distance(
                        universe.rocket.position,
                        universe.sun.position
                    ) * 1.1
                )
            );
        } else if (this.moonCentered) {
            this.range = this.fit(
                Math.max(
                    universe.moon.radius * 3,
                    V.distance(
                        universe.rocket.position,
                        universe.moon.position
                    ) + universe.moon.radius
                )
            );
        } else {
            const apoapsis = this.elements?.apoRadius;

            this.range = this.fit(
                Math.max(
                    RE * 1.5,
                    Math.min(
                        8e8,
                        Number.isFinite(apoapsis)
                            ? apoapsis
                            : RE * 5
                    )
                )
            );
        }
    }

    toggle() {
        if (this.map) {
            this.map = false;
        } else {
            this.openMap("Earth");
        }
    }

    drag(dx, dy) {
        this.heading -= dx * 0.005;

        this.pitch = Math.max(
            -1.45,
            Math.min(
                1.45,
                this.pitch + dy * 0.005
            )
        );
    }

    zoom(delta) {
        const minimum = this.moonCentered
            ? this.universe.moon.radius * 1.4
            : RE * 1.15;

        this.range = Math.max(
            minimum,
            Math.min(
                1e13,
                this.range * Math.exp(delta * 0.001)
            )
        );
    }

    applyCamera() {
        const universe = this.universe;

        const center = this.solar
            ? universe.fixedPoint(universe.sun.position)
            : this.moonCentered
                ? universe.fixedPoint(universe.moon.position)
                : new V();

        const rotation = Matrix3.transpose(
            universe.earthRotation(),
            new Matrix3()
        );

        const c = Math.cos(this.pitch);
        const r = this.range;

        this.viewer.camera.lookAtTransform(
            Matrix4.fromRotationTranslation(
                rotation,
                center,
                new Matrix4()
            ),
            new V(
                r * c * Math.sin(this.heading),
                -r * c * Math.cos(this.heading),
                r * Math.sin(this.pitch)
            )
        );
    }

    updatePrediction(flight, walking, now) {
        const universe = this.universe;
        const burning = flight.throttle > 0.00001;

        if (burning !== this.burning) {
            this.job = null;
            this.result = null;
            this.lastStart = -Infinity;
        }

        this.burning = burning;

        let disabled = "";

        if (universe.world.collision) {
            disabled =
                "Simulation stopped at a collision.";
        } else if (
            flight.landed ||
            flight.crashed ||
            walking
        ) {
            disabled =
                "Launch and clear 160 km to show the predicted coast line.";
        } else if (
            V.distance(
                universe.rocket.position,
                universe.earth.position
            ) <= RE + 160000
        ) {
            disabled =
                "Above 160 km, the map will show your predicted coast. " +
                "Atmospheric flight is not forecast.";
        }

        if (disabled) {
            this.job = null;
            this.result = null;
            this.predictionMessage = disabled;
            return;
        }

        const refreshMs = burning ? 400 : 2500;

        const expired = this.result &&
            universe.world.time >=
                this.result.start + this.result.elapsed;

        if (
            !this.job &&
            (
                !this.result ||
                now - this.lastStart > refreshMs ||
                expired
            )
        ) {
            const lunar = moonState(universe);
            let horizon = 7 * DAY;

            if (lunar.inside && lunar.orbit?.bound) {
                horizon = Math.min(
                    7 * DAY,
                    Math.max(
                        7200,
                        2 * lunar.orbit.period
                    )
                );
            } else if (
                this.elements?.bound &&
                this.elements.apoRadius <
                    V.distance(
                        universe.earth.position,
                        universe.moon.position
                    ) * 0.6
            ) {
                horizon = Math.min(
                    DAY,
                    Math.max(
                        7200,
                        2 * this.elements.period
                    )
                );
            }

            this.job = new MoonEncounter(
                universe,
                { horizon }
            );

            this.lastStart = now;
        }

        if (this.job) {
            try {
                this.job.advance(96, 3);

                if (this.job.done) {
                    this.result = this.job;
                    this.job = null;
                }
            } catch (error) {
                console.error(
                    "Moon prediction failed:",
                    error
                );

                this.job = null;
                this.result = null;

                this.predictionMessage =
                    "Prediction unavailable; check browser console.";

                return;
            }
        }

        const forecast = this.result || this.job;
        if (!forecast) return;

        const best = forecast.closest;

        const until =
            best.time - universe.world.time;

        const when =
            best.time <= forecast.start + 0.1
                ? "nearest point is at forecast start"
                : until >= 0
                    ? `in ${duration(until)}`
                    : `${duration(-until)} ago; updating`;

        this.predictionMessage =
            (
                burning
                    ? "IF ENGINE CUT NOW. "
                    : "ENGINE-OFF COAST. "
            ) +
            `Closest in forecast: ${km(best.altitude)} ` +
            `above Moon surface, ${when}. ` +
            `Relative speed there ${speed(best.speed)}. ` +
            (
                forecast.done
                    ? `Window ${duration(forecast.elapsed)} · ${forecast.reason}.`
                    : `Computing: ${(forecast.progress * 100).toFixed(0)}% of ${duration(forecast.horizon)}.`
            );

        if (best.altitude <= universe.rocket.radius) {
            this.predictionMessage +=
                " Predicted Moon impact.";
        }

        if (this.result && this.job) {
            this.predictionMessage +=
                " Refreshing forecast…";
        }

        if (burning) {
            this.predictionMessage +=
                ` Snapshot age ${
                    duration(
                        universe.world.time - forecast.start
                    )
                }.`;
        }
    }

    forecastPoint(state, moon = false) {
        const universe = this.universe;

        const rotation = Matrix3.transpose(
            universe.earthRotation(),
            new Matrix3()
        );

        const convert = point =>
            Matrix3.multiplyByVector(
                rotation,
                point,
                new V()
            );

        if (this.solar) {
            return V.add(
                universe.fixedPoint(
                    universe.sun.position
                ),
                convert(
                    moon
                        ? state.moonSun
                        : state.sunRelative
                ),
                new V()
            );
        }

        if (this.moonCentered) {
            if (moon) {
                return universe.fixedPoint(
                    universe.moon.position
                );
            }

            return V.add(
                universe.fixedPoint(
                    universe.moon.position
                ),
                convert(state.moonRelative),
                new V()
            );
        }

        return convert(
            moon
                ? state.moonEarth
                : state.earthRelative
        );
    }

    fitPath() {
        this.map = true;

        const universe = this.universe;

        const center = this.solar
            ? universe.fixedPoint(universe.sun.position)
            : this.moonCentered
                ? universe.fixedPoint(universe.moon.position)
                : new V();

        const forecast = this.result || this.job;

        const points = [
            universe.fixedPoint(
                universe.rocket.position
            ),
            ...(
                forecast
                    ? forecast.samples
                        .filter(
                            state =>
                                state.time > universe.world.time
                        )
                        .map(
                            state => this.forecastPoint(state)
                        )
                    : []
            )
        ];

        const minimum = this.solar
            ? universe.sun.radius * 3
            : this.moonCentered
                ? universe.moon.radius * 2
                : RE * 1.5;

        const radius = points.reduce(
            (maximum, point) =>
                Math.max(
                    maximum,
                    V.distance(point, center)
                ),
            minimum
        );

        this.range = Math.min(
            1e13,
            this.fit(radius * 1.05)
        );
    }

    drawForecast() {
        const universe = this.universe;
        const forecast = this.result || this.job;

        const visible =
            this.map && !!forecast;

        const future = forecast
            ? forecast.samples.filter(
                state =>
                    state.time >
                    universe.world.time + 1e-5
            )
            : [];

        // The first point is always the actual rocket.
        const points = [
            universe.fixedPoint(
                universe.rocket.position
            ),
            ...future.map(
                state => this.forecastPoint(state)
            )
        ];

        this.path.polyline.positions = points;

        this.path.polyline.show =
            visible && points.length > 1;

        const moonPoints = [
            universe.fixedPoint(
                universe.moon.position
            ),
            ...future.map(
                state => this.forecastPoint(state, true)
            )
        ];

        this.futureMoonPath.polyline.positions =
            moonPoints;

        this.futureMoonPath.polyline.show =
            visible &&
            !this.moonCentered &&
            moonPoints.length > 1;

        const best = forecast?.closest;

        const show =
            visible &&
            best &&
            best.time >= universe.world.time;

        const closest = best
            ? this.forecastPoint(best)
            : new V();

        const arrival = best
            ? this.forecastPoint(best, true)
            : new V();

        this.showMarker(
            this.closestMarker,
            closest,
            !!show
        );

        this.showMarker(
            this.arrivalMarker,
            arrival,
            !!show && !this.moonCentered
        );

        this.closestLink.polyline.positions = [
            closest,
            arrival
        ];

        this.closestLink.polyline.show = !!show;

        const end = forecast?.samples.at(-1);

        this.showMarker(
            this.endMarker,
            end
                ? this.forecastPoint(end)
                : new V(),

            visible &&
                !!end &&
                end.time > universe.world.time
        );

        this.endMarker.label.text =
            forecast?.done
                ? `Forecast end · ${forecast.reason}`
                : "Forecast computing…";
    }

    update(flight, walking = false) {
        if (walking) this.map = false;

        const universe = this.universe;
        const now = performance.now();

        this.moon = universe.fixedPoint(
            universe.moon.position
        );

        this.elements = orbitalElements(
            flight.position,
            flight.velocity,
            G * universe.earth.mass
        );

        this.updatePrediction(
            flight,
            walking,
            now
        );

        if (
            universe.world.time - this.lastTrail >= 1800
        ) {
            this.lastTrail = universe.world.time;

            this.moonTrail.push(
                difference(
                    universe.moon.position,
                    universe.earth.position
                )
            );

            if (
                universe.world.time -
                    this.lastEarthTrail >= 21600
            ) {
                this.lastEarthTrail =
                    universe.world.time;

                this.earthTrail.push(
                    difference(
                        universe.earth.position,
                        universe.sun.position
                    )
                );
            }

            if (this.moonTrail.length > 2048) {
                this.moonTrail.shift();
            }

            if (this.earthTrail.length > 2048) {
                this.earthTrail.shift();
            }
        }

        const rotation = Matrix3.transpose(
            universe.earthRotation(),
            new Matrix3()
        );

        const convert = point =>
            Matrix3.multiplyByVector(
                rotation,
                point,
                new V()
            );

        const sun = universe.fixedPoint(
            universe.sun.position
        );

        this.earthPath.polyline.positions =
            this.earthTrail.map(
                point => V.add(
                    sun,
                    convert(point),
                    new V()
                )
            );

        this.moonPath.polyline.positions =
            this.moonTrail.map(convert);

        this.earthPath.polyline.show =
            this.map &&
            this.solar &&
            this.earthTrail.length > 1;

        this.moonPath.polyline.show =
            this.map &&
            !this.solar &&
            !this.moonCentered &&
            this.moonTrail.length > 1;

        this.showMarker(
            this.target,
            this.moon,
            this.map
        );

        this.showMarker(
            this.earthMarker,
            new V(),
            this.map &&
                (this.solar || this.moonCentered)
        );

        this.showMarker(
            this.rocketMarker,
            universe.fixedPoint(
                universe.rocket.position
            ),
            this.map
        );

        for (const button of [
            this.mapButton,
            this.earthButton,
            this.moonButton,
            this.solarButton,
            this.fitButton
        ]) {
            button.disabled = walking;
        }

        this.mapButton.textContent = this.map
            ? "Follow rocket (M)"
            : "Orbit map (M)";

        if (now - this.lastDraw >= 150) {
            this.lastDraw = now;
            this.drawForecast();
        }

        if (now - this.lastReadout < 200) return;

        this.lastReadout = now;

        const orbit = this.elements;

        this.readout.textContent = flight.landed
            ? `Grounded on ${flight.landedOn}.`
            : orbit
                ? `${orbit.status} · Earth apoapsis ${km(orbit.apoapsis)} · periapsis ${km(orbit.periapsis)} · speed ${speed(orbit.speed)}.`
                : "Orbit data unavailable.";

        const lunar = moonState(universe);
        const lunarOrbit = lunar.orbit;

        let capture =
            "Outside Moon's estimated region of influence";

        if (lunar.inside) {
            capture = lunarOrbit.bound
                ? lunarOrbit.periapsis >
                    universe.rocket.radius
                    ? "Lunar orbit estimate"
                    : "Moon-bound, surface-intersecting trajectory"
                : "Lunar flyby / escape";
        }

        this.moonReadout.textContent =
            `Moon surface distance ${km(lunar.altitude)}` +
            ` · relative speed ${speed(lunar.speed)}` +
            ` · ${lunar.closing >= 0 ? "closing" : "receding"}` +
            ` at ${speed(Math.abs(lunar.closing))}. ` +
            `${capture}. ` +
            `Escape speed here ${speed(lunarOrbit.escapeSpeed)}.` +
            (
                lunar.inside
                    ? ` Lunar periapsis ${km(lunarOrbit.periapsis)} · apoapsis ${km(lunarOrbit.apoapsis)}.`
                    : ""
            );

        this.forecastReadout.textContent =
            this.predictionMessage;
    }
}