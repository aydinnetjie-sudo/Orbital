import * as THREE from "three";

export class EarthGeography {

    constructor() {

        this.loader = new THREE.TextureLoader();

        this.landMask = null;
        this.image = null;

        this.ready = false;

        this.canvas = document.createElement("canvas");
        this.context = this.canvas.getContext("2d");

        this.loader.load(
            "/textures/earth/landmask.png",

            (texture) => {

                this.landMask = texture;
                this.image = texture.image;

                this.canvas.width =
                    this.image.width;

                this.canvas.height =
                    this.image.height;

                this.context.drawImage(
                    this.image,
                    0,
                    0
                );

                this.ready = true;

                console.log(
                    "Earth geography loaded:",
                    this.image.width,
                    "x",
                    this.image.height
                );

                this.testLocations();
                
            },

            undefined,

            (error) => {

                console.error(
                    "Could not load Earth land mask:",
                    error
                );

            }
        );

    }


    latLonToUV(latitude, longitude) {

        const u =
            (longitude + 180) / 360;

        const v =
            (90 - latitude) / 180;

        return new THREE.Vector2(
            u,
            v
        );

    }


    isLand(latitude, longitude) {

        if (!this.ready) {

            return null;

        }

        const uv =
            this.latLonToUV(
                latitude,
                longitude
            );

        const x = Math.floor(
            uv.x * this.image.width
        );

        const y = Math.floor(
            uv.y * this.image.height
        );

        const pixel =
            this.context.getImageData(
                x,
                y,
                1,
                1
            ).data;

        const brightness =
            pixel[0];

        return brightness > 128;

    }
testLocations() {

    const locations = {

        Stockholm: {
            latitude: 59.3293,
            longitude: 18.0686
        },

        Everest: {
            latitude: 27.9881,
            longitude: 86.9250
        },

        Amazon: {
            latitude: -3.4653,
            longitude: -62.2159
        },

        PacificOcean: {
            latitude: 0,
            longitude: -140
        }

    };


    for (const [name, location] of Object.entries(locations)) {

        const result =
            this.isLand(
                location.latitude,
                location.longitude
            );

        console.log(
            name,
            "→",
            result ? "LAND" : "OCEAN"
        );

    }

}

}