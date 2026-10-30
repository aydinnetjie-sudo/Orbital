# Orbital hot-nozzle CFD commissioning bundle

Target: OpenCFD OpenFOAM v2312, Docker image opencfd/openfoam-default:2312.

Run bash run-nozzle-cases.sh from any directory. It uses two MPI processes, a 3 GB memory limit, a 256 MB shared-memory area and a two-hour wall-time limit per case. Both sea-level (101325 Pa) and thin-air (10000 Pa) cases are generated. Each covers 0.02 seconds of simulated flow, not 0.02 seconds of computer time. Logs are kept in each case and progress is printed every 15 seconds.

The six-block, 7120-cell axisymmetric mesh includes the bell from its sonic throat, matching the game's 0.22 m throat and 0.58 m internal exit radii. The computational plume domain extends 16 m downstream and to 6 m radius. No analytical plume shape is prescribed downstream.

## Scope and limitations

This is a NON-REACTING SINGLE-GAS RANS COMMISSIONING calculation, not a validated real rocket exhaust, photometric flame, or vacuum solution. Engine constants are the existing project's assumptions, not measured engine data. The exterior gas uses the same constant Cp, gamma and molecular weight as the exhaust. Viscosity is a representative Sutherland law. Walls are adiabatic with wall functions; turbulence intensity is assumed to be 5% with a 0.05 m length scale. kOmegaSST models mean turbulent transport. This axisymmetric RANS calculation cannot provide three-dimensional turbulent flame detail. Chemical heat release, soot formation/oxidation, detailed spectra, rarefaction and continuum/DSMC coupling are NOT included. No experimental, grid-convergence, domain-convergence, time-convergence or wall-y-plus validation has been established. Finishing a run and passing field-integrity checks does not establish those validations.

The run does not edit the game or install a replacement flame. It exports p, T, rho, U and turbulence fields for inspection before extending the physical model. Do not treat these fields alone as validated visible emission.

The initial nozzle state is seeded from one-dimensional isentropic relations for numerical startup. The solver subsequently evolves it, including wall and external-pressure effects. Initial-pressure/temperature/velocity fields are created explicitly, avoiding the missing 0/p issue from the reference run.

Monitoring: inlet/outlet/farfield signed sector mass flux and integrated domain mass are recorded in postProcessing. The report includes the expected inflow for the actual 5-degree planar wedge; do not compare a sector flux directly to full-circle mass flow.

At completion the script reconstructs each parallel result, exports the latest time in ASCII VTK, verifies finite positive thermodynamic/turbulence fields, then creates a ZIP alongside this bundle. Upload that results ZIP for analysis. If a case fails, the tail of its solver log is printed and the run stops. Preserve failed cases for diagnosis.

To create a separate finer commissioning mesh, run:
python3 build-nozzle-case.py /path/to/new-case --refinement 2

The generator refuses to overwrite an existing case and rejects ambient pressures below 1000 Pa. The latter is an explicit workflow restriction, not a universal Knudsen-number criterion. It must not be used to claim continuum validity at every cell.

References for model configuration:
https://doc.openfoam.com/2306/tools/processing/models/turbulence/ras/linear-evm/rtm/kOmegaSST/
https://api.openfoam.com/2312/classFoam_1_1compressible_1_1alphatWallFunctionFvPatchScalarField.html
