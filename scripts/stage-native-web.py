"""Copy only the public UI used by the native shells; no Dev configs, templates source or provider keys."""
import json, shutil, sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
allowed={root/'native/windows/web',root/'native/android/app/src/main/assets/web'}
if len(sys.argv)!=2 or (dst:=Path(sys.argv[1]).resolve()) not in allowed:
    raise SystemExit('Pass the Windows or Android web staging directory.')
files=['index.html','icon.svg','pwa-192.png','pwa-512.png','manifest.webmanifest','sw.js']
roles=json.loads((root/'shared/cabinet-registry.json').read_text(encoding='utf8'))
files.extend(row['path'] for row in roles)
files.extend(str(p.relative_to(root)) for p in (root/'vendor/pdf').rglob('*') if p.is_file())
shutil.rmtree(dst,ignore_errors=True)
for file in files:
    target=dst/file
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(root/file,target)
print(f'Staged {len(files)} public assets ({len(roles)} cabinets).')
