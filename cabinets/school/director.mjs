import {openWorkspaceView} from '../../shared/workspace-view.mjs';
import {tabStorage,persistentStore,cabinetFormAction,printCabinetSheet} from '../../shared/cabinet-runtime.mjs';
import {selectedDemoSchool as school,enableInstitutionPicker,takeRolePerson,roleSetup} from '../../shared/cabinets.mjs';
import {maxTasks,validYear,directorProfile,directorTask,directorPlan,taskInYear,validatePersonnel,validateCourse,courseSchedule} from './director-data.mjs';
const $=id=>document.getElementById(id);
let key=school?`smartmaktab.demo.director.v1.${school.id}`:null;
const en={saved:['Профиль сохранён в текущей вкладке.','Профил дар равзанаи ҷорӣ сабт шуд.'],memory:['Профиль сохранён до перезагрузки.','Профил то бозборкунӣ сабт шуд.'],
 invalidYear:['Укажите год начала учебного года, от 2000 до 2099.','Соли оғози таҳсилро аз 2000 то 2099 ворид кунед.'],
 invalidDue:['Месяц исполнения должен быть внутри учебного года.','Моҳи иҷро бояд ба соли таҳсил дохил шавад.'],
 invalidTask:['Проверьте поля задачи.','Майдонҳои вазифаро санҷед.'],outside:['Срок вне выбранного учебного года.','Муҳлат берун аз соли таҳсили интихобшуда аст.'],
 added:['Задача добавлена.','Вазифа илова шуд.'],limit:['В плане уже 16 задач.','Дар нақша аллакай 16 вазифа ҳаст.'],removed:['Задача удалена из списка.','Вазифа аз рӯйхат хориҷ шуд.'],remove:['Убрать','Хориҷ кардан'],
 ready:['Черновик готов к печати.','Пешнавис барои чоп омода аст.'], invalidPlan:['Укажите цель на год и проверьте сроки всех задач.','Ҳадафи солро ворид кунед ва муҳлати ҳамаи вазифаҳоро санҷед.'],
 stale:['Готовый черновик не изменился. Сформируйте его заново, чтобы включить правки.','Пешнависи тайёр тағйир наёфт. Барои ворид кардани ислоҳҳо пешнависи нав созед.']};
const t=key=>en[key]?.[document.documentElement.lang==='tg'?1:0]??'';
const label=(id,value)=>Array.from($(id).options).find(option=>option.value===value)?.textContent??'';
let profile=null;
if(key)try{profile=directorProfile(JSON.parse(tabStorage.getItem(key)));}catch{}
const planDraftKey=()=>school?`smartmaktab.demo.director-plan.v1.${school.id}`:null;
function loadPlanDraft(){
  const dk=planDraftKey();if(!dk)return [];
  try{
    const saved=JSON.parse(persistentStore.getItem(dk));
    if(!saved||typeof saved!=='object')return [];
    if(typeof saved.year==='string')$('directorYear').value=saved.year;
    if(typeof saved.goal==='string')$('directorGoal').value=saved.goal;
    return Array.isArray(saved.tasks)?saved.tasks.slice(0,maxTasks).filter(Boolean):[];
  }catch{return [];}
}
function savePlanDraft(){
  const dk=planDraftKey();if(!dk)return;
  try{persistentStore.setItem(dk,JSON.stringify({year:$('directorYear').value,goal:$('directorGoal').value,tasks}));}catch{}
}
let editing=!profile,tasks=loadPlanDraft(),snapshot=null,note='',profileNote='';
function fillProfile(){ $('directorType').value=profile?.type??'';$('directorShifts').value=profile?.shifts??''; }
function modified(other=''){note=snapshot?'stale':other;}
function taskList(list,working){return list.map((task,index)=>{
  const li=document.createElement('li'),title=document.createElement('strong'),meta=document.createElement('p');
  title.textContent=task.title;
  meta.textContent=[label('directorDirection',task.direction),task.due,label('directorOwner',task.owner)].join(' · ');
  meta.className='small';li.append(title,meta);
  if(working){
    if(!taskInYear(task.due,$('directorYear').value)){
      const warn=document.createElement('p');warn.className='tag warn';warn.textContent=t('outside');li.append(warn);
    }
    const remove=document.createElement('button');remove.type='button';remove.className='button alt';remove.textContent=t('remove');remove.disabled=editing;
    remove.addEventListener('click',()=>{tasks=tasks.filter((_,i)=>i!==index);savePlanDraft();modified('removed');render();$('directorTitle').focus();});li.append(remove);
  }
  return li;
});}
function render(){
  $('directorCode').textContent=school?.id??'—';
  $('directorProfilePanel').hidden=!school;
  $('directorProfile').hidden=!editing;$('directorCancel').hidden=!profile;
  $('directorSummary').hidden=editing;
  $('directorSummaryType').textContent=label('directorType',profile?.type);
  $('directorSummaryShifts').textContent=label('directorShifts',profile?.shifts);
  $('directorProfileStatus').textContent=t(profileNote);
  $('directorPlanPanel').hidden=!profile;
  for(const id of ['directorYear','directorGoal','directorTaskFields']) $(id).disabled=editing;
  $('directorAdd').disabled=tasks.length>=maxTasks;
  $('directorGenerate').disabled=editing||!tasks.length;
  $('directorEmpty').hidden=!!tasks.length;
  $('directorTasks').replaceChildren(...taskList(tasks,true));
  $('directorStatus').textContent=t(note);
  if(snapshot){
    $('directorSheetSchool').textContent=`${snapshot.school} (${snapshot.code}) · ${label('directorType',snapshot.type)}`;
    $('directorSheetShifts').textContent=label('directorShifts',snapshot.shifts);
    $('directorSheetYear').textContent=`${snapshot.year}–${Number(snapshot.year)+1}`;
    $('directorSheetGoal').textContent=snapshot.goal;
    $('directorSheetTasks').replaceChildren(...taskList(snapshot.tasks,false));
    $('directorSheet').hidden=false;
  }
}
$('directorProfile').inert=false;
cabinetFormAction($('directorProfile'),$('directorProfile').querySelector('button[type=submit]'),()=>{
  if(!school||!editing)return;
  const next=directorProfile({type:$('directorType').value,shifts:$('directorShifts').value});if(!next)return;
  if(JSON.stringify(next)!==JSON.stringify(profile)&&snapshot)modified();
  profile=next;editing=false;profileNote='saved';
  try{tabStorage.setItem(key,JSON.stringify(profile));}catch{profileNote='memory';}
  render();openWorkspaceView('directorPlanPanel');$('directorYear').focus();
});
$('directorEdit').addEventListener('click',()=>{editing=true;profileNote='';fillProfile();render();$('directorType').focus();});
$('directorCancel').addEventListener('click',()=>{editing=false;fillProfile();render();$('directorEdit').focus();});
$('directorYear').addEventListener('input',()=>{savePlanDraft();modified();render();});
$('directorGoal').addEventListener('input',()=>{savePlanDraft();if(snapshot){modified();$('directorStatus').textContent=t(note);}});
cabinetFormAction($('directorTask'),$('directorAdd'),()=>{
  if(editing||!profile)return;
  const year=$('directorYear').value,due=$('directorDue').value;
  const task=directorTask({title:$('directorTitle').value,direction:$('directorDirection').value,due,owner:$('directorOwner').value},year);
  if(!validYear(year))note='invalidYear';
  else if(!taskInYear(due,year))note='invalidDue';
  else if(!task)note='invalidTask';
  else if(tasks.length>=maxTasks)note='limit';
  else{tasks.push(task);savePlanDraft();$('directorTitle').value='';modified(tasks.length===maxTasks?'limit':'added');}
  render();
});
$('directorGenerate').addEventListener('click',()=>{
  if(editing)return;
  const next=directorPlan({school,profile,year:$('directorYear').value,goal:$('directorGoal').value,tasks});
  if(next){snapshot=next;note='ready';}else note='invalidPlan';
  render();if(next)openWorkspaceView('directorSheet');
});
$('directorPrint').addEventListener('click',event=>{if(snapshot)printCabinetSheet(event.currentTarget);});
document.addEventListener('cabinet:language',render);
fillProfile();render();


// Personal fields are not stored in the school profile or included in the annual plan.
const personnelForm=$('directorPersonnelForm');
const inputs={first:'directorFirst',last:'directorLast',middle:'directorMiddle',birth:'directorBirth',educationYears:'directorEduYears',leadYears:'directorLeadYears',
  otherLanguage:'directorOtherLanguage',university:'directorUniversity',specialty:'directorSpecialty',diploma:'directorDiploma',graduation:'directorGraduation',
  category:'directorCategory',attestation:'directorAttestation',appointed:'directorAppointed',gender:'directorGender',phone:'directorPhone',email:'directorEmail',address:'directorAddress',awardNotes:'directorAwardNotes'};
const languageInputs=[...$('directorLanguages').querySelectorAll('input')];
const achievementInputs=[...$('directorAchievements').querySelectorAll('input')];
const statuses={contacts:['Проверьте телефон, почту и адрес.','Телефон, почта ва суроғаро санҷед.'],fields:['Заполните обязательные поля анкеты.','Майдонҳои ҳатмиро пур кунед.'],birth:['Проверьте год рождения.','Соли таваллудро санҷед.'],
  experience:['Стаж директором не может превышать стаж в образовании. Проверьте оба значения.','Собиқаи директорӣ набояд аз собиқаи маориф зиёд бошад. Ҳар ду қиматро санҷед.'],
  dates:['Проверьте годы: они должны быть после года рождения и не позже текущего года.','Солҳоро санҷед: онҳо бояд пас аз соли таваллуд ва на дертар аз соли ҷорӣ бошанд.'],
  language:['Укажите название другого языка.','Номи забони дигарро нависед.'],saved:['Анкета сохранена в памяти этой страницы.','Варақа дар хотираи ҳамин саҳифа сабт шуд.']};
const personnelKey=()=>`smartmaktab.demo.director-personnel.v1.${school?.id||'default'}`;
let personnel=null,editingPersonnel=true,status='';
try{const saved=JSON.parse(persistentStore.getItem(personnelKey()));const checked=saved?validatePersonnel(saved):null;if(checked?.data){personnel=checked.data;editingPersonnel=false;}}catch{}
const fillPersonnel=(data={})=>{
  for(const [field,id] of Object.entries(inputs))$(id).value=data[field]??'';
  languageInputs.forEach(input=>input.checked=data.languages?.includes(input.value)??false);
  achievementInputs.forEach(input=>input.checked=data.achievements?.includes(input.value)??false);
};
function renderPersonnel(){
  $('directorPersonnel').hidden=false;
  personnelForm.hidden=!editingPersonnel;$('directorPersonnelSummary').hidden=editingPersonnel;
  $('directorPersonnelCancel').hidden=!personnel;
  $('directorOtherLanguageRow').hidden=!languageInputs.some(input=>input.value==='other'&&input.checked);
  $('directorPersonnelStatus').textContent=statuses[status]?.[document.documentElement.lang==='tg'?1:0]??'';
  if(!personnel)return;
  const rows=[];
  for(const [field,id] of Object.entries(inputs)){
    const value=personnel[field];if(!value||field==='otherLanguage')continue;
    const input=$(id),name=input.closest('label').querySelector('span').textContent;
    rows.push([name,input instanceof HTMLSelectElement?label(id,value):value]);
    if(field==='leadYears'&&personnel.languages.length){
      const languages=languageInputs.filter(node=>personnel.languages.includes(node.value)&&node.value!=='other').map(node=>node.nextElementSibling.textContent);
      if(personnel.otherLanguage)languages.push(personnel.otherLanguage);
      rows.push([$('directorLanguages').previousElementSibling.textContent,languages.join(', ')]);
    }
  }
  if(personnel.achievements.length)rows.push([$('directorAchievements').previousElementSibling.textContent,
    achievementInputs.filter(input=>personnel.achievements.includes(input.value)).map(input=>input.nextElementSibling.textContent).join(', ')]);
  $('directorPersonnelValues').replaceChildren(...rows.flatMap(([name,value])=>{
    const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=value;return [dt,dd];
  }));
}
const person=roleSetup??takeRolePerson();
if(person){
 const source=person.fields??{},candidate={first:person.first,last:person.last};
 for(const [field,id] of Object.entries(inputs))if(typeof source[id]==='string')candidate[field]=source[id];
 candidate.languages=Array.isArray(source.directorLanguages)?source.directorLanguages:[];
 candidate.achievements=Array.isArray(source.directorAchievements)?source.directorAchievements:[];
 fillPersonnel(candidate);
 const checked=validatePersonnel(candidate);
 if(checked.data){personnel=checked.data;editingPersonnel=false;}
}

for(const field of ['birth','graduation','attestation','appointed']) $(inputs[field]).max=String(new Date().getFullYear());
personnelForm.inert=false;
$('directorLanguages').addEventListener('change',renderPersonnel);
$('directorPersonnelSave').addEventListener('click',()=>{
  if(!editingPersonnel||!personnelForm.reportValidity())return;
  const values=Object.fromEntries(Object.entries(inputs).map(([field,id])=>[field,$(id).value]));
  const result=validatePersonnel({...values,languages:languageInputs.filter(input=>input.checked).map(input=>input.value),achievements:achievementInputs.filter(input=>input.checked).map(input=>input.value)});
  if(result.error){status=result.error;renderPersonnel();return;}
  personnel=result.data;status='saved';editingPersonnel=false;
  try{persistentStore.setItem(personnelKey(),JSON.stringify({...values,languages:result.data.languages,achievements:result.data.achievements}));}catch{}
  renderPersonnel();enableInstitutionPicker();if(school)$('directorPersonnelEdit').focus();
});
personnelForm.addEventListener('submit',event=>{event.preventDefault();$('directorPersonnelSave').click();});
$('directorPersonnelEdit').addEventListener('click',()=>{editingPersonnel=true;status='';fillPersonnel(personnel);renderPersonnel();$('directorLast').focus();});
$('directorPersonnelCancel').addEventListener('click',()=>{editingPersonnel=false;status='';renderPersonnel();$('directorPersonnelEdit').focus();});
document.addEventListener('cabinet:language',renderPersonnel);
renderPersonnel();


const courseForm=$('directorCourseForm');courseForm.inert=false;$('directorCourses').hidden=!school;
const calendar=new Date();
const today=[calendar.getFullYear(),String(calendar.getMonth()+1).padStart(2,'0'),String(calendar.getDate()).padStart(2,'0')].join('-');
const courseLabels={invalid:['Проверьте даты: окончание не может быть раньше начала.','Санаҳоро санҷед: анҷом пеш аз оғоз буда наметавонад.'],
 future:['Для завершённого курса укажите дату окончания не позже сегодняшней.','Санаи анҷоми курси анҷомёфта набояд баъд аз имрӯз бошад.'],
 added:['Курс добавлен.','Курс илова шуд.'],empty:['Нет завершённых курсов для расчёта срока.','Барои ҳисоб кардани муҳлат курси анҷомёфта нест.'],
 removed:['Курс удалён.','Курс хориҷ шуд.'],planned:['Запланирован или ещё не окончен','Ба нақша гирифта шудааст ё ҳанӯз анҷом наёфтааст'],
 overdue:['Срок прошёл','Муҳлат гузашт'],due:['Срок сегодня','Муҳлат имрӯз аст'],upcoming:['Срок ещё не наступил','Муҳлат ҳанӯз нарасидааст'],limit:['Можно добавить до 20 курсов.','То 20 курс илова кардан мумкин аст.']};
const localCourse=key=>courseLabels[key]?.[document.documentElement.lang==='tg'?1:0]??'';
const humanDate=iso=>iso.split('-').reverse().join('.');
const setupCourse=roleSetup?.fields?validateCourse({title:roleSetup.fields.directorCourseTitle,provider:roleSetup.fields.directorCourseProvider,
  start:roleSetup.fields.directorCourseStart,end:roleSetup.fields.directorCourseEnd,state:roleSetup.fields.directorCourseCompletion}):null;
const coursesKey=()=>`smartmaktab.demo.director-courses.v1.${school?.id||'default'}`;
function loadCourses(){
  try{
    const saved=JSON.parse(persistentStore.getItem(coursesKey()));
    if(Array.isArray(saved))return saved.slice(0,20).map(item=>validateCourse(item)).filter(Boolean);
  }catch{}
  return setupCourse?[setupCourse]:[];
}
function saveCourses(){try{persistentStore.setItem(coursesKey(),JSON.stringify(courses));}catch{}}
let courseNote='',courses=loadCourses();
function renderCourses(){
 const schedule=courseSchedule(courses,today);
 $('directorCourseStatus').textContent=[localCourse(courseNote),!schedule&&courseNote!=='invalid'?localCourse('empty'):''].filter(Boolean).join(' ');
 $('directorCourseSchedule').hidden=!schedule;
 $('directorDueNext').textContent=schedule?humanDate(schedule.due):'';
 $('directorTrainingState').textContent=schedule?localCourse(schedule.status):'';
 $('directorCourseList').replaceChildren(...[...courses].sort((a,b)=>b.end.localeCompare(a.end)).map(course=>{
  const row=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('p'),remove=document.createElement('button');
  title.textContent=course.title;detail.textContent=[course.provider,`${humanDate(course.start)} — ${humanDate(course.end)}`,course.state==='planned'?localCourse('planned'):''].filter(Boolean).join(' · ');
  detail.className='small';remove.className='button alt';remove.type='button';remove.textContent=t('remove');
  remove.addEventListener('click',()=>{courses=courses.filter(item=>item!==course);saveCourses();courseNote='removed';renderCourses();$('directorCourseTitle').focus();});
  row.append(title,detail,remove);return row;
 }));
}
$('directorAddCourse').addEventListener('click',()=>{
 if(!school||!courseForm.reportValidity())return;
 if(courses.length>=20){courseNote='limit';renderCourses();return;}
 const course=validateCourse({title:$('directorCourseTitle').value,provider:$('directorCourseProvider').value,start:$('directorCourseStart').value,end:$('directorCourseEnd').value,state:$('directorCourseCompletion').value});
 if(!course){courseNote='invalid';renderCourses();return;}
 if(course.state==='completed'&&course.end>today){courseNote='future';renderCourses();return;}
 courses.push(course);saveCourses();courseNote='added';courseForm.reset();renderCourses();$('directorCourseTitle').focus();
});
courseForm.addEventListener('submit',event=>{event.preventDefault();$('directorAddCourse').click();});
document.addEventListener('cabinet:language',renderCourses);
document.addEventListener('cabinet:school',()=>{
 key=`smartmaktab.demo.director.v1.${school.id}`;profile=null;
 try{profile=directorProfile(JSON.parse(tabStorage.getItem(key)));}catch{}
 editing=!profile;snapshot=null;note='';profileNote='';
 for(const id of ['directorYear','directorGoal','directorDue','directorTitle','directorOwner','directorDirection'])$(id).value='';
 tasks=loadPlanDraft();
 personnel=null;editingPersonnel=true;status='';
 try{const saved=JSON.parse(persistentStore.getItem(personnelKey()));const checked=saved?validatePersonnel(saved):null;if(checked?.data){personnel=checked.data;editingPersonnel=false;}}catch{}
 fillPersonnel(personnel||{});
 courses=loadCourses();
 $('directorSheet').hidden=true;$('directorCourses').hidden=false;fillProfile();render();renderPersonnel();renderCourses();
});
renderCourses();
