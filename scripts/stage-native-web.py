"""Stage minimal native asset metadata for Android (live-URL shell)."""
import os, re, shutil, sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
assets_dir = (root / 'native/android/app/src/main/assets').resolve()
legacy_web = (assets_dir / 'web').resolve()
allowed = {assets_dir, legacy_web}
if len(sys.argv) != 2 or Path(sys.argv[1]).resolve() not in allowed:
    raise SystemExit('Pass native/android/app/src/main/assets as destination.')

shutil.rmtree(legacy_web, ignore_errors=True)
assets_dir.mkdir(parents=True, exist_ok=True)
repo = os.environ.get('GITHUB_REPOSITORY', 'smartmaktabtj/smartmaktab')
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}', repo) or repo.endswith(('/.', '/..')):
    raise SystemExit('Invalid GitHub repository for Windows downloads.')
(assets_dir / 'windows-release-repository.txt').write_text(repo + '\n', encoding='ascii')
print('Staged Android live-wrapper asset metadata.')
