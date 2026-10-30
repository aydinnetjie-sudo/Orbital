"""Install the M1 exhaust port into the exact uploaded Orbital game revision."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,shutil,subprocess,sys,tempfile,os
HERE=Path(__file__).resolve().parent
DEFAULT=Path('/workspaces/Orbital/orbital')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
def atomic_write(p,data):
 p.parent.mkdir(parents=True,exist_ok=True)
 temporary=p.with_name(p.name+'.m1-tmp')
 try:
  temporary.write_bytes(data);os.replace(temporary,p)
 finally:temporary.unlink(missing_ok=True)
def main():
 args=[a for a in sys.argv[1:] if a!='--check-only'];check='--check-only' in sys.argv
 if len(args)>1:raise SystemExit('Usage: python3 install.py [PROJECT] [--check-only]')
 project=(Path(args[0]) if args else Path.cwd() if (Path.cwd()/'terrain.html').is_file() else DEFAULT).resolve()
 manifest=json.loads((HERE/'manifest.json').read_text());expected=manifest['input'];payload=manifest['payload']
 if not (project/'package.json').is_file():raise SystemExit('Orbital package.json is missing. Run this from the orbital folder. No files changed.')
 if all(digest(project/n)==h for n,h in payload.items()):
  print('This M1 exhaust revision is already installed.');return
 for name,want in expected.items():
  if digest(project/name)!=want:raise SystemExit(name+' differs from the uploaded version. No files changed; send the updated file so the installer can preserve it.')
 for name,h in payload.items():
  if digest(HERE/name)!=h:raise SystemExit('Update package is incomplete or changed: '+name+'. No files changed.')
  if name not in expected and (project/name).exists():raise SystemExit('A new module path already exists: '+name+'. No files changed.')
 node=shutil.which('node')
 if not node:raise SystemExit('Node is required to check the JavaScript before installation. No files changed.')
 # Check every payload file as ES modules before touching the game.
 with tempfile.TemporaryDirectory(prefix='m1-exhaust-check-') as temp:
  temp=Path(temp);(temp/'package.json').write_text('{"type":"module"}')
  for name in payload:
   path=temp/name;path.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(HERE/name,path)
   subprocess.run([node,'--check',str(path)],check=True)
 if check:print('Preflight passed. Files to update: '+str(len(payload))+'. No files changed.');return
 stamp=datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f');backup=project/'m1-exhaust-backups'/stamp;backup.mkdir(parents=True)
 existed={name:(project/name).is_file() for name in payload}
 for name in payload:
  if existed[name]:
   dest=backup/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(project/name,dest)
 state={'project':str(project),'existed':existed,'installedHashes':payload}
 (backup/'restore-state.json').write_text(json.dumps(state,indent=2));shutil.copy2(HERE/'restore.py',backup/'restore.py')
 try:
  for name in payload:atomic_write(project/name,(HERE/name).read_bytes())
 except BaseException:
  for name in payload:
   if existed[name]:atomic_write(project/name,(backup/name).read_bytes())
   else:(project/name).unlink(missing_ok=True)
  raise
 print('M1 exhaust installed. Refresh terrain.html.')
 print('33 nozzle sources; throttle, altitude pressure and shutdown connected.')
 print('Air refraction: equivalent-jet approximation. Single-engine CFD is not a cluster prediction.')
 print('Backup:',backup)
 print('Restore: python3 "'+str(backup/'restore.py')+'"')
if __name__=='__main__':main()
