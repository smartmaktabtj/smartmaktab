"""Create missing cabinet files, never overwrite an existing cabinet."""
import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'shared/cabinet-registry.json'


def layout(prefix, title, current, body):
    ownership = '<span data-tg="© Парвиз Шарипов. Ҳамаи ҳуқуқҳо ҳифз шудаанд.">© Парвиз Шарипов. Ҳамаи ҳуқуқҳо ҳифз шудаанд.</span>'
    header_left = (
        f'<div class="teacher-context">'
        f'<a class="brand top-brand" href="{prefix}index.html">'
        f'<span class="logo" aria-hidden="true">S</span><span class="brand-name">SmartMaktab</span></a>'
        f'<h1 class="crumb">{escape(title)}</h1>'
        f'<span class="tag" id="workspaceSchool">—</span></div>'
    )
    return f'''<!doctype html>
<html lang="tg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,interactive-widget=resizes-content"><title>{escape(title)} · SmartMaktab</title>
<link rel="stylesheet" href="{prefix}shared/cabinets.css"><script type="module" src="{prefix}shared/cabinets.mjs"></script></head>
<body><div class="layout">
<div class="page"><header class="top">{header_left}<div class="actions"></div></header>
<main class="frame" id="cabinetHome">{body}<footer class="ownership-notice no-print">{ownership}</footer></main></div></div></body></html>
'''


def stub(entry):
    path = Path(entry['path'])
    prefix = '../' * (len(path.parts) - 1)
    group = entry['group']
    specialist = entry['title']
    body = f'''<article data-cabinet-id="{escape(entry['id'])}"></article>'''
    return layout(prefix, specialist, group, body)


def build():
    rows = json.loads(REGISTRY.read_text(encoding='utf8'))
    if len({r['id'] for r in rows}) != len(rows) or len({r['path'] for r in rows}) != len(rows):
        raise ValueError('Repeated cabinet ID or path')
    for r in rows:
        path = ROOT / r['path']
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_text(stub(r), encoding='utf8')
    print(f'{len(rows)} cabinet routes')


if __name__ == '__main__':
    build()
