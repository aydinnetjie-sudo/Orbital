# Nozzle CFD: first-results review

Both uploaded OpenFOAM runs completed at 0.020 seconds with 7,120 cells each. The data are a non-reacting, single-gas, axisymmetric RANS commissioning calculation, not a validated rocket flame.

## Findings

- Both meshes report Mesh OK; solver logs end normally. Independently parsed final fields are finite, and pressure, density, temperature, k and omega are positive.
- Maximum speeds: sea level 3056.72 m/s; thin air 3581.18 m/s. These are local maxima, not nozzle-averaged exhaust velocity.
- Final temperature ranges: sea level 280.27–3147.25 K; thin air 220.84–3147.25 K.
- Final VTK and reconstructed checkpoint cell ordering agree. The ideal gas relation p = rho R T agrees to about 0.0011%, consistent with rounded VTK fields.
- Sampled boundary mass flux agrees with the finite-difference change of stored domain mass. Over 15–20 ms, mean absolute residual normalized by inlet mass flux is 0.0348% at sea level and 0.0260% in thin air. This sampled integral check does not establish energy conservation or physical validation.
- Between 15 and 20 ms, cellwise velocity-vector relative L2 changes inside the nozzle are 0.405% at sea level and 0.291% in thin air. In the near-plume region (0 <= x < 4 m, r < 1.5 m), they are 17.16% and 1.302%, respectively. These are unweighted checkpoint differences, not formal convergence error estimates.
- Domain mass falls from the first monitor sample to the last by about 2.0% at sea level and 16.7% in thin air. Strong outer-boundary outflow is balanced by that stored-mass decrease. Outflow alone does not prove the boundary is wrong; continuing the transient is the next diagnostic.

## Decision

Continue the existing coarse cases from 0.020 to 0.040 seconds before a mesh refinement study. Compare near-field and boundary histories again. This may expose continuing startup transients or boundary sensitivity; extension does not guarantee convergence.

The continuation preserves the original checkpoints and copies control/report/marker files into a timestamped backup. Previous VTK exports are moved to that backup. It reuses both decomposed processor checkpoints, adds MPI --oversubscribe, and sets a two-hour wall-time limit per case. It never rebuilds or decomposes the existing mesh. On failure, keep the files and send the log; do not rerun this script blindly.

Upload continue-nozzle.py to /workspaces/Orbital/orbital and run:

    python3 /workspaces/Orbital/orbital/continue-nozzle.py

The script can run from any working directory. On success it produces orbital-nozzle-cfd-results-extended.zip beside the existing case bundle.

## Limits and checks still needed

No soot, combustion chemistry, spectral emission, air/exhaust species mixing or deep-vacuum rarefaction is modelled. Constant gas properties and turbulence wall functions remain assumptions. Mesh, time-step, domain-size and wall-resolution sensitivity are not established. This axisymmetric RANS setup cannot provide resolved three-dimensional turbulent flame motion. None of these files changes the game renderer.

## Contents

- flow-cross-sections.png: final temperature, speed and pressure, plotted directly as cell polygons without smoothing. The figure shows a crop of the full domain. The top row is gas temperature, not visible flame brightness.
- flow-history.png: sampled flux and stored-mass histories for the simulated five-degree wedge. These mass flows are not full-circle engine flow rates.
- analysis.json: numeric summary and checkpoint comparisons.
- analyse.py: reproducible analysis; expects the original ZIP at ../cfd-results-review/orbital-nozzle-cfd-results.zip and requires NumPy, SciPy and Matplotlib.
- continue-nozzle.py: standard-library-only continuation runner for the existing Codespace case.

The analysis was executed locally against the uploaded archive, and both charts were visually inspected. Continuation shell syntax and checkpoint preflight were checked against fixtures extracted from that archive. The continuation itself has not been executed here; this environment has no OpenFOAM/Docker runtime.
