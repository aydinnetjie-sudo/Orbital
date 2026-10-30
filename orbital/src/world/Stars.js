import * as THREE from "three";


export class Stars {


    constructor(camera){

        this.camera = camera;


        const geometry =
            new THREE.BufferGeometry();


        const positions = [];


        const count = 10000;


        const radius = 500000000;


        for(let i = 0; i < count; i++){


            const direction =
                new THREE.Vector3(

                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5

                )
                .normalize();



            const distance =
                radius *
                (0.8 + Math.random() * 0.2);



            positions.push(

                direction.x * distance,
                direction.y * distance,
                direction.z * distance

            );


        }



        geometry.setAttribute(

            "position",

            new THREE.Float32BufferAttribute(
                positions,
                3
            )

        );



        const material =
            new THREE.PointsMaterial({

                color:0xffffff,

                size:500,

                sizeAttenuation:true

            });



        this.mesh =
            new THREE.Points(

                geometry,

                material

            );


    }



    update(){

        this.mesh.position.copy(

            this.camera.position

        );

    }


}