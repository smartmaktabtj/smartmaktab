import {openWorkspaceView,closeWorkspaceView} from '../../shared/workspace-view.mjs';
import {readableSize} from '../../shared/book-transfer.mjs';
import {setupLessonAssistant} from '../../shared/lesson-assistant.mjs';
import {makePdfReader} from '../../shared/pdf-reader.mjs';
import {mountTeachingEditor} from '../../shared/teaching-editor.mjs';
import {subjectName} from '../../shared/subjects.mjs';
import {booksFor,teacherShelf} from '../../shared/teacher-books.mjs';
import {mountClassPicker} from '../../shared/class-picker.mjs';
import {tabStorage,cabinetFormAction,printCabinetSheet,cabinetPageURL,offlineViewer} from '../../shared/cabinet-runtime.mjs';
import {selectedDemoSchool as school,demoSchoolNames,readTeacherWorkplaces,teacherWorkplacesKey,findDemoSchools,chooseInstitution} from '../../shared/cabinets.mjs';
import {validateTeacherProfile,makeLessonSnapshot} from './teacher-data.mjs';
const $=id=>document.getElementById(id);
let storageKey=school ? `smartmaktab.demo.teacher.v1.${school.id}` : null;
const locales={ru:{tg:'Таджикский',ru:'Русский',choose:'Выберите класс',classes:'Выберите хотя бы один класс и язык обучения.',
  saved:'Профиль сохранён для этой школы в текущей вкладке.',memory:'Профиль сохранён до перезагрузки: браузер запретил хранение данных вкладки.',
  invalid:'Проверьте класс, дату, тему и цель урока.',ready:'Черновик готов. Для изменения создайте новый предпросмотр.',
  outdated:'В черновике остались прежние данные. Чтобы подставить новые, нажмите «Показать черновик».'},
  tg:{tg:'Тоҷикӣ',ru:'Русӣ',choose:'Синфро интихоб кунед',classes:'Камаш як синф ва забони таълимро интихоб кунед.',
  saved:'Профил барои ҳамин мактаб дар равзанаи ҷорӣ сабт шуд.',memory:'Профил то бозборкунӣ сабт шуд: браузер нигоҳдории равзанаро иҷозат надод.',
  invalid:'Синф, сана, мавзӯъ ва ҳадафи дарсро санҷед.',ready:'Пешнавис омода аст. Барои тағйир додан пешнамоиши нав созед.',
  outdated:'Дар пешнавис маълумоти пешина монд. Барои навсозӣ «Дидани пешнавис»-ро пахш кунед.'}};
const t=key=>locales[document.documentElement.lang==='tg'?'tg':'ru'][key]??'';
const text=(tg,ru)=>document.documentElement.lang==='ru'?ru:tg;
$('teacherProfile').inert=false;
const editor=mountTeachingEditor($('teacherProfileClasses'));
const pdfReader=makePdfReader($('teacherBookPanel'));
let profile=null,editing=true,snapshot=null,profileNote='',documentNote='',activeBook=null;
const shelf=document.createElement('section');shelf.className='teacher-shelf no-print';shelf.id='teacherShelf';
const shelfHeader=document.createElement('header'),shelfTitle=document.createElement('h2'),shelfAll=document.createElement('button'),shelfList=document.createElement('ul'),shelfEmpty=document.createElement('p');
shelfAll.type='button';shelfAll.className='button alt';shelfAll.dataset.teacherLibrary='';shelfEmpty.className='small';
shelfHeader.append(shelfTitle,shelfAll);shelf.append(shelfHeader,shelfEmpty,shelfList);document.querySelector('.sm-shortcuts').before(shelf);
shelfAll.addEventListener('click',()=>showBooks(null,shelfAll));
function loadProfile(){try{return storageKey?validateTeacherProfile(JSON.parse(tabStorage.getItem(storageKey))):null;}catch{return null;}}
profile=loadProfile();editing=!profile?.teaching;
const refreshAssistant=setupLessonAssistant($('teacherDraft'),()=>({classCode:$('teacherClass').value,subject:$('teacherLessonSubject').value}));
const lessonClass=mountClassPicker($('teacherLessonClass'),{available:[],onChange:list=>{
 $('teacherClass').value=list[0]??'';refreshSubjects();clearDraft();
}});
function fillInputs(){editor.set(profile?.teaching??[],profile?.classes??[]);$('instructionLanguage').value=profile?.language??'';}
function clearDraft(){if(!snapshot&&!documentNote)return;snapshot=null;documentNote='';$('teacherSheet').hidden=true;$('teacherStatus').textContent='';}
function refreshSubjects(prefer=$('teacherLessonSubject').value){
 const field=$('teacherLessonSubject'),items=(profile?.teaching??[]).filter(row=>row.classCode===$('teacherClass').value);
 field.replaceChildren(new Option(text('Фанро интихоб кунед','Выберите предмет'),''),...items.map(row=>new Option(subjectName(row.subject),row.subject)));
 field.value=items.some(row=>row.subject===prefer)?prefer:items.length===1?items[0].subject:'';field.disabled=!items.length;refreshAssistant();
}
function showLesson(row){
 if(editing||!school)return;lessonClass.set([row.classCode]);$('teacherClass').value=row.classCode;refreshSubjects(row.subject);clearDraft();
 openWorkspaceView('teacherDocumentPanel');
}
function showBooks(row,trigger){pdfReader?.close();activeBook=row;renderBooks();openWorkspaceView('teacherBookPanel',trigger);}
function bookControls(li,book,home=false){
 if(!pdfReader)return;
 const open=document.createElement('button');open.type='button';open.className='button alt';open.textContent=pdfReader.buttonText();
 if(home)open.dataset.homeRead='';else open.dataset.readerLaunch='';
 open.addEventListener('click',()=>pdfReader.open(book,{trigger:open}));li.append(open);
 if(!home){const save=document.createElement('button');save.type='button';save.className='button alt';save.dataset.bookDownload='';save.textContent=pdfReader.downloadText();save.addEventListener('click',()=>pdfReader.open(book,{download:true,trigger:save}));li.append(save);}
}
function bookLink(book){const link=document.createElement('a');link.target='_blank';link.rel='noopener noreferrer';link.href=book.url;link.textContent=book.title;return link;}
function contextLabel(rows){
 const groups=new Map();for(const {classCode,subject} of rows){if(!groups.has(subject))groups.set(subject,[]);groups.get(subject).push(classCode);}
 return [...groups].map(([subject,codes])=>`${codes.join(', ')} · ${subjectName(subject)}`).join(' / ');
}
function renderBooks(){
 const rows=profile?.teaching??[];
 const {items,missing}=teacherShelf(activeBook?[activeBook]:rows);
 $('teacherBookHeading').textContent=activeBook?contextLabel([activeBook]):text('Китобҳои дарсии ман','Мои учебники');
 pdfReader?.refresh();
 $('teacherBookNote').textContent=items.length?text('Китобҳо мувофиқи синфу фанҳои профили ҳамин мактаб интихоб шудаанд.','Книги подобраны по классам и предметам вашего профиля в этой школе.'):rows.length?text('Китоби мувофиқ ёфт нашуд.','Подходящий учебник не найден.'):text('Синфу фанро дар профили корӣ илова кунед.','Добавьте класс и предмет в рабочем профиле.');
 $('teacherBooks').replaceChildren(...items.map(book=>{
  const li=document.createElement('li'),group=document.createElement('div'),context=document.createElement('small'),size=document.createElement('strong');
  context.textContent=contextLabel(book.rows);size.className='book-file-size';size.textContent=readableSize(book.size);size.setAttribute('aria-label',`${text('Ҳаҷми файл','Размер файла')}: ${size.textContent}`);
  group.className='teacher-book-name';group.append(bookLink(book),context);li.append(group,size);bookControls(li,book);return li;
 }));
 const status=$('teacherBooksMissing');status.hidden=!missing.length||!!activeBook;
 const list=status.querySelector('ul');status.querySelector('summary').textContent=text(`Бе китоби мувофиқ: ${missing.length}`,`Без подходящего учебника: ${missing.length}`);
 list.replaceChildren(...missing.map(row=>{const li=document.createElement('li');li.textContent=contextLabel([row]);return li;}));
}
function renderShelf(){
 const rows=profile?.teaching??[],{items}=teacherShelf(rows);
 shelfTitle.textContent=text('Китобҳои дарсии ман','Мои учебники');shelfAll.textContent=text(`Ҳамаи китобҳо (${items.length})`,`Все учебники (${items.length})`);
 shelfEmpty.hidden=!!items.length;shelfEmpty.textContent=rows.length?text('Барои ин синфу фанҳо дар феҳрист китоб ёфт нашуд.','Для этих классов и предметов в каталоге пока нет подходящих книг.'):text('Синфу фанҳоро дар профили корӣ илова кунед. Китобҳои мувофиқ дар ин ҷо нишон дода мешаванд.','Добавьте классы и предметы в профиль. Подходящие книги появятся здесь автоматически.');
 shelfList.hidden=!items.length;
 shelfList.replaceChildren(...items.slice(0,4).map(book=>{
  const li=document.createElement('li'),group=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('small');
  title.textContent=book.title;note.textContent=`${contextLabel(book.rows)} · ${readableSize(book.size)}`;group.append(title,note);li.append(group);
  if(pdfReader)bookControls(li,book,true);else li.append(bookLink(book));return li;
 }));
}
$('teacherCloseBooks').addEventListener('click',()=>{closeWorkspaceView('teacherBookPanel');activeBook=null;pdfReader?.close();renderBooks();});
function render(renewClasses=false){
 const rows=profile?.teaching??[];
 $('teacherHeaderSchool').textContent=school?.name??text('Мактаб интихоб нашудааст','Школа не выбрана');
 $('teacherNoSchool').hidden=!!school;$('teacherProfilePanel').hidden=!school;$('teacherProfile').hidden=!editing;
 $('teacherProfileSummary').hidden=editing;$('teacherCancelProfile').hidden=!profile?.teaching;
 $('profileClasses').textContent=rows.map(row=>`${row.classCode} · ${subjectName(row.subject)}`).join(', ');
 $('profileInstruction').textContent=t(profile?.language);$('teacherProfileStatus').textContent=profileNote==='classes'?text('Камаш як синф ва фан ва забони таълимро интихоб кунед.','Добавьте хотя бы одну пару «класс — предмет» и укажите язык обучения.'):t(profileNote);
 $('teacherDocumentPanel').hidden=!rows.length;$('teacherDocumentFields').disabled=editing;
 $('teacherStatus').textContent=t(documentNote);editor.refresh();
 if(renewClasses){const old=$('teacherClass').value;lessonClass.set(old?[old]:[],[...new Set(rows.map(row=>row.classCode))]);$('teacherClass').value=lessonClass.read()[0]??'';}else lessonClass.refresh();
 refreshSubjects();
 $('teacherSubjectsHeading').tabIndex=-1;
 $('teacherSubjectsEmpty').textContent=!school?text('Аввал мактабро интихоб кунед.','Сначала выберите школу.'):rows.length?'':text('Синф ва фанро дар «Танзимот» ба профили корӣ илова кунед.','Добавьте класс и предмет в рабочем профиле в «Настройках».');
 $('teacherSubjectRows').replaceChildren(...rows.map(row=>{
  const li=document.createElement('li'),name=document.createElement('strong'),lesson=document.createElement('button'),book=document.createElement('button');
  name.textContent=`${row.classCode} · ${subjectName(row.subject)}`;lesson.type=book.type='button';lesson.className=book.className='button alt';
  lesson.dataset.lessonShortcut='';book.dataset.bookShortcut='';lesson.disabled=editing;
  lesson.textContent=text('Нақшаи дарс','План урока');book.textContent=text('Китоби дарсӣ','Учебник');
  lesson.addEventListener('click',()=>showLesson(row));book.addEventListener('click',()=>showBooks(row,book));li.append(name,lesson,book);return li;
 }));renderBooks();renderShelf();
 if(snapshot){const [y,m,d]=snapshot.date.split('-');
  for(const [id,value] of Object.entries({sheetSchool:snapshot.school,sheetSubject:subjectName(snapshot.subject),sheetInstruction:t(snapshot.language),sheetClass:snapshot.classCode,
   sheetDate:`${d}.${m}.${y}`,sheetTopic:snapshot.topic,sheetGoal:snapshot.goal})) $(id).textContent=value;
  $('teacherSheet').hidden=false;
 }
}
cabinetFormAction($('teacherProfile'),$('teacherProfile').querySelector('button[type=submit]'),()=>{
 if(!school||!editing)return;
 const next=validateTeacherProfile({teaching:editor.read(),language:$('instructionLanguage').value});
 if(!next?.teaching||editor.missing().length){profileNote='classes';render();return;}
 profile=next;editing=false;profileNote='saved';activeBook=null;pdfReader?.close();clearDraft();
 try{tabStorage.setItem(storageKey,JSON.stringify(next));}catch{profileNote='memory';}
 render(true);$('teacherEditProfile').focus();
});
$('teacherEditProfile').addEventListener('click',()=>{editing=true;profileNote='';fillInputs();render();editor.focus();});
$('teacherCancelProfile').addEventListener('click',()=>{editing=false;fillInputs();render();$('teacherEditProfile').focus();});
cabinetFormAction($('teacherDraft'),$('teacherDraft').querySelector('button[type=submit]'),()=>{
 if(editing||!school||!profile)return;
 const next=makeLessonSnapshot({school,profile,classCode:$('teacherClass').value,subject:$('teacherLessonSubject').value,date:$('teacherDate').value,
  topic:$('teacherTopic').value,goal:$('teacherGoal').value});
 snapshot=next;$('teacherSheet').hidden=!snapshot;documentNote=next?'ready':'invalid';render();if(snapshot)openWorkspaceView('teacherSheet');
});
$('teacherDraft').addEventListener('input',event=>{if(!event.target.matches('[data-class-grade],[data-class-letter]'))clearDraft();});
$('teacherDraft').addEventListener('change',event=>{if(event.target===$('teacherLessonSubject'))clearDraft();});
$('teacherPrint').addEventListener('click',event=>{if(snapshot)printCabinetSheet(event.currentTarget);});
document.addEventListener('cabinet:language',()=>render());
fillInputs();render(true);

const workplaceForm=$('teacherWorkplaceForm');workplaceForm.inert=false;
let workplaces=readTeacherWorkplaces(),workNote='';
if(!workplaces.length&&school)workplaces=[school.id];
const workText={ru:{saved:'Места работы сохранены в текущей вкладке.',required:'Отметьте хотя бы одну школу.',blocked:'Браузер не разрешил сохранить список школ.',current:'текущая',unsaved:'Изменения не сохранены.'},
 tg:{saved:'Ҷойҳои кор дар равзанаи ҷорӣ сабт шуданд.',required:'Камаш як мактабро интихоб кунед.',blocked:'Браузер сабти рӯйхати мактабҳоро иҷозат надод.',current:'ҷорӣ',unsaved:'Тағйирот сабт нашуд.'}};
for(const [id,name] of Object.entries(demoSchoolNames)){
 const label=document.createElement('label'),input=document.createElement('input');
 input.type='checkbox';input.value=id;input.checked=workplaces.includes(id);
 label.dataset.schoolId=id;label.append(input,document.createTextNode(name));$('teacherSchoolChecks').append(label);
}
function renderWorkplaces(){
 $('teacherWorkplaces').hidden=!school;
 const labels=workText[document.documentElement.lang==='tg'?'tg':'ru'];
 $('teacherWorkplaceStatus').textContent=labels[workNote]??'';
 $('teacherSchoolLinks').replaceChildren(...workplaces.map(id=>{
  const node=document.createElement(id===school?.id?'span':'a');
  node.textContent=`${demoSchoolNames[id]||(id===school?.id?school.name:id)}${id===school?.id?` · ${labels.current}`:''}`;
  node.className=id===school?.id?'tag':'button alt';
  if(id!==school?.id){
   const url=new URL(cabinetPageURL);url.search='';url.hash='';url.searchParams.set('school',id);
   url.searchParams.set('lang',document.documentElement.lang);node.href=url;
   if(offlineViewer)node.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();chooseInstitution(id,{setAsWorkspace:false});});
  }
  return node;
 }));
}
$('teacherSchoolSearch').addEventListener('input',event=>{const ids=new Set(findDemoSchools(event.target.value));for(const label of $('teacherSchoolChecks').children)label.hidden=!ids.has(label.dataset.schoolId);});
$('teacherSchoolChecks').addEventListener('change',()=>{workNote='unsaved';renderWorkplaces();});
$('teacherSaveWorkplaces').addEventListener('click',()=>{
 const next=[...$('teacherSchoolChecks').querySelectorAll('input:checked')].map(input=>input.value);
 if(!next.length){workNote='required';renderWorkplaces();return;}
 workplaces=next;workNote='saved';
 try{tabStorage.setItem(teacherWorkplacesKey,JSON.stringify(next));}catch{workNote='blocked';}
 if(workNote==='saved'&&(!school||!next.includes(school.id))){
  const url=new URL(cabinetPageURL);url.search='';url.hash='';url.searchParams.set('school',next[0]);
  url.searchParams.set('lang',document.documentElement.lang);
  if(offlineViewer)chooseInstitution(next[0],{setAsWorkspace:false});else location.assign(url);return;
 }
 renderWorkplaces();
});
workplaceForm.addEventListener('submit',event=>{event.preventDefault();$('teacherSaveWorkplaces').click();});
document.addEventListener('cabinet:language',renderWorkplaces);
document.addEventListener('cabinet:school',()=>{
 storageKey=`smartmaktab.demo.teacher.v1.${school.id}`;profile=loadProfile();
 editing=!profile?.teaching;activeBook=null;pdfReader?.close();bookTrigger=null;snapshot=null;profileNote='';documentNote='';$('teacherSheet').hidden=true;$('teacherDraft').reset();$('teacherClass').value='';
 if(!workplaces.includes(school.id))workplaces.push(school.id);
 for(const input of $('teacherSchoolChecks').querySelectorAll('input'))input.checked=workplaces.includes(input.value);
 fillInputs();render(true);renderWorkplaces();
});
renderWorkplaces();
