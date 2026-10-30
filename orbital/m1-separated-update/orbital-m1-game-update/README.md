# Orbital M1 — separate-nozzle exhaust update

This revision removes the forced 0.25–1.5 m inward morph. All 33 source centres remain at their actual nozzle positions. Their normalized exhaust distributions spread and overlap; they are never translated toward a shared centreline.

This corrects a known rendering artefact. It is **not validated interacting-jet CFD** or an accurate prediction of flame brightness. Read `science/CLUSTER-CALCULATIONS.md` for equations, assumptions, numerical results and uncertainty.

## Install on your current game

Upload the new `orbital-m1-game-update.zip` into `/workspaces/Orbital/orbital`, then run:

```bash
cd /workspaces/Orbital/orbital
python3 -m zipfile -e orbital-m1-game-update.zip m1-separated-update
python3 m1-separated-update/orbital-m1-game-update/install.py
```

Refresh `terrain.html`. The installer recognizes the original uploaded game and the previously supplied M1 integration. It verifies the known source versions and package hashes, checks JavaScript syntax, makes a backup, and prints a restore command. If you edited these source files afterwards, it stops without overwriting them. Running the identical update twice is harmless. `--check-only` performs preflight without changes. Restore refuses to overwrite later user edits.

The full updated game archive already contains this revision and does not need the patch installer. Use one route. Its other source, assets and CFD case files are retained. Fresh project copies still need the usual `npm ci`, your existing Cesium configuration, and `npm run dev`.

## What changes

- Actual 33-nozzle positions and the existing inner exit radius are used individually.
- A uniform nozzle disk is convolved with a diffusion kernel. Every transverse profile is normalized to preserve its assigned exhaust scalar flux, even where profiles overlap.
- Nozzle axes remain fixed relative to the rocket. Tilting the vehicle rotates the whole layout normally.
- The flow table supplies the candidate nozzle pressure, speed, density and pressure-mismatch reference. A documented, uncertain mixing closure supplies diffusion width. The widening bounds include the whole cluster rather than reverting to one narrow central plume.
- The old single-centre air-refraction approximation is **off by default**. It can still be selected under **Exhaust appearance** as a legacy approximation. No new accurate cluster refractivity field has been calculated.
- Throttle, shutdown, vacuum pressure selection, fixed render-domain length, elapsed-time advection and native Cesium logarithmic-depth handling remain connected.

The detailed 2,165-part inspection engine is not added to the 33-engine game vehicle. Rocket geometry and flight thrust, mass, navigation, walking and terrain systems are unchanged. The ideal visual-source performance calculation is not applied as flight thrust; it is not calibrated to the game's existing 500 kN thrust model.

## Controls and cost

Space / X and Shift / Ctrl keep their existing meanings. Expand **Exhaust appearance** for quality and brightness. Low (40 samples) remains default; Balanced (64) and High (96) cost more GPU work. A single screen-space stage evaluates all 33 footprints, rather than creating 33 independent ray-march volumes. This is more work per sample than the previous nearest-engine approximation; performance on your hardware is not established here. Brightness remains artistic exposure.

## Calculation files

`science/` contains the report, source-layout/operating-point data, calculated overlap diagnostics, kernel generator, analysis script and a plot of the actual source footprints. Their 95% scalar-flow contours are not visible flame boundaries. At 75% sea level the selected closure gives first footprint contact around 1.1 m, while the stated closure sensitivity gives 0.9–2.2 m. A connected footprint graph at about 2.9 m does not mean all gas suddenly follows one centreline.

The older single-engine CFD field is retained and bypassed for this cluster. Shock-induced turning, reverse flow, pressure redistribution between jets, reacting afterburning, radiative emission and resolved turbulent motion remain unsolved. Preserving fixed axes is the pre-interaction transport approximation, not a claim that real interacting gas can never turn.

## Checks

The numerical kernel row integrals, source positions, Cesium/WebGL execution, all quality levels, throttle/shutdown, vacuum, fixed-camera vehicle tilt, foreground occlusion at large camera range, and resize were checked. The full Vite build passed. A placeholder build token kept the actual game code in that build; it is not a live Cesium credential or saved into source. Live ion terrain services and the user's Codespace session were not tested. Installer upgrade, idempotence, changed-source refusal, restore protection and partial-write rollback were checked separately. Internal browser screenshots are not distributed.
