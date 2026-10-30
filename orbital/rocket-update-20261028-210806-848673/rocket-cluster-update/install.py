"""Install the three-engine rocket visuals while preserving current exhaust helpers."""
from pathlib import Path
from datetime import datetime, timezone
import re
import shutil
import subprocess

PROJECT = Path('/workspaces/Orbital/orbital')
HERE = Path(__file__).resolve().parent
VISUAL = PROJECT / 'src/RocketVisual.js'
DESIGN = PROJECT / 'src/RocketDesign.js'

def prepare(source):
    marker = 'export class RocketVisual {'
    if source.count(marker) != 1:
        raise ValueError('Expected exactly one RocketVisual class.')
    # Keep the installed flame shader, engine model, profile cache and presentation
    # helpers; replace only the visual constructor/update class.
    current_head, current_class = source.split(marker)
    template = (HERE / 'src/RocketVisual.js').read_text()
    new_class = template.split(marker, 1)[1]
    required = ['visualExhaustState', 'updateExhaustProfile', 'EnginePresentation',
                'PLUME_VERTEX', 'PLUME_MATERIAL', 'EXHAUST_PROFILE_SIZE']
    if not all(name in current_head for name in required):
        raise ValueError('Current file lacks expected exhaust helpers; no files changed.')
    # Remove an earlier installation's import before adding the canonical one.
    current_head = re.sub(
        r'^import\s*\{\s*buildRocketDesign\s*,\s*ROCKET_ENGINES\s*\}\s*from\s*[\"\']\./RocketDesign\.js[\"\'];?\s*\n',
        '', current_head, flags=re.M
    )
    return 'import { buildRocketDesign, ROCKET_ENGINES } from "./RocketDesign.js";\n' + current_head + marker + new_class

def main():
    if not VISUAL.is_file() or not (PROJECT / 'package.json').is_file():
        raise SystemExit('Expected project at /workspaces/Orbital/orbital. No files changed.')
    try:
        updated=prepare(VISUAL.read_text())
    except ValueError as error:
        raise SystemExit(str(error))
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup=PROJECT / ('rocket-design-backup-' + stamp)
    backup.mkdir()
    shutil.copy2(VISUAL, backup / VISUAL.name)
    if DESIGN.exists():
        shutil.copy2(DESIGN, backup / DESIGN.name)
    else:
        (backup / 'RocketDesign-was-new.txt').write_text('RocketDesign.js was added by this update.\n')
    try:
        DESIGN.write_text((HERE / 'src/RocketDesign.js').read_text())
        VISUAL.write_text(updated)
        for path in [DESIGN,VISUAL]:
            subprocess.run(['node','--check',str(path)],check=True)
    except BaseException:
        shutil.copy2(backup / VISUAL.name,VISUAL)
        if (backup / DESIGN.name).exists():
            shutil.copy2(backup / DESIGN.name,DESIGN)
        else:
            DESIGN.unlink(missing_ok=True)
        raise
    print('Three-engine rocket installed. Refresh terrain.html.')
    print('Backup:',backup)
    print('Flight thrust and running CFD cases were not modified.')

if __name__=='__main__':
    main()
