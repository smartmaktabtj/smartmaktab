#!/usr/bin/env python3
"""Update only managed profile/picker and sidebar buttons in physical cabinet pages."""
from pathlib import Path
from html import escape
import json,re
ROOT=Path(__file__).resolve().parents[1]
rows=json.loads((ROOT/'shared/cabinet-registry.json').read_text())
fields={}
for line in (ROOT/'startup/role-profile-fields.txt').read_text().splitlines():
    if line and not line.startswith('#'):
        role,ru,tg=line.split('|'); fields[role]=list(zip(ru.split(';'),tg.split(';'),strict=True))
assert len(fields)==53 and set(fields)=={r['id'] for r in rows}-{'school-director'}
documents={}
for line in (ROOT/'startup/role-documents.txt').read_text().splitlines():
    if line and not line.startswith('#'):
        ident,ru,tg,materials_ru,materials_tg=line.split('|')
        documents[ident]=(list(zip(ru.split(';'),tg.split(';'),strict=True)),materials_ru,materials_tg)
assert set(documents)=={r['id'] for r in rows}
class_roles={'school-class-teacher','school-primary-deputy','school-military-preparation-deputy','school-upper-class-method-group','school-lower-class-method-group'}
def txt(ru,tg):return f'<span data-tg="{escape(tg, quote=True)}">{escape(ru)}</span>'
def entry(row):
    id=row['id']; director=id=='school-director'
    roles=''
    if not director:
        names=[] if id=='school-girls-council-chair' else [('first','Имя','Ном',60,True),('last','Фамилия','Насаб',60,True)]
        extras=[(f'work-{i}',ru,tg,120,i==1) for i,(ru,tg) in enumerate(fields[id],1)]
        work_context=[('period','Период работы (например: 2026/27)','Давраи кор (масалан: 2026/27)',24,False)] if id not in ['school-girls-council-chair','school-sozmon','advisers-sozmon'] else []
        def field(key,ru,tg,maxlen,required):
            if id in class_roles and key=='work-1':
                variant='single' if id=='school-class-teacher' else 'multi'
                return f'<div class="class-field"><strong>{txt(ru,tg)}</strong><div data-role-class="{variant}" data-field="{key}" data-required="true"></div></div>'
            return f'<label class="field">{txt(ru,tg)}<input data-intake-field="{key}" maxlength="{maxlen}"'+(' required' if required else '')+'></label>'
        form=''.join(field(*args) for args in names+extras+work_context)
        roles=f'''<section class="section no-print" id="roleIntake"><h2>{txt('Анкета должности','Варақаи вазифа')} · {escape(row['title'])}</h2><p class="small">{txt('Пример для этой должности. Не вводите реальные личные данные.','Намуна барои ҳамин вазифа. Маълумоти воқеии шахсиро ворид накунед.')}</p>
<form id="roleIntakeForm" inert autocomplete="off"><div class="steps">{form}</div><div class="control"><button type="button" id="saveRoleIntake" class="button">{txt('Сохранить анкету','Сабти варақа')}</button></div></form><p class="small" role="status" id="roleIntakeStatus"></p></section>'''
    scope=('Выбор учреждения не меняет права доступа.','Рӯйхат намоишӣ аст. Интихоби муассиса минтақаи дастрасиро иваз намекунад.')
    picker=f'''<section class="section no-print" id="institutionPicker" hidden><h2>{txt('Выбор школы','Интихоби мактаб')}</h2><p class="small">{txt(*scope)}</p><div class="steps">
<label class="field">{txt('Поиск школы по номеру или названию','Ҷустуҷӯи мактаб аз рӯи рақам ё ном')}<input id="institutionSearch" type="search" maxlength="80" autocomplete="off" placeholder="МТМУ № 88"></label>
<label class="field">{txt('Школа','Мактаб')}<select id="institutionChoice"></select></label></div><div class="control"><button class="button" type="button" id="confirmInstitution">{txt('Выбрать школу','Интихоби мактаб')}</button></div><p class="small" role="status" id="institutionStatus"></p></section>'''
    return '<!-- ROLE-PROFILE START -->\n'+roles+'\n'+picker+'\n<!-- ROLE-PROFILE END -->'
def workspace(row):
    items,materials_ru,materials_tg=documents[row['id']]
    buttons=''.join(f'<button class="document-tile" type="button" data-doc-template="{i}" data-title-tg="{escape(tg,quote=True)}"><span aria-hidden="true">▤</span><strong>{txt(ru,tg)}</strong><small>{txt("Открыть черновик","Кушодани пешнавис")}</small></button>' for i,(ru,tg) in enumerate(items,1))
    return f'''<!-- ROLE-WORKSPACE START -->
<section class="section workspace-overview no-print" id="workspaceOverview" aria-labelledby="workspaceOverviewTitle"><div class="pill-row"><span class="tag">SmartMaktab</span><h2 id="workspaceOverviewTitle">{txt('Мой рабочий стол','Мизи кории ман')}</h2></div><div class="summary workspace-summary"><div class="metric"><span>{txt('Должность','Вазифа')}</span><b>{escape(row['title'])}</b></div><div class="metric"><span>{txt('Учреждение','Муассиса')}</span><b id="workspaceSchool">—</b></div><div class="metric"><span>{txt('Рабочие шаблоны','Намунаҳои корӣ')}</span><b>{len(items)}</b></div></div></section>
<section class="section no-print" id="workspaceDocs"><div class="pill-row"><span class="workspace-icon" aria-hidden="true">▤</span><h2>{txt('Документы','Ҳуҷҷатҳо')}</h2></div><p class="small">{txt('Шаблоны для этой должности · не утверждены.','Намунаҳо барои ҳамин вазифа · тасдиқ нашудаанд.')}</p><div class="workspace-tiles">{buttons}</div></section>
<section class="section" id="workspaceDraft" hidden><div class="no-print"><h2 id="workspaceDraftTitle" tabindex="-1"></h2><form id="workspaceDraftForm" inert><div class="steps"><label class="field">{txt('Период','Давра')}<input id="workspaceDraftPeriod" required maxlength="50"></label><label class="field">{txt('Тема или задача','Мавзӯъ ё вазифа')}<input id="workspaceDraftTopic" required maxlength="120"></label></div><label class="field spacer">{txt('Содержание и следующие шаги','Мундариҷа ва қадамҳои навбатӣ')}<textarea id="workspaceDraftBody" rows="4" maxlength="800"></textarea></label><div class="control"><button type="button" class="button" id="workspacePreview">{txt('Показать черновик','Дидани пешнавис')}</button><button type="button" class="button alt" id="workspaceCloseDraft">{txt('Закрыть','Пӯшидан')}</button></div></form><p id="workspaceDraftStatus" class="small" role="status"></p></div>
<div class="print-card" id="workspaceSheet" hidden><h3 id="workspaceSheetTitle"></h3><p id="workspaceSheetSchool"></p><dl><dt>{txt('Период','Давра')}</dt><dd id="workspaceSheetPeriod"></dd><dt>{txt('Тема','Мавзӯъ')}</dt><dd id="workspaceSheetTopic"></dd><dt>{txt('Содержание','Мундариҷа')}</dt><dd id="workspaceSheetBody"></dd></dl><p class="small">{txt('Черновик · не утверждён','Пешнавис · тасдиқ нашудааст')}</p><button type="button" id="workspacePrint" class="button alt no-print">{txt('Печать','Чоп')}</button></div></section>
<section class="section no-print" id="workspaceMaterials"><div class="pill-row"><span class="workspace-icon" aria-hidden="true">◇</span><h2>{txt('Материалы и подсказки','Мавод ва роҳнамо')}</h2></div><p>{txt(materials_ru,materials_tg)}</p><ul class="workspace-guide"><li>{txt('Проверьте учреждение, период и цель документа.','Муассиса, давра ва ҳадафи ҳуҷҷатро санҷед.')}</li><li>{txt('Используйте вымышленные или обезличенные данные.','Додаҳои сохта ё беномро истифода баред.')}</li></ul></section>
<!-- ROLE-WORKSPACE END -->'''
settings_links={'roleIntake','directorPersonnel','directorInstitution','directorCourses','teacherWorkplaces','teacherProfilePanel','libraryProfilePanel','institutionPicker'}
for row in rows:
    p=ROOT/row['path']; s=p.read_text(); block=entry(row)
    if '<!-- ROLE-PROFILE START -->' in s:
        s=re.sub(r'<!-- ROLE-PROFILE START -->.*?<!-- ROLE-PROFILE END -->',lambda _:block,s,count=1,flags=re.S)
    else:
        # After title and notice, before working content. Director's existing personnel form comes first.
        if row['id']=='school-director': point=s.index('<section class="section no-print" id="directorCourses"')
        else:
            m=re.search(r'<(?:p|div) class="notice[^>]*>.*?</(?:p|div)>',s,flags=re.S)
            assert m,row['path'];point=m.end()
        s=s[:point]+'\n'+block+'\n'+s[point:]
    if 'id="cabinetRailToggle"' not in s:
        s=s.replace('<nav aria-label="Разделы кабинета">','<button type="button" id="cabinetRailToggle" class="rail-toggle" aria-expanded="true" aria-controls="cabinetRailNav">☰ <span>'+txt('Свернуть меню','Пӯшидани меню')+'</span></button><nav id="cabinetRailNav" aria-label="Разделы кабинета">',1)
        if row['id']!='school-director':
            i=s.index('</nav>');s=s[:i]+'<a href="#roleIntake">'+txt('Анкета должности','Варақаи вазифа')+'</a>'+s[i:]
        i=s.index('</nav>');s=s[:i]+'<a href="#institutionPicker" data-institution-link hidden>'+txt('Выбор школы','Интихоби мактаб')+'</a>'+s[i:]
    block=workspace(row)
    if '<!-- ROLE-WORKSPACE START -->' in s:
        s=re.sub(r'<!-- ROLE-WORKSPACE START -->.*?<!-- ROLE-WORKSPACE END -->',lambda _:block,s,count=1,flags=re.S)
    else:
        end_section=s.index('</article>');s=s[:end_section]+block+s[end_section:]
    nav=re.search(r'<nav[^>]+id="cabinetRailNav"[^>]*>.*?</nav>',s,flags=re.S)
    if nav:
        original=nav.group(0)
        menu=re.sub(r'<a href="#([^"\s]+)"[^>]*>.*?</a>',lambda m:'' if m.group(1) in settings_links|{'workspaceDocs','workspaceMaterials'} else m.group(0),original,flags=re.S)
        links=f'<a href="#workspaceDocs">▤ {txt("Документы","Ҳуҷҷатҳо")}</a><a href="#workspaceMaterials">◇ {txt("Материалы","Мавод")}</a>'
        menu=menu.replace('</nav>',links+'</nav>')
        s=s[:nav.start()]+menu+s[nav.end():]
    p.write_text(s)

