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
function formatSchoolAddress(s){
 return [s?.district_name,s?.jamoat_name,s?.village_name].filter(Boolean).join(', ');
}
function buildMergedSchoolCatalog(){
 const cloudReady=state.bootstrapStatus==='ready'&&Array.isArray(state.cloudSchools);
 const cloud=Array.isArray(state.cloudSchools)?state.cloudSchools:[];
 const hasLogin=Boolean(clean(state.credentials?.login)&&state.credentials?.password);
 const localCustom=readLocalCustomSchools();
 const base=cloudReady
  ? cloud.map(s=>{
     const addr=formatSchoolAddress(s);
     return {
      id:s.id,
      name:s.name+(addr?` (${addr})`:''),
      isCloud:true,
      raw:s,
     };
    })
  : (hasLogin?[]:schoolIds.map(id=>({id,name:schoolNames[id],isCloud:false,raw:null})));
 const seen=new Set(base.map(b=>b.id));
 for(const c of localCustom){
  if(c?.id&&!seen.has(c.id)){
   const addr=formatSchoolAddress(c);
   base.push({id:c.id,name:c.name+(addr?` (${addr})`:''),isCloud:false,raw:c});
  }
 }
 return base;
}
function filterMergedSchools(term){
 const q=String(term||'').trim().toLocaleLowerCase();
 const all=buildMergedSchoolCatalog();
 if(!q)return all;
 return all.filter(s=>s.name.toLocaleLowerCase().includes(q)||(s.raw?.school_code||'').toLocaleLowerCase().includes(q)||(s.raw?.jamoat_name||'').toLocaleLowerCase().includes(q)||(s.raw?.village_name||'').toLocaleLowerCase().includes(q));
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
 const jamSel=$('newSchoolJamoatSelect'),jamCustomWrap=$('newSchoolJamoatCustomWrap');
 const vilSel=$('newSchoolVillageSelect'),vilCustomWrap=$('newSchoolVillageCustomWrap');
 if(!regSel||!distList)return;
 const auths=Array.isArray(state.cloudAuthorities)?state.cloudAuthorities:[];
 const locs=Array.isArray(state.cloudLocations)&&state.cloudLocations.length?state.cloudLocations:null;
 const regionSet=new Set(DEFAULT_REGIONS);
 for(const a of auths){
  if(!a.region_name)continue;
  const c=canonicalRegionName(a.region_name);
  if(![...regionSet].some(r=>canonicalRegionName(r)===c))regionSet.add(a.region_name);
 }
 if(locs){
  for(const r of getRegionNames(locs)){
   if(![...regionSet].some(x=>canonicalRegionName(x)===canonicalRegionName(r)))regionSet.add(r);
  }
 }
 const regions=[...regionSet];
 const prevReg=regSel.value||state.newSchool?.region_name||'';
 regSel.replaceChildren(new Option(fp('pick'),''),...regions.map(r=>new Option(r,r)));
 const matchingReg=regions.find(r=>r===prevReg||canonicalRegionName(r)===canonicalRegionName(prevReg));
 if(matchingReg)regSel.value=matchingReg;
 const curReg=regSel.value;
 const canonReg=canonicalRegionName(curReg);

 const districts=[...new Set([
  ...getDistrictNames(curReg,locs||undefined),
  ...auths.filter(a=>a.authority_tier==='maorif'&&(!canonReg||canonicalRegionName(a.region_name)===canonReg)).map(a=>a.district_name).filter(Boolean),
 ])];
 distList.replaceChildren(...districts.map(d=>Object.assign(document.createElement('option'),{value:d})));

 if(!jamSel||!vilSel)return;
 const curDist=clean($('newSchoolDistrict')?.value||state.newSchool?.district_name||'');
 const jamoats=curDist?getJamoatsForDistrict(curReg,curDist,locs||undefined):[];
 const otherLbl=lang==='tg'?'Дигар (дастӣ ворид кардан)':'Другой (ввести вручную)';
 const pickOptLbl=lang==='tg'?'Интихоб кунед (ихтиёрӣ)':'Выберите (необязательно)';
 const jamPrev=jamSel.value;
 jamSel.replaceChildren(
  new Option(pickOptLbl,''),
  ...jamoats.map(j=>new Option(j,j)),
  new Option(otherLbl,'__custom__'),
 );
 if(jamPrev&&(jamPrev==='__custom__'||jamoats.includes(jamPrev)))jamSel.value=jamPrev;
 else if(state.newSchool?.jamoat_name&&jamoats.includes(state.newSchool.jamoat_name))jamSel.value=state.newSchool.jamoat_name;
 else if(state.newSchool?.jamoat_name&&jamSel.value==='')jamSel.value='__custom__';
 const isCustomJam=jamSel.value==='__custom__';
 if(jamCustomWrap)jamCustomWrap.hidden=!isCustomJam;

 const curJam=isCustomJam?clean($('newSchoolJamoatCustom')?.value):jamSel.value;
 const villages=(curDist&&curJam&&!isCustomJam)?getVillagesForJamoat(curReg,curDist,curJam,locs||undefined):[];
 const vilPrev=vilSel.value;
 vilSel.replaceChildren(
  new Option(pickOptLbl,''),
  ...villages.map(v=>new Option(v,v)),
  new Option(otherLbl,'__custom__'),
 );
 if(vilPrev&&(vilPrev==='__custom__'||villages.includes(vilPrev)))vilSel.value=vilPrev;
 else if(state.newSchool?.village_name&&villages.includes(state.newSchool.village_name))vilSel.value=state.newSchool.village_name;
 else if(state.newSchool?.village_name&&vilSel.value==='')vilSel.value='__custom__';
 const isCustomVil=vilSel.value==='__custom__';
 if(vilCustomWrap)vilCustomWrap.hidden=!isCustomVil;
}
function canSubmitStep4(){
 if(state.creatingNewSchool){
  return Boolean(clean(state.newSchool?.region_name)&&clean(state.newSchool?.district_name)&&clean(state.newSchool?.name).length>=2);
 }
 return Boolean(state.school);
}
function findCloudSchoolMatch(schoolIdOrTitle){
 const cloud=Array.isArray(state.cloudSchools)?state.cloudSchools:[];
 if(!cloud.length||!schoolIdOrTitle)return null;
 const rawTitle=resolveSchoolTitle(schoolIdOrTitle);
 const norm=s=>String(s||'').trim().toLocaleLowerCase().replace(/\s+/g,' ');
 const target=norm(rawTitle);
 return cloud.find(s=>norm(s.name)===target)||null;
}
function fillSchoolChoices(){
 const choice=$('schoolChoice'),items=filterMergedSchools($('schoolSearch').value);
 const previous=choice.value||state.school;
 choice.replaceChildren(new Option(fp('pick'),''),...items.map(s=>new Option(s.name,s.id)));
 const validIds=new Set(items.map(s=>s.id));
 let nextVal='';
 if(validIds.has(previous)){
  nextVal=previous;
 }else if(previous&&!/^[0-9a-f-]{36}$/i.test(previous)){
  const matched=findCloudSchoolMatch(previous);
  if(matched&&validIds.has(matched.id))nextVal=matched.id;
 }
 if(!nextVal&&items.length===1)nextVal=items[0].id;
 choice.value=nextVal;
 state.school=choice.value;
 const hasCloudConnection=state.bootstrapStatus==='ready'&&Array.isArray(state.cloudSchools);
 const hasCloudSchools=hasCloudConnection&&state.cloudSchools.length>0;
 const hasLogin=Boolean(clean(state.credentials?.login)&&state.credentials?.password);
 const retryBtn=$('retryBootstrapBtn');
 if(retryBtn)retryBtn.hidden=useFileViewer||hasCloudConnection;
 const demoWarn=$('demoModeWarning');
 if(demoWarn)demoWarn.hidden=hasLogin;
 const diag=state.bootstrapError?` (${state.bootstrapError})`:'';
 let notice='';
 if(!items.length){
  if(hasCloudConnection&&!hasCloudSchools){
   notice=lang==='tg'
    ?'Дар пойгоҳи додаҳо ҳанӯз мактаб илова нашудааст. Тугмаи «Мактаби мо дар рӯйхат нест — Илова кардан»-ро пахш кунед.'
    :'В базе данных школы ещё не добавлены. Нажмите «Нашей школы нет в списке — Добавить», чтобы зарегистрировать вашу школу.';
  }else if(!useFileViewer&&!hasCloudConnection&&hasLogin){
   if(state.bootstrapStatus==='loading'){
    notice=lang==='tg'?'Рӯйхати мактабҳо аз сервер бор мешавад…':'Загрузка списка школ с сервера…';
   }else{
    notice=lang==='tg'
     ?`Рӯйхати мактабҳо аз сервер бор нашуд${diag}. «Аз нав бор кардан»-ро пахш кунед ё мактабатонро дастӣ илова кунед.`
     :`Не удалось загрузить список школ с сервера${diag}. Нажмите «Повторить» при включённом интернете или добавьте школу вручную ниже.`;
   }
  }else{
   notice=fp('none');
  }
 }else if(!useFileViewer&&!hasCloudConnection){
  if(state.bootstrapStatus==='loading'){
   notice=lang==='tg'?'Рӯйхати мактабҳо аз сервер бор мешавад…':'Загрузка списка школ с сервера…';
  }else if(hasLogin){
   notice=lang==='tg'
    ?`Рӯйхати мактабҳо аз сервер бор нашуд${diag}. «Аз нав бор кардан»-ро пахш кунед ё мактабатонро дастӣ илова кунед.`
    :`Не удалось загрузить список школ с сервера${diag}. Нажмите «Повторить» при включённом интернете или добавьте школу вручную ниже.`;
  }else{
   notice=lang==='tg'?'Пайваст бо сервер нест — мактабҳои демо нишон дода шудаанд.':'Сервер школ недоступен — показаны локальные демо-школы.';
  }
 }
 $('schoolNotice').textContent=notice;
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
