"""Generate a non-reacting, single-gas nozzle-flow commissioning case.

This is NOT a validated reacting rocket plume or a vacuum-flow model.
Python standard library only. OpenFOAM-com v2312 is the target runtime.
"""
from pathlib import Path
import argparse
import json
import math


GAMMA, GAS_R, TC = 1.22, 355.0, 3500.0
PC, RT, RE = 2370021.534066159, .22, .58
CP = GAMMA * GAS_R / (GAMMA - 1)
TS = TC / (1 + (GAMMA - 1) / 2)
PS = PC * (TS / TC) ** (GAMMA / (GAMMA - 1))
US = math.sqrt(GAMMA * GAS_R * TS)
MDOT = PS / (GAS_R * TS) * US * math.pi * RT * RT
HALF_ANGLE = math.radians(2.5)


def header(name, kind='dictionary'):
    return ('FoamFile\n{\n version 2.0;\n format ascii;\n class ' + kind +
            ';\n object ' + name + ';\n}\n\n')


def mach_for_area(area):
    lo, hi = 1., 30.
    for _ in range(60):
        m = (lo + hi) / 2
        a = (2 / (GAMMA + 1) * (1 + (GAMMA - 1) * m * m / 2)) ** (
            (GAMMA + 1) / (2 * (GAMMA - 1))) / m
        if a < area:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def make_mesh(refinement=1):
    vertices, ids, blocks = [], {}, []

    def vertex(x, r, sign):
        point = (x, r * math.cos(HALF_ANGLE), sign * r * math.sin(HALF_ANGLE))
        key = tuple(round(v, 12) for v in point)
        if key not in ids:
            ids[key] = len(vertices)
            vertices.append(point)
        return ids[key]

    def block(x0, x1, r0a, r0b, r1a, r1b, nx, nr, grade, tag):
        v = [vertex(x0, r0a, -1), vertex(x1, r0b, -1),
             vertex(x1, r1b, -1), vertex(x0, r1a, -1),
             vertex(x0, r0a, 1), vertex(x1, r0b, 1),
             vertex(x1, r1b, 1), vertex(x0, r1a, 1)]
        blocks.append(dict(v=v, x0=x0, x1=x1, r0=r0a, r1=r1a,
                           wall0=r1a, wall1=r1b, nx=nx * refinement,
                           nr=nr * refinement, grade=grade, tag=tag))

    # Inner bell profile from the game's mesh, expressed downstream from throat.
    profile = [(-.70, .22), (-.52, .32), (-.26, .47), (0., .58)]
    for (a, b), nx in zip(zip(profile, profile[1:]), [12, 16, 16]):
        block(a[0], b[0], 0, 0, a[1], b[1], nx, 20, .03, 'nozzle')
    block(0, 16, 0, 0, .58, .58, 120, 20, .03, 'core')
    block(0, 16, .58, .58, .89, .89, 120, 8, 40, 'base')
    block(0, 16, .89, .89, 6, 6, 120, 24, 10, 'outer')

    faces = {}
    local = [('xmin', (0, 4, 7, 3)), ('xmax', (1, 2, 6, 5)),
             ('rmin', (0, 1, 5, 4)), ('rmax', (3, 7, 6, 2)),
             ('wedge1', (0, 3, 2, 1)), ('wedge2', (4, 5, 6, 7))]
    for b in blocks:
        for side, indices in local:
            f = tuple(b['v'][i] for i in indices)
            if len(set(f)) < 3:
                continue  # collapsed symmetry-axis face
            faces.setdefault(tuple(sorted(f)), []).append((f, b, side))

    patches = {name: [] for name in ['inlet', 'outlet', 'farfield', 'walls', 'wedge1', 'wedge2']}
    for shared in faces.values():
        if len(shared) == 2:
            continue
        if len(shared) != 1:
            raise ValueError('Non-manifold block interface')
        f, b, side = shared[0]
        if side.startswith('wedge'):
            patch = side
        elif side == 'xmin' and b['x0'] < -.69:
            patch = 'inlet'
        elif side == 'xmax' and b['x1'] == 16:
            patch = 'outlet'
        elif b['tag'] == 'nozzle' and side == 'rmax':
            patch = 'walls'
        elif b['tag'] == 'base' and side == 'xmin':
            patch = 'walls'
        elif b['tag'] == 'outer' and side in ['xmin', 'rmax']:
            patch = 'farfield'
        else:
            raise ValueError('Unassigned boundary: ' + str((b, side)))
        patches[patch].append(f)

    text = header('blockMeshDict') + 'mergeType points;\nscale 1;\nvertices\n(\n'
    text += ''.join(' (' + ' '.join(f'{x:.15g}' for x in p) + ')\n' for p in vertices)
    text += ');\nblocks\n(\n'
    for b in blocks:
        text += (' hex (' + ' '.join(map(str, b['v'])) + f") ({b['nx']} {b['nr']} 1) " +
                 f"simpleGrading (1 {b['grade']} 1)\n")
    text += ');\nedges ();\nboundary\n(\n'
    for name, fs in patches.items():
        kind = 'wedge' if name.startswith('wedge') else ('wall' if name == 'walls' else 'patch')
        text += f' {name}\n {{ type {kind}; faces\n (\n'
        text += ''.join('  (' + ' '.join(map(str, f)) + ')\n' for f in fs)
        text += ' );\n }\n'
    return text + ');\nmergePatchPairs ();\n', vertices, blocks, patches


def build_case(destination, ambient=101325., temperature=288.15, refinement=1):
    root = Path(destination)
    if root.exists():
        raise ValueError('Output directory already exists: ' + str(root))
    if ambient < 1000:
        raise ValueError('This continuum commissioning generator is restricted to >=1000 Pa; no deep-vacuum extrapolation.')
    for sub in ['0', 'constant', 'system']:
        (root / sub).mkdir(parents=True, exist_ok=True)

    def write(name, body, kind='dictionary'):
        path = root / name
        path.write_text(header(path.name, kind) + body)

    mesh, vertices, blocks, patches = make_mesh(refinement)
    (root / 'system/blockMeshDict').write_text(mesh)
    write('constant/thermophysicalProperties', f'''
thermoType
{{
 type hePsiThermo; mixture pureMixture; transport sutherland;
 thermo hConst; equationOfState perfectGas; specie specie;
 energy sensibleInternalEnergy;
}}
mixture
{{
 specie {{ molWeight {8314.46261815324 / GAS_R:.15g}; }}
 thermodynamics {{ Cp {CP:.15g}; Hf 0; }}
 transport {{ As 1.458e-06; Ts 110.4; Pr .72; }}
}}
''')
    write('constant/turbulenceProperties', '''simulationType RAS;
RAS { RASModel kOmegaSST; turbulence on; printCoeffs on; }
''')
    write('system/fvSchemes', '''fluxScheme Kurganov;
ddtSchemes { default Euler; }
gradSchemes { default cellLimited Gauss linear 1; }
divSchemes
{
 default none;
 div(tauMC) Gauss linear;
 div(phi,k) bounded Gauss upwind;
 div(phi,omega) bounded Gauss upwind;
}
laplacianSchemes { default Gauss linear corrected; }
interpolationSchemes
{
 default linear;
 reconstruct(rho) vanLeer;
 reconstruct(U) vanLeerV;
 reconstruct(T) vanLeer;
}
snGradSchemes { default corrected; }
wallDist { method meshWave; }
''')
    write('system/fvSolution', '''solvers
{
 "(rho|rhoU|rhoE)" { solver diagonal; }
 "(U|e|k|omega)"
 { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0; }
}
relaxationFactors { equations { k .7; omega .7; } }
''')
    write('system/decomposeParDict', 'numberOfSubdomains 2;\nmethod scotch;\n')
    functions = ''
    for patch in ['inlet', 'outlet', 'farfield']:
        functions += f'''mass_{patch}
 {{ type surfaceFieldValue; libs ("libfieldFunctionObjects.so");
 regionType patch; name {patch}; operation sum; fields (phi);
 writeFields false; log false; writeControl timeStep; writeInterval 200; }}
'''
    functions += '''domainMass
 { type volFieldValue; libs ("libfieldFunctionObjects.so");
 operation volIntegrate; fields (rho); writeFields false;
 log false; writeControl timeStep; writeInterval 200; }
'''
    write('system/controlDict', '''application rhoCentralFoam;
startFrom startTime; startTime 0; stopAt endTime; endTime .02;
deltaT 1e-9; adjustTimeStep yes; maxCo .2; maxDeltaT 1e-5;
writeControl adjustableRunTime; writeInterval .005; purgeWrite 0;
writeFormat ascii; writePrecision 12; writeCompression off;
timeFormat general; timePrecision 10; runTimeModifiable true;
functions
{
''' + functions + '}\n')

    # Seed the nozzle only with a one-dimensional isentropic state.
    # These are initial conditions; the Navier-Stokes solver evolves them.
    values = {name: [] for name in ['p', 'T', 'U', 'k', 'omega']}
    for b in blocks:
        for _ in range(b['nr']):
            for i in range(b['nx']):
                x = b['x0'] + (i + .5) / b['nx'] * (b['x1'] - b['x0'])
                if b['tag'] == 'nozzle':
                    radius = b['wall0'] + (b['wall1'] - b['wall0']) * (x - b['x0']) / (b['x1'] - b['x0'])
                    m = mach_for_area((radius / RT) ** 2)
                    t = TC / (1 + (GAMMA - 1) * m * m / 2)
                    p = PC * (t / TC) ** (GAMMA / (GAMMA - 1))
                    u = m * math.sqrt(GAMMA * GAS_R * t)
                    k = 1.5 * (.05 * u) ** 2
                    omega = math.sqrt(k) / (.09 ** .25 * .05)
                else:
                    p, t, u, k, omega = ambient, temperature, 0., .01, 10.
                for name, value in [('p', p), ('T', t), ('U', (u, 0., 0.)), ('k', k), ('omega', omega)]:
                    values[name].append(value)

    inlet_k = 1.5 * (.05 * US) ** 2
    inlet_omega = math.sqrt(inlet_k) / (.09 ** .25 * .05)
    dims = {'p': '[1 -1 -2 0 0 0 0]', 'T': '[0 0 0 1 0 0 0]',
            'U': '[0 1 -1 0 0 0 0]', 'k': '[0 2 -2 0 0 0 0]',
            'omega': '[0 0 -1 0 0 0 0]', 'nut': '[0 2 -1 0 0 0 0]',
            'alphat': '[1 -1 -1 0 0 0 0]'}
    inlet = {'p': f'type fixedValue; value uniform {PS:.15g};',
             'T': f'type fixedValue; value uniform {TS:.15g};',
             'U': f'type fixedValue; value uniform ({US:.15g} 0 0);',
             'k': f'type fixedValue; value uniform {inlet_k:.15g};',
             'omega': f'type fixedValue; value uniform {inlet_omega:.15g};'}
    walls = {'p': 'type zeroGradient;', 'T': 'type zeroGradient;', 'U': 'type noSlip;',
             'k': 'type kqRWallFunction; value uniform .01;',
             'omega': f'type omegaWallFunction; value uniform {inlet_omega:.15g};',
             'nut': 'type nutkWallFunction; value uniform 0;',
             'alphat': 'type compressible::alphatWallFunction; Prt .85; value uniform 0;'}
    far = {
        'p': f'type totalPressure; rho none; psi thermo:psi; gamma {GAMMA}; p0 uniform {ambient}; value uniform {ambient};',
        'T': f'type totalTemperature; psi thermo:psi; gamma {GAMMA}; T0 uniform {temperature}; value uniform {temperature};',
        'U': 'type pressureInletOutletVelocity; value uniform (0 0 0);',
        'k': 'type inletOutlet; inletValue uniform .01; value uniform .01;',
        'omega': 'type inletOutlet; inletValue uniform 10; value uniform 10;'}
    outlet = dict(far)
    outlet['p'] = f'type waveTransmissive; field p; psi thermo:psi; gamma {GAMMA}; fieldInf {ambient}; lInf 16; value uniform {ambient};'
    outlet['T'] = f'type inletOutlet; inletValue uniform {temperature}; value uniform {temperature};'
    outlet['U'] = 'type inletOutlet; inletValue uniform (0 0 0); value uniform (0 0 0);'

    for name in dims:
        vector = name == 'U'
        kind = 'volVectorField' if vector else 'volScalarField'
        text = 'dimensions ' + dims[name] + ';\ninternalField '
        if name in values:
            data = values[name]
            text += f"nonuniform List<{'vector' if vector else 'scalar'}>\n{len(data)}\n(\n"
            for v in data:
                text += ('(' + ' '.join(f'{x:.12g}' for x in v) + ')' if vector else f'{v:.12g}') + '\n'
            text += ');\n'
        else:
            text += 'uniform 0;\n'
        calculated = 'type calculated; value uniform 0;'
        text += 'boundaryField\n{\n'
        for patch, bc in [('inlet', inlet.get(name, calculated)), ('outlet', outlet.get(name, calculated)),
                          ('farfield', far.get(name, calculated)), ('walls', walls[name]),
                          ('wedge1', 'type wedge;'), ('wedge2', 'type wedge;'),
                          ('defaultFaces', 'type empty;')]:
            text += f' {patch} {{ {bc} }}\n'
        text += '}\n'
        write('0/' + name, text, kind)

    report = dict(stage='non-reacting single-gas RANS commissioning', image='opencfd/openfoam-default:2312',
                  solver='rhoCentralFoam', cells=sum(b['nx'] * b['nr'] for b in blocks),
                  ambient_pressure_Pa=ambient, ambient_temperature_K=temperature,
                  throat_radius_m=RT, exit_radius_m=RE, chamber_temperature_K=TC,
                  chamber_pressure_Pa=PC, throat_temperature_K=TS, throat_pressure_Pa=PS,
                  throat_speed_mps=US, ideal_full_circle_massflow_kgps=MDOT,
                  prescribed_wedge_inlet_massflow_kgps=MDOT * math.sin(2 * HALF_ANGLE) / (2 * math.pi),
                  refinement=refinement, rocket_plume_validated=False, vacuum_plume_validated=False,
                  assumptions=['Axisymmetric 5-degree wedge, from sonic throat downstream',
                               'Single perfect gas: ambient uses the same gas properties as exhaust',
                               'Constant Cp and gamma; representative Sutherland viscosity',
                               'Adiabatic no-slip walls with wall functions',
                               '5% inlet turbulence intensity and 0.05 m length scale',
                               'No chemical reactions, soot kinetics or spectral radiation',
                               'Not valid as a deep-vacuum CFD/DSMC solution',
                               'Mesh/domain/time convergence and wall y+ have not been established'])
    (root / 'case-report.json').write_text(json.dumps(report, indent=2))
    (root / 'nozzle.foam').touch()
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('output')
    parser.add_argument('--ambient', type=float, default=101325.)
    parser.add_argument('--temperature', type=float, default=288.15)
    parser.add_argument('--refinement', type=int, choices=[1, 2], default=1)
    args = parser.parse_args()
    report = build_case(args.output, args.ambient, args.temperature, args.refinement)
    print(json.dumps(report, indent=2))
