import * as THREE from "three";

import { EarthGeography } from "./EarthGeography.js";
import { TerrainChunk } from "../terrain/TerrainChunk.js";

import { CameraController } from "../camera/CameraController.js";

import { Gravity } from "../simulation/Gravity.js";
import { Time } from "../simulation/Time.js";

import { Stars } from "./Stars.js";

import { Sun } from "./bodies/Sun.js";
import { Earth } from "./bodies/Earth.js";
import { Moon } from "./bodies/Moon.js";


export class World {

    constructor(scene, camera, controls) {

        this.scene = scene;
        this.camera = camera;
        this.controls = controls;


        this.gravity = new Gravity();

        this.time = new Time();


        this.renderScale = 1000;

        this.bodies = [];


        // ---------- Stars ----------

        this.stars = new Stars(
            this.camera
        );

        this.scene.add(
            this.stars.mesh
        );


        // ---------- Bodies ----------

        this.sun = new Sun();

        this.earth = new Earth();

        this.moon = new Moon();

        this.earthGeography = new EarthGeography();

        this.testChunk =
    new TerrainChunk(
        this.earth
    );

this.testChunk.setLocation(
    27.9881,
    86.9250
);

this.scene.add(
    this.testChunk.group
);

        this.addBody(this.sun);

        this.scene.add(this.sun.light);
        
        this.scene.add(this.sun.light.target);

        this.addBody(this.earth);

        this.addBody(this.moon);

        this.updateRenderPositions();



        // ---------- Initial Camera ----------

        this.camera.position.copy(
    this.earth.group.position
);

this.camera.position.z += 6400;


this.controls.target.copy(
    this.earth.group.position
);


        this.controls.update();

        this.cameraController =
    new CameraController(
        this.camera,
        this.controls
    );

this.cameraController.follow(
    this.earth
);



        // ---------- Controls ----------


        window.addEventListener(
            "keydown",
            (event)=>{



                if(event.key === "]"){

                    this.time.increase();

                    console.log(
                        "Time Warp:",
                        this.time.timeWarp + "x"
                    );

                }



                if(event.key === "["){

                    this.time.decrease();

                    console.log(
                        "Time Warp:",
                        this.time.timeWarp + "x"
                    );

                }


            }
        );

    }



    addBody(body){

        this.bodies.push(body);


        this.scene.add(
            body.group
        );

        

    }



    update(realDeltaTime){


        const deltaTime =
            this.time.update(
                realDeltaTime
            );



        this.stars.update();



        // ---------- Physics ----------


        this.gravity.update(
            this.bodies
        );


        for(const body of this.bodies){

            body.update(
                deltaTime,
                this.camera
            );

        }



        this.updateRenderPositions();



        // ---------- Sun Light ----------


        if(this.sun.light){


            this.sun.light.position.copy(
                this.sun.group.position
            );


            this.sun.light.target.position.copy(
                this.earth.group.position
            );


            this.sun.light.target.updateMatrixWorld();

            const sunDirection = this.sun.group.position
    .clone()
    .sub(this.earth.group.position)
    .normalize();

this.earth.material.uniforms.sunDirection.value.copy(
    sunDirection
);

this.earth.atmosphere.mesh.material.uniforms.sunDirection.value.copy(
    sunDirection
);

        } 



this.cameraController.update();

    }



    updateRenderPositions(){


        for(const body of this.bodies){


            body.group.position.set(

                body.position.x / this.renderScale,

                body.position.y / this.renderScale,

                body.position.z / this.renderScale

            );


        }


    }


}