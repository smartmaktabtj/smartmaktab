import {openWorkspaceView,closeWorkspaceView} from './workspace-view.mjs';
import {setupPilotCertificate} from './pilot-certificate-ui.mjs';
import {setupOperations} from './operations.mjs';
import {mountClassPicker} from './class-picker.mjs';
import {cabinetFormAction,printCabinetSheet,persistentStore} from './cabinet-runtime.mjs';
import {periods,schoolProgress,orderSchedule} from './school-forms-data.mjs';
const certificate='certificate',characteristic='characteristic',progress='progress',schedule='schedule';
const roles={
 'school-director':[certificate,characteristic,progress,schedule],'school-records-clerk':[certificate],
 'school-class-teacher':[characteristic,progress],'school-education-quality':[progress],
 'school-academic-deputy':[progress,schedule],'school-primary-deputy':[progress,schedule],
 'school-upbringing-deputy':[characteristic]
};
const content={
 certificate:['Маълумотнома','Справка об обучении'],certificateType:['Навъи маълумотнома','Вид справки'],student:['Маълумотномаи хонанда','Справка учащегося'],competition:['Маълумотнома барои озмун','Справка для конкурса'],participation:['Маълумотнома барои иштирок','Справка для участия'],event:['Номи озмун ё чорабинӣ','Название конкурса или мероприятия'],characteristic:['Тавсифнома','Характеристика учащегося'],progress:['Сифати таҳсилот','Качество образования'],
 schedule:['Ҷадвали дарсҳо','Расписание уроков'],day:['Рӯзи ҳафта','День недели'],monday:['Душанбе','Понедельник'],tuesday:['Сешанбе','Вторник'],wednesday:['Чоршанбе','Среда'],thursday:['Панҷшанбе','Четверг'],friday:['Ҷумъа','Пятница'],saturday:['Шанбе','Суббота'],sunday:['Якшанбе','Воскресенье'],start:['Оғоз','Начало'],end:['Анҷом','Конец'],teacher:['Омӯзгор','Учитель'],room:['Утоқ','Кабинет'],lesson:['Дарс','Урок'],addLesson:['Иловаи дарс','Добавить урок'],removeLesson:['Хориҷ кардани дарс','Удалить урок'],timeError:['Вақти оғозу анҷом ва ҳампӯшии дарсҳоро санҷед.','Проверьте время начала, конца и пересечения уроков.'],
 title:['Варақаҳои корӣ','Рабочие формы'],intro:['Варақаро пур карда, санҷед ва барои чоп кушоед. Маълумот ба сервер фиристода намешавад.','Заполните форму, проверьте и откройте для печати. Данные не отправляются на сервер.'],
 caution:['Танҳо маълумоти сохта ворид кунед. Шакл тасдиқ нашудааст.','Вводите только вымышленные данные. Форма не утверждена.'],
 person:['Ному насаби хонанда','Имя и фамилия учащегося'],class:['Синф','Класс'],date:['Сана','Дата'],number:['Рақами ҳуҷҷат','Номер документа'],director:['Ному насаби директор','Имя и фамилия директора'],leader:['Роҳбари синф','Классный руководитель'],purpose:['Ҷойи пешниҳод','Место предъявления'],behavior:['Рафтор','Поведение'],details:['Тавсифи таҳсил ва иштироки хонанда','Описание учёбы и участия'],achievement:['Дастовардҳо (ихтиёрӣ)','Достижения (необязательно)'],
 year:['Соли таҳсил','Учебный год'],subject:['Фан','Предмет'],period:['Давра','Период'],total:['Шумораи хонандагон','Число учащихся'],assessed:['Шумораи хонандагони баҳогирифта','Число оценённых'],quality:['Шумора бо натиҷаи сифатнок (зиёда аз 7)','Число с результатом выше 7'],passed:['Шумора бо натиҷаи қаноатбахш (аз 4)','Число с результатом от 4'],q1:['Чоряки 1','1-я четверть'],q2:['Чоряки 2','2-я четверть'],q3:['Чоряки 3','3-я четверть'],q4:['Чоряки 4','4-я четверть'],h1:['Нимсолаи 1','1-е полугодие'],h2:['Нимсолаи 2','2-е полугодие'],annual:['Солона','Год'],averages:['Миёнаи фан аз рӯи чоряк (1–10, ихтиёрӣ)','Среднее по предмету за четверть (1–10, необязательно)'],
 aggregate:['Барои давраи интихобшуда шумораҳои ҷамъбастиро ворид кунед, на баҳои хонандагонро. Фоиз аз шумораи умумии хонандагон ҳисоб мешавад. Ҳадҳо аз барномаи манбаъ гирифта шудаанд; онҳо меъёри тасдиқшуда нестанд.','Введите сводные числа за выбранный период, а не оценки учащихся. Процент считается от общего числа учащихся. Пороги взяты из исходной программы и не являются утверждённой нормой.'],
 qualityPct:['Сифати таҳсилот','Качество знаний'],passPct:['Азхудкунӣ','Успеваемость'],preview:['Пешнамоиш','Предпросмотр'],print:['Чоп','Печать'],close:['Пӯшидан','Закрыть'],clear:['Тоза кардан','Очистить'],invalid:['Майдонҳои ҳатмӣ ва синфро санҷед.','Проверьте обязательные поля и класс.'],countError:['Шумораҳо бояд бо ин тартиб бошанд: натиҷаи сифатнок ≤ натиҷаи қаноатбахш ≤ баҳогирифта ≤ умумӣ.','Числа должны идти в таком порядке: результат выше 7 ≤ результат от 4 ≤ оценены ≤ всего.'],chooseSchool:['Аввал дар танзимот мактабро интихоб кунед.','Сначала выберите школу в настройках.'],signature:['Имзо','Подпись'],place:['Барои пешниҳод ба','Для предъявления в'],confirmed:['Бо ҳамин маълумотнома тасдиқ мешавад, ки','Настоящая справка подтверждает, что'],studies:['таҳсил мекунад','обучается'],
};
const el=(tag,cls)=>{const node=document.createElement(tag);if(cls)node.className=cls;return node;};
export function setupSchoolForms(article,docs,school){
 const kinds=roles[article.dataset.cabinetId];if(!kinds)return;
 const text=key=>content[key][document.documentElement.lang==='ru'?1:0];
 const draftKey=k=>school()?.id?`smartmaktab.demo.form-draft.v1.${school().id}.${article.dataset.cabinetId}.${k}`:null;
 const group=el('div','school-forms-tools no-print'),heading=el('h3'),intro=el('p','small'),actions=el('div','control');
 group.append(heading,intro,actions);
 const tiles=docs.querySelector('.workspace-tiles');
 if(tiles)tiles.before(group);else docs.append(group);
 setupOperations(article,group,school);
 setupPilotCertificate(article,group,school);
 const panel=el('section','section school-forms');panel.id='schoolForms';panel.hidden=true;article.append(panel);
 let kind,editor,picker,inputs,status,statusKey,sheet,report,headingForm;
 const bindings=new Map();
 const bind=(tag,key,cls)=>{const node=el(tag,cls);node.textContent=text(key);bindings.set(node,key);return node;};
 bindings.set(heading,'title');bindings.set(intro,'intro');
 const buttons=kinds.map(key=>{const button=bind('button',key,'button alt');button.type='button';actions.append(button);button.addEventListener('click',()=>open(key));return button;});
 function close(focus=true){panel.hidden=true;panel.replaceChildren();for(const node of bindings.keys())if(!node.isConnected)bindings.delete(node);report=null;picker=null;if(focus)closeWorkspaceView(panel.id);}
 function open(key){
  close(false);kind=key;inputs={};statusKey='';
  editor=el('form','no-print');editor.autocomplete='off';editor.noValidate=true;
  headingForm=bind('h2',kind);headingForm.tabIndex=-1;editor.append(headingForm,bind('p','caution','small'));
  const fields=el('div','school-fields');editor.append(fields);
  const lessonRows=[];
  function field(key,{required=false,type='text',area=false,parent=fields,max=120}={}){
   const label=el('label','field');label.append(bind('span',key));
   const input=el(area?'textarea':'input');if(!area)input.type=type;else input.rows=4;
   input.required=required;if(type==='number'){input.min='0';input.max='9999';}else if(type==='text')input.maxLength=max;
   label.append(input);parent.append(label);inputs[key]=input;input.dataset.schoolFormField=key;return input;
  }
  function choice(key,options){
   const label=el('label','field');label.append(bind('span',key));const select=el('select');select.dataset.schoolFormField=key;
   for(const [value,term] of options){const option=bind('option',term);option.value=value;select.append(option);}
   label.append(select);fields.append(label);inputs[key]=select;return select;
  }
  if(kind===schedule){
   choice('day',['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(value=>[value,value]));
   const list=el('div');const add=bind('button','addLesson','button alt');add.type='button';editor.append(list,add);
   function addLesson(){
    if(lessonRows.length>=12)return;
    const box=el('fieldset','school-fields quarter-fields');box.append(bind('legend','lesson'));
    const record={};
    for(const [key,type,required] of [['subject','text',true],['start','time',true],['end','time',true],['teacher','text',false],['room','text',false]]){
     const label=el('label','field');label.append(bind('span',key));const control=el('input');control.type=type;control.required=required;control.dataset.lessonField=key;if(type==='text')control.maxLength=100;label.append(control);box.append(label);record[key]=control;
    }
    const remove=bind('button','removeLesson','button alt');remove.type='button';box.append(remove);list.append(box);lessonRows.push({record,remove});
    function refresh(){add.disabled=lessonRows.length>=12;lessonRows.forEach(row=>row.remove.disabled=lessonRows.length===1);}
    remove.addEventListener('click',()=>{lessonRows.splice(lessonRows.findIndex(row=>row.record===record),1);for(const node of bindings.keys())if(box.contains(node))bindings.delete(node);box.remove();refresh();invalidate();saveDraft();add.focus();});
    refresh();return record;
   }
   add.addEventListener('click',()=>{invalidate();addLesson()?.subject?.focus();});
   let restoredLessons=false;
   try{
    const saved=draftKey(key)?JSON.parse(persistentStore.getItem(draftKey(key))):null;
    if(saved?.lessons?.length){
     for(const l of saved.lessons.slice(0,12)){
      const rec=addLesson();
      if(rec)for(const [k,input] of Object.entries(rec))if(typeof l[k]==='string')input.value=l[k];
     }
     restoredLessons=true;
    }
   }catch{}
   if(!restoredLessons)addLesson();
  }else if(kind===progress){
   editor.append(bind('p','aggregate','small'));
   field('year',{required:true,max:18});field('subject',{required:true,max:80});
   choice('period',periods.map(value=>[value,value==='year'?'annual':value]));
   for(const value of ['total','assessed','quality','passed'])field(value,{required:true,type:'number'});
   const quarterBox=el('fieldset','school-fields quarter-fields');quarterBox.append(bind('legend','averages'));
   for(const value of periods.slice(0,4)){const input=field(value,{parent:quarterBox,max:5});input.inputMode='decimal';input.pattern='(?:10(?:[.,]0{1,2})?|[1-9](?:[.,][0-9]{1,2})?)';}
   editor.append(quarterBox);
  }else{
   field('person',{required:true});field('date',{required:true,type:'date'}).value=new Date().toLocaleDateString('sv-SE');
   field('number',{max:32});field('director');
   if(kind===certificate){
    const type=choice('certificateType',['student','competition','participation'].map(value=>[value,value]));
    const occasion=field('event');const refresh=()=>{occasion.required=type.value!=='student';occasion.closest('label').hidden=!occasion.required;occasion.disabled=!occasion.required;};
    type.addEventListener('change',refresh);refresh();field('purpose');
   }else{field('leader');field('behavior',{required:true});field('details',{required:true,area:true,max:1500}).closest('label').classList.add('school-field-wide');field('achievement',{area:true,max:800}).closest('label').classList.add('school-field-wide');}
  }
  const classBox=el('fieldset','class-form-field');classBox.append(bind('legend','class'));const classControl=el('div');classBox.append(classControl);fields.prepend(classBox);picker=mountClassPicker(classControl,{onChange:()=>{invalidate();saveDraft();}});
  try{
   const saved=draftKey(key)?JSON.parse(persistentStore.getItem(draftKey(key))):null;
   if(saved&&typeof saved==='object'){
    if(saved.classCode)picker.set([saved.classCode]);
    if(saved.values&&typeof saved.values==='object'){
     for(const [k,v] of Object.entries(saved.values))if(inputs[k]&&typeof v==='string')inputs[k].value=v;
     if(inputs.certificateType)inputs.certificateType.dispatchEvent(new Event('change'));
    }
   }
  }catch{}
  function saveDraft(){
   const dk=draftKey(key);if(!dk)return;
   try{
    const values=Object.fromEntries(Object.entries(inputs).map(([k,input])=>[k,input.value]));
    const lessons=kind===schedule?lessonRows.map(({record})=>Object.fromEntries(Object.entries(record).map(([k,input])=>[k,input.value]))):undefined;
    persistentStore.setItem(dk,JSON.stringify({classCode:picker?.read()[0]||'',values,lessons}));
   }catch{}
  }
  const control=el('div','control');const preview=bind('button','preview','button'),clearBtn=bind('button','clear','button alt'),cancel=bind('button','close','button alt');preview.type='submit';clearBtn.type='button';cancel.type='button';
  clearBtn.addEventListener('click',()=>{const dk=draftKey(key);if(dk)persistentStore.removeItem(dk);open(key);});
  cancel.addEventListener('click',()=>close());control.append(preview,clearBtn,cancel);status=el('p','small');status.setAttribute('role','status');editor.append(control,status);
  sheet=el('div','print-card school-form-sheet');sheet.id='schoolFormPrint';sheet.hidden=true;panel.append(editor,sheet);panel.hidden=false;
  function invalidate(){if(report){report=null;sheet.hidden=true;}statusKey='';if(status)status.textContent='';}
  editor.addEventListener('input',()=>{invalidate();saveDraft();});editor.addEventListener('change',()=>{invalidate();saveDraft();});
  cabinetFormAction(editor,preview,()=>{
   const classCode=picker.read()[0],values=Object.fromEntries(Object.entries(inputs).map(([k,input])=>[k,input.value.trim()]));
   const setStatus=key=>{statusKey=key;status.textContent=text(key);};
   if(!school()){setStatus('chooseSchool');return;}
   if(!editor.reportValidity()||!classCode||Object.entries(inputs).some(([key,input])=>input.required&&!values[key])){setStatus('invalid');if(!classCode)picker.focus();return;}
   let result;
   if(kind===schedule){result=orderSchedule(lessonRows.map(({record})=>Object.fromEntries(Object.entries(record).map(([key,input])=>[key,input.value.trim()]))));if(!result){setStatus('timeError');return;}}
   if(kind===progress){result=schoolProgress([values.total,values.assessed,values.quality,values.passed],periods.slice(0,4).map(key=>values[key]));if(!result){setStatus('countError');return;}}
   report={values,school:school().name,classCode,result};statusKey='';status.textContent='';renderSheet();openWorkspaceView(sheet.id,preview);
  });
  openWorkspaceView(panel.id,buttons[kinds.indexOf(kind)]);
 }
 function renderSheet(){
  if(!report)return;const {values:v,school:schoolName,classCode,result}=report;
  sheet.replaceChildren();sheet.hidden=false;
  const append=(tag,value)=>{const node=el(tag);node.textContent=value;sheet.append(node);return node;};
  const tg=document.documentElement.lang!=='ru',format=new Intl.NumberFormat(tg?'tg-TJ':'ru',{maximumFractionDigits:2});
  append('h3',text(kind===certificate&&v.certificateType!=='student'?v.certificateType:kind));append('p',`${schoolName} · ${text('class')} ${classCode}`);
  if(kind===schedule){
   append('p',text(v.day));
   const list=el('ol','schedule-print-list');sheet.append(list);
   for(const row of result){const line=el('li');line.textContent=[`${row.start}–${row.end}`,row.subject,row.teacher,row.room&&`${text('room')} ${row.room}`].filter(Boolean).join(' · ');list.append(line);}
  }else if(result){
   append('p',`${v.year} · ${v.subject} · ${text(v.period==='year'?'annual':v.period)}`);
   const dl=el('dl');sheet.append(dl);const metric=(key,value)=>{const dt=el('dt'),dd=el('dd');dt.textContent=text(key);dd.textContent=value;dl.append(dt,dd);};
   for(const [key,value] of Object.entries({total:result.enrolled,assessed:result.assessed,quality:result.quality,passed:result.passed,qualityPct:`${format.format(result.qualityPercent)}%`,passPct:`${format.format(result.passPercent)}%`}))metric(key,value);
   [...result.quarter,result.h1,result.h2,result.year].forEach((value,i)=>metric(['q1','q2','q3','q4','h1','h2','annual'][i],value===null?'—':format.format(value)));
  }else{
   append('p',`${v.number?`№ ${v.number} · `:''}${v.date.split('-').reverse().join('.')}`);
   if(kind===certificate){append('p',tg?`${text('confirmed')} ${v.person} дар синфи ${classCode}-и ${schoolName} ${text('studies')}.`:`${text('confirmed')} ${v.person} ${text('studies')} в классе ${classCode} (${schoolName}).`);if(v.event&&v.certificateType!=='student')append('p',`${text('event')}: ${v.event}`);if(v.purpose)append('p',`${text('place')}: ${v.purpose}`);}
   else{append('p',v.person);append('p',`${text('behavior')}: ${v.behavior}`);append('p',v.details);if(v.achievement)append('p',`${text('achievement')}: ${v.achievement}`);append('p',`${text('leader')}: ${v.leader||'________________'} · ${text('signature')}: __________`);}
   append('p',`${text('director')}: ${v.director||'________________'} · ${text('signature')}: __________`);
  }
  append('p',text('caution')).className='small';
  const print=append('button',text('print'));print.type='button';print.className='button alt no-print';print.addEventListener('click',()=>printCabinetSheet(print));
 }
 document.addEventListener('cabinet:language',()=>{for(const [node,key] of bindings)node.textContent=text(key);picker?.refresh();if(status&&statusKey)status.textContent=text(statusKey);if(!document.body.classList.contains('sm-print-preview'))renderSheet();});
 document.addEventListener('cabinet:school',()=>close(false));
}
