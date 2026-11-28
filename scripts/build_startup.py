#!/usr/bin/env python3
"""Build the start screen and its standalone viewer routes from the physical cabinet files."""
import json
import re
import shutil
import subprocess
import sys
from base64 import b64encode
from gzip import compress
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'startup'))
from inline_assets import encoded,inline_script

def compact_json(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

def build_reader_assets():
    src=ROOT/'node_modules/pdfjs-dist'
    dest=ROOT/'vendor/pdf'
    dest.mkdir(parents=True,exist_ok=True)
    for filename in ('pdf.min.mjs','pdf.worker.min.mjs'):
        shutil.copyfile(src/'build'/filename,dest/filename)
    shutil.copyfile(src/'LICENSE',dest/'LICENSE')
    shutil.copytree(src/'standard_fonts',dest/'standard_fonts',dirs_exist_ok=True)


def build_startup(viewer):
    rows=json.loads((ROOT/'shared/cabinet-registry.json').read_text(encoding='utf8'))
    source=(ROOT/'startup/index.template.html').read_text(encoding='utf8')
    js=(ROOT/'startup/wizard.js').read_text(encoding='utf8')
    ui=(ROOT/'startup/file-viewer.js').read_text(encoding='utf8')
    payload=b64encode(compress(compact_json(viewer).encode('utf8'),mtime=0)).decode('ascii')
    shared='\n'.join(re.sub(r'^import .+\n','',(ROOT/path).read_text(encoding='utf8'),flags=re.M).replace('export ','') for path in ('shared/theme.mjs','shared/language.mjs','shared/class-picker.mjs','shared/subjects.mjs','shared/teaching-editor.mjs','shared/schools.mjs','shared/cloud-config.mjs','shared/tajikistan-locations.mjs','shared/position-catalog.mjs'))
    gzip_js=subprocess.check_output(['node',str(ROOT/'scripts/bundle-inline.cjs'),str(ROOT/'startup/gzip-fallback.mjs')],encoding='utf8')
    profiles=(ROOT/'startup/profiles.js').read_text(encoding='utf8')
    splash=(ROOT/'startup/brand-splash.js').read_text(encoding='utf8')
    splash_css=(ROOT/'startup/brand-splash.css').read_text(encoding='utf8')
    pdf_root=ROOT/'vendor/pdf'
    pdf_assets={name:(pdf_root/name).read_text(encoding='utf8') for name in ('pdf.min.mjs','pdf.worker.min.mjs')}
    pdf_assets['fonts']={file.name:b64encode(file.read_bytes()).decode('ascii') for file in sorted((pdf_root/'standard_fonts').iterdir()) if file.suffix in {'.pfb','.ttf'}}
    pdf_payload=b64encode(compress(compact_json(pdf_assets).encode('utf8'),mtime=0)).decode('ascii')
    output=source.replace('@@SPLASH_CSS@@',splash_css).replace('@@ROLE_DATA@@',encoded(compact_json(rows))).replace('@@VIEWER_DATA@@',payload).replace('@@PDF_DATA@@',pdf_payload).replace('@@STARTUP_JS@@',inline_script(gzip_js+'\n'+shared+'\n'+ui+'\n'+profiles+'\n'+splash+'\n'+js))
    (ROOT/'index.html').write_text(output, encoding='utf8')

if __name__=='__main__':
    build_reader_assets()
    from build_clickable_files import assemble
    build_startup(assemble())
