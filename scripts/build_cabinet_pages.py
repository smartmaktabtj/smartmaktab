"""Build the public demo directory; create missing cabinet files, never overwrite a cabinet."""
import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'shared/cabinet-registry.json'
GROUPS = {
    'school': ('Школа','Мактаб','Школьные должности и назначения'),
    'advisers': ('Мушовирон','Мушовирон','Сопровождение школьных направлений'),
    'subjects': ('Предметы','Фанҳо','Мушовирон по предметам'),
    'office': ('Маориф','Маориф','Управление и бухгалтерия маориф'),
    'raesat': ('Раёсат','Раёсат','Кабинеты раёсата'),
}
NOTICE = ('Используйте только вымышленные данные. Выбор школы не выдаёт прав доступа.',
          'Танҳо маълумоти сохтаро истифода баред. Интихоби мактаб ҳуқуқи дастрасӣ намедиҳад.')


def txt(ru, tg):
    return f'<span data-tg="{escape(tg, quote=True)}">{escape(ru)}</span>'


def layout(prefix, title, current, body, fallback=False):
    ownership = txt("© Парвиз Шарипов. Все права защищены.", "© Парвиз Шарипов. Ҳамаи ҳуқуқҳо ҳифз шудаанд.")
    if current:
        header_left = f'<div class="teacher-context"><a class="brand top-brand" href="{prefix}index.html"><span class="logo" aria-hidden="true">S</span><span class="brand-name">SmartMaktab</span></a><h1 class="crumb">{escape(title)}</h1><span class="tag" id="workspaceSchool">—</span></div>'
    else:
        header_left = f'<div class="teacher-context"><a class="brand top-brand" href="{prefix}index.html"><span class="logo" aria-hidden="true">S</span><span class="brand-name">SmartMaktab</span></a><a class="crumb" href="{prefix}onboarding/index.html">{txt("Кабинеты", "Утоқҳои корӣ")}</a></div>'
    css = ''
    if fallback:
        css = '<style>body{margin:0;font:16px/1.5 system-ui;color:#18332a;background:#f2f7f4}.frame{max-width:960px;margin:auto;padding:20px}.top{background:white;padding:9px 20px}.section{background:white;padding:18px;border-radius:13px;margin-top:14px}.list a{color:#174f39}.desc{margin-inline:8px}.tag{font-size:.8em}.notice{padding:10px;background:#e5f6e9}[hidden]{display:none!important}</style>'
    return f'''<!doctype html>
<html lang="tg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,interactive-widget=resizes-content"><title>{escape(title)} · SmartMaktab</title>
{css}<link rel="stylesheet" href="{prefix}shared/cabinets.css"><script type="module" src="{prefix}shared/cabinets.mjs"></script></head>
<body><div class="layout">
<div class="page"><header class="top">{header_left}<div class="actions">
<select id="cabinetLang" class="lang-select" aria-label="Язык / Забон"><option value="tg">Тоҷикӣ</option><option value="ru">Русский</option></select></div></header>
<main class="frame" id="cabinetHome">{body}<footer class="ownership-notice no-print">{ownership}</footer></main></div></div></body></html>
'''


def stub(entry):
    path = Path(entry['path'])
    prefix = '../' * (len(path.parts)-1)
    group = entry['group']
    specialist = entry['title']
    body = f'''<article data-cabinet-id="{escape(entry['id'])}"></article>'''
    return layout(prefix,specialist,group,body)


def directory(rows):
    sections=[]
    for group,(name,tg,heading) in GROUPS.items():
        links=[]
        entries=[r for r in rows if r['group']==group]
        for r in entries:
            status={'example':('Пример','Намуна',''), 'proposed':('К согласованию','Барои мувофиқа','warn'), 'shell':('Каркас','Сохтор','quiet')}[r['mode']]
            links.append(f'''<li data-cabinet-entry><a data-cabinet-link data-group="{group}" href="../{escape(r['path'])}"><span class="num">{r['number']:02}</span><span><strong class="name">{escape(r['title'])}</strong><span class="desc">{escape(r['description'])}</span></span><span class="tag {status[2]}">{txt(*status[:2])}</span></a></li>''')
        sections.append(f'''<section class="section" id="{group}" data-cabinet-section="{group}"><div class="pill-row"><h2>{escape(heading)}</h2><span class="tag quiet">{len(entries)}</span></div><ul class="list">{''.join(links)}</ul></section>''')
    opts=''.join(f'<option value="{key}" data-tg="{escape(tg)}">{escape(ru)}</option>' for key,(ru,tg,_) in GROUPS.items())
    sample_count = sum(r['mode'] == 'example' for r in rows)
    body=f'''<div class="hero"><span class="eyebrow">SmartMaktab</span><h1>{txt('Школы и рабочие кабинеты','Мактабҳо ва утоқҳои корӣ')}</h1><p>{txt('Выберите должность. Школа выбирается в кабинете после заполнения анкеты.', 'Вазифаро интихоб кунед. Мактаб баъд аз пур кардани варақа дар утоқ интихоб мешавад.')}</p></div>
<div class="notice">{txt(*NOTICE)}</div><div class="summary no-print">
<div class="metric"><b>{len(rows)}</b><span>{txt('отдельных страниц','саҳифаҳои алоҳида')}</span></div><div class="metric"><b>20</b><span>{txt('школьных пунктов','бахшҳои мактаб')}</span></div><div class="metric"><b>{sample_count}</b><span>{txt('страниц с примерами','намунаҳои омода')}</span></div></div>
<section class="section" aria-labelledby="choose-title"><h2 id="choose-title">{txt('Выбор рабочего кабинета','Интихоби утоқи корӣ')}</h2><div class="steps">
<label class="field" for="cabinetSection">{txt('Раздел','Бахш')}<select id="cabinetSection"><option value="all" data-tg="Ҳамаи утоқҳо">Все кабинеты</option>{opts}</select></label>
</div>
<label class="field search" for="cabinetQuery">{txt('Поиск должности или предмета','Ҷустуҷӯи вазифа ё фан')}<input id="cabinetQuery" type="search" maxlength="100"></label><p class="small" id="directoryStatus" role="status"></p></section>
{''.join(sections)}'''
    return layout('../','Каталог кабинетов','',body,fallback=True)


def build():
    rows=json.loads(REGISTRY.read_text(encoding='utf8'))
    if len({r['id'] for r in rows}) != len(rows) or len({r['path'] for r in rows}) != len(rows):
        raise ValueError('Repeated cabinet ID or path')
    for r in rows:
        path=ROOT/r['path']; path.parent.mkdir(parents=True,exist_ok=True)
        if not path.exists(): path.write_text(stub(r),encoding='utf8')
    entry=ROOT/'onboarding/index.html'; entry.parent.mkdir(exist_ok=True)
    entry.write_text(directory(rows),encoding='utf8')
    print(f'{len(rows)} cabinet routes')


if __name__=='__main__':
    build()
