// Role-specific working controls and unified school directory helpers.
const fieldCopy={
 loading:['Загрузка дополнительных полей…','Майдонҳои иловагӣ бор мешаванд…'],
 failed:['Не удалось открыть дополнительные поля.','Майдонҳои иловагӣ кушода нашуданд.'],
 required:['Заполните обязательные поля анкеты.','Майдонҳои ҳатмиро пур кунед.'],
 experience:['Стаж директором должен быть не больше общего стажа.','Собиқаи директорӣ набояд аз собиқаи умумӣ зиёд бошад.'],
 none:['Школы не найдены.','Мактаб ёфт нашуд.'],
 same:['Как у основной должности','Мисли вазифаи асосӣ'],
 pick:['Выберите школу','Мактабро интихоб кунед'],
 class:['Классы, в которых вы преподаёте','Синфҳое, ки дарс медиҳед'],
 other:['Укажите другой язык.','Забони дигарро нависед.'],
};
const fp=key=>fieldCopy[key][lang==='tg'?1:0];
const docsForRole=new Map();
const SKIP_DUPLICATE_KEYS=new Set([
 'first','last','directorFirst','directorLast','directorMiddle','directorBirth',
 'directorGender','directorSpecialty','directorEduYears','directorDiploma','directorOtherLanguage',
]);
const localize=node=>{if(lang==='tg')for(const element of node.querySelectorAll('[data-tg]'))element.textContent=element.dataset.tg;};
function dataForRole(id){let fields=state.fields.get(id);if(!fields){fields=Object.create(null);state.fields.set(id,fields);}return fields;}
function roleDoc(id,pack){
 if(!docsForRole.has(id))docsForRole.set(id,new DOMParser().parseFromString(pack.routes[roster.get(id).path].html,'text/html'));
 return docsForRole.get(id);
}
function cloneControl(original,parent,fields,key,validators){
 if(!original)return null;
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
 if(id==='school-director'){
  cloneControl(doc.getElementById('directorLeadYears'),grid,fields,'directorLeadYears',validators);
  cloneControl(doc.getElementById('directorUniversity'),grid,fields,'directorUniversity',validators);
  cloneControl(doc.getElementById('directorCategory'),grid,fields,'directorCategory',validators);
  cloneControl(doc.getElementById('directorType'),grid,fields,'directorType',validators);
  cloneControl(doc.getElementById('directorShifts'),grid,fields,'directorShifts',validators);
  validators.push(()=>{
   if(Number(fields.directorLeadYears||0)>Number(state.person.eduYears||0))return fp('experience');
   return null;
  });
 }else{
  for(const control of original.querySelectorAll('input:not([type=checkbox]),select,textarea')){
   const key=control.dataset.intakeField??control.id;
   if(!key||SKIP_DUPLICATE_KEYS.has(key))continue;
   cloneControl(control,grid,fields,key,validators);
  }
  for(const host of original.querySelectorAll('[data-role-class]')){
   const title=host.previousElementSibling?.querySelector('[data-tg]');
   addClassControls(groups,fields,host.dataset.field,host.dataset.roleClass==='multi',lang==='tg'?title?.dataset.tg:title?.textContent,validators);
  }
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
 if(!grid.children.length)grid.hidden=true;
 if(!groups.children.length)groups.hidden=true;
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
 return container?.dataset.roleReady==='yes'?container.validateSetup?.()??null:null;
}
const DEFAULT_REGIONS=['Душанбе','Вилояти Суғд','Вилояти Хатлон','ВМКБ','Ноҳияҳои тобеи ҷумҳурӣ'];
function readLocalCustomSchools(){
 try{const v=JSON.parse(localStorage.getItem('smartmaktab.custom_schools.v1')||'[]');return Array.isArray(v)?v:[];}catch{return [];}
}
function buildMergedSchoolCatalog(){
 const cloud=Array.isArray(state.cloudSchools)?state.cloudSchools:[];
 const localCustom=readLocalCustomSchools();
 const base=cloud.length
  ? cloud.map(s=>({
     id:s.id,
     name:s.name+(s.district_name?` (${s.district_name})`:''),
     isCloud:true,
     raw:s,
    }))
  : schoolIds.map(id=>({id,name:schoolNames[id],isCloud:false,raw:null}));
 const seen=new Set(base.map(b=>b.id));
 for(const c of localCustom){
  if(c?.id&&!seen.has(c.id)){
   base.push({id:c.id,name:c.name+(c.district_name?` (${c.district_name})`:''),isCloud:false,raw:c});
  }
 }
 return base;
}
function filterMergedSchools(term){
 const q=String(term||'').trim().toLocaleLowerCase();
 const all=buildMergedSchoolCatalog();
 if(!q)return all;
 return all.filter(s=>s.name.toLocaleLowerCase().includes(q)||(s.raw?.school_code||'').toLocaleLowerCase().includes(q));
}
function resolveSchoolTitle(schoolId){
 const cloud=Array.isArray(state.cloudSchools)?state.cloudSchools.find(s=>s.id===schoolId):null;
 if(cloud)return cloud.name;
 const custom=readLocalCustomSchools().find(s=>s.id===schoolId);
 if(custom)return custom.name;
 return schoolNames[schoolId]||schoolId;
}
function populateNewSchoolTerritory(){
 const regSel=$('newSchoolRegion'),distList=$('newSchoolDistrictList');
 if(!regSel||!distList)return;
 const auths=Array.isArray(state.cloudAuthorities)?state.cloudAuthorities:[];
 const regions=[...new Set([...auths.map(a=>a.region_name).filter(Boolean),...DEFAULT_REGIONS])];
 const prevReg=regSel.value||state.newSchool?.region_name||'';
 regSel.replaceChildren(new Option(fp('pick'),''),...regions.map(r=>new Option(r,r)));
 if(regions.includes(prevReg))regSel.value=prevReg;
 const curReg=regSel.value;
 const districts=[...new Set(auths.filter(a=>a.authority_tier==='maorif'&&(!curReg||a.region_name===curReg)).map(a=>a.district_name).filter(Boolean))];
 distList.replaceChildren(...districts.map(d=>Object.assign(document.createElement('option'),{value:d})));
}
function canSubmitStep4(){
 if(state.creatingNewSchool){
  return Boolean(clean(state.newSchool?.region_name)&&clean(state.newSchool?.district_name)&&clean(state.newSchool?.name).length>=2);
 }
 return Boolean(state.school);
}
function fillSchoolChoices(){
 const choice=$('schoolChoice'),items=filterMergedSchools($('schoolSearch').value);
 const previous=choice.value;
 choice.replaceChildren(new Option(fp('pick'),''),...items.map(s=>new Option(s.name,s.id)));
 const validIds=new Set(items.map(s=>s.id));
 choice.value=validIds.has(previous||state.school)?(previous||state.school):(items.length===1?items[0].id:'');
 state.school=choice.value;
 $('schoolNotice').textContent=items.length?'':fp('none');
 populateNewSchoolTerritory();
 $('begin').disabled=!canSubmitStep4();
}
function renderExtraSchools(){
 const list=$('extraSchools'),all=buildMergedSchoolCatalog();
 list.replaceChildren(...state.extras.map(id=>{
  const item=el('label',undefined,'field'),select=el('select');select.dataset.schoolFor=id;
  select.replaceChildren(new Option(fp('same'),''),...all.map(s=>new Option(s.name,s.id)));
  select.value=state.schools[id]??'';select.addEventListener('change',()=>{state.schools[id]=select.value;});
  item.append(el('span',roster.get(id)?.title||id),select);return item;
 }));
 $('extraSchoolBlock').hidden=!state.extras.length;
}
function buildRolePayload(role,school,fields,personObj){
 const roleKey=`smartmaktab.demo.role-setup.v3.${role.id}`;
 const first=clean(personObj.first||'');
 const last=clean(personObj.last||'');
 const enriched={
  ...fields,
  directorMiddle:personObj.middle||fields.directorMiddle||'',
  directorBirth:personObj.birthYear||fields.directorBirth||'',
  directorGender:personObj.gender||fields.directorGender||'',
  directorSpecialty:personObj.specialty||fields.directorSpecialty||'',
  directorEduYears:personObj.eduYears||fields.directorEduYears||'',
  directorDiploma:(personObj.education==='higher'?'specialist':personObj.education)||fields.directorDiploma||'',
  directorLanguages:Array.isArray(personObj.languages)?personObj.languages:(fields.directorLanguages||[]),
  directorOtherLanguage:personObj.otherLanguage||fields.directorOtherLanguage||'',
 };
 const payload={[roleKey]:JSON.stringify({school,first,last,fields:enriched,expires:Date.now()+300000})};
 if(role.id==='school-teacher')payload[`smartmaktab.demo.teacher.v1.${school}`]=JSON.stringify({teaching:fields.teacherTeaching,language:fields.instructionLanguage});
 if(role.id==='school-library-head')payload[`smartmaktab.demo.library.v1.${school}`]=JSON.stringify({zone:fields.libraryZone,funds:fields.libraryFunds});
 if(role.id==='school-director')payload[`smartmaktab.demo.director.v1.${school}`]=JSON.stringify({type:fields.directorType,shifts:fields.directorShifts});
 return payload;
}
