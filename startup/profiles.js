// These forms are built from the same physical cabinet fields as Settings.
const fieldCopy={loading:['Загрузка полей анкеты…','Майдонҳои варақа бор мешаванд…'],failed:['Не удалось открыть анкету. Обновите страницу.','Варақа кушода нашуд. Саҳифаро бозбор кунед.'],
 required:['Заполните обязательные поля анкеты.','Майдонҳои ҳатмиро пур кунед.'],experience:['Стаж директором должен быть не больше общего стажа.','Собиқаи директорӣ набояд аз собиқаи умумӣ зиёд бошад.'],
 course:['Проверьте название и даты курса: окончание не раньше начала.','Ном ва санаҳои курсро санҷед: анҷом пас аз оғоз бошад.'],none:['Школы не найдены.','Мактаб ёфт нашуд.'],same:['Как у основной должности','Мисли вазифаи асосӣ'],
 pick:['Выберите школу','Мактабро интихоб кунед'],optionalCourse:['Последний курс повышения квалификации (необязательно)','Курси охирини такмили ихтисос (ихтиёрӣ)'],
 class:['Классы, в которых вы преподаёте','Синфҳое, ки дарс медиҳед'],other:['Укажите другой язык.','Забони дигарро нависед.'],dates:['Укажите годы после года рождения.','Солҳои пас аз таваллудро ворид кунед.']};
const fp=key=>fieldCopy[key][lang==='tg'?1:0];
const docsForRole=new Map();
const localize=node=>{if(lang==='tg')for(const element of node.querySelectorAll('[data-tg]'))element.textContent=element.dataset.tg;};
function dataForRole(id){let fields=state.fields.get(id);if(!fields){fields=Object.create(null);state.fields.set(id,fields);}return fields;}
function roleDoc(id,pack){
 if(!docsForRole.has(id))docsForRole.set(id,new DOMParser().parseFromString(pack.routes[roster.get(id).path].html,'text/html'));
 return docsForRole.get(id);
}
function cloneControl(original,parent,fields,key,validators){
 const label=original.closest('label').cloneNode(true),input=label.querySelector('input,select,textarea');
 label.removeAttribute('for');label.removeAttribute('hidden');input.removeAttribute('id');input.removeAttribute('name');input.dataset.setupField=key;
 if(/^director(Birth|Graduation|Attestation|Appointed)$/.test(key))input.max=String(new Date().getFullYear());
 input.value=typeof fields[key]==='string'?fields[key]:'';
 input.addEventListener('input',()=>{fields[key]=input.value;});
 input.addEventListener('change',()=>{fields[key]=input.value;});
 if(input.required)validators.push(()=>!input.value.trim()?fp('required'):null);
 localize(label);parent.append(label);return input;
}
function addClassControls(parent,fields,key,multiple,caption,validators,required=true){
 const area=el('div',undefined,'class-field'),title=el('strong',caption),host=el('div');host.dataset.setupClass=key;area.append(title,host);parent.append(area);
 const picker=mountClassPicker(host,{multiple,value:fields[key]??[],onChange:values=>{fields[key]=values;}});
 if(required)validators.push(()=>picker.read().length?null:fp('required'));
}
function addCheckGroup(parent,group,fields,key,validators,required=false){
 if(!group)return;
 const box=el('fieldset',undefined,'choice-set'),title=group.parentElement.querySelector('legend')?.cloneNode(true)??el('legend',group.id);
 if(lang==='tg'&&title.dataset.tg)title.textContent=title.dataset.tg;
 const items=el('div',undefined,'checkboxes');box.append(title,items);parent.append(box);
 const values=new Set(Array.isArray(fields[key])?fields[key]:[]);
 for(const source of group.querySelectorAll('label')){
  const node=source.cloneNode(true),input=node.querySelector('input');if(!input)continue;
  input.checked=values.has(input.value);input.dataset.setupGroup=key;
  input.addEventListener('change',()=>{if(input.checked)values.add(input.value);else values.delete(input.value);fields[key]=[...values];});
  localize(node);items.append(node);
 }
 if(required)validators.push(()=>values.size?null:fp('required'));
}
function fillProfileFields(id,container,doc){
 const fields=dataForRole(id),validators=[],grid=el('div',undefined,'inputs'),groups=el('div',undefined,'profile-groups');
 container.replaceChildren(grid,groups);container.dataset.roleReady='yes';
 const original=doc.querySelector(id==='school-director'?'#directorPersonnelForm':'#roleIntakeForm');
 if(!original){container.dataset.roleReady='no';return;}
 for(const control of original.querySelectorAll('input:not([type=checkbox]),select,textarea')){
  const key=control.dataset.intakeField??control.id;
  if(!key||['first','last','directorFirst','directorLast'].includes(key))continue;
  cloneControl(control,grid,fields,key,validators);
 }
 for(const host of original.querySelectorAll('[data-role-class]')){
  const title=host.previousElementSibling?.querySelector('[data-tg]');
  addClassControls(groups,fields,host.dataset.field,host.dataset.roleClass==='multi',lang==='tg'?title?.dataset.tg:title?.textContent,validators);
 }
 if(id==='school-director'){
  addCheckGroup(groups,doc.getElementById('directorLanguages'),fields,'directorLanguages',validators);
  addCheckGroup(groups,doc.getElementById('directorAchievements'),fields,'directorAchievements',validators);
  for(const key of ['directorType','directorShifts'])cloneControl(doc.getElementById(key),grid,fields,key,validators);
  const courses=el('details',undefined,'choice-set'),heading=el('summary',fp('optionalCourse')),content=el('div',undefined,'inputs');
  courses.append(heading,content);groups.append(courses);
  for(const key of ['directorCourseTitle','directorCourseProvider','directorCourseStart','directorCourseEnd','directorCourseCompletion']){
   const source=doc.getElementById(key);source.required=false;const input=cloneControl(source,content,fields,key,validators);
   if(input instanceof HTMLSelectElement&&!fields[key]){input.value='completed';fields[key]='completed';}
  }
  validators.push(()=>{
   if(Number(fields.directorLeadYears)>Number(fields.directorEduYears))return fp('experience');
   if(['directorGraduation','directorAttestation','directorAppointed'].some(key=>fields[key]&&Number(fields[key])<=Number(fields.directorBirth)))return fp('dates');
   if(fields.directorLanguages?.includes('other')&&!fields.directorOtherLanguage?.trim())return fp('other');
   const {directorCourseTitle:title,directorCourseStart:start,directorCourseEnd:end,directorCourseProvider:provider}=fields;
   if(title||start||end||provider){if(!title?.trim()||!start||!end||end<start)return fp('course');
    const today=new Date();const iso=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    if(fields.directorCourseCompletion!=='planned'&&end>iso)return fp('course');}
   return null;
  });
 }
 if(id==='school-teacher'){
  const area=el('div',undefined,'class-field'),host=el('div');host.dataset.setupClass='teacherClasses';area.append(el('strong',fp('class')),host);groups.append(area);
  const editor=mountTeachingEditor(host,{value:fields.teacherTeaching,legacy:fields.teacherClasses,onChange:rows=>{fields.teacherTeaching=rows;}});
  validators.push(()=>editor.read().length&&!editor.missing().length?null:fp('required'));
  cloneControl(doc.getElementById('instructionLanguage'),grid,fields,'instructionLanguage',validators);
 }
 if(id==='school-library-head'){
  cloneControl(doc.getElementById('libraryZone'),grid,fields,'libraryZone',validators);
  addCheckGroup(groups,doc.querySelector('#libraryProfile .class-choices'),fields,'libraryFunds',validators,true);
 }
 container.validateSetup=()=>validators.reduce((error,validate)=>error??validate(),null);
}
async function mountRoleFields(id,container){
 container.dataset.setupRole=id;container.dataset.roleReady='no';container.textContent=fp('loading');
 const request=Symbol();container.setupRequest=request;
 try{
  const pack=await getPack();if(container.setupRequest!==request||!container.isConnected)return;
  const doc=roleDoc(id,pack);fillProfileFields(id,container,doc);
 }catch{if(container.setupRequest===request)container.textContent=fp('failed');}
}
function checkRoleFields(container){
 return container?.dataset.roleReady==='yes'?container.validateSetup?.()??null:fp('required');
}
function fillSchoolChoices(){
 const choice=$('schoolChoice'),ids=findDemoSchools($('schoolSearch').value);
 const previous=choice.value;
 choice.replaceChildren(new Option(fp('pick'),''),...ids.map(id=>new Option(schoolNames[id],id)));
 choice.value=ids.includes(previous||state.school)?previous||state.school:ids.length===1?ids[0]:'';
 state.school=choice.value;$('schoolNotice').textContent=ids.length?'':fp('none');$('begin').disabled=!state.school;
}
function renderExtraSchools(){
 const list=$('extraSchools');list.replaceChildren(...state.extras.map(id=>{
  const item=el('label',undefined,'field'),select=el('select');select.dataset.schoolFor=id;
  select.replaceChildren(new Option(fp('same'),''),...schoolIds.map(id=>new Option(schoolNames[id],id)));
  select.value=state.schools[id]??'';select.addEventListener('change',()=>{state.schools[id]=select.value;});
  item.append(el('span',roster.get(id).title),select);return item;
 }));
 $('extraSchoolBlock').hidden=!state.extras.length;
}
function buildRolePayload(role,school,fields,first,last){
 const roleKey=`smartmaktab.demo.role-setup.v3.${role.id}`;
 const payload={[roleKey]:JSON.stringify({school,first,last,fields,expires:Date.now()+300000})};
 if(role.id==='school-teacher')payload[`smartmaktab.demo.teacher.v1.${school}`]=JSON.stringify({teaching:fields.teacherTeaching,language:fields.instructionLanguage});
 if(role.id==='school-library-head')payload[`smartmaktab.demo.library.v1.${school}`]=JSON.stringify({zone:fields.libraryZone,funds:fields.libraryFunds});
 if(role.id==='school-director')payload[`smartmaktab.demo.director.v1.${school}`]=JSON.stringify({type:fields.directorType,shifts:fields.directorShifts});
 return payload;
}
