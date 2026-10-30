import * as THREE from "three";
import { TerrainChunk } from "./TerrainChunk.js";

export class TerrainManager {

    constructor(planet, scene){

        this.planet = planet;

        this.chunk = new TerrainChunk(scene);

        this.enabled = false;

    }

    update(camera){

        const altitude =

            camera.position.distanceTo(
                this.planet.group.position
            )

            - this.planet.radius / 1000;

        if(altitude < 100000){

            if(!this.enabled){

                this.enabled = true;

                console.log("Terrain Enabled");

                const up = camera.position
                    .clone()
                    .sub(this.planet.group.position)
                    .normalize();

                const position = this.planet.group.position
                    .clone()
                    .addScaledVector(
                        up,
                        this.planet.radius / 1000 + 5
                    );

                this.chunk.add(

    position,

    this.planet.group.position

);

                console.log(position);
console.log(this.planet.group.position);

            }

        }

        else{

            if(this.enabled){

                this.enabled = false;

                console.log("Terrain Disabled");

                this.chunk.remove();

            }

        }

    }

}