# Complete two-stage stack

A long first-stage booster beneath a constant-diameter upper ship, connected by an open vented interstage. There is no enlarged payload fairing or shoulder bump. The model has 33 booster engines, six recessed upper-stage engines (three smaller bells and three larger bells), four booster lattice fins, four ship flaps, a smooth ogive nose and a dark windward thermal-protection surface.

The arrangement is inspired by the 33+6 configuration documented by SpaceX: https://new.spacex.com/vehicles/starship . The model is an original compact game representation, about 30.3 m tall with a 2.24 m barrel diameter, not a dimensionally accurate replica.

## Scope

Both stages and their engine bays are present in the geometry. The stack still flies as one rigid vehicle: stage separation, separate fuel tanks, upper-stage ignition and independent booster flight are not implemented. Only the booster exhaust is active. Existing thrust, mass, controls and orbital dynamics remain as before; they are not specifications of the real launch vehicle. The existing plume is a visual approximation, and the ongoing offline CFD jobs are untouched.

The reference origin is near the stack center. Ground clearance is 15.5 m, with matching foot/body contacts and spawn height. The cockpit camera is above the 14.8 m nose at local z=17 m. Default chase range is 75 m. Walking exit and boarding height checks use the new ground clearance. Exhaust illumination is anchored to the booster base.

## Installation

Upload full-stack-update.zip to /workspaces/Orbital/orbital. Extract it and run install.py with Python 3, then refresh terrain.html. Use a different terminal from the running CFD case.

The installer backs up seven files and updates RocketVisual.js, RocketDesign.js, RocketClusterExhaust.js, CesiumRocket.js, RocketControls.js, SurfaceWalker.js and cesium-test.js. It preserves existing exhaust shader/model helpers and patches existing support modules rather than replacing their unrelated logic. Syntax failures trigger rollback. Original, previous three-engine, Starship-style, original-launcher and taller-launcher visual variants are supported.

## Verification

254 finite mesh instances in four hull material batches; one booster exhaust volume. Geometry/index bounds, engine clearances, aggregate booster exit area, exhaust anchoring, cutoff/visibility, texture fallback and resource cleanup pass. Ground contacts, taller spawn height, actual walker exit and on/off-pad boarding checks pass. Existing attitude-control, engine-presentation and lunar-transfer/capture checks pass. Generated shaders compile/link under Mesa OpenGL, and the Vite production build passes with a placeholder token. Installer fixtures cover variant compatibility, all seven backups and camera/ground/walker changes.

rocket-preview.png uses the actual model and material sources under standalone lighting. Full Cesium browser appearance and frame rate have not been verified here.

## Formatting compatibility correction

The installer and exhaust adapter accept both compact GLSL and the whitespace-formatted shader in the uploaded Pasted text(9).txt. The corrected bundle was installed against that exact uploaded RocketVisual.js in a temporary project fixture. The entire original PLUME_MATERIAL string is preserved verbatim; the rendering adapter patches sample coordinates at runtime with whitespace-tolerant, unique-match checks. Support-file patches also tolerate line breaks around their target expressions. Shader compilation, full-stack integration, exhaust-profile and engine-presentation checks and production build were repeated against the uploaded helpers.
