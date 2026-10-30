import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export class Engine {

    constructor() {

        // ---------- Scene ----------

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x010208);

        // ---------- Camera ----------

        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            1,
            1e9
        );

        // ---------- Renderer ----------

        this.renderer = new THREE.WebGLRenderer({

            antialias: true,

            logarithmicDepthBuffer: true

        });

        this.renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

        this.renderer.outputColorSpace =
            THREE.SRGBColorSpace;

        this.renderer.toneMapping =
            THREE.ACESFilmicToneMapping;

        this.renderer.toneMappingExposure = 1.0;

        this.renderer.physicallyCorrectLights = true;

        document.body.appendChild(
            this.renderer.domElement
        );

        // ---------- Post Processing ----------

        this.composer = new EffectComposer(
            this.renderer
        );

        this.renderPass = new RenderPass(
    this.scene,
    this.camera
);

this.composer.addPass(this.renderPass);

        this.bloomPass = new UnrealBloomPass(

            new THREE.Vector2(
                window.innerWidth,
                window.innerHeight
            ),

            0.8,
            0.5,
            1.5

        );

        this.composer.addPass(
            this.bloomPass
        );
        this.bloomPass.enabled = true;
this.bloomPass.strength = 1.5;
this.bloomPass.radius = 0.75;
this.bloomPass.threshold = 0.8;

// Keep this after the bloom pass.
this.composer.addPass(new OutputPass());

        // ---------- Controls ----------

        this.controls = new OrbitControls(

            this.camera,
            this.renderer.domElement

        );

        this.controls.enableDamping = true;
        this.controls.enablePan = false;

        // ---------- Ambient Light ----------

        this.scene.add(

            new THREE.AmbientLight(
                0xffffff,
                0.03
            )

        );

        // ---------- Events ----------

        window.addEventListener(

            "resize",

            () => this.onResize()

        );

    }

    start() {

        this.previousTime =
            performance.now();

        this.animate();

    }

    animate() {

        requestAnimationFrame(

            () => this.animate()

        );

        const now =
            performance.now();

        let deltaTime =
            (now - this.previousTime) / 1000;

        this.previousTime = now;

        // Prevent physics explosions after lag spikes
        deltaTime = Math.min(
            deltaTime,
            0.05
        );

        if(this.world){

            this.world.update(
                deltaTime
            );

        }

        if (this.controls.enabled) {
    this.controls.update();
}

        this.composer.render();

        
    }

    onResize() {

        this.camera.aspect =
            window.innerWidth /
            window.innerHeight;

        this.camera.updateProjectionMatrix();

        this.renderer.setSize(

            window.innerWidth,
            window.innerHeight

        );

        this.composer.setSize(

            window.innerWidth,
            window.innerHeight

        );

    }

}