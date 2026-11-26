import {getLanguage,saveLanguage} from './language.mjs';
import {setupWorkspace} from './workspace-page.mjs';
import {mountClassPicker} from './class-picker.mjs';
import {validSchools,schoolNames,findDemoSchools} from './schools.mjs';
import {installTheme} from './theme.mjs';
import {viewerContext,offlineViewer,tabStorage,persistentStore,saveActiveResume,cabinetPageURL,appRoot as root,openCabinetView,cabinetFormAction,publishTheme,publishLanguage} from './cabinet-runtime.mjs';
const $ = id => document.getElementById(id);
export {schoolNames as demoSchoolNames,findDemoSchools} from './schools.mjs';
export const teacherWorkplacesKey='smartmaktab.demo.teacher-workplaces.v1';
export function readTeacherWorkplaces(){
  try{ const value=JSON.parse(tabStorage.getItem(teacherWorkplacesKey));return Array.isArray(value)?[...new Set(value.filter(id=>validSchools.has(id)))]:[]; }catch{return [];}
}
const searchParams=cabinetPageURL.searchParams;
let lang=getLanguage(searchParams.get('lang'));
const texts=[...document.querySelectorAll('[data-tg]')].map(node=>[node,node.textContent]);
const placeholders=[...document.querySelectorAll('[data-tg-placeholder]')].map(node=>[node,node.placeholder]);
const dict={
  selectSchool:['Сначала выберите школу, затем откройте её кабинет.','Аввал мактабро интихоб кунед, баъд утоқи онро кушоед.'],
  noResults:['Пункты не найдены. Попробуйте другой запрос.','Натиҷа ёфт нашуд. Калимаи дигарро ҷустуҷӯ кунед.'],
  count:['Показано страниц: ','Саҳифаҳои намоён: '],
  noneSchool:['Школа не выбрана','Мактаб интихоб нашудааст']
};
const t=key=>dict[key][lang==='tg'?1:0];
const section=$('cabinetSection'), query=$('cabinetQuery');
const listLinks=[...document.querySelectorAll('[data-cabinet-link]')];
const sections=[...document.querySelectorAll('[data-cabinet-section]')];
const listPath=new Map(listLinks.map(link=>[link,link.getAttribute('href')]));
const backLinks=[...document.querySelectorAll('a[href*="onboarding/index.html"]')];
const baseBack=new Map(backLinks.map(link=>[link,link.getAttribute('href')]));
const profileKey='smartmaktab.profile.v1';
function readSavedProfile(){
  try{const raw=persistentStore.getItem(profileKey)||tabStorage.getItem(profileKey);return raw?JSON.parse(raw):null;}catch{return null;}
}
function isUuid(v){return typeof v==='string'&&/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|custom-[a-z0-9-]+)$/i.test(v);}
const urlSchool=searchParams.get('school')||'';
const savedProf=readSavedProfile();
let fromURL=validSchools.has(urlSchool)?urlSchool:(isUuid(urlSchool)?urlSchool:(isUuid(savedProf?.organizationId)?savedProf.organizationId:''));
function schoolDisplayName(id){
  if(!id)return '';
  if(schoolNames[id])return schoolNames[id];
  try{
    const customs=JSON.parse(persistentStore.getItem('smartmaktab.custom_schools.v1')||'[]');
    const hit=Array.isArray(customs)?customs.find(x=>x.id===id):null;
    if(hit?.name)return hit.name;
  }catch{}
  const prof=readSavedProfile();
  if(prof?.organizationId===id&&prof?.organizationName)return prof.organizationName;
  return id;
}
export let selectedDemoSchool=fromURL ? Object.freeze({id:fromURL,name:schoolDisplayName(fromURL)}) : null;
const cabinet=document.querySelector('[data-cabinet-id]');
const themeButton=cabinet?document.createElement('button'):null;
if(themeButton){themeButton.id='themeToggle';themeButton.type='button';themeButton.className='theme-toggle';$('cabinetLang').before(themeButton);}
const theme=themeButton?installTheme(themeButton,{initial:viewerContext?.theme,onChange:publishTheme}):null;
const workspaceKey='smartmaktab.demo.workspace.v1';
function getWorkspace(){
  if(!cabinet)return null;
  try{
    const data=JSON.parse(tabStorage.getItem(workspaceKey));
    const assigned=data?.schools?.[cabinet.dataset.cabinetId]??'';
    const teacherAlternate=cabinet.dataset.cabinetId==='school-teacher'&&readTeacherWorkplaces().includes(fromURL);
    if(!data||(assigned!==fromURL&&!(isUuid(assigned)&&!fromURL)&&!teacherAlternate)||!Array.isArray(data.roles)||data.roles.length<1||data.roles.length>20||data.roles[0]?.id!==data.primary)return null;
    if(!data.roles.every(role=>role&&typeof role.id==='string'&&typeof role.title==='string'&&role.title.length<=150&&
      typeof role.path==='string'&&/^cabinets\/(?:[a-z-]+\/)*[a-z-]+\.html$/.test(role.path)))return null;
    if(new Set(data.roles.map(role=>role.path)).size!==data.roles.length)return null;
    const current=data.roles.find(role=>role.id===cabinet.dataset.cabinetId&&new URL(role.path,root).pathname===cabinetPageURL.pathname);
    return current?data:null;
  }catch{return null;}
}
const workspace=getWorkspace();
function currentResumeRoute(){
  if(!cabinet)return '';
  const rel=(cabinetPageURL.pathname.startsWith(root.pathname)?cabinetPageURL.pathname.slice(root.pathname.length):cabinetPageURL.pathname).replace(/^\//,'');
  const params=new URLSearchParams();
  if(fromURL)params.set('school',fromURL);
  params.set('lang',lang);
  return `${rel}?${params.toString()}`;
}
if(workspace&&cabinet){saveActiveResume({role:cabinet.dataset.cabinetId,school:fromURL,lang,route:currentResumeRoute()});}
const switcher=workspace&&workspace.roles.length>1?document.createElement('select'):null;
const switchLabel=switcher?document.createElement('label'):null;
const switchCaption=switcher?document.createElement('span'):null;
if(switcher){
  switcher.id='workspaceSwitch';switcher.className='lang-select';switchLabel.className='workspace-switch';
  switchLabel.append(switchCaption,switcher);$('cabinetLang')?.before(switchLabel);
  switcher.addEventListener('change',()=>{
    const selected=workspace.roles.find(role=>role.id===switcher.value);
    if(!selected||selected.id===cabinet.dataset.cabinetId)return;
    const dest=new URL(selected.path,root);
    const target=workspace.schools?.[selected.id];
    if(validSchools.has(target)||isUuid(target))dest.searchParams.set('school',target);
    dest.searchParams.set('lang',lang);
    openCabinetView(dest);
  });
}
function refreshSwitcher(){
  if(!switcher)return;
  switchCaption.textContent=lang==='tg'?'Утоқҳои ман':'Мои кабинеты';
  switcher.replaceChildren(...workspace.roles.map(role=>new Option(role.title+(role.id===workspace.primary?(lang==='tg'?' · асосӣ':' · основной'):''),role.id)));
  switcher.value=cabinet.dataset.cabinetId;
}
if(cabinet)for(const link of backLinks)link.hidden=true;
function refreshLinks(){
  const chosen=cabinet?fromURL:'';
  for(const [link,original] of [...listPath,...baseBack]) {
    const dest=new URL(original,cabinetPageURL);
    dest.searchParams.set('lang',lang);
    if(chosen && (!link.dataset.group || link.dataset.group==='school')) dest.searchParams.set('school',chosen);
    link.href=dest;
  }
  const brand=document.querySelector('.brand');
  if(cabinet&&brand){
    const setupDest=new URL('index.html',root);
    setupDest.searchParams.set('setup','1');
    setupDest.searchParams.set('lang',lang);
    brand.href=setupDest;
  }
}
function refreshDirectory(){
  if(!section) return;
  const term=query.value.trim().toLocaleLowerCase();
  let count=0;
  for(const group of sections){
    let found=0;
    const active=section.value==='all'||section.value===group.dataset.cabinetSection;
    for(const entry of group.querySelectorAll('[data-cabinet-entry]')){
      entry.hidden=!active||!entry.textContent.toLocaleLowerCase().includes(term);
      if(!entry.hidden) found++;
    }
    group.hidden=!found;
    count+=found;
  }
  $('directoryStatus').textContent=count?(t('count')+count):t('noResults');
}
function applyLanguage(){
  document.documentElement.lang=lang;theme?.refresh();
  if($('cabinetLang')) $('cabinetLang').value=lang;
  for(const [node,ru] of texts) node.textContent=lang==='tg'?node.dataset.tg:ru;
  for(const [node,ru] of placeholders)node.placeholder=lang==='tg'?node.dataset.tgPlaceholder:ru;
  if($('selectedSchool')) $('selectedSchool').textContent=schoolDisplayName(fromURL)||t('noneSchool');
  refreshLinks(); refreshDirectory(); refreshSwitcher();refreshRoleUI();
  document.dispatchEvent(new Event('cabinet:language'));
}
function readHash(){
  const key=(viewerContext?.hash||location.hash).slice(1);
  if(section) { section.value=sections.some(el=>el.id===key)?key:'all'; refreshDirectory(); }
}
section?.addEventListener('change',()=>{ try { history.replaceState(null,'', section.value==='all'?'#all':`#${section.value}`); } catch {} refreshDirectory(); });
query?.addEventListener('input',refreshDirectory);
$('cabinetLang')?.addEventListener('change',event=>{lang=event.target.value==='ru'?'ru':'tg';saveLanguage(lang);publishLanguage(lang);cabinetPageURL.searchParams.set('lang',lang);if(!offlineViewer)try{history.replaceState(null,'',cabinetPageURL);}catch{}if(workspace&&cabinet)saveActiveResume({role:cabinet.dataset.cabinetId,school:fromURL,lang,route:currentResumeRoute()});applyLanguage();});
window.addEventListener('hashchange',readHash);

const roleCopy={saved:['Анкета заполнена. Теперь выберите школу.','Варақа пур шуд. Акнун мактабро интихоб кунед.'],invalid:['Заполните обязательные поля.','Майдонҳои ҳатмиро пур кунед.'],choose:['Выберите из списка','Аз рӯйхат интихоб кунед'],nothing:['Школы не найдены.','Мактаб ёфт нашуд.'],selected:['Выбрано: ','Интихоб шуд: '],expand:['Развернуть меню','Кушодани меню'],collapse:['Свернуть меню','Пӯшидани меню']};
const rt=key=>roleCopy[key][lang==='tg'?1:0];
const roleForm=$('roleIntakeForm'),picker=$('institutionPicker'),toggle=$('cabinetRailToggle');
let intakeReady=!!fromURL,intakeNote='',collapsed=false;
function takeSetup(){
 const id=cabinet?.dataset.cabinetId,key=`smartmaktab.demo.role-setup.v3.${id}`,savedKey=`smartmaktab.demo.saved-setup.v3.${id}`;
 if(!id)return null;
 try{
  const raw=tabStorage.getItem(key);
  if(raw){
   tabStorage.removeItem(key);
   const data=JSON.parse(raw);
   if(data?.school===fromURL&&data.expires>=Date.now()&&data.fields&&typeof data.fields==='object'){
    persistentStore.setItem(savedKey,JSON.stringify({school:data.school,fields:data.fields,first:data.first,last:data.last}));
    return data;
   }
  }
  const durable=JSON.parse(persistentStore.getItem(savedKey));
  return durable?.school===fromURL&&durable.fields&&typeof durable.fields==='object'?durable:null;
 }catch{return null;}
}
export const roleSetup=takeSetup();
let roleClassFields=[];

export function takeRolePerson(){
  const id=cabinet?.dataset.cabinetId;if(!id)return null;
  const key=`smartmaktab.demo.role-name.v2.${id}`,savedKey=`smartmaktab.demo.saved-name.v2.${id}`;
  try{
    const raw=tabStorage.getItem(key);
    if(raw){
      tabStorage.removeItem(key);
      const data=JSON.parse(raw);
      if(data?.expires>=Date.now()&&[data.first,data.last].every(v=>typeof v==='string'&&v.length<=60)){
        persistentStore.setItem(savedKey,JSON.stringify({first:data.first,last:data.last}));
        return data;
      }
    }
    const durable=JSON.parse(persistentStore.getItem(savedKey));
    if(durable&&[durable.first,durable.last].every(v=>typeof v==='string'&&v.length<=60))return durable;
  }catch{}
  return null;
}
export function enableInstitutionPicker(){
  intakeReady=true;refreshRoleUI();
  if(!selectedDemoSchool)$('institutionSearch')?.focus();
}
function renderSchools(){
  if(!picker)return;
  const choice=$('institutionChoice'),previous=choice.value,ids=findDemoSchools($('institutionSearch').value);
  choice.replaceChildren(new Option(rt('choose'),''),...ids.map(id=>new Option(schoolNames[id],id)));
  choice.value=ids.includes(previous)?previous:(ids.includes(fromURL)?fromURL:(ids.length===1?ids[0]:''));
  $('institutionStatus').textContent=!ids.length?rt('nothing'):fromURL?rt('selected')+schoolNames[fromURL]:'';
  $('confirmInstitution').disabled=!choice.value;
}
function refreshRoleUI(){
  roleClassFields.forEach(({picker})=>picker.refresh());
  if(picker){
    picker.hidden=!intakeReady;
    document.querySelectorAll('[data-institution-link]').forEach(link=>link.hidden=!intakeReady);
    if($('roleIntakeStatus'))$('roleIntakeStatus').textContent=intakeNote?rt(intakeNote):'';
    renderSchools();
  }
  if(toggle){
    toggle.querySelector('span span').textContent=rt(collapsed?'expand':'collapse');
    toggle.setAttribute('aria-label',rt(collapsed?'expand':'collapse'));
  }
}
if(roleForm){
 const fields=[...roleForm.querySelectorAll('[data-intake-field]')],person=roleSetup??takeRolePerson();
 for(const input of fields){
  const key=input.dataset.intakeField;const data=['first','last'].includes(key)?person?.[key]:roleSetup?.fields?.[key];
  if(typeof data==='string'&&data.length<=input.maxLength)input.value=data;
 }
 roleClassFields=[...roleForm.querySelectorAll('[data-role-class]')].map(node=>({node,picker:mountClassPicker(node,{multiple:node.dataset.roleClass==='multi',value:roleSetup?.fields?.[node.dataset.field]??[]})}));
 roleForm.inert=false;
 cabinetFormAction(roleForm,$('saveRoleIntake'),()=>{
   const blank=fields.find(input=>input.required&&!input.value.trim());
   const missing=roleClassFields.find(({node,picker})=>node.dataset.required==='true'&&!picker.read().length);
   if(blank||missing){intakeNote='invalid';refreshRoleUI();if(blank)blank.focus();else missing.picker.focus();return;}
   intakeNote='saved';enableInstitutionPicker();
 });
}
$('institutionSearch')?.addEventListener('input',renderSchools);
$('institutionChoice')?.addEventListener('change',()=>{$('confirmInstitution').disabled=!$('institutionChoice').value;});
export function chooseInstitution(id,{setAsWorkspace=true}={}){
  if((!validSchools.has(id)&&!isUuid(id))||id===fromURL)return;
  fromURL=id;selectedDemoSchool=Object.freeze({id,name:schoolDisplayName(id)});intakeReady=true;
  if(workspace&&setAsWorkspace){
    workspace.schools??={};workspace.schools[cabinet.dataset.cabinetId]=id;
    try{tabStorage.setItem(workspaceKey,JSON.stringify(workspace));}catch{}
  }
  cabinetPageURL.searchParams.set('school',id);
  cabinetPageURL.searchParams.set('lang',lang);
  if(!offlineViewer)try{history.replaceState(null,'',cabinetPageURL);}catch{}
  if((workspace&&setAsWorkspace)||globalThis.SmartMaktabSqlite)saveActiveResume({role:cabinet.dataset.cabinetId,school:id,lang,route:currentResumeRoute()});
  document.dispatchEvent(new Event('cabinet:school'));
  applyLanguage();
}
$('confirmInstitution')?.addEventListener('click',()=>{if(intakeReady)chooseInstitution($('institutionChoice').value);});
if(offlineViewer){
 document.addEventListener('click',event=>{
  const anchor=event.target.closest('a[href]');if(!anchor)return;
  const href=anchor.getAttribute('href');if(!href||href.startsWith('#'))return;
  const url=new URL(href,cabinetPageURL);
  if(url.origin!==cabinetPageURL.origin)return;
  event.preventDefault();openCabinetView(url);
 });
}
function setRail(value){
  if(!toggle)return;
  collapsed=value;
  const nav=$('cabinetRailNav');if(value&&nav.contains(document.activeElement))toggle.focus({preventScroll:true});
  nav.hidden=value;toggle.setAttribute('aria-expanded',String(!value));
  toggle.closest('.layout').classList.toggle('rail-collapsed',value);
  refreshRoleUI();
}
if(toggle){toggle.addEventListener('click',()=>setRail(!collapsed));setTimeout(()=>setRail(true),15000);}
setupWorkspace({configured:!!workspace&&!!selectedDemoSchool,school:()=>selectedDemoSchool});
applyLanguage(); readHash();
