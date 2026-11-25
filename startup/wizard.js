'use strict';
const $=id=>document.getElementById(id);
const rows=JSON.parse(decode($('roleData').dataset.roles));
const roster=new Map(rows.map(row=>[row.id,row]));
const allowed={school:['school'],maorif:['office','advisers','subjects'],raesat:['raesat']};
const names=['first','last'];
const empty=()=>({level:'',primary:'',extras:[],person:{first:'',last:''},overrides:new Map(),fields:new Map(),school:'',schools:Object.create(null)});
const WIZARD_STORAGE_KEY='smartmaktab.wizard.state';
function saveState(){try{localStorage.setItem(WIZARD_STORAGE_KEY,JSON.stringify({state:state,step:step}));}catch{}}
function loadState(){try{const saved=localStorage.getItem(WIZARD_STORAGE_KEY);if(saved){const parsed=JSON.parse(saved);state=parsed.state??empty();step=parsed.step??1;}}catch{}}
loadState();
let lang=getLanguage(new URLSearchParams(location.search).get('lang'));
const copy={primary:['Основная', 'Асосӣ'],extra:['Дополнительная','Иловагӣ'],first:['Имя','Ном'],last:['Фамилия','Насаб'],
 main:['Подставлено из основной','Аз вазифаи асосӣ'],changed:['Изменено для этой должности','Барои ҳамин вазифа иваз шуд'],
 restore:['Подставить из основной','Аз вазифаи асосӣ гирифтан'],invalid:['Введите вымышленные имя и фамилию.','Ном ва насаби сохтаро ворид кунед.'],
 school:['Выберите вымышленное учреждение.','Муассисаро интихоб кунед.'],blocked:['Кабинет не открылся. Нажмите «Оғоз» ещё раз или откройте index.html в Chrome/Edge.','Утоқи корӣ кушода нашуд. «Оғоз»-ро дубора пахш кунед ё index.html-ро дар Chrome/Edge кушоед.'],opening:['Открываем кабинет…','Утоқи корӣ кушода мешавад…'],
 advisers:['Направление маориф','Самти маориф'],subjects:['Предметный мушовир','Мушовири фаннӣ']};
const t=key=>copy[key][lang==='tg'?1:0];
const androidPrograms=$('androidPrograms');
if(globalThis.SmartMaktabAndroid&&androidPrograms){
 androidPrograms.hidden=false;
 const contentButton=$('androidContentUpdate');
 const windowsButton=$('androidWindowsDownload');
 if(contentButton)contentButton.addEventListener('click',()=>{
  androidPrograms.open=false;
  globalThis.SmartMaktabAndroid.postMessage(JSON.stringify({action:'downloadContentUpdate',lang}));
 });
 if(windowsButton)windowsButton.addEventListener('click',()=>{
  androidPrograms.open=false;
  globalThis.SmartMaktabAndroid.postMessage(JSON.stringify({action:'downloadWindows',lang}));
 });
}
const staticText=[...document.querySelectorAll('[data-tg]')].map(el=>[el,el.textContent]);
const sections=[...document.querySelectorAll('[data-step]')];
for(const section of sections){const footer=section.querySelector('.foot'),body=document.createElement('div');body.className='setup-step-body';
 if(footer){section.append(footer);const status=section.querySelector('[role=status].error');if(status)footer.append(status);}
 for(const node of [...section.children])if(node!==footer&&node.tagName!=='H2')body.append(node);
 section.insertBefore(body,footer??null);
}
const roles=()=>rows.filter(row=>allowed[state.level]?.includes(row.group));
const selectedName=()=>roster.get(state.primary)?.title??'';
const clean=value=>value.trim();
const isName=value=>!!value&&[...value].length<=60&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
const valueFor=(id,field)=>state.overrides.get(id)?.[field]??state.person[field];
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
function setStep(n){step=n;saveState();render();const section=sections[n-1];section.querySelector('.setup-step-body').scrollTop=0;section.querySelector('h2').focus({preventScroll:true});}
function renderChoices(){
 const extras=new Set(state.extras);
 for(const main of [true,false]){
  const target=$(main?'primaryChoices':'extraChoices');
  const options=roles().filter(row=>main||row.id!==state.primary);
  target.replaceChildren(...options.map(row=>{
   const item=el('label',undefined,'role'),input=el('input'),text=el('span');
   input.type=main?'radio':'checkbox';input.name=main?'primary-role':'extra-role';input.value=row.id;
   input.checked=main?state.primary===row.id:extras.has(row.id);
   input.disabled=!main&&!input.checked&&extras.size>=10;
   text.append(el('strong',row.title));
      if(['advisers','subjects'].includes(row.group))text.append(el('span',lang==='ru'?`${t(row.group)} · ${row.description}`:t(row.group)));
   else if(row.description!==row.title)text.append(el('span',lang==='tg'?row.descriptionTg:row.description));
   item.append(input,text);return item;
  }));
 }
 $('noExtras').hidden=roles().length>1;
 $('extraCount').textContent=`${extras.size} / 10`;
 $('toExtras').disabled=!state.primary;
}
function refreshExtras(){
 const isFull=state.extras.length>=10;
 for(const input of $('extraChoices').querySelectorAll('input')){input.checked=state.extras.includes(input.value);input.disabled=isFull&&!input.checked;}
 $('extraCount').textContent=`${state.extras.length} / 10`;
}
function setPersonalOverride(id,key,value){
 const values=state.overrides.get(id)??{};
 if(clean(value)===state.person[key]) delete values[key];else values[key]=value;
 if(Object.keys(values).length)state.overrides.set(id,values);else state.overrides.delete(id);
}
function reviewCard(id){
 const card=el('div',undefined,'row'),fields=el('div',undefined,'inputs');card.dataset.reviewRole=id;
 card.append(el('h3',roster.get(id).title),fields);
 for(const field of names){
  const label=el('label',undefined,'field'),input=el('input'),flag=el('span',undefined,'small'),restore=el('button',t('restore'),'button alt');
  input.value=valueFor(id,field);input.required=true;input.maxLength=60;input.autocomplete='off';input.dataset.field=field;
  flag.id=`flag-${id}-${field}`;input.setAttribute('aria-describedby',flag.id);restore.type='button';
  const updateFlag=()=>{const custom=Object.hasOwn(state.overrides.get(id)??{},field);flag.textContent=t(custom?'changed':'main');restore.hidden=!custom;};
  input.addEventListener('input',()=>{setPersonalOverride(id,field,input.value);$('reviewError').textContent='';updateFlag();});
  restore.addEventListener('click',()=>{setPersonalOverride(id,field,state.person[field]);input.value=state.person[field];updateFlag();input.focus();});
  updateFlag();label.append(el('span',t(field)),input,flag);
  const wrapper=el('div');wrapper.append(label,restore);fields.append(wrapper);
 }
 const details=el('div',undefined,'profile-fields');details.dataset.extraRoleFields='';card.append(details);
 queueMicrotask(()=>mountRoleFields(id,details));
 return card;
}
function renderReview(){
 $('primaryReview').replaceChildren(el('h3',`${t('primary')} · ${selectedName()}`),el('p',`${state.person.first} ${state.person.last}`));
 $('reviewList').replaceChildren(...state.extras.map(reviewCard));
 $('reviewEmpty').hidden=!!state.extras.length;
}
function destination(row){
 const params=new URLSearchParams({school:state.schools[row.id]||state.school});
 params.set('lang',lang);
 const query=params.toString();return `./${row.path}${query?`?${query}`:''}`;
}
function resultCard(id){
 const row=roster.get(id),card=el('div',undefined,'row'),head=el('div',undefined,'role-head');
 head.append(el('h3',row.title),el('span',t(id===state.primary?'primary':'extra'),'count'));
 card.append(head,el('p',`${clean(valueFor(id,'first'))} ${clean(valueFor(id,'last'))}`));
 return card;
}
function render(){
 $('startupShell').dataset.screen=String(step);
 document.documentElement.lang=lang;$('lang').value=lang;startupTheme.refresh();
 for(const [node,ru] of staticText)node.textContent=lang==='tg'?node.dataset.tg:ru;
 sections.forEach(section=>{section.hidden=Number(section.dataset.step)!==step;});
 document.querySelectorAll('[data-mark]').forEach(mark=>{if(Number(mark.dataset.mark)===step)mark.setAttribute('aria-current','step');else mark.removeAttribute('aria-current');});
 if(step===2||step===3)renderChoices();
 $('mainRole').textContent=`${t('primary')}: ${selectedName()}`;
 $('mainFormRole').textContent=selectedName();
 if(step===4){$('firstName').value=state.person.first;$('lastName').value=state.person.last;$('primaryError').textContent='';mountRoleFields(state.primary,$('primaryRoleFields'));}
 if(step===5){renderReview();$('reviewError').textContent='';}
 if(step===6){fillSchoolChoices();renderExtraSchools();$('results').replaceChildren(...[state.primary,...state.extras].map(resultCard));}
}
for(const button of document.querySelectorAll('[data-level]'))button.addEventListener('click',()=>{
 const level=button.dataset.level;
 if(level!==state.level){state=empty();state.level=level;}
 setStep(2);
});
for(const button of document.querySelectorAll('[data-back]'))button.addEventListener('click',()=>setStep(Number(button.dataset.back)));
$('primaryChoices').addEventListener('change',event=>{
 const id=event.target.value;
 if(!roles().some(row=>row.id===id))return;
 state.primary=id;saveState();
 state.extras=state.extras.filter(role=>role!==id);state.overrides.delete(id);
 $('toExtras').disabled=false;
});
$('extraChoices').addEventListener('change',event=>{
 const id=event.target.value;
 if(id===state.primary||!roles().some(row=>row.id===id))return;
 if(event.target.checked&&state.extras.length<10&&!state.extras.includes(id))state.extras.push(id);saveState();
 if(!event.target.checked){state.extras=state.extras.filter(role=>role!==id);state.overrides.delete(id);}
 refreshExtras();
});
$('toExtras').addEventListener('click',()=>{if(state.primary)setStep(3);});
$('toProfile').addEventListener('click',()=>{if(state.primary)setStep(4);});
$('primaryForm').inert=false;$('reviewForm').inert=false;
$('firstName').addEventListener('input',()=>{state.person.first=$('firstName').value;});
$('lastName').addEventListener('input',()=>{state.person.last=$('lastName').value;});
$('toReview').addEventListener('click',()=>{
 const first=clean($('firstName').value),last=clean($('lastName').value);
 if(!isName(first)||!isName(last)){$('primaryError').textContent=t('invalid');return;}
 const error=checkRoleFields($('primaryRoleFields'));
 if(!$('primaryForm').reportValidity()||error){$('primaryError').textContent=error??fp('required');return;}
 state.person={first,last};setStep(state.extras.length?5:6);
});
$('finish').addEventListener('click',()=>{
 if(!$('reviewForm').reportValidity())return;
 for(const group of $('reviewList').querySelectorAll('[data-extra-role-fields]')){const error=checkRoleFields(group);if(error){$('reviewError').textContent=error;group.scrollIntoView({block:'center'});return;}}
 for(const id of state.extras)for(const field of names){
  const input=$('reviewList').querySelector(`[data-review-role="${id}"] [data-field="${field}"]`);
  const value=clean(input.value);
  if(!isName(value)){$('reviewError').textContent=t('invalid');input.focus();return;}
  setPersonalOverride(id,field,value);
 }
 setStep(6);
});
for(const [form,button] of [['primaryForm','toReview'],['reviewForm','finish']]) $(form).addEventListener('keydown',event=>{
 if(event.key==='Enter'&&event.target instanceof HTMLInputElement&&!event.isComposing){event.preventDefault();$(button).click();}
});
$('lang').addEventListener('change',event=>{lang=event.target.value==='ru'?'ru':'tg';saveLanguage(lang);
 if(!useFileViewer){const url=new URL(location.href);if(url.searchParams.has('lang')){url.searchParams.set('lang',lang);try{history.replaceState(null,'',url);}catch{}}}
 render();});
$('schoolSearch').addEventListener('input',fillSchoolChoices);
$('schoolChoice').addEventListener('change',event=>{state.school=event.target.value;$('begin').disabled=!state.school;});
$('backToProfiles').addEventListener('click',()=>setStep(state.extras.length?5:4));
let enteringCabinet=false;
$('begin').addEventListener('click',async()=>{
 if(enteringCabinet||step!==6||!state.primary||!validSchools.has(state.school))return;
 enteringCabinet=true;
 $('begin').disabled=true;
 $('beginError').textContent=t('opening');
 try{
  const row=roster.get(state.primary),route=destination(row);
  const roles=[state.primary,...state.extras].map(id=>{const item=roster.get(id);return {id,path:item.path,title:item.title};});
  const schools=Object.fromEntries(roles.map(role=>[role.id,state.schools[role.id]||state.school]));
  const workspace={primary:state.primary,schools,roles};
  const payload={'smartmaktab.demo.workspace.v1':JSON.stringify(workspace)};
  for(const role of roles){
   const allowName=role.id!=='school-girls-council-chair';
   Object.assign(payload,buildRolePayload(role,schools[role.id],dataForRole(role.id),allowName?clean(valueFor(role.id,'first')):'',allowName?clean(valueFor(role.id,'last')):''));
  }
  const nativeOrigin=location.protocol==='smapp:'||location.hostname==='appassets.androidplatform.net';
  const embeddedOnly=useFileViewer||!nativeOrigin&&navigator.onLine===false;
  const intro=brandSplash.play('school',{school:schoolNames[schools[row.id]],role:row.title,lang});
  if(embeddedOnly)void getPack().catch(()=>{});
  await intro;
  const isHandoff=key=>key.startsWith('smartmaktab.demo.role-name.v2.')||key.startsWith('smartmaktab.demo.role-setup.v3.')||key==='smartmaktab.demo.director-handoff.v1';
  if(!embeddedOnly)try{
   for(const key of Object.keys(localStorage))if(isHandoff(key))localStorage.removeItem(key);localStorage.removeItem(WIZARD_STORAGE_KEY);
   for(const [key,value] of Object.entries(payload))localStorage.setItem(key,value);
   location.assign(route);$('beginError').textContent='';return;
  }catch{/* Browser storage can be disabled; use the self-contained cabinet instead. */}
  for(const key of Object.keys(embeddedStore))if(isHandoff(key))delete embeddedStore[key];
  Object.assign(embeddedStore,payload);
  $('beginError').textContent=await openEmbedded(row.path,{lang,title:row.title,school:schools[row.id]})?'':t('blocked');
 }catch{$('beginError').textContent=t('blocked');}
 finally{enteringCabinet=false;$('begin').disabled=!validSchools.has(state.school);}
});
render();
$('wizard').inert=false;
$('viewerNotReady').hidden=true;

if(!useFileViewer&&openOfflineRoute&&rows.some(row=>row.path===openOfflineRoute)){
 const params=new URLSearchParams(location.search);const row=rows.find(row=>row.path===openOfflineRoute);
 try{for(const key of Object.keys(localStorage))if(key.startsWith('smartmaktab.demo.'))embeddedStore[key]=localStorage.getItem(key);}catch{}
 openEmbedded(row.path,{school:params.get('school'),lang,title:row.title});
}else brandSplash.play('launch',{lang});

if(!useFileViewer&&location.protocol!=='smapp:'&&location.hostname!=='appassets.androidplatform.net'){try{navigator.serviceWorker?.register('./sw.js').catch(()=>{});}catch{}}

if(globalThis.SmartMaktabAndroid)globalThis.smartMaktabBack=()=>{const splash=$('brandSplash');if(splash.open){$('splashSkip').click();return true;}if(step<=1)return false;setStep(step===6?(state.extras.length?5:4):step-1);return true;};
