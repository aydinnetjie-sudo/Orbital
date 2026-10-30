import * as THREE from "three";

export class TerrainChunk {

    constructor(earth) {

        this.earth = earth;

        // Temporary test size.
        // 500 render units = 500 km
        this.size = 500;

        this.segments = 32;

        this.group = new THREE.Group();


        // ----------------------------------------
        // Geometry
        // ----------------------------------------

        this.geometry =
            new THREE.PlaneGeometry(
                this.size,
                this.size,
                this.segments,
                this.segments
            );


        // ----------------------------------------
        // Temporary material
        // ----------------------------------------

        this.material =
            new THREE.MeshStandardMaterial({

                color: 0x4f8f3f,

                roughness: 1.0,

                metalness: 0.0,

                side: THREE.DoubleSide

            });


        this.mesh =
            new THREE.Mesh(
                this.geometry,
                this.material
            );


        this.group.add(
            this.mesh
        );

    }


    // ========================================
    // Position chunk on Earth
    // ========================================

    setLocation(latitude, longitude) {

        // Convert degrees → radians.

        const lat =
            THREE.MathUtils.degToRad(
                latitude
            );

        const lon =
            THREE.MathUtils.degToRad(
                longitude
            );


        // Earth radius in render units.
        //
        // 6,371,000 m / 1,000
        // = 6,371 km

        const radius =
            this.earth.radius / 1000;


        // ----------------------------------------
        // Latitude / longitude → 3D position
        // ----------------------------------------

        const position =
            new THREE.Vector3(

                radius *
                Math.cos(lat) *
                Math.cos(lon),

                radius *
                Math.sin(lat),

                radius *
                Math.cos(lat) *
                Math.sin(lon)

            );


        // ----------------------------------------
        // Surface normal
        // ----------------------------------------

        const normal =
            position.clone().normalize();


        // ----------------------------------------
        // Position the chunk
        // ----------------------------------------

        this.group.position.copy(
            position
        );


        // ----------------------------------------
        // Temporary offset
        // ----------------------------------------
        //
        // Put the test chunk slightly above
        // Earth's surface so the Earth sphere
        // cannot hide it.

        this.group.position.add(
            normal.clone().multiplyScalar(5)
        );


        // ----------------------------------------
        // Rotate the chunk
        // ----------------------------------------
        //
        // A PlaneGeometry initially faces +Z.
        //
        // Rotate it so +Z points away from
        // the centre of Earth.

        this.group.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 0, 1),
            normal
        );

    }

}