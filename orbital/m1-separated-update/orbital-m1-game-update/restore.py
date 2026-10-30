"""Restore this update only if its installed files have not subsequently changed."""
from pathlib import Path
import hashlib,json,os
HERE=Path(__file__).resolve().parent
state=json.loads((HERE/'restore-state.json').read_text());project=Path(state['project'])
for name,want in state['installedHashes'].items():
 p=project/name
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=want:raise SystemExit(name+' changed since installation. Nothing restored; preserve those changes before restoring.')
for name,existed in state['existed'].items():
 p=project/name
 if existed:
  temp=p.with_name(p.name+'.m1-restore');temp.write_bytes((HERE/name).read_bytes());os.replace(temp,p)
 else:p.unlink()
print('Previous exhaust restored. Refresh terrain.html. Backup retained:',HERE)
