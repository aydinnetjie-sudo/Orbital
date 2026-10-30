import * as THREE from "three";

export class CameraController {

    constructor(camera, controls) {

        this.camera = camera;
        this.controls = controls;

        this.targetBody = null;

        this.offset = new THREE.Vector3();

    }

    follow(body) {

        this.targetBody = body;

        this.offset.copy(
            this.camera.position
        ).sub(
            body.group.position
        );

    }

    update() {

        if(!this.targetBody) return;

        // Move the OrbitControls target
        const movement = this.targetBody.group.position
            .clone()
            .sub(this.controls.target);

        // Move BOTH the target and camera
        this.controls.target.add(movement);
        this.camera.position.add(movement);

    }

}