import {openWorkspaceView,closeWorkspaceView} from '../../shared/workspace-view.mjs';
import {readableSize} from '../../shared/book-transfer.mjs';
import {makePdfReader} from '../../shared/pdf-reader.mjs';
import {mountTeachingEditor} from '../../shared/teaching-editor.mjs';
import {subjectName} from '../../shared/subjects.mjs';
import {booksFor,teacherShelf} from '../../shared/teacher-books.mjs';
import {tabStorage,cabinetFormAction,cabinetPageURL,offlineViewer} from '../../shared/cabinet-runtime.mjs';
import {selectedDemoSchool as school,demoSchoolNames,readTeacherWorkplaces,teacherWorkplacesKey,findDemoSchools,chooseInstitution} from '../../shared/cabinets.mjs';
import {validateTeacherProfile} from './teacher-data.mjs';
const $=id=>document.getElementById(id);
let storageKey=school ? `smartmaktab.demo.teacher.v1.${school.id}` : null;
const locales={ru:{tg:'Таджикский',ru:'Русский',classes:'Выберите хотя бы один класс и язык обучения.',
  saved:'Профиль сохранён для этой школы в текущей вкладке.',memory:'Профиль сохранён до перезагрузки: браузер запретил хранение данных вкладки.'},
  tg:{tg:'Тоҷикӣ',ru:'Русӣ',classes:'Камаш як синф ва забони таълимро интихоб кунед.',
  saved:'Профил барои ҳамин мактаб дар равзанаи ҷорӣ сабт шуд.',memory:'Профил то бозборкунӣ сабт шуд: браузер нигоҳдории равзанаро иҷозат надод.'}};
const t=key=>locales[document.documentElement.lang==='tg'?'tg':'ru'][key]??'';
const text=(tg,ru)=>document.documentElement.lang==='ru'?ru:tg;
$('teacherProfile').inert=false;
const editor=mountTeachingEditor($('teacherProfileClasses'));
const pdfReader=makePdfReader($('teacherBookPanel'));
let profile=null,editing=true,profileNote='',activeBook=null;
const shelf=document.createElement('section');shelf.className='teacher-shelf no-print';shelf.id='teacherShelf';
const shelfHeader=document.createElement('header'),shelfTitle=document.createElement('h2'),shelfAll=document.createElement('button'),shelfList=document.createElement('ul'),shelfEmpty=document.createElement('p');
shelfAll.type='button';shelfAll.className='button alt';shelfAll.dataset.teacherLibrary='';shelfEmpty.className='small';
shelfHeader.append(shelfTitle,shelfAll);shelf.append(shelfHeader,shelfEmpty,shelfList);document.querySelector('.sm-shortcuts').before(shelf);
shelfAll.addEventListener('click',()=>showBooks(null,shelfAll));
function loadProfile(){try{return storageKey?validateTeacherProfile(JSON.parse(tabStorage.getItem(storageKey))):null;}catch{return null;}}
profile=loadProfile();editing=!profile?.teaching;
function fillInputs(){editor.set(profile?.teaching??[],profile?.classes??[]);$('instructionLanguage').value=profile?.language??'';}
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
function render(){
 const rows=profile?.teaching??[];
 const schoolTag=$('teacherHeaderSchool')||$('workspaceSchool');
 if(schoolTag)schoolTag.textContent=school?.name??text('Мактаб интихоб нашудааст','Школа не выбрана');
 $('teacherNoSchool').hidden=!!school;$('teacherProfilePanel').hidden=!school;$('teacherProfile').hidden=!editing;
 $('teacherProfileSummary').hidden=editing;$('teacherCancelProfile').hidden=!profile?.teaching;
 $('profileClasses').textContent=rows.map(row=>`${row.classCode} · ${subjectName(row.subject)}`).join(', ');
 $('profileInstruction').textContent=t(profile?.language);$('teacherProfileStatus').textContent=profileNote==='classes'?text('Камаш як синф ва фан ва забони таълимро интихоб кунед.','Добавьте хотя бы одну пару «класс — предмет» и укажите язык обучения.'):t(profileNote);
 editor.refresh();
 $('teacherSubjectsHeading').tabIndex=-1;
 $('teacherSubjectsEmpty').textContent=!school?text('Аввал мактабро интихоб кунед.','Сначала выберите школу.'):rows.length?'':text('Синф ва фанро дар «Танзимот» ба профили корӣ илова кунед.','Добавьте класс и предмет в рабочем профиле в «Настройках».');
 $('teacherSubjectRows').replaceChildren(...rows.map(row=>{
  const li=document.createElement('li'),name=document.createElement('strong'),book=document.createElement('button');
  name.textContent=`${row.classCode} · ${subjectName(row.subject)}`;book.type='button';book.className='button alt';
  book.dataset.bookShortcut='';
  book.textContent=text('Китоби дарсӣ','Учебник');
  book.addEventListener('click',()=>showBooks(row,book));li.append(name,book);return li;
 }));renderBooks();renderShelf();
}
cabinetFormAction($('teacherProfile'),$('teacherProfile').querySelector('button[type=submit]'),()=>{
 if(!school||!editing)return;
 const next=validateTeacherProfile({teaching:editor.read(),language:$('instructionLanguage').value});
 if(!next?.teaching||editor.missing().length){profileNote='classes';render();return;}
 profile=next;editing=false;profileNote='saved';activeBook=null;pdfReader?.close();
 try{tabStorage.setItem(storageKey,JSON.stringify(next));}catch{profileNote='memory';}
 render();$('teacherEditProfile').focus();
});
$('teacherEditProfile').addEventListener('click',()=>{editing=true;profileNote='';fillInputs();render();editor.focus();});
$('teacherCancelProfile').addEventListener('click',()=>{editing=false;fillInputs();render();$('teacherEditProfile').focus();});
document.addEventListener('cabinet:language',()=>render());
fillInputs();render();

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
 editing=!profile?.teaching;activeBook=null;pdfReader?.close();profileNote='';
 if(!workplaces.includes(school.id))workplaces.push(school.id);
 for(const input of $('teacherSchoolChecks').querySelectorAll('input'))input.checked=workplaces.includes(input.value);
 fillInputs();render();renderWorkplaces();
});
renderWorkplaces();
