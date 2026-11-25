import {mountWindowsContent} from './windows-content-ui.mjs';
import {setupNativeFiles} from './native-shell.mjs';
import {initWorkspaceViews} from './workspace-view.mjs';
import {setupSchoolForms} from './school-forms.mjs';
import {cabinetFormAction,printCabinetSheet} from './cabinet-runtime.mjs';
const $=id=>document.getElementById(id);
export function setupWorkspace({configured,school}){
 const overview=$('workspaceOverview');if(!overview)return;
 const article=overview.closest('article'),docs=$('workspaceDocs'),editor=$('workspaceDraft'),materials=$('workspaceMaterials');
 const page=$('cabinetHome');
 const toggle=document.createElement('button');toggle.type='button';toggle.id='workspaceSettingsToggle';toggle.className='theme-toggle';
 toggle.setAttribute('aria-controls','workspaceSettings');
 const drawer=document.createElement('section');drawer.className='section no-print workspace-settings';drawer.id='workspaceSettings';
 const heading=document.createElement('h2');heading.id='workspaceSettingsTitle';heading.tabIndex=-1;drawer.setAttribute('aria-labelledby',heading.id);
 const settingsHeader=document.createElement('div');settingsHeader.className='pill-row';
 const close=document.createElement('button');close.type='button';close.className='button alt';close.id='closeWorkspaceSettings';settingsHeader.append(heading,close);drawer.append(settingsHeader);
 const ids=['roleIntake','directorPersonnel','institutionPicker','directorInstitution','directorCourses','directorProfilePanel','teacherWorkplaceScope','teacherWorkplaces','teacherProfilePanel','libraryWorkplaceScope','libraryProfilePanel'];
 for(const id of ids){const element=$(id);if(element)drawer.append(element);}
 const hero=article.querySelector('.hero');hero.after(overview,drawer,docs,editor);
 const teacher=!!$('teacherSubjects');if(teacher){drawer.append($('teacherSubjects'));if(materials)docs.append(materials);for(const a of $('cabinetRailNav').querySelectorAll('a[href="#teacherSubjects"],a[href="#workspaceMaterials"]'))a.hidden=true;}
 if($('teacherBookPanel'))editor.after($('teacherBookPanel'));
 $('cabinetLang').before(toggle);setupNativeFiles($('cabinetLang'));
 setupSchoolForms(article,docs,school);
 const views=initWorkspaceViews(article);mountWindowsContent(article,views);
 for(const id of ['workspaceSettings','workspaceDraft','teacherBookPanel','schoolOperations','schoolForms','pilotCertificate'])$(id)?.classList.add('sm-screen');
 const entries={workspaceDocs:['Документы','Ҳуҷҷатҳо','▤'],workspaceMaterials:['Материалы','Мавод','◇'],teacherSubjects:['Классы и предметы','Синфҳо ва фанҳо','⊞'],teacherDocumentPanel:['План урока','Нақшаи дарс','▤'],directorPlanPanel:['План работы','Нақшаи кор','▤'],libraryPlanPanel:['План библиотеки','Нақшаи китобхона','▤'],adviserSchools:['Школы','Мактабҳо','▦'],adviserDocuments:['Документы направления','Ҳуҷҷатҳои самт','▤']};
 if(teacher){delete entries.teacherSubjects;delete entries.workspaceMaterials;}
 for(const [id,values] of Object.entries(entries))views.shortcut(id,...values);
 for(const anchor of $('cabinetRailNav').querySelectorAll('a[href^="#"]')){
  const id=anchor.hash.slice(1);if(anchor.hidden||id==='cabinetHome'||Object.hasOwn(entries,id))continue;const panel=$(id);if(!panel)continue;
  const entry=anchor.querySelector('[data-tg]')??anchor;views.shortcut(id,entry.textContent.trim(),entry.dataset.tg??entry.textContent.trim(),'◇');
 }
 let chosen=null,snapshot=null;
 const tg=()=>document.documentElement.lang==='tg';
 const label=(ru,tj)=>tg()?tj:ru;
 function sync(){
  const templateTitle=docs.querySelector('[data-template-heading]');if(templateTitle)templateTitle.textContent=label('Образцы · не утверждены','Намунаҳо · тасдиқ нашудаанд');
  const title=label('Настройки','Танзимот');toggle.textContent=`⚙ ${title}`;toggle.setAttribute('aria-label',title);
  toggle.setAttribute('aria-expanded',String(views.current()==='workspaceSettings'));heading.textContent=title;close.textContent=label('Закрыть','Пӯшидан');
  $('workspaceSchool').textContent=school()?.name??label('Не выбрано','Интихоб нашудааст');
  if(chosen)$('workspaceDraftTitle').textContent=chosen.querySelector('strong').textContent;
  if(snapshot){$('workspaceSheetTitle').textContent=chosen.querySelector('strong').textContent;$('workspaceSheetSchool').textContent=snapshot.school;}
  views.refresh();
 }
 function setSettings(open){if(open)views.open('workspaceSettings',toggle);else views.close('workspaceSettings');sync();}
 toggle.addEventListener('click',()=>setSettings(views.current()!=='workspaceSettings'));close.addEventListener('click',()=>setSettings(false));
 const navState=new MutationObserver(sync);navState.observe(article,{attributes:true,attributeFilter:['data-sm-screen']});
 const form=$('workspaceDraftForm');form.inert=false;
 const cards=[...docs.querySelectorAll('[data-doc-template]')];
 const tiles=docs.querySelector('.workspace-tiles');if(tiles){const title=document.createElement('h3');title.dataset.templateHeading='';tiles.before(title);}
 const specialized={'school-teacher':'teacherDocumentPanel','school-director':'directorPlanPanel','school-library-head':'libraryPlanPanel'}[article.dataset.cabinetId];
 for(const card of cards)card.addEventListener('click',()=>{
   if(card===cards[0]&&specialized){views.open(specialized,card);return;}

   if(chosen!==card){form.reset();snapshot=null;$('workspaceSheet').hidden=true;$('workspaceDraftStatus').textContent='';}
   chosen=card;editor.hidden=false;sync();views.open('workspaceDraft',card);
 });
 $('workspaceCloseDraft').addEventListener('click',()=>{views.close('workspaceDraft');editor.hidden=true;});
 cabinetFormAction(form,$('workspacePreview'),()=>{
  const period=$('workspaceDraftPeriod').value.trim(),topic=$('workspaceDraftTopic').value.trim(),details=$('workspaceDraftBody').value.trim();
  if(!period||!topic||!chosen)return;
  if(!school()){$('workspaceDraftStatus').textContent=label('Сначала выберите школу в настройках.','Аввал дар танзимот мактабро интихоб кунед.');return;}
  snapshot={school:school().name,period,topic,details};
  $('workspaceSheetPeriod').textContent=period;$('workspaceSheetTopic').textContent=topic;$('workspaceSheetBody').textContent=details||'—';
  $('workspaceDraftStatus').textContent=label('Печатный черновик готов.','Пешнавис барои чоп омода аст.');$('workspaceSheet').hidden=false;sync();views.open('workspaceSheet',$('workspacePreview'));
 });
 $('workspacePrint').addEventListener('click',event=>{if(snapshot)printCabinetSheet(event.currentTarget);});
 document.addEventListener('cabinet:language',sync);
 document.addEventListener('cabinet:school',()=>{if(snapshot){snapshot=null;$('workspaceSheet').hidden=true;}$('workspaceDraftStatus').textContent='';sync();});
 sync();
 if(!configured)views.open('workspaceSettings',toggle,{focus:false});
}
