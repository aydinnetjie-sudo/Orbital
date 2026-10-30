# Orbital M1 exhaust — Cesium game integration

This update ports the accepted M1 preview's procedural emission and fast advection into the uploaded Cesium game. It replaces the old exhaust renderer on the existing full two-stage, 33-engine rocket. The rocket geometry, engine hardware, flight thrust, masses, controls, walking, terrain, and CFD case files are unchanged. The detailed 2,165-part inspection engine is **not** added 33 times to the game.

## Install in the existing Codespace

Upload `orbital-m1-game-update.zip` into `/workspaces/Orbital/orbital`, then run:

```bash
cd /workspaces/Orbital/orbital
python3 -m zipfile -e orbital-m1-game-update.zip m1-game-update
python3 m1-game-update/orbital-m1-game-update/install.py
```

Refresh `terrain.html`. The existing Space / X / Shift / Ctrl controls operate the new effect. Expand **Exhaust appearance** to choose quality, air refraction and brightness. Low (40 samples) is the default. Balanced (64) and High (96) increase GPU cost. Brightness is artistic exposure, not an engine performance control.

The installer verifies the exact uploaded RocketVisual and RocketDesign versions, checks JavaScript syntax before writing, and backs up the previous exhaust. It prints a restore command. It stops without changes if these source files have changed since the upload, or new module paths already exist. Re-running the identical installer after success is harmless. An optional `--check-only` performs preflight without writing. The installer does not replace your whole source folder or touch `.env.local`.

The separate full updated game archive already contains these changes. It does not require this installer; use one installation route. It retains the uploaded project's other files and assets. A fresh copy still needs the usual npm installation and your existing Cesium configuration. No live credentials are added by this update.

## What is connected

- Actual 33-nozzle positions and inner exit radius from the existing rocket design; all sources are rendered in one screen-space volume.
- Existing smoothed engine power, shutdown and crash/landed visibility rules.
- Methane/oxygen ideal-nozzle table from the M1 preview, feeding pressure mismatch, relative density, exit speed and shock-spacing estimates. It remains an assumed candidate operating point, not a pump/valve calibration or measured flight thrust.
- Earth pressure from the game's existing exponential-atmosphere convention: 101325 exp(−h/8500) Pa, with vacuum above its 160 km limit. The nearest-body check prevents an atmosphere being created at the Moon.
- Motion accumulated from real elapsed seconds at the calculated exit speed times the existing assumed 0.6 convection factor; a bounded periodic phase avoids long-runtime precision loss. Flight time warp does not multiply the visual texture speed.
- Native Cesium scene-depth reconstruction, including logarithmic depth, clips the integrated plume at terrain and foreground geometry. Camera translations are transformed on the CPU in float64 before uploading local metre coordinates, avoiding metre-scale ECEF precision loss in the shader.
- A 1× first-order air-refraction integral, bypassed in vacuum and outside model applicability. No hidden optical magnification is applied.

## What the air calculation means in this game

The saved CFD case is **one 0.65 m-radius nozzle at 75%, sea level, 288.15 K**, sampled at 20–40 ms. It is not converged or experimentally validated. Your game has **33 much smaller nozzles**: each existing inner exit radius is 0.58 / √33 ≈ 0.101 m, with a combined exit area equivalent to radius 0.58 m. Their spacing, merging jets and Reynolds numbers do not match the CFD case.

Consequently, the default game air effect uses the previously documented reduced-order entrainment model, rescaled geometrically to this equivalent area. It conserves bulk model balances and uses thermodynamic and refractivity inputs, but its Gaussian spatial reconstruction, entrainment closure, similarity scaling and treatment as one equivalent jet are **unvalidated approximations for this cluster**. Near-field nozzle streams transition artistically into a shared downstream envelope over 0.25–1.5 m; interacting-jet dynamics are not solved.

`CFDAirField.js` is included intact for reference/future integration. The native Cesium shader can sample its saved grid, but `setAirMode('cfd')` bypasses it unless the source geometry and operating point match the single-engine gate. The game's UI disables that selection for this cluster. This gate prevents presenting the earlier CFD as a 33-engine prediction; passing the gate alone would not validate another engine design. The source model's mixture ratio and nozzle area ratio remain design assumptions and are not inferred from the game's simplified bell geometry.

The coloured plume and its turbulence are illustrative emission, not a finite-rate chemistry, soot or spectral-radiation solution. Cesium custom stages run after its built-in tone mapping, so this port tone-maps its emission contribution separately and composites it into the scene. It will not be pixel-identical to the preview's Three.js HDR/bloom pipeline. A uniform sky may show very little refraction; a distant textured background is more revealing. No claim of accurate resolved turbulent shimmer is made.

## Validation and practical limits

The full uploaded game was built using its lockfile dependencies and Vite. A placeholder build token was used to keep the actual terrain/game code in the production bundle; it is not a functioning Cesium credential and is not saved into source. An independent credential-free Cesium scene loaded the actual updated RocketVisual and tested the effect with scene geometry, standard game coordinates, tilt, quality changes, shutdown, vacuum, the CFD guard, foreground occlusion and resizing. This exercises the actual Cesium/WebGL port without relying on ion terrain/image service access. Live terrain and your signed-in Codespace session were not exercised here.

The installer has separate preflight, idempotence, changed-source refusal and restore checks. Validation JSON is included; internal browser screenshots are not distributed. GPU rendering was tested using software WebGL; that does not establish frame rate on the user's computer. One combined pass avoids 33 separate ray-march volumes, but additional quality and air integration still cost GPU time. The detailed inspection engine remains a separate asset.

## Runtime files

Only `src/RocketVisual.js` is replaced. New modules are in `src/m1/`:

- `CesiumM1Exhaust.js`: game adapter, pressure selection, camera transforms, lifecycle and UI.
- `CesiumM1Shaders.js`: Cesium GLSL port of emission and refraction.
- `MethaloxModel.js`, `AirMixingModel.js`, `CFDAirField.js`: retained calculation inputs and models.

The earlier CFD report and raw results remain separate deliverables. This update does not improve or claim convergence of that calculation.
