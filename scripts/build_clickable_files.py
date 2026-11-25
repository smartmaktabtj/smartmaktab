#!/usr/bin/env python3
"""Inline cabinet assets for sandbox viewing, and derive embedded routes for the start file."""
from pathlib import Path
import json,re,subprocess,sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'startup'))
from inline_assets import inline_script
REGISTRY=json.loads((ROOT/'shared/cabinet-registry.json').read_text(encoding='utf8'))
CSS=(ROOT/'shared/cabinets.css').read_text(encoding='utf8')
ASSETS=re.compile(r'<!-- SMARTMAKTAB INLINE START -->.*?<!-- SMARTMAKTAB INLINE END -->',re.S)
OLD=re.compile(r'<link rel="stylesheet" href="[^"]*shared/cabinets\.css"><script type="module" src="[^"]+"></script>')

def assemble():
    routes={}
    modes={'school-director':'cabinets/school/director.mjs','school-teacher':'cabinets/school/teacher.mjs','school-library-head':'cabinets/school/library-head.mjs'}
    paths={row['path']:modes.get(row['id'],'shared/cabinets.mjs') for row in REGISTRY}
    bundles={}
    for entry in set(paths.values()):
        js=subprocess.check_output(['node',str(ROOT/'scripts/bundle-inline.cjs'),str(ROOT/entry)],encoding='utf8')
        assert '</script' not in js.lower()
        bundles[entry]=js
    for path,entry in paths.items():
        f=ROOT/path
        source=ASSETS.sub('',OLD.sub('',f.read_text(encoding='utf8')))
        source=source.replace('content="width=device-width,initial-scale=1"','content="width=device-width,initial-scale=1,interactive-widget=resizes-content"')
        if '<meta name="author"' not in source:
            source=source.replace('</head>', '<meta name="author" content="Парвиз Шарипов"></head>',1)
        assert '</body>' in source and '</head>' in source,path
        # Leave the HTML and stand-alone embedded route in sync; common CSS/JS are stored once in the start screen.
        routes[path]={'html':source,'entry':entry}
        runtime=f'<!-- SMARTMAKTAB INLINE START --><meta name="smartmaktab-path" content="{path}"><style>{CSS}</style>{inline_script(bundles[entry])}<!-- SMARTMAKTAB INLINE END -->'
        # CSS is attached at the bottom of the document with the runtime, after the entire DOM can be queried.
        f.write_text(source.replace('</body>',runtime+'</body>',1),encoding='utf8')
    return {'routes':routes,'bundles':bundles,'css':CSS}

if __name__=='__main__':
    from build_startup import build_startup
    build_startup(assemble())
