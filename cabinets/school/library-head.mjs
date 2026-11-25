import {openWorkspaceView} from '../../shared/workspace-view.mjs';
import {setupLibraryLoans} from './library-loans.mjs';
import {tabStorage,cabinetFormAction,printCabinetSheet} from '../../shared/cabinet-runtime.mjs';
import {selectedDemoSchool as school} from '../../shared/cabinets.mjs';
import {maxLibraryActivities,validateLibraryProfile,validateLibraryActivity,makeLibrarySnapshot} from './library-data.mjs';
const $=id=>document.getElementById(id);
let storageKey=school?`smartmaktab.demo.library.v1.${school.id}`:null;
const dict={ru:{main:'Основная библиотека',reading:'Читальный зал',textbooks:'Учебники',fiction:'Художественная литература',reference:'Справочная литература',
 primary:'Начальные классы',secondary:'Средние и старшие классы',staff:'Педагоги',all:'Все классы',choose:'Выберите раздел',remove:'Убрать',
 profileInvalid:'Выберите рабочую зону и хотя бы один раздел фонда.',saved:'Профиль сохранён для этой школы в текущей вкладке.',memory:'Браузер не разрешил сохранять профиль. Он доступен до перезагрузки.',
 itemInvalid:'Проверьте раздел фонда, аудиторию и название мероприятия.',added:'Мероприятие добавлено в план.',removed:'Мероприятие убрано из плана.',limit:'В плане может быть не больше 12 мероприятий.',
 unavailable:'Раздел удалён из профиля.',invalid:'Укажите месяц и добавьте мероприятия из действующих разделов фонда.',ready:'Черновик готов к печати.',stale:'Черновик не изменился. Для подстановки новых данных сформируйте его заново.'},
 tg:{main:'Китобхонаи асосӣ',reading:'Толори хониш',textbooks:'Китобҳои дарсӣ',fiction:'Адабиёти бадеӣ',reference:'Адабиёти маълумотӣ',
 primary:'Синфҳои ибтидоӣ',secondary:'Синфҳои боло',staff:'Омӯзгорон',all:'Ҳамаи синфҳо',choose:'Қисмро интихоб кунед',remove:'Хориҷ кардан',
 profileInvalid:'Минтақаи корӣ ва камаш як қисми фондро интихоб кунед.',saved:'Профил барои мактаби интихобшуда дар равзанаи ҷорӣ сабт шуд.',memory:'Браузер сабти профилро иҷозат надод. Профил то бозборкунӣ мемонад.',
 itemInvalid:'Қисми фонд, гурӯҳ ва номи чорабиниро санҷед.',added:'Чорабинӣ ба нақша илова шуд.',removed:'Чорабинӣ аз нақша хориҷ шуд.',limit:'Дар нақша то 12 чорабинӣ ҷо мешавад.',
 unavailable:'Қисми фонд аз профил бароварда шуд.',invalid:'Моҳро интихоб карда, аз қисмҳои фаъоли фонд чорабинӣ илова кунед.',ready:'Пешнавис барои чоп омода аст.',stale:'Пешнавис тағйир наёфт. Барои гузоштани додаҳои нав пешнависи нав созед.'}};
const language=()=>document.documentElement.lang==='tg'?'tg':'ru';
const t=key=>dict[language()][key]??'';
$('libraryProfile').inert=false;
const checks=[...$('libraryProfile').querySelectorAll('input[type=checkbox]')];
let profile=null;
if(storageKey)try{profile=validateLibraryProfile(JSON.parse(tabStorage.getItem(storageKey)));}catch{}
let editing=!profile,profileNote='',planNote='',items=[],snapshot=null;
function loadForm(){
  $('libraryZone').value=profile?.zone??'';
  checks.forEach(check=>{check.checked=profile?.funds.includes(check.value)??false;});
}
function changed(note){planNote=snapshot?'stale':note;}
function cell(value){const td=document.createElement('td');td.textContent=value;return td;}
function rows(data,interactive){return data.map((item,index)=>{
  const row=document.createElement('tr');
  row.append(cell(item.name),cell(t(item.fund)+(interactive&&!profile?.funds.includes(item.fund)?` — ${t('unavailable')}`:'')),cell(t(item.audience)));
  if(interactive){
    const td=cell('');const button=document.createElement('button');button.type='button';button.className='button alt';button.textContent=t('remove');
    button.disabled=editing;button.addEventListener('click',()=>{items=items.filter((_,i)=>i!==index);changed('removed');render();});td.append(button);row.append(td);
  }
  return row;
});}
function render(){
  $('libraryNoSchool').hidden=!!school;
  $('libraryProfilePanel').hidden=!school;
  $('libraryProfile').hidden=!editing;
  $('librarySummary').hidden=editing;
  $('libraryCancel').hidden=!profile;
  $('librarySummaryZone').textContent=t(profile?.zone);
  $('librarySummaryFunds').textContent=profile?.funds.map(t).join(', ')??'';
  $('libraryProfileStatus').textContent=t(profileNote);
  $('libraryPlanPanel').hidden=!profile;
  $('libraryMonth').disabled=editing;
  $('libraryActivityFields').disabled=editing||items.length>=maxLibraryActivities;
  $('libraryGenerate').disabled=editing||!items.length;
  const select=$('libraryFund'),previous=select.value;
  select.replaceChildren(new Option(t('choose'),''),...(profile?.funds??[]).map(fund=>new Option(t(fund),fund)));
  select.value=profile?.funds.includes(previous)?previous:'';
  $('libraryEmpty').hidden=!!items.length;
  $('libraryWorking').hidden=!items.length;
  $('libraryRows').replaceChildren(...rows(items,true));
  $('libraryPlanStatus').textContent=t(planNote);
  if(snapshot){
    $('librarySheetSchool').textContent=snapshot.school;
    $('librarySheetZone').textContent=t(snapshot.zone);
    $('librarySheetMonth').textContent=snapshot.month;
    $('librarySheetRows').replaceChildren(...rows(snapshot.items,false));
    $('librarySheet').hidden=false;
  }
}
cabinetFormAction($('libraryProfile'),$('libraryProfile').querySelector('button[type=submit]'),()=>{
  if(!school||!editing)return;
  const next=validateLibraryProfile({zone:$('libraryZone').value,funds:checks.filter(el=>el.checked).map(el=>el.value)});
  if(!next){profileNote='profileInvalid';render();return;}
  if(JSON.stringify(next)!==JSON.stringify(profile)&&snapshot)planNote='stale';
  profile=next;editing=false;profileNote='saved';
  try{tabStorage.setItem(storageKey,JSON.stringify(profile));}catch{profileNote='memory';}
  render();openWorkspaceView('libraryPlanPanel');$('libraryMonth').focus();
});
$('libraryEdit').addEventListener('click',()=>{editing=true;profileNote='';loadForm();render();$('libraryZone').focus();});
$('libraryCancel').addEventListener('click',()=>{editing=false;loadForm();render();$('libraryEdit').focus();});
$('libraryMonth').addEventListener('input',()=>{if(snapshot){changed('');$('libraryPlanStatus').textContent=t(planNote);}});
cabinetFormAction($('libraryActivity'),$('libraryActivity').querySelector('button[type=submit]'),()=>{
  if(!profile||editing)return;
  if(items.length>=maxLibraryActivities){planNote='limit';render();return;}
  const item=validateLibraryActivity({name:$('libraryAction').value,fund:$('libraryFund').value,audience:$('libraryAudience').value},profile);
  if(!item){planNote='itemInvalid';render();return;}
  items.push(item); $('libraryAction').value='';changed('added');render();
  if (items.length >= maxLibraryActivities) $('libraryGenerate').focus(); else $('libraryAction').focus();
});
$('libraryGenerate').addEventListener('click',()=>{
  if(editing)return;
  const next=makeLibrarySnapshot({school,profile,month:$('libraryMonth').value,items});
  if(next){snapshot=next;planNote='ready';}else planNote='invalid';
  render();if(next)openWorkspaceView('librarySheet');
});
$('libraryPrint').addEventListener('click',event=>{if(snapshot)printCabinetSheet(event.currentTarget);});
document.addEventListener('cabinet:language',render);
loadForm();render();

document.addEventListener('cabinet:school',()=>{
 storageKey=`smartmaktab.demo.library.v1.${school.id}`;profile=null;
 try{profile=validateLibraryProfile(JSON.parse(tabStorage.getItem(storageKey)));}catch{}
 editing=!profile;items=[];snapshot=null;profileNote='';planNote='';$('libraryMonth').value='';$('libraryActivity').reset();$('librarySheet').hidden=true;
 loadForm();render();
});

setupLibraryLoans(()=>school);
