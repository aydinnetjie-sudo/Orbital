# Three-engine rocket redesign

A wider white tank barrel, dark engine bay, swept fins, flush cockpit windows, three exposed engine bells and reinforced landing legs. The original foot contact locations and nose/engine heights are retained. The three smaller bells have the same combined exit area as the previous single bell, and each has an attached exhaust primitive.

This is a visual redesign. Existing total flight thrust, controls, mass and orbital dynamics remain as before. It does not add independent engine failures, independently steerable engines or interacting-jet CFD. The running offline CFD cases are untouched; their original nozzle reference remains a single-engine commissioning model.

## Installation

Upload this ZIP to /workspaces/Orbital/orbital, extract it, and run install.py using Python 3. The installer locates that absolute project path, backs up current visual files, preserves the installed flame shader and exhaust-profile helpers, and replaces the visual class plus RocketDesign.js. Syntax checks run automatically, with rollback on a syntax-check failure. Refresh terrain.html afterward.

Only src/RocketVisual.js and src/RocketDesign.js are installed. The full replacement files are also supplied in src/ for inspection. Existing flame helper code in your current file takes precedence over the supplied full-file copy.

## Verification

Geometry/index/normal integrity, all three plume attachments, rotated craft transforms, clearance between bells, combined exit area, visibility, cutoff and cleanup pass. Existing attitude-control, engine-presentation and exhaust-profile checks pass. The Vite production build passes with a placeholder token. Actual generated material shaders compile/link under Mesa OpenGL, and the preview uses the actual exported geometry. Full Cesium browser rendering and frame rate have not been verified here. Hull parts remain in five material batches; the three plumes share one material and lookup profile. Three visible jets can still cost more GPU time than one.

rocket-preview.png is a standalone model preview with studio lighting, not a screenshot of the running game.
