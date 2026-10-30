import * as THREE from "three";
import { CelestialBody } from "./CelestialBody.js";


export class Rocket extends CelestialBody {


    constructor(){

        super({

            name:"Rocket",

            // tiny compared to planets
            radius:5,

            mass:20000,


            // Start near Earth

            position:new THREE.Vector3(

                149597870700,

                0,

                6371000 + 10000

            ),


            // Earth orbital velocity

            velocity:new THREE.Vector3(

                0,

                0,

                29780

            )

        });



        // ---------- Graphics ----------


        const geometry =
            new THREE.ConeGeometry(

                2,

                10,

                16

            );


        const material =
            new THREE.MeshStandardMaterial({

                color:0xffffff

            });


        this.mesh =
            new THREE.Mesh(

                geometry,

                material

            );


        this.mesh.rotation.x =
            Math.PI / 2;



        this.group.add(
            this.mesh
        );

        this.thrustPower = 500000;

this.rotationSpeed = 0.03;

this.keys = {};

window.addEventListener(
    "keydown",
    (event)=>{
        this.keys[event.key.toLowerCase()] = true;
    }
);


window.addEventListener(
    "keyup",
    (event)=>{
        this.keys[event.key.toLowerCase()] = false;
    }
);


    }

    update(deltaTime){

    super.update(deltaTime);


    // Rotate rocket

    if(this.keys["a"]){

        this.mesh.rotation.y +=
            this.rotationSpeed;

    }


    if(this.keys["d"]){

        this.mesh.rotation.y -=
            this.rotationSpeed;

    }



    // Forward thrust

    if(this.keys["w"]){

        const direction =
            new THREE.Vector3(0,0,-1);


        direction.applyQuaternion(
            this.mesh.quaternion
        );


        const force =
            direction.multiplyScalar(
                this.thrustPower
            );


        this.applyForce(
            force
        );

    }



    // Reverse thrust

    if(this.keys["s"]){

        const direction =
            new THREE.Vector3(0,0,1);


        direction.applyQuaternion(
            this.mesh.quaternion
        );


        const force =
            direction.multiplyScalar(
                this.thrustPower
            );


        this.applyForce(
            force
        );

    }

}

}