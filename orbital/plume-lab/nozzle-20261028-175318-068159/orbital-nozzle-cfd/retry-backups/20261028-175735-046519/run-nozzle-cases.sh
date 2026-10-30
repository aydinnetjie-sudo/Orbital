#!/usr/bin/env bash
set -e
bundle=$(cd "$(dirname "$0")" && pwd)
image=opencfd/openfoam-default:2312

for case_name in sea-level thin-air; do
  plume_case="$bundle/cases/$case_name"
  test -f "$plume_case/0/p"
  if [ -f "$plume_case/RUN_COMPLETE" ]; then
    printf 'Already completed: %s\n' "$case_name"
    continue
  fi
  if [ -d "$plume_case/processor0" ]; then
    echo "An earlier parallel run exists. Preserve it for inspection before retrying."
    exit 1
  fi
  printf 'Starting hot-nozzle flow case: %s\n' "$case_name"

  docker run --rm -i --cpus=2 --memory=3g --shm-size=256m \
    --user "$(id -u):$(id -g)" -e HOME=/tmp \
    --mount "type=bind,src=$plume_case,dst=/case" \
    --workdir /case --entrypoint /bin/bash "$image" -s <<'FOAM'
source /usr/lib/openfoam/openfoam2312/etc/bashrc || exit 1
set -e
cd /case

run_step() {
  name="$1"
  shift
  printf 'Running %s...\n' "$name"
  if "$@" </dev/null >"log.$name" 2>&1; then
    printf '%s: finished\n' "$name"
  else
    tail -n 80 "log.$name"
    return 1
  fi
}

run_step blockMesh blockMesh
run_step checkMesh checkMesh
if ! grep -q 'Mesh OK' log.checkMesh; then
  tail -n 80 log.checkMesh
  exit 1
fi
run_step decompose decomposePar

echo "Solving on two processes. Progress is printed every 15 seconds."
timeout 2h mpirun --allow-run-as-root --bind-to none -np 2 \
  rhoCentralFoam -parallel </dev/null >log.solver 2>&1 &
solver_pid=$!
while kill -0 "$solver_pid" 2>/dev/null; do
  sleep 15
  awk '/^Time =|^ExecutionTime =/ {latest=$0} END {if (latest!="") print latest}' log.solver
done
if ! wait "$solver_pid"; then
  tail -n 100 log.solver
  exit 1
fi
if grep -Eiq 'FOAM FATAL|(^|[^[:alpha:]])(nan|inf)([^[:alpha:]]|$)' log.solver; then
  tail -n 100 log.solver
  exit 1
fi

run_step reconstruct reconstructPar
run_step export foamToVTK -latestTime -ascii
tail -n 15 log.solver
FOAM

  python3 "$bundle/inspect-nozzle.py" "$plume_case"
  printf 'Finished and exported: %s\n' "$case_name"
done

python3 - "$bundle" <<'PY'
from pathlib import Path
import shutil
import sys
bundle = Path(sys.argv[1])
result = bundle.parent / (bundle.name + '-results')
archive = shutil.make_archive(str(result), 'zip', bundle.parent, bundle.name)
print('HOT_NOZZLE_CASES_READY')
print('Upload this ZIP:', archive)
PY
