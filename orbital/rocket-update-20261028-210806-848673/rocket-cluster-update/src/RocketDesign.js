import {
    Cartesian3 as V, Matrix3, Matrix4,
    Geometry, GeometryAttribute, ComponentDatatype, PrimitiveType,
    BoundingSphere, BoxGeometry
} from "cesium";

// Three geometrically similar bells share the original aggregate exit area.
// This is a visual engine arrangement, not a simulation of interacting jets.
const engineScale = 1 / Math.sqrt(3);
export const ROCKET_ENGINES = Object.freeze(
    Array.from({ length: 3 }, (_, i) => {
        const angle = -Math.PI / 2 + i * Math.PI * 2 / 3;
        return Object.freeze({
            x: .62 * Math.cos(angle),
            y: .62 * Math.sin(angle),
            exitZ: -4.50,
            scale: engineScale
        });
    })
);

// Extruded, swept fin with explicit flat normals and textured faces.
export function sweptFin() {
    const outline = [[1.03, -1.18], [1.78, -2.78], [1.78, -3.65], [1.03, -3.50]];
    const halfThickness = .045;
    const positions = [], normals = [], st = [], indices = [];
    const points = [];
    for (const y of [-halfThickness, halfThickness]) {
        for (const [x, z] of outline) points.push(new V(x, y, z));
    }
    const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1],
        [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
    // Reorient each polygon away from the centroid, independently of outline winding.
    const center = new V(1.405, 0, -2.7775);
    for (const face of faces) {
        let ids = face.slice();
        const a = points[ids[0]], b = points[ids[1]], c = points[ids[2]];
        let normal = V.cross(V.subtract(b, a, new V()), V.subtract(c, a, new V()), new V());
        if (V.dot(normal, V.subtract(a, center, new V())) < 0) {
            ids.reverse(); V.negate(normal, normal);
        }
        V.normalize(normal, normal);
        const base = positions.length / 3;
        for (let j = 0; j < 4; j++) {
            const p = points[ids[j]];
            positions.push(p.x, p.y, p.z);
            normals.push(normal.x, normal.y, normal.z);
            st.push(j === 1 || j === 2 ? 1 : 0, j >= 2 ? 1 : 0);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const p = new Float64Array(positions);
    return new Geometry({
        attributes: {
            position: new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE,
                componentsPerAttribute: 3, values: p }),
            normal: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT,
                componentsPerAttribute: 3, values: new Float32Array(normals) }),
            st: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT,
                componentsPerAttribute: 2, values: new Float32Array(st) })
        },
        indices: new Uint16Array(indices), primitiveType: PrimitiveType.TRIANGLES,
        boundingSphere: BoundingSphere.fromVertices(p)
    });
}

export function buildRocketDesign({ put, tube, strut, lathe, support, white, dark, metal, copper, glass }) {
    const translate = (x, y, z) => Matrix4.fromTranslation(new V(x, y, z));
    const box = (x, y, z, dx, dy, dz, material, angle = 0) => put(material,
        BoxGeometry.fromDimensions({ dimensions: new V(dx, dy, dz), vertexFormat: support.vertexFormat }),
        Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(angle), new V(x, y, z)));

    // Tank barrel, shoulder and continuously tapered crew-module nose.
    put(white, lathe([
        [-3.48, 1.00], [-3.12, 1.12], [1.75, 1.12], [2.30, 1.08],
        [2.95, .99], [3.55, .88], [4.15, .76], [4.75, .61],
        [5.32, .45], [5.85, .30], [6.32, .16], [6.70, .055], [6.98, .001]
    ], 80));
    // Engine bay and structural joints: flush bands rather than stacked disks.
    tube(-3.30, .36, 1.065, 1.00, dark);
    tube(-2.93, .07, 1.126, 1.126, metal);
    tube(.82, .075, 1.126, 1.126, metal);
    tube(1.94, .30, 1.112, 1.107, dark);
    tube(2.13, .045, 1.099, 1.103, copper);
    tube(-3.51, .10, .96, .96, metal);

    // Long, restrained service spine and twin inset stripes.
    box(0, -1.12, -.50, .18, .055, 4.1, dark);
    box(.23, -1.12, -.48, .028, .04, 3.1, copper);
    box(-.23, -1.12, -.48, .028, .04, 3.1, copper);

    for (const engine of ROCKET_ENGINES) {
        const { x, y, scale: s, exitZ } = engine;
        const throatZ = exitZ + .70 * s;
        const mount = translate(x, y, 0);
        // Chamber, gimbal collar and feed pipe above the visible bell.
        tube(throatZ + .10, .24, .17, .17, dark, x, y);
        tube(throatZ + .25, .09, .205, .205, metal, x, y);
        strut(new V(x * .6, y * .6, -3.54), new V(x, y, throatZ + .13), .035, metal);
        strut(new V(x + .16, y, -3.51), new V(x + .16, y, throatZ), .022, copper);
        put(metal, lathe([
            [exitZ, .62 * s], [exitZ + .25*s, .51*s],
            [exitZ + .52*s, .36*s], [throatZ, .25*s]
        ], 48), mount);
        // Reverse inner wall normals and winding to expose the cavity correctly.
        const inner = lathe([
            [exitZ + .001*s, .58*s], [exitZ + .26*s, .47*s],
            [exitZ + .52*s, .32*s], [throatZ, .22*s]
        ], 48);
        for (let k = 0; k < inner.attributes.normal.values.length; k++) inner.attributes.normal.values[k] *= -1;
        for (let k = 0; k < inner.indices.length; k += 3) {
            const b = inner.indices[k+1]; inner.indices[k+1] = inner.indices[k+2]; inner.indices[k+2] = b;
        }
        put(dark, inner, mount);
        put(copper, lathe([
            [exitZ, .62*s], [exitZ + .04*s, .625*s], [exitZ + .075*s, .62*s]
        ], 48), mount);
        // Circumferential cooling-jacket bands follow the bell contour.
        for (let i = 1; i <= 5; i++) {
            const a = i / 6;
            const z = exitZ + .52*s*a;
            const r = (.62 + (.36-.62)*a) * s + .006;
            tube(z, .012, r, r, metal, x, y);
        }
    }

    for (let j = 0; j < 4; j++) {
        const angle = j * Math.PI / 2;
        const x = Math.cos(angle), y = Math.sin(angle);
        // Swept aerodynamic surfaces meet the barrel and engine skirt.
        put(dark, sweptFin(),
            Matrix4.fromRotationTranslation(Matrix3.fromRotationZ(angle), V.ZERO));
        // Upper hinge, wide compression strut, diagonal brace and original contact pad.
        tube(-5.44, .12, .29, .29, dark, x*2.8, y*2.8);
        strut(new V(x*1.05, y*1.05, -2.55), new V(x*2.8, y*2.8, -5.36), .095, metal);
        strut(new V(x*1.02, y*1.02, -3.46), new V(x*2.25, y*2.25, -4.48), .055, dark);
        strut(new V(x*2.2, y*2.2, -4.40), new V(x*2.73, y*2.73, -5.26), .055, copper);
        box(x*1.09, y*1.09, -2.52, .22, .22, .32, dark, angle);

        // Curved, flush panes follow the hull instead of protruding like bubbles.
        for (const [material, lo, hi, width, lift] of [
            [dark, 3.05, 3.68, .33, .009],
            [glass, 3.13, 3.60, .265, .015]
        ]) {
            const rows = 4, cols = 10, positions = [], normals = [], uv = [], indices = [];
            for (let row = 0; row <= rows; row++) {
                const z = lo + (hi-lo)*row/rows;
                const radius = z <= 3.55
                    ? .99 + (.88-.99)*(z-2.95)/.60
                    : .88 + (.76-.88)*(z-3.55)/.60;
                const slope = z <= 3.55 ? (.88-.99)/.60 : (.76-.88)/.60;
                const norm = Math.sqrt(1+slope*slope);
                for (let col = 0; col <= cols; col++) {
                    const a = angle + (col/cols-.5)*width*2;
                    positions.push((radius+lift)*Math.cos(a), (radius+lift)*Math.sin(a), z);
                    normals.push(Math.cos(a)/norm, Math.sin(a)/norm, -slope/norm);
                    uv.push(col/cols, row/rows);
                    if (row < rows && col < cols) {
                        const k = row*(cols+1)+col, n = k+cols+1;
                        indices.push(k,k+1,n,k+1,n+1,n);
                    }
                }
            }
            const values = new Float64Array(positions);
            put(material, new Geometry({
                attributes: {
                    position: new GeometryAttribute({componentDatatype: ComponentDatatype.DOUBLE, componentsPerAttribute:3, values}),
                    normal: new GeometryAttribute({componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute:3, values:new Float32Array(normals)}),
                    st: new GeometryAttribute({componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute:2, values:new Float32Array(uv)})
                }, indices:new Uint16Array(indices), primitiveType:PrimitiveType.TRIANGLES,
                boundingSphere:BoundingSphere.fromVertices(values)
            }));
        }
        // Four compact reaction-control housings around the shoulder.
        box(x*1.075, y*1.075, 2.08, .14, .27, .18, metal, angle);
    }
}
