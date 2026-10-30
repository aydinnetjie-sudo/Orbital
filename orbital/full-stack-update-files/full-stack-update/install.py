"""Install the complete two-stage visual; preserve current flight/exhaust helpers."""
from pathlib import Path
from datetime import datetime, timezone
import re
import shutil
import subprocess

PROJECT=Path('/workspaces/Orbital/orbital')
HERE=Path(__file__).resolve().parent
NAMES=['RocketVisual.js','RocketDesign.js','RocketClusterExhaust.js','CesiumRocket.js','RocketControls.js','SurfaceWalker.js','cesium-test.js']

def prepare_visual(source):
    marker='export class RocketVisual {'
    if source.count(marker)!=1:
        raise ValueError('Expected one RocketVisual class; no files changed.')
    head=source.split(marker,1)[0]
    expected=[
        'float z=max(0.0,axial);\n        vec2 xy=p.xy*metric.xy;float r=length(xy);',
        'float bore=re+.49*min(axial,0.0);',
        'smoothstep(-.44,-.30,axial)',
        'updateExhaustProfile', 'EnginePresentation'
    ]
    if not all(token in head for token in expected):
        raise ValueError('Exhaust helpers differ from the supported version. No files changed; send RocketVisual.js.')
    head=re.sub(r'^import[^\n]*from\s*[\"\']\./(?:RocketDesign|RocketClusterExhaust)\.js[\"\'];?[^\n]*\n','',head,flags=re.M)
    imports='import { buildRocketDesign, ROCKET_ENGINES, ENGINE_EXIT_Z, createShipSkin, createHeatShieldSkin } from "./RocketDesign.js";\nimport { clusterPlumeSource } from "./RocketClusterExhaust.js";\n'
    body=(HERE/'src/RocketVisual.js').read_text().split(marker,1)[1]
    head=head.replace("1.0 - .12 * panel - .07 * seam", "1.0 - .025 * panel - .008 * seam")
    head=head.replace("vec3(0.0, 0.0, -5.25)","vec3(0.0, 0.0, -15.95)").replace("point.z + 4.43","point.z + 15.13")
    return imports+head+marker+body

def prepare_flight(source):
    template=(HERE/'src/CesiumRocket.js').read_text()
    pattern=r'const FEET = \[.*?\];\s*const BODY = \[.*?\];'
    match=re.search(pattern,template,re.S)
    if len(re.findall(pattern,source,re.S))!=1 or match is None:
        raise ValueError('Landing contact definitions differ. No files changed; send CesiumRocket.js.')
    source=re.sub(pattern,lambda _:match.group(),source,count=1,flags=re.S)
    if "groundHeight + 5.5" not in source and "groundHeight + 15.5" not in source:
        raise ValueError("Ground spawn definition differs; no files changed.")
    return source.replace("groundHeight + 5.5","groundHeight + 15.5")

def prepare_support(name,source):
    if name=='RocketControls.js':
        if 'rocketGeo.height - 5.5' not in source and 'rocketGeo.height - 15.5' not in source:
            raise ValueError('Chase-camera ground definition differs; no files changed.')
        return source.replace('rocketGeo.height - 5.5','rocketGeo.height - 15.5')
    if name=='SurfaceWalker.js':
        return source.replace('rocket.offset(0, 5, -5.5)','rocket.offset(0, 5, -15.5)').replace('craft.height - 5.5','craft.height - 15.5')
    if name=='cesium-test.js':
        source=source.replace('range: 45,','range: 75,').replace('view.range = 45;','view.range = 75;')
        pattern=r'flight\.offset\(0, 0, (?:8|10|17)\)'
        if len(re.findall(pattern,source))!=1:
            raise ValueError('Cockpit-camera position differs; no files changed.')
        return re.sub(pattern,'flight.offset(0, 0, 17)',source)
    raise ValueError('Unexpected support module')

def main():
    src=PROJECT/'src'
    if not (PROJECT/'package.json').is_file() or not (src/'RocketVisual.js').is_file() or not (src/'CesiumRocket.js').is_file():
        raise SystemExit('Expected /workspaces/Orbital/orbital project is missing. No files changed.')
    try:
        content={
            'RocketVisual.js':prepare_visual((src/'RocketVisual.js').read_text()),
            'CesiumRocket.js':prepare_flight((src/'CesiumRocket.js').read_text()),
            'RocketDesign.js':(HERE/'src/RocketDesign.js').read_text(),
            'RocketClusterExhaust.js':(HERE/'src/RocketClusterExhaust.js').read_text(),
            **{name:prepare_support(name,(src/name).read_text()) for name in ['RocketControls.js','SurfaceWalker.js','cesium-test.js']}
        }
    except ValueError as e:
        raise SystemExit(str(e))
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')
    backup=PROJECT/('full-stack-backup-'+stamp)
    backup.mkdir()
    existed={name:(src/name).exists() for name in NAMES}
    for name in NAMES:
        if existed[name]:shutil.copy2(src/name,backup/name)
    (backup/'new-files.txt').write_text('\n'.join(name for name in NAMES if not existed[name]))
    try:
        for name,text in content.items():(src/name).write_text(text)
        for name in NAMES:subprocess.run(['node','--check',str(src/name)],check=True)
    except BaseException:
        for name in NAMES:
            if existed[name]:shutil.copy2(backup/name,src/name)
            else:(src/name).unlink(missing_ok=True)
        raise
    print('Complete two-stage stack installed. Refresh terrain.html.')
    print('Backup:',backup)
    print('Camera, ground contacts and walking height updated. Running CFD cases are unchanged.')

if __name__=='__main__':main()
