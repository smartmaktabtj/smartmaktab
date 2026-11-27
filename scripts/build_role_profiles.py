#!/usr/bin/env python3
"""Update only managed profile/picker and header controls in physical cabinet pages."""
from pathlib import Path
from html import escape
import json,re
ROOT=Path(__file__).resolve().parents[1]
rows=json.loads((ROOT/'shared/cabinet-registry.json').read_text())
fields={}
for line in (ROOT/'startup/role-profile-fields.txt').read_text().splitlines():
    if line and not line.startswith('#'):
        role,ru,tg=line.split('|'); fields[role]=list(zip(ru.split(';'),tg.split(';'),strict=True))
assert len(fields)==23 and set(fields)=={r['id'] for r in rows}-{'school-director'}
documents={}
for line in (ROOT/'startup/role-documents.txt').read_text().splitlines():
    if line and not line.startswith('#'):
        ident,ru,tg,materials_ru,materials_tg=line.split('|')
        documents[ident]=(list(zip(ru.split(';'),tg.split(';'),strict=True)),materials_ru,materials_tg)
assert set(documents)=={r['id'] for r in rows}
class_roles={'school-class-teacher','school-primary-deputy','school-military-preparation-deputy','school-upper-class-method-group','school-lower-class-method-group'}
def txt(ru,tg):return f'<span data-tg="{escape(tg, quote=True)}">{escape(tg)}</span>'
def entry(row):
    id=row['id']; director=id=='school-director'
    roles=''
    if not director:
        names=[] if id=='school-girls-council-chair' else [('first','Ном','Ном',60,True),('last','Насаб','Насаб',60,True)]
        extras=[(f'work-{i}',ru,tg,120,i==1) for i,(ru,tg) in enumerate(fields[id],1)]
        work_context=[('period','Давраи кор (масалан: 2026/27)','Давраи кор (масалан: 2026/27)',24,False)] if id not in ['school-girls-council-chair','school-sozmon'] else []
        def field(key,ru,tg,maxlen,required):
            if id in class_roles and key=='work-1':
                variant='single' if id=='school-class-teacher' else 'multi'
                return f'<div class="class-field"><strong>{txt(ru,tg)}</strong><div data-role-class="{variant}" data-field="{key}" data-required="true"></div></div>'
            return f'<label class="field">{txt(ru,tg)}<input data-intake-field="{key}" maxlength="{maxlen}"'+(' required' if required else '')+'></label>'
        form=''.join(field(*args) for args in names+extras+work_context)
        roles=f'''<section class="section no-print" id="roleIntake"><h2>{txt('Варақаи вазифа','Варақаи вазифа')} · {escape(row['title'])}</h2><p class="small">{txt('Намуна барои ҳамин вазифа. Маълумоти воқеии шахсиро ворид накунед.','Намуна барои ҳамин вазифа. Маълумоти воқеии шахсиро ворид накунед.')}</p>
<form id="roleIntakeForm" inert autocomplete="off"><div class="steps">{form}</div><div class="control"><button type="button" id="saveRoleIntake" class="button">{txt('Сабти варақа','Сабти варақа')}</button></div></form><p class="small" role="status" id="roleIntakeStatus"></p></section>'''
    scope=('Рӯйхат намоишӣ аст. Интихоби муассиса минтақаи дастрасиро иваз намекунад.','Рӯйхат намоишӣ аст. Интихоби муассиса минтақаи дастрасиро иваз намекунад.')
    picker=f'''<section class="section no-print" id="institutionPicker" hidden><h2>{txt('Интихоби мактаб','Интихоби мактаб')}</h2><p class="small">{txt(*scope)}</p><div class="steps">
<label class="field">{txt('Ҷустуҷӯи мактаб аз рӯи рақам ё ном','Ҷустуҷӯи мактаб аз рӯи рақам ё ном')}<input id="institutionSearch" type="search" maxlength="80" autocomplete="off" placeholder="МТМУ № 88"></label>
<label class="field">{txt('Мактаб','Мактаб')}<select id="institutionChoice"></select></label></div><div class="control"><button class="button" type="button" id="confirmInstitution">{txt('Интихоби мактаб','Интихоби мактаб')}</button></div><p class="small" role="status" id="institutionStatus"></p></section>'''
    return '<!-- ROLE-PROFILE START -->\n'+roles+'\n'+picker+'\n<!-- ROLE-PROFILE END -->'
def header_html(row):
    prefix='../'*(len(Path(row['path']).parts)-1)
    return (
        f'<header class="top"><div class="teacher-context">'
        f'<a class="brand top-brand" href="{prefix}index.html"><span class="logo" aria-hidden="true">S</span><span class="brand-name">SmartMaktab</span></a>'
        f'<h1 class="crumb">{escape(row["title"])}</h1>'
        f'<span class="tag" id="workspaceSchool">—</span></div><div class="actions"></div></header>'
    )

for row in rows:
    p=ROOT/row['path']; raw=p.read_text(); block=entry(row)
    if '<!-- SMARTMAKTAB INLINE START -->' in raw:
        idx=raw.index('<!-- SMARTMAKTAB INLINE START -->')
        s,tail=raw[:idx],raw[idx:]
    else:
        s,tail=raw,''
    s=re.sub(r'<aside class="rail">.*?</aside>\s*', '', s, count=1, flags=re.S)
    s=re.sub(r'<header class="top">.*?</header>', lambda _: header_html(row), s, count=1, flags=re.S)
    s=re.sub(r'<div class="hero">.*?</div>\s*<(?:p|div) class="notice[^"]*"[^>]*>.*?</(?:p|div)>\s*', '', s, count=1, flags=re.S)
    s=re.sub(r'\.rail[^}]*\}\s*', '', s)
    s=re.sub(r'\.hero\{[^}]*\}\s*', '', s)
    if row['id']=='school-teacher':
        s=re.sub(r'<section class="section" id="teacherDocumentPanel"[^>]*>.*?</section>\s*', '', s, count=1, flags=re.S)
    if '<!-- ROLE-PROFILE START -->' in s:
        s=re.sub(r'<!-- ROLE-PROFILE START -->.*?<!-- ROLE-PROFILE END -->',lambda _:block,s,count=1,flags=re.S)
    else:
        if row['id']=='school-director': point=s.index('<section class="section no-print" id="directorCourses"')
        else:
            m=re.search(r'<article data-cabinet-id="[^"]+">\s*',s)
            assert m,row['path'];point=m.end()
        s=s[:point]+'\n'+block+'\n'+s[point:]
    s=re.sub(r'\s*<!-- ROLE-WORKSPACE START -->.*?<!-- ROLE-WORKSPACE END -->', '', s, count=1, flags=re.S)
    p.write_text(s+tail)
