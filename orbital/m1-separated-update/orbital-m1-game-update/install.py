"""Install the separate-axis M1 exhaust on the original or previous M1 game."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,shutil,subprocess,sys,tempfile,os
HERE=Path(__file__).resolve().parent
DEFAULT=Path('/workspaces/Orbital/orbital')
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
def atomic_write(p,data):
 p.parent.mkdir(parents=True,exist_ok=True);temp=p.with_name(p.name+'.m1-tmp')
 try:temp.write_bytes(data);os.replace(temp,p)
 finally:temp.unlink(missing_ok=True)
def main():
 args=[a for a in sys.argv[1:] if a!='--check-only'];check='--check-only' in sys.argv
 if len(args)>1:raise SystemExit('Usage: python3 install.py [PROJECT] [--check-only]')
 project=(Path(args[0]) if args else Path.cwd() if (Path.cwd()/'terrain.html').is_file() else DEFAULT).resolve()
 manifest=json.loads((HERE/'manifest.json').read_text());payload=manifest['payload']
 if not (project/'package.json').is_file():raise SystemExit('Run this in the Orbital project folder. No files changed.')
 if all(digest(project/n)==h for n,h in payload.items()):print('This separate-nozzle revision is already installed.');return
 selected=next((version for version in manifest['supportedInputs'] if all(digest(project/n)==h for n,h in version.items())),None)
 if selected is None:raise SystemExit('Source differs from both the uploaded game and the previous M1 update. No files changed; send the changed source files so they can be preserved.')
 for name,want in payload.items():
  if digest(HERE/name)!=want:raise SystemExit('Update package is incomplete or modified: '+name+'. No files changed.')
  if name not in selected and (project/name).exists():raise SystemExit('A new module path already exists: '+name+'. No files changed.')
 node=shutil.which('node')
 if not node:raise SystemExit('Node is required for JavaScript checks. No files changed.')
 with tempfile.TemporaryDirectory(prefix='m1-check-') as folder:
  folder=Path(folder);(folder/'package.json').write_text('{"type":"module"}')
  for name in payload:
   p=folder/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(HERE/name,p);subprocess.run([node,'--check',str(p)],check=True)
 if check:print('Preflight passed. No files changed.');return
 backup=project/'m1-exhaust-backups'/datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f');backup.mkdir(parents=True)
 existed={name:(project/name).is_file() for name in payload}
 for name in payload:
  if existed[name]:p=backup/name;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(project/name,p)
 (backup/'restore-state.json').write_text(json.dumps({'project':str(project),'existed':existed,'installedHashes':payload},indent=2));shutil.copy2(HERE/'restore.py',backup/'restore.py')
 try:
  for name in payload:atomic_write(project/name,(HERE/name).read_bytes())
 except BaseException:
  for name in payload:
   if existed[name]:atomic_write(project/name,(backup/name).read_bytes())
   else:(project/name).unlink(missing_ok=True)
  raise
 print('Separate-nozzle exhaust installed. Refresh terrain.html.')
 print('No forced inward merge. Cluster gas interactions remain unvalidated.')
 print('Backup:',backup);print('Restore: python3 "'+str(backup/'restore.py')+'"')
if __name__=='__main__':main()
