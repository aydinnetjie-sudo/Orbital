export class Time {

    constructor() {

        // ---------- Simulation ----------

        this.timeWarp = 1;

        this._deltaTime = 0;

        // Maximum allowed warp
        this.maxWarp = 1_000_000;

    }

    get deltaTime() {

        return this._deltaTime;

    }

    update(realDeltaTime) {

        this._deltaTime =
            realDeltaTime *
            this.timeWarp;

        return this._deltaTime;

    }

    increase() {

        this.timeWarp = Math.min(
            this.timeWarp * 10,
            this.maxWarp
        );

    }

    decrease() {

        this.timeWarp = Math.max(
            this.timeWarp / 10,
            1
        );

    }

    setWarp(value) {

        this.timeWarp = Math.min(
            Math.max(value, 1),
            this.maxWarp
        );

    }

}