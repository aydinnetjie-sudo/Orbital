import * as THREE from "three";
import { createNoise3D } from "simplex-noise";


export class PlanetSurface {

    constructor(radius){

        this.radius = radius;

        this.noise = createNoise3D();


        this.noiseScale = 3;

        this.heightScale = 0.01;


        const geometry =
            new THREE.SphereGeometry(

                radius,

                200,

                200

            );


        const positions =
            geometry.attributes.position;


        const vertex =
            new THREE.Vector3();


        for(
            let i = 0;
            i < positions.count;
            i++
        ){

            vertex.fromBufferAttribute(
                positions,
                i
            );


            const normal =
                vertex.clone().normalize();


            const value =
                this.noise(

                    normal.x *
                    this.noiseScale,

                    normal.y *
                    this.noiseScale,

                    normal.z *
                    this.noiseScale

                );


            vertex.copy(

                normal.multiplyScalar(

                    radius +
                    value *
                    radius *
                    this.heightScale

                )

            );


            positions.setXYZ(

                i,

                vertex.x,
                vertex.y,
                vertex.z

            );

        }


        positions.needsUpdate = true;

        geometry.computeVertexNormals();


        const material =
            new THREE.MeshStandardMaterial({

                color:0x3d7eff

            });


        this.mesh =
            new THREE.Mesh(

                geometry,

                material

            );

    }

}