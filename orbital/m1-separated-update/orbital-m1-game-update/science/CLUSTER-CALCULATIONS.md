# M1 cluster: calculated separate-axis exhaust distributions

## What was corrected

The previous renderer replaced individual source coordinates with cluster-centre coordinates over a fixed 0.25–1.5 m distance. That was a visual morph, not a flow calculation. This revision removes that displacement entirely. A positive, normalized distribution is centred on every actual nozzle. Its spread changes with downstream distance and operating point, and neighbouring distributions can overlap without moving their centres.

This is a reduced scalar-transport model. It does **not** calculate the momentum/pressure interaction of 33 supersonic jets. Its conservation checks cannot establish accurate rocket-plume physics.

## Geometry and source conditions

The existing game layout contains 3, 10 and 20 nozzles on rings of radius 0.14, 0.43 and 0.85 m. The inner exit radius is 0.58/√33 = **0.100965 m**. The combined exit area is equivalent to radius 0.58 m. The smallest centre spacing is **0.242487 m**, leaving **0.040557 m** between adjacent exit edges.

At 75% nominal pressure and 101325 Pa ambient, the retained ideal M1 table gives exit speed **3249.72 m/s**, exit Mach **4.114**, and convective Mach reference **2.875**. Area scaling gives an assigned exhaust flow of **15.640 kg/s per source**, or **516.125 kg/s** over 33 sources. These are candidate ideal-source numbers, not measured engine data. They do not replace the game's existing flight thrust.

The game only models the lower bell visually; the actual throat, injector distribution, pump map, exhaust turbulence and operating point are not established by that simplified geometry. The prior table's mixture ratio, area ratio and nominal pressure remain assumptions. Accurate engine performance and plume prediction would require consistent measured or specified nozzle/inlet conditions.

## Pressure and mixing references

A fully expanded ideal radius is obtained from the retained isentropic source table. A pressure-adaptation screening length uses Rₑ√(Mₑ²−1), a Mach-wave geometric scale. For weak overexpansion the source disk radius relaxes toward the ideal expanded radius on that scale. For underexpansion the retained Prandtl–Meyer slope widens it. These are approximations, not a free-boundary/shock solution. In vacuum the same widening is only a ballistic expansion reference; rarefied flow and gas collisions are not solved.

A density-scaled incompressible vorticity-thickness growth reference is

\[
G_0=0.0825\left(1+\sqrt{\rho_a/\rho_e}\right).
\]

The convective-Mach reference is M꜀ = Uₑ/(aₑ+aₐ). These forms follow mixing-layer scaling; the heterogeneous-gas implementation is a reference approximation. The hot-jet study cited below provides a low-M꜀ fit F = 1−M꜀² only up to M꜀ = 0.6. **It must not be extrapolated to our M꜀ ≈ 2.88**, where it would become negative.

Instead, the runtime explicitly selects an uncertain supersonic damping factor **F = 0.2**, with sensitivity values **0.1 and 0.25**. The selection is motivated by observed high-speed growth suppression, not fitted to this engine or measured as a 33-engine value. Round hot jets and plane mixing layers have different growth behaviour. These sensitivity endpoints are not statistical confidence bounds or guaranteed physical bounds.

The Gaussian spread is σ(z) = G₀Fz/√(2π). The √(2π) conversion relates Gaussian smoothing of a velocity step to vorticity thickness. At the selected case, dσ/dz = **0.0253763**. Unknown nozzle-exit boundary layers and reacting mixing can materially change it. This chosen closure is the main uncertainty in the reported overlap distances.

## Conserved transverse kernel

At each station, a normalized uniform disk of radius a is convolved with an isotropic 2D Gaussian of standard deviation σ. For fixed a this is the Green-function solution of transverse scalar diffusion with an appropriate integrated diffusivity. The added pressure-radius adaptation is a separate approximate geometric scaling, so the complete model is not advertised as an exact global PDE solution.

The convolution remains centred on its source and integrates to one. With b² = a² + 4σ², s = r/b and q = σ/b, the tabulated dimensionless kernel H satisfies

\[
2\pi\int_0^\infty sH(s,q)\,ds=1,
\qquad
f_i(x,y,z)=\frac{\dot m_i}{b^2}
H\!\left(\frac{|(x,y)-(x_i,y_i)|}{b},q\right).
\]

The sum of fᵢ integrates to the sum of assigned source mass flows; each individual first moment stays at (xᵢ,yᵢ). This is an exhaust **scalar-flux** invariant. It does not mean superposed gas pressure, velocity or total mixture density satisfy mass, momentum and energy conservation as a coupled gas-flow solution. Overlapping kernels cannot predict shock deflection or reverse flow.

SciPy's noncentral chi-squared CDF evaluates the disk–Gaussian convolution. A 512 × 129 float32 lookup table covers s = 0–3.5 and q = 0–0.5. Rows are normalized using the exact integral of their linear-in-radius interpolant, so bilinear interpolation between rows preserves the assigned flux. This numerical normalization is intentional; it is not independent evidence of physical accuracy. The measured maximum row-integral error after float32 storage is **3.13 × 10⁻⁸**. The table is a discretized approximation to the exact convolution, especially at the initially sharp disk edge.

The shader evaluates the same table separately at the 33 fixed offsets. Area dilution appears in the normalized kernel; the previous duplicate radius-squared dilution was removed. The rendered blue/orange light and diamond pattern additionally apply artistic noise, emission weights, exposure and a finite-domain tail fade. Those light weights are not conserved scalar flux or calibrated radiance. The plot shows the calculated scalar field, not a prediction of a photograph.

## Overlap results and their meaning

Overlap is defined here using the radius enclosing **95% of one source's assigned scalar flow**. A Gaussian has no sharp outer boundary, and a visible flame does not necessarily coincide with this contour.

| Supersonic damping assumption | First 95% footprint contact | All-source footprint graph connected |
|---:|---:|---:|
| 0.10 | 2.236 m | 5.812 m |
| 0.20, selected | 1.105 m | 2.906 m |
| 0.25 | 0.876 m | 2.324 m |

These are for 75%, sea level. “Connected” means every source can be linked through touching 95% footprints; it does not mean the gas has become uniform or its axes have converged. Results for 15 pressure/command combinations are recorded in `cluster-calculations.json`. They are model sensitivities, not experimentally validated merger distances.

After substantial interaction begins, fixed-axis linear transport is increasingly uncertain: real shocks, pressure forces, turbulent exchange and chemistry can redistribute gas and turn the flow. This update removes the known false inward morph; it does not settle those missing physics.

## Verification and use

`transport-validation.json` checks the scalar integrals at several downstream stations. Cesium/WebGL checks use the actual game RocketVisual, a fixed camera, vehicle tilt, all quality modes, vacuum and shutdown, foreground opaque geometry and a camera far range of 10¹³ m. Image comparison checks foreground occlusion. The Vite production build and reversible installer upgrade checks are separate. None is a hot-fire, schlieren or flow-field validation against this engine cluster.

Air refraction defaults to off. The old equivalent-centre air model remains an explicitly labelled legacy option. The saved single-engine CFD is retained but bypassed for this geometry. No new 33-engine CFD was run for this revision.

Reproduce the kernel and data analysis from the extracted update directory with Python 3, NumPy, SciPy and Matplotlib. `science/make-kernel.py` regenerates the source table; `node science/export-cases.mjs` exports the source models; `python3 -P science/analyze.py` regenerates the diagnostics and scientific plot. The source layout is frozen in `science/layout.json`. No Python is required at game runtime.

## Primary references

- McGuirk & Feng (2021), *The near-field aerodynamic characteristics of hot high-speed jets*, JFM 915 A120, equations 2.2–2.5 and 4.1–4.2, and the stated high-Mach extrapolation limits: https://doi.org/10.1017/jfm.2021.162
- Papamoschou & Roshko (1988), *The compressible turbulent shear layer: an experimental study*, JFM 197:453–477, primary experimental evidence for compressibility suppression: https://authors.library.caltech.edu/records/ktwm0-v0j30
- Raje & Sinha (2019), *Three-dimensional simulation of rocket nozzles with multi-jet interaction using shock-unsteadiness model*, illustrates the interacting pressure/shock physics omitted here: https://www.hypersonic-cfd.com/Inhouse_papers/2019/raje_aiaa_aafe_2019.pdf
- Nallasamy et al. (2010), NASA KSC-2009-281, *Base Flow and Heat Transfer Characteristics of a Four-Nozzle Clustered Rocket Engine: Effect of Nozzle Pressure Ratio*, a different cluster configuration; not validation of M1: https://ntrs.nasa.gov/citations/20110008322
