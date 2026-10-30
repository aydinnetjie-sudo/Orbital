"""Continue the two existing OpenFOAM cases from 0.020 to 0.040 seconds."""
from pathlib import Path
from datetime import datetime, timezone
import json
import shutil
import subprocess
import zipfile

BUNDLE = Path('/workspaces/Orbital/orbital/plume-lab/nozzle-20261028-175318-068159/orbital-nozzle-cfd')
IMAGE = 'opencfd/openfoam-default:2312'
TARGET = 0.04

INNER = r'''
source /usr/lib/openfoam/openfoam2312/etc/bashrc || exit 1
set -e
cd /case
run_step() {
    name="$1"; shift
    echo "Running $name..."
    if "$@" </dev/null >"log.$name" 2>&1; then
        echo "$name: finished"
    else
        tail -n 100 "log.$name"
        return 1
    fi
}
foamDictionary system/controlDict -entry startFrom -set latestTime
foamDictionary system/controlDict -entry endTime -set 0.04
foamDictionary system/controlDict -entry purgeWrite -set 0

echo "Continuing from 0.020 to 0.040 simulated seconds."
timeout 2h mpirun --allow-run-as-root --oversubscribe --bind-to none -np 2 \
    rhoCentralFoam -parallel </dev/null >log.continue-solver 2>&1 &
solver_pid=$!
while kill -0 "$solver_pid" 2>/dev/null; do
    sleep 15
    awk '/^Time =|^ExecutionTime =/ {latest=$0} END {if (latest!="") print latest}' log.continue-solver
done
if ! wait "$solver_pid"; then
    tail -n 100 log.continue-solver
    exit 1
fi
if grep -Eiq 'FOAM FATAL|(^|[^[:alpha:]])(nan|inf)([^[:alpha:]]|$)' log.continue-solver; then
    tail -n 100 log.continue-solver
    exit 1
fi
awk '/^Time =/ {last=$3} END {exit !(last >= 0.0399999)}' log.continue-solver
run_step continue-reconstruct reconstructPar -newTimes
run_step continue-export foamToVTK -latestTime -ascii
tail -n 12 log.continue-solver
'''

def latest_time(processor):
    times=[]
    for p in processor.iterdir():
        if p.is_dir():
            try: times.append(float(p.name))
            except ValueError: pass
    return max(times, default=-1)

def preflight(bundle=BUNDLE):
    if not (bundle/'inspect-nozzle.py').is_file():
        raise SystemExit('Expected case bundle is missing. No files changed.')
    cases=[bundle/'cases'/name for name in ['sea-level','thin-air']]
    for case in cases:
        if not (case/'RUN_COMPLETE').is_file():
            raise SystemExit(f'{case.name}: completed initial run marker missing. No files changed.')
        for rank in range(2):
            processor=case/f'processor{rank}'
            if not processor.is_dir() or abs(latest_time(processor)-0.02)>1e-10:
                raise SystemExit(f'{case.name}: expected checkpoint at 0.020 s on both ranks. No files changed.')
            for field in ['p','T','U','rho','k','omega']:
                if not (processor/'0.02'/field).is_file() and not (processor/'0.02'/(field+'.gz')).is_file():
                    raise SystemExit(f'{case.name}: missing checkpoint field {field}. No files changed.')
    return cases

def main():
    cases=preflight()
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup=BUNDLE/'continuation-backups'/stamp
    print('Continuing two existing cases. Each has a two-hour wall time limit.',flush=True)
    for case in cases:
        saved=backup/case.name
        saved.mkdir(parents=True)
        shutil.copy2(case/'system/controlDict',saved/'controlDict')
        shutil.copy2(case/'case-report.json',saved/'case-report.json')
        shutil.move(str(case/'RUN_COMPLETE'),str(saved/'RUN_COMPLETE'))
        if (case/'VTK').exists():
            shutil.move(str(case/'VTK'),str(saved/'VTK'))
        print(f'\nContinuing {case.name}; backup: {saved}',flush=True)
        subprocess.run([
            'docker','run','--rm','-i','--cpus=2','--memory=3g','--shm-size=256m',
            '--user',f'{__import__("os").getuid()}:{__import__("os").getgid()}',
            '-e','HOME=/tmp','--mount',f'type=bind,src={case},dst=/case',
            '--workdir','/case','--entrypoint','/bin/bash',IMAGE,'-s'
        ],input=INNER,text=True,check=True)
        subprocess.run(['python3',str(BUNDLE/'inspect-nozzle.py'),str(case)],check=True)
        path=case/'case-report.json'
        report=json.loads(path.read_text())
        report['continuation_end_time_s']=TARGET
        report['continuation_note']='Extended execution only; physical and mesh convergence remain unverified.'
        path.write_text(json.dumps(report,indent=2))
    archive=BUNDLE.parent/'orbital-nozzle-cfd-results-extended.zip'
    print('Packaging results...',flush=True)
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for path in sorted(BUNDLE.rglob('*')):
            if path.is_file():
                z.write(path,path.relative_to(BUNDLE.parent))
    print('EXTENDED_NOZZLE_CASES_READY',flush=True)
    print('Upload this ZIP:',archive,flush=True)

if __name__=='__main__':
    main()
