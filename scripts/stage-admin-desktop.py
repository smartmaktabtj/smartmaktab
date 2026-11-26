#!/usr/bin/env python3
"""Stage public shared modules & assets into admin-desktop/bundled/ for Electron packaging."""
import json
import re
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dst = root / 'admin-desktop' / 'bundled'
shutil.rmtree(dst, ignore_errors=True)
dst.mkdir(parents=True, exist_ok=True)

shutil.copyfile(root / 'native' / 'windows' / 'content.cjs', dst / 'content.cjs')
shutil.copyfile(root / 'shared' / 'cabinet-registry.json', dst / 'cabinet-registry.json')
shutil.copyfile(root / 'pwa-512.png', dst / 'icon.png')

cloud_src = (root / 'shared' / 'cloud-config.mjs').read_text(encoding='utf8')
url_m = re.search(r"url:\s*'([^']+)'", cloud_src)
key_m = re.search(r"publishableKey:\s*'([^']+)'", cloud_src)
ref_m = re.search(r"projectRef:\s*'([^']+)'", cloud_src)
if not (url_m and key_m):
    raise SystemExit('Could not extract Supabase public config from shared/cloud-config.mjs')

(dst / 'cloud-config.json').write_text(
    json.dumps(
        {
            'projectRef': ref_m.group(1) if ref_m else 'waorfkkavzzpbrsvjjln',
            'url': url_m.group(1),
            'publishableKey': key_m.group(1),
        },
        indent=2,
    ),
    encoding='utf8',
)
print('Staged admin-desktop bundled assets cleanly.')
