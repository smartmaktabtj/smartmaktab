import {openWorkspaceView,closeWorkspaceView} from './workspace-view.mjs';
import {mountClassPicker} from './class-picker.mjs';
import {cabinetFormAction,printCabinetSheet,persistentStore} from './cabinet-runtime.mjs';
import {weekDays,matrixPeriods,checkWeekly,checkMatrix} from './operations-data.mjs';
const copy={weekly:['Ҷадвали ҳафтаина','Недельное расписание'],matrix:['Ҳисоботи сифат аз рӯи давраҳо','Качество по учебным периодам'],title:['Варақаҳои корӣ','Рабочие формы'],
 mon:['Душанбе','Понедельник'],tue:['Сешанбе','Вторник'],wed:['Чоршанбе','Среда'],thu:['Панҷшанбе','Четверг'],fri:['Ҷумъа','Пятница'],sat:['Шанбе','Суббота'],sun:['Якшанбе','Воскресенье'],all:['Ҳамаи ҳафта','Вся неделя'],day:['Рӯз','День'],classCode:['Синф','Класс'],teacher:['Омӯзгор','Учитель'],room:['Утоқ','Кабинет'],start:['Оғоз','Начало'],end:['Анҷом','Конец'],subject:['Фан','Предмет'],year:['Соли таҳсил','Учебный год'],view:['Давраи чоп','Период печати'],add:['Иловаи дарс','Добавить урок'],remove:['Хориҷ кардани дарс','Удалить урок'],lesson:['Дарс','Урок'],note:['Шакли корӣ — тасдиқ нашудааст. Танҳо маълумоти сохтаро ворид кунед.','Рабочая форма не утверждена. Вводите только вымышленные данные.'],
 details:['Ҳамаи дарсҳои мактабро дар ин варақа ворид кунед, то ҳампӯшии синф, омӯзгор ва утоқ санҷида шавад.','Проверка пересечений класса, учителя и кабинета относится только к урокам, внесённым в эту форму.'],
 matrixNote:['Шумораҳои ҷамъбастии ҳар давраро пурра ворид кунед ё давраро холӣ гузоред. Ҳисоботи солона мустақил аст: фоизи он миёнаи фоизҳои чоряк нест.','Введите все сводные числа периода или оставьте его пустым. Годовой результат вводится отдельно и не усредняет проценты четвертей.'],
 q1:['Чоряки 1','1-я четверть'],q2:['Чоряки 2','2-я четверть'],h1:['Нимсолаи 1','1-е полугодие'],q3:['Чоряки 3','3-я четверть'],q4:['Чоряки 4','4-я четверть'],h2:['Нимсолаи 2','2-е полугодие'],annual:['Солона','Год'],total:['Ҳамагӣ','Всего'],assessed:['Баҳогирифта','Оценено'],quality:['Натиҷа зиёда аз 7','Результат выше 7'],passed:['Натиҷа аз 4','Результат от 4'],qualityPct:['Сифат, %','Качество, %'],passPct:['Азхудкунӣ, %','Успеваемость, %'],
 preview:['Пешнамоиш','Предпросмотр'],close:['Пӯшидан','Закрыть'],clear:['Тоза кардан','Очистить'],print:['Чоп','Печать'],invalid:['Майдонҳо, синф ва вақтро санҷед.','Проверьте обязательные поля, класс и время.'],badTotals:['Шумораҳои давраро санҷед','Проверьте числа периода'],school:['Аввал мактабро интихоб кунед.','Сначала выберите школу.'],conflict:['Ҳампӯшии дарсҳо','Пересечение уроков'],empty:['Дар ин давра сабт нест.','За этот период нет записей.']};
const el=(tag,cls)=>{const x=document.createElement(tag);if(cls)x.className=cls;return x;};
const by=id=>document.getElementById(id);
export function setupOperations(article,panel,school){
 const id=article.dataset.cabinetId;
 const kinds=id==='school-education-quality'||id==='school-class-teacher'?['matrix']:['school-director','school-academic-deputy','school-primary-deputy'].includes(id)?['weekly','matrix']:[];
 if(!kinds.length)return;
 const words=key=>copy[key][document.documentElement.lang==='ru'?1:0];
 const labelPeriod=period=>words(period==='year'?'annual':period);
 const permanent=new Map(),transient=new Map(),pickers=[];
 function label(tag,key,cls,map=transient){const n=el(tag,cls);map.set(n,key);n.textContent=words(key);return n;}
 const actions=el('div','control');panel.append(actions);
 const holder=el('section','section operations-panel');holder.id='schoolOperations';holder.hidden=true;by('workspaceDocs').after(holder);
 let current=null,snapshot=null,output=null,status=null,statusMessage=null,trigger=null;
 const draftKey=k=>school()?.id?`smartmaktab.demo.ops-draft.v1.${school().id}.${id}.${k}`:null;
 function close(focus=false){holder.hidden=true;holder.replaceChildren();snapshot=null;statusMessage=null;holder.onlanguage=null;transient.clear();pickers.length=0;if(focus)closeWorkspaceView(holder.id);}
 for(const kind of kinds){const button=label('button',kind,'button alt',permanent);button.type='button';actions.append(button);button.addEventListener('click',()=>{trigger=button;open(kind);});}
 function open(kind){
  close();current=kind;
  const form=el('form','no-print'),heading=label('h2',kind);heading.tabIndex=-1;form.autocomplete='off';form.noValidate=true;
  form.append(heading,label('p','note','small'),label('p',kind==='weekly'?'details':'matrixNote','small'));
  const fields=el('div','school-fields');form.append(fields);
  function field(parent,key,{type='text',values=null,required=true,fieldId=key}={}){
   const l=el('label','field'),input=el(values?'select':'input');l.append(label('span',key),input);parent.append(l);input.dataset.operationField=fieldId;input.required=required;
   if(values)for(const option of values){const node=label('option',option);node.value=option;input.append(node);}else{input.type=type;if(type==='text')input.maxLength=100;if(type==='number'){input.min='0';input.max='9999';input.step='1';}}
   return input;
  }
  let saveDraft=()=>{};
  function classField(parent){const g=el('fieldset','class-form-field');g.append(label('legend','classCode'));const host=el('div');g.append(host);parent.append(g);const picker=mountClassPicker(host,{onChange:()=>{invalidate();saveDraft();}});pickers.push(picker);return picker;}
  function setStatus(fn){statusMessage=fn;status.textContent=fn?fn():'';}
  function invalidate(){snapshot=null;if(output)output.hidden=true;if(status)setStatus(null);}
  const year=kind==='matrix'?field(fields,'year'):null,subject=kind==='matrix'?field(fields,'subject'):null;
  let selectedClass,view,weekly=[],matrix={};
  if(kind==='weekly'){
   view=field(fields,'view',{values:['all',...weekDays]});const list=el('div'),add=label('button','add','button alt');add.type='button';form.append(list,add);
   function updateRows(){weekly.forEach((row,i)=>{row.caption.textContent=`${words('lesson')} ${i+1}`;row.remove.disabled=weekly.length<2;});add.disabled=weekly.length>=60;}
   function addRow(){if(weekly.length>=60)return;const box=el('fieldset','school-fields quarter-fields'),caption=el('legend');box.append(caption);list.append(box);
    const classPicker=classField(box),data={day:field(box,'day',{values:weekDays}),subject:field(box,'subject'),start:field(box,'start',{type:'time'}),end:field(box,'end',{type:'time'}),teacher:field(box,'teacher'),room:field(box,'room')};
    const remove=label('button','remove','button alt');remove.type='button';box.append(remove);const row={classPicker,data,remove,caption};weekly.push(row);
    remove.addEventListener('click',()=>{weekly=weekly.filter(x=>x!==row);for(const node of transient.keys())if(box.contains(node))transient.delete(node);box.remove();pickers.splice(pickers.indexOf(classPicker),1);updateRows();invalidate();saveDraft();add.focus();});updateRows();return row;
   }
   add.addEventListener('click',()=>{invalidate();addRow()?.classPicker?.focus?.();});
   let restoredWeekly=false;
   try{
    const saved=draftKey(kind)?JSON.parse(persistentStore.getItem(draftKey(kind))):null;
    if(saved&&typeof saved==='object'){
     if(typeof saved.view==='string')view.value=saved.view;
     if(Array.isArray(saved.rows)&&saved.rows.length){
      for(const r of saved.rows.slice(0,60)){
       const created=addRow();
       if(created){
        if(r.classCode)created.classPicker.set([r.classCode]);
        for(const [k,ctrl] of Object.entries(created.data))if(typeof r[k]==='string')ctrl.value=r[k];
       }
      }
      restoredWeekly=true;
     }
    }
   }catch{}
   if(!restoredWeekly)addRow();
   holder.onlanguage=updateRows;
  }else{
   holder.onlanguage=null;selectedClass=classField(fields);const grid=el('div','quality-edit-grid');form.append(grid);
   for(const period of matrixPeriods){const box=el('fieldset','quarter-fields');box.append(label('legend',period==='year'?'annual':period));grid.append(box);
    matrix[period]=['total','assessed','quality','passed'].map(k=>field(box,k,{type:'number',required:false,fieldId:`${period}-${k}`}));}
   try{
    const saved=draftKey(kind)?JSON.parse(persistentStore.getItem(draftKey(kind))):null;
    if(saved&&typeof saved==='object'){
     if(typeof saved.year==='string')year.value=saved.year;
     if(typeof saved.subject==='string')subject.value=saved.subject;
     if(saved.classCode)selectedClass.set([saved.classCode]);
     if(saved.matrix&&typeof saved.matrix==='object'){
      for(const period of matrixPeriods)if(Array.isArray(saved.matrix[period])){
       matrix[period].forEach((inp,i)=>{if(typeof saved.matrix[period][i]==='string')inp.value=saved.matrix[period][i];});
      }
     }
    }
   }catch{}
  }
  saveDraft=()=>{
   const dk=draftKey(kind);if(!dk)return;
   try{
    if(kind==='weekly'){
     const rows=weekly.map(r=>({classCode:r.classPicker.read()[0]||'',...Object.fromEntries(Object.entries(r.data).map(([k,v])=>[k,v.value]))}));
     persistentStore.setItem(dk,JSON.stringify({view:view.value,rows}));
    }else{
     const m=Object.fromEntries(Object.entries(matrix).map(([k,items])=>[k,items.map(x=>x.value)]));
     persistentStore.setItem(dk,JSON.stringify({year:year.value,subject:subject.value,classCode:selectedClass.read()[0]||'',matrix:m}));
    }
   }catch{}
  };
  const buttons=el('div','control'),submit=label('button','preview','button'),clearBtn=label('button','clear','button alt'),back=label('button','close','button alt');submit.type='submit';clearBtn.type='button';back.type='button';buttons.append(submit,clearBtn,back);
  clearBtn.addEventListener('click',()=>{const dk=draftKey(kind);if(dk)persistentStore.removeItem(dk);open(kind);});
  back.addEventListener('click',()=>close(true));
  status=el('p','notice');status.setAttribute('role','status');form.append(buttons,status);output=el('div','print-card report-sheet');output.id='operationsPrint';output.hidden=true;holder.append(form,output);holder.hidden=false;
  form.addEventListener('input',()=>{invalidate();saveDraft();});form.addEventListener('change',()=>{invalidate();saveDraft();});
  cabinetFormAction(form,submit,()=>{
   if(!school()){setStatus(()=>words('school'));return;}
   if(!form.reportValidity()){setStatus(()=>words('invalid'));return;}
   if(kind==='weekly'){
    const {sorted,conflicts,error}=checkWeekly(weekly.map(row=>({classCode:row.classPicker.read()[0],...Object.fromEntries(Object.entries(row.data).map(([k,v])=>[k,v.value.trim()]))})));
    if(error){setStatus(()=>words('invalid'));return;}
    if(conflicts.length){setStatus(()=>`${words('conflict')}: ${conflicts.slice(0,10).map(c=>`${c.first} ↔ ${c.second} (${c.fields.map(words).join(', ')})`).join('; ')}`);return;}
    snapshot={school:school().name,rows:sorted,view:view.value};
   }else{
    const code=selectedClass.read()[0];if(!year.value.trim()||!subject.value.trim()||!code){setStatus(()=>words('invalid'));return;}
    const {result,error}=checkMatrix(Object.fromEntries(Object.entries(matrix).map(([k,items])=>[k,items.map(x=>x.value)])));
    if(error){setStatus(()=>`${words('badTotals')}: ${labelPeriod(error)}`);return;}
    snapshot={school:school().name,year:year.value.trim(),subject:subject.value.trim(),classCode:code,result};
   }
   setStatus(null);draw();openWorkspaceView(output.id,submit);
  });openWorkspaceView(holder.id,trigger);
 }
 function draw(){
  if(!snapshot)return;output.replaceChildren();output.hidden=false;
  function add(tag,value,parent=output){const n=el(tag);n.textContent=value;parent.append(n);return n;}
  const heading=add('h3',words(current));heading.tabIndex=-1;add('p',snapshot.school);
  function table(headers,rows){const scroll=el('div','report-scroll'),t=el('table');scroll.append(t);output.append(scroll);
   const caption=el('caption');caption.textContent=words(current);t.append(caption);
   const thead=el('thead'),head=el('tr'),body=el('tbody');t.append(thead,body);thead.append(head);for(const h of headers){const x=add('th',h,head);x.scope='col';}
   for(const row of rows){const tr=el('tr');body.append(tr);row.forEach((x,i)=>{const cell=add(i?'td':'th',x,tr);if(!i)cell.scope='row';});}}
  if(current==='weekly'){
   add('p',words(snapshot.view));const rows=snapshot.rows.filter(row=>snapshot.view==='all'||snapshot.view===row.day);
   if(!rows.length)add('p',words('empty'));else table(['day','classCode','start','end','subject','teacher','room'].map(words),rows.map(row=>[words(row.day),row.classCode,row.start,row.end,row.subject,row.teacher,row.room]));
  }else{
   add('p',`${words('classCode')} ${snapshot.classCode} · ${snapshot.subject} · ${snapshot.year}`);
   const fmt=new Intl.NumberFormat(document.documentElement.lang==='ru'?'ru':'tg-TJ',{maximumFractionDigits:2});
   table([words('view'),...matrixPeriods.map(labelPeriod)],[['total','enrolled'],['assessed','assessed'],['quality','quality'],['passed','passed'],['qualityPct','qualityPercent'],['passPct','passPercent']].map(([key,prop])=>[words(key),...matrixPeriods.map(period=>snapshot.result[period]===null?'—':fmt.format(snapshot.result[period][prop]))]));
  }
  add('p',words('note')).className='small';const print=add('button',words('print'));print.className='button alt no-print';print.type='button';print.addEventListener('click',()=>printCabinetSheet(print));
 }
 document.addEventListener('cabinet:school',()=>close());
 document.addEventListener('cabinet:language',()=>{for(const [node,key] of [...permanent,...transient])node.textContent=words(key);pickers.forEach(p=>p.refresh());holder.onlanguage?.();if(statusMessage&&status)status.textContent=statusMessage();if(!document.body.classList.contains('sm-print-preview'))draw();});
}
