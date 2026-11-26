'use strict';
const params=new URLSearchParams(location.search);
const wantsSetup=params.get('setup')==='1'||params.get('changeRole')==='1';
const wantsRegister=params.get('register')==='1';
const activeCabinetKey='smartmaktab.active-cabinet.v1';
const profileStorageKey='smartmaktab.profile.v1';
const cloudSessionKey='smartmaktab.cloud.session.v1';
const validResumeRoute=/^cabinets\/(?:[a-z-]+\/)*[a-z-]+\.html\?(?:school=[a-z0-9-]+&)?lang=(?:tg|ru)$/;

function hydrateFromSqlite(){
 if(!globalThis.SmartMaktabSqlite?.getAllJson)return;
 try{
  const raw=globalThis.SmartMaktabSqlite.getAllJson();
  if(!raw)return;
  const parsed=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object')return;
  for(const [k,v] of Object.entries(parsed)){
   if(typeof v==='string'&&localStorage.getItem(k)===null)localStorage.setItem(k,v);
  }
 }catch{}
}
function checkResumeRoute(){
 if(useFileViewer||openOfflineRoute||wantsSetup||wantsRegister)return '';
 hydrateFromSqlite();
 try{
  const rawActive=localStorage.getItem(activeCabinetKey)||globalThis.SmartMaktabSqlite?.getItem?.(activeCabinetKey)||'';
  const rawWorkspace=localStorage.getItem('smartmaktab.demo.workspace.v1')||globalThis.SmartMaktabSqlite?.getItem?.('smartmaktab.demo.workspace.v1')||'';
  if(!rawActive||!rawWorkspace)return '';
  const active=JSON.parse(rawActive);
  const workspace=JSON.parse(rawWorkspace);
  if(!active||!workspace?.primary||!Array.isArray(workspace.roles))return '';
  if(typeof active.route==='string'&&validResumeRoute.test(active.route))return active.route;
 }catch{}
 return '';
}
const resumeTarget=checkResumeRoute();
if(resumeTarget){
 location.replace('./'+resumeTarget);
}

const $=id=>document.getElementById(id);
const rows=JSON.parse(decode($('roleData').dataset.roles));
const roster=new Map(rows.map(row=>[row.id,row]));
const cloudCfg=getCloudConfig();

const empty=()=>({
 primary:'',
 extras:[],
 includeAliya:false,
 customMethodName:'',
 person:{
  first:'',
  last:'',
  middle:'',
  birthYear:'',
  gender:'',
  specialty:'',
  eduYears:'',
  education:'',
  languages:['tg'],
  otherLanguage:'',
 },
 credentials:{login:'',password:'',password2:''},
 overrides:new Map(),
 fields:new Map(),
 school:'',
 schools:Object.create(null),
 creatingNewSchool:false,
 newSchool:{region_name:'',district_name:'',name:'',school_code:''},
 cloudSchools:null,
 cloudAuthorities:null,
 cloudTariffs:null,
});
let state=empty();
let step=wantsRegister?1:0;
let authorityLoginMode=false;
let lang=getLanguage(params.get('lang'));

const copy={
 primary:['Основная', 'Асосӣ'],
 extra:['Дополнительная','Иловагӣ'],
 somoni:['сомони','сомонӣ'],
 perMonth:['/ мес','/ моҳ'],
 totalPrefix:['Итого:','Ҳамагӣ:'],
 aliyaYes:['+ Алия (30 сомони)','+ Алия (30 сомонӣ)'],
 selectedMain:['Основная должность: ','Вазифаи асосӣ: '],
 invalidProfile:['Заполните все обязательные поля анкеты (ФИО, год рождения, пол, специальность, стаж, образование).','Ҳамаи майдонҳои ҳатмии варақаро пур кунед (Ном, насаб, соли таваллуд, ҷинс, ихтисос, собиқа, маълумот).'],
 invalidMethodName:['Укажите название вашего методического объединения.','Номи иттиҳодияи методии худро ворид кунед.'],
 invalidOtherLang:['Укажите другой язык.','Забони дигарро нависед.'],
 invalidCreds:['Введите логин (или номер телефона) и пароль не менее 6 символов, совпадающий в обоих полях.','Логин (ё рақами телефон) ва пароли ҳадди ақал 6-аломатаро дуруст ворид кунед.'],
 invalidLoginCreds:['Введите логин (или телефон/Email) и пароль.','Логин (ё телефон/Email) ва паролро ворид кунед.'],
 loginFail:['Неверный логин или пароль, либо сервер недоступен.','Логин ё парол нодуруст аст, ё интернет пайваст нест.'],
 authorityDenied:['Этот аккаунт не относится к Мудири маориф или Сардори раёсат.','Ин ҳисоб ба Мудири маориф ё Сардори раёсат тааллуқ надорад.'],
 loginBusy:['Выполняется вход…','Воридшавӣ иҷро мешавад…'],
 regBusy:['Создание аккаунта и открытие кабинета…','Сохтани ҳисоб ва кушодани утоқ…'],
 duplicateLogin:['Этот логин или телефон уже зарегистрирован. Нажмите «Войти» на стартовом экране.','Ин логин ё телефон аллакай ба қайд гирифта шудааст. Дар саҳифаи асосӣ «Ворид шудан»-ро пахш кунед.'],
 blocked:['Кабинет не открылся. Попробуйте снова или откройте index.html в Chrome/Edge.','Утоқи корӣ кушода нашуд. Боз кӯшиш кунед ё index.html-ро дар Chrome/Edge кушоед.'],
 opening:['Открываем кабинет…','Утоқи корӣ кушода мешавад…'],
 authTitleSchool:['Вход в SmartMaktab','Воридшавӣ ба SmartMaktab'],
 authSubSchool:['Введите логин, номер телефона или Email и пароль.','Логин, рақами телефон ё Email ва пароли худро ворид кунед.'],
 authTitleAuthority:['Вход: Мудири маориф / Сардори раёсат','Вуруд: Мудири маориф / Сардори раёсат'],
 authSubAuthority:['Введите логин и пароль, выданные администратором.','Логин ва пароли аз ҷониби маъмур додашударо ворид кунед.'],
};
const t=key=>copy[key][lang==='tg'?1:0];
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const clean=value=>String(value||'').trim();

function writeStoreItem(k,v){
 try{localStorage.setItem(k,v);}catch{}
 try{globalThis.SmartMaktabSqlite?.setItem?.(k,v);}catch{}
}
function removeStoreItem(k){
 try{localStorage.removeItem(k);}catch{}
 try{globalThis.SmartMaktabSqlite?.removeItem?.(k);}catch{}
}

// Top-bar Update icon menu (Windows + Android + Web)
const updMenu=$('startupUpdateMenu'),updDot=$('startupUpdateDot'),updStatusLine=$('updStatusLine');
if(updMenu){
 const menuBox=updMenu.querySelector(':scope > div');
 const positionMenu=()=>{
  if(!updMenu.open||!menuBox)return;
  menuBox.style.transform='';
  const rect=menuBox.getBoundingClientRect(),pad=10,maxRight=document.documentElement.clientWidth-pad;
  let dx=0;
  if(rect.left<pad)dx=pad-rect.left;else if(rect.right>maxRight)dx=maxRight-rect.right;
  if(dx)menuBox.style.transform=`translateX(${Math.round(dx)}px)`;
 };
 updMenu.addEventListener('toggle',positionMenu);
 window.addEventListener('resize',positionMenu);
 document.addEventListener('click',ev=>{if(updMenu.open&&!updMenu.contains(ev.target))updMenu.open=false;});

 $('updAppBtn')?.addEventListener('click',async()=>{
  updMenu.open=false;
  if(globalThis.SmartMaktabAndroid){
   globalThis.SmartMaktabAndroid.postMessage(JSON.stringify({action:'checkAssetUpdate',lang}));
   return;
  }
  if(globalThis.SmartMaktabWindows?.checkAppRelease){
   const r=await globalThis.SmartMaktabWindows.checkAppRelease().catch(()=>({status:'network'}));
   if(r.status==='available'&&r.downloadUrl){
    await globalThis.SmartMaktabWindows.openAppDownload(r.downloadUrl).catch(()=>{});
   }else{
    updStatusLine.hidden=false;
    updStatusLine.textContent=r.status==='up-to-date'
     ?(lang==='tg'?`Нусхаи навтарин (${r.currentVersion}) насб аст.`:`Установлена актуальная версия (${r.currentVersion}).`)
     :(lang==='tg'?'Санҷиш имконнопазир (интернет лозим).':'Проверка недоступна (нужен интернет).');
    updMenu.open=true;
   }
   return;
  }
  try{const reg=await navigator.serviceWorker?.getRegistration?.();await reg?.update?.();}catch{}
  updStatusLine.hidden=false;
  updStatusLine.textContent=lang==='tg'?'Барнома санҷида шуд.':'Приложение проверено.';
  updMenu.open=true;
 });

 $('updContentBtn')?.addEventListener('click',async()=>{
  updMenu.open=false;
  if(globalThis.SmartMaktabAndroid){
   globalThis.SmartMaktabAndroid.postMessage(JSON.stringify({action:'downloadContentUpdate',lang}));
   return;
  }
  updStatusLine.hidden=false;
  updStatusLine.textContent=lang==='tg'
   ?'Барои навсозии мавод пас аз воридшавӣ ба утоқ тугмаи ↻-ро пахш кунед.'
   :'Для применения .smupdate войдите в кабинет и нажмите ↻ → Обновление материалов.';
  updMenu.open=true;
 });

 $('updWinBtn')?.addEventListener('click',async()=>{
  updMenu.open=false;
  if(globalThis.SmartMaktabAndroid){
   globalThis.SmartMaktabAndroid.postMessage(JSON.stringify({action:'downloadWindows',lang}));
   return;
  }
  const relUrl='https://github.com/smartmaktabtj/smartmaktab/releases/latest';
  if(globalThis.SmartMaktabWindows?.openAppDownload){
   await globalThis.SmartMaktabWindows.openAppDownload('https://github.com/smartmaktabtj/smartmaktab/releases').catch(()=>{});
  }else{
   window.open(relUrl,'_blank','noopener');
  }
 });

 // Passive non-blocking update indicator check on Windows
 if(globalThis.SmartMaktabWindows?.checkAppRelease){
  void globalThis.SmartMaktabWindows.checkAppRelease().then(r=>{
   if(r?.status==='available'&&updDot)updDot.hidden=false;
  }).catch(()=>{});
 }
}

const staticText=[...document.querySelectorAll('[data-tg]')].map(el=>[el,el.textContent]);
const sections=[...document.querySelectorAll('[data-step]')];

function roleTitle(id){
 const tRow=Array.isArray(state.cloudTariffs)?state.cloudTariffs.find(x=>x.position_code===id):null;
 if(tRow)return lang==='ru'?(tRow.title_ru||tRow.title_tg):(tRow.title_tg||tRow.title_ru);
 return formatPositionTitle(id,lang);
}

function rolePrice(id){
 const tRow=Array.isArray(state.cloudTariffs)?state.cloudTariffs.find(x=>x.position_code===id):null;
 if(tRow&&Number.isFinite(Number(tRow.base_price_tjs)))return Number(tRow.base_price_tjs);
 return getPositionMeta(id)?.defaultBasePrice??10;
}

function schoolPositions(){
 return POSITION_CATALOG.filter(r=>r.group==='school');
}

function updateTotalBar(){
 const calc=computePositionTariffTotal({
  primaryPosition:state.primary||null,
  extraPositions:state.extras,
  tariffs:state.cloudTariffs||[],
  includeAliya:state.includeAliya,
 });
 const bar=$('totalPriceAmount');
 if(bar)bar.textContent=`${t('totalPrefix')} ${calc.totalTjs} ${t('somoni')} ${t('perMonth')}`;
}

function setStep(n){
 step=n;
 render();
 const active=sections.find(s=>Number(s.dataset.step)===n);
 if(active){
  const body=active.querySelector('.setup-step-body');
  if(body)body.scrollTop=0;
  active.querySelector('h2')?.focus({preventScroll:true});
 }
}

function renderPrimaryAndExtraChoices(){
 const primaryTarget=$('primaryChoices');
 const extraTarget=$('extraChoices');
 const allSchool=schoolPositions();
 const extrasSet=new Set(state.extras);

 primaryTarget.replaceChildren(...allSchool.map(meta=>{
  const item=el('label',undefined,'role');
  const left=el('div',undefined,'role-main');
  const input=el('input');
  input.type='radio';input.name='primary-role';input.value=meta.id;
  input.checked=state.primary===meta.id;
  const labelText=el('strong',roleTitle(meta.id));
  left.append(input,labelText);
  const price=el('span',`${rolePrice(meta.id)} ${t('somoni')}`,'price-pill');
  item.append(left,price);
  return item;
 }));

 const compatible=state.primary?getCompatibleExtraPositions(state.primary,allSchool):[];
 $('noExtras').hidden=!state.primary||compatible.length>0;
 extraTarget.replaceChildren(...compatible.map(meta=>{
  const item=el('label',undefined,'role');
  const left=el('div',undefined,'role-main');
  const input=el('input');
  input.type='checkbox';input.name='extra-role';input.value=meta.id;
  input.checked=extrasSet.has(meta.id);
  const labelText=el('strong',roleTitle(meta.id));
  left.append(input,labelText);
  const price=el('span',`+${rolePrice(meta.id)} ${t('somoni')}`,'price-pill');
  item.append(left,price);
  return item;
 }));

 $('extraCount').textContent=`${state.extras.length}`;
 $('toExtras').disabled=!state.primary;
 $('aliyaAddonToggle').checked=Boolean(state.includeAliya);
 updateTotalBar();
}

function renderProfileStep(){
 const chosen=[state.primary,...state.extras];
 const needsMethodName=chosen.includes('school-five-method-groups');
 $('customMethodWrap').hidden=!needsMethodName;
 $('customMethodNameInput').required=needsMethodName;
 $('customMethodNameInput').value=state.customMethodName||'';

 $('firstName').value=state.person.first||'';
 $('lastName').value=state.person.last||'';
 $('middleName').value=state.person.middle||'';
 $('birthYear').value=state.person.birthYear||'';
 $('genderSelect').value=state.person.gender||'';
 $('specialtyInput').value=state.person.specialty||'';
 $('eduYearsInput').value=state.person.eduYears||'';
 $('educationSelect').value=state.person.education||'';
 $('otherLangInput').value=state.person.otherLanguage||'';
 const langSet=new Set(Array.isArray(state.person.languages)?state.person.languages:['tg']);
 for(const cb of $('langChoices').querySelectorAll('input[type=checkbox]')){
  cb.checked=langSet.has(cb.value);
 }
 $('otherLangWrap').hidden=!langSet.has('other');
 $('regLogin').value=state.credentials.login||'';
 $('regPassword').value=state.credentials.password||'';
 $('regPassword2').value=state.credentials.password2||'';
 $('primaryError').textContent='';
 mountRoleFields(state.primary,$('primaryRoleFields'));
}

function resultCard(id){
 const card=el('div',undefined,'row'),head=el('div',undefined,'role-head');
 const title=(id==='school-five-method-groups'&&clean(state.customMethodName))
  ?`${roleTitle(id)} — ${clean(state.customMethodName)}`
  :roleTitle(id);
 head.append(el('h3',title),el('span',`${t(id===state.primary?'primary':'extra')} · ${rolePrice(id)} ${t('somoni')}`,'count'));
 card.append(head,el('p',`${clean(state.person.first)} ${clean(state.person.last)}${state.person.specialty?` · ${clean(state.person.specialty)}`:''}`));
 return card;
}

function render(){
 $('startupShell').dataset.screen=String(step);
 document.documentElement.lang=lang;$('lang').value=lang;startupTheme.refresh();
 for(const [node,ru] of staticText)node.textContent=lang==='tg'?node.dataset.tg:ru;

 // Update auth screen mode text cleanly after staticText pass
 if(step===0){
  $('loginTitle').textContent=authorityLoginMode?t('authTitleAuthority'):t('authTitleSchool');
  $('loginSubtitle').textContent=authorityLoginMode?t('authSubAuthority'):t('authSubSchool');
  $('schoolAuthExtras').hidden=authorityLoginMode;
  $('backAuthorityLogin').hidden=!authorityLoginMode;
 }

 $('regProgress').hidden=step===0;
 sections.forEach(section=>{section.hidden=Number(section.dataset.step)!==step;});
 document.querySelectorAll('[data-mark]').forEach(mark=>{
  if(Number(mark.dataset.mark)===step)mark.setAttribute('aria-current','step');
  else mark.removeAttribute('aria-current');
 });

 if(step===1||step===2)renderPrimaryAndExtraChoices();
 $('mainRole').textContent=state.primary?`${t('selectedMain')}${roleTitle(state.primary)} (${rolePrice(state.primary)} ${t('somoni')})`:'';
 $('mainFormRole').textContent=state.primary?roleTitle(state.primary):'';
 if(step===3)renderProfileStep();
 if(step===4){
  fillSchoolChoices();
  renderExtraSchools();
  const calc=computePositionTariffTotal({
   primaryPosition:state.primary,
   extraPositions:state.extras,
   tariffs:state.cloudTariffs||[],
   includeAliya:state.includeAliya,
  });
  const totalCard=el('div',undefined,'total-bar');
  totalCard.append(
   el('span',state.includeAliya?t('aliyaYes'):''),
   el('span',`${t('totalPrefix')} ${calc.totalTjs} ${t('somoni')} ${t('perMonth')}`,'total-val'),
  );
  $('results').replaceChildren(...[state.primary,...state.extras].map(resultCard),totalCard);
 }
}

// Fetch real schools & updated tariffs from Supabase register-user Edge Function silently in background
async function loadRegistrationBootstrap(){
 if(useFileViewer||navigator.onLine===false)return;
 try{
  const res=await fetch(`${cloudCfg.url}/functions/v1/register-user?action=bootstrap`,{
   method:'GET',
   headers:{apikey:cloudCfg.publishableKey,'Content-Type':'application/json'},
  });
  if(!res.ok)return;
  const data=await res.json().catch(()=>null);
  if(Array.isArray(data?.schools)&&data.schools.length)state.cloudSchools=data.schools;
  if(Array.isArray(data?.authorities)&&data.authorities.length)state.cloudAuthorities=data.authorities;
  if(Array.isArray(data?.tariffs)&&data.tariffs.length)state.cloudTariffs=data.tariffs;
  if(step>=1)render();
 }catch{}
}
void loadRegistrationBootstrap();

// Step 0 events: Login + Authority login toggle + Register button
$('goToRegister')?.addEventListener('click',()=>{
 authorityLoginMode=false;
 $('loginError').textContent='';
 setStep(1);
});
$('goAuthorityLogin')?.addEventListener('click',()=>{
 authorityLoginMode=true;
 $('loginError').textContent='';
 $('loginIdentifier').focus();
 render();
});
$('backAuthorityLogin')?.addEventListener('click',()=>{
 authorityLoginMode=false;
 $('loginError').textContent='';
 render();
});

$('loginForm')?.addEventListener('submit',async ev=>{
 ev.preventDefault();
 const rawId=clean($('loginIdentifier').value);
 const pass=$('loginPassword').value;
 if(!rawId||!pass){$('loginError').textContent=t('invalidLoginCreds');return;}
 const parsed=normalizeLoginIdentifier(rawId);
 const email=parsed.valid?parsed.email:rawId;
 $('loginSubmit').disabled=true;
 $('loginError').textContent=t('loginBusy');
 try{
  const authRes=await fetch(`${cloudCfg.url}/auth/v1/token?grant_type=password`,{
   method:'POST',
   headers:{apikey:cloudCfg.publishableKey,'Content-Type':'application/json'},
   body:JSON.stringify({email,password:pass}),
  });
  const authJson=await authRes.json().catch(()=>({}));
  if(!authRes.ok||!authJson?.access_token){
   $('loginError').textContent=authJson?.error_description||t('loginFail');
   return;
  }
  const ctxRes=await fetch(`${cloudCfg.url}/rest/v1/rpc/get_my_workspace_context`,{
   method:'POST',
   headers:{apikey:cloudCfg.publishableKey,Authorization:`Bearer ${authJson.access_token}`,'Content-Type':'application/json'},
   body:'{}',
  });
  const ctx=await ctxRes.json().catch(()=>null);
  const memberships=Array.isArray(ctx?.memberships)?ctx.memberships:[];
  const primaryMem=memberships[0]||null;
  if(authorityLoginMode){
   const isAuth=Boolean(ctx?.is_super_admin)||memberships.some(m=>['office-head','raesat-head'].includes(m.primary_position)||['maorif','authority_viewer'].includes(m.role));
   if(!isAuth){
    $('loginError').textContent=t('authorityDenied');
    return;
   }
  }
  writeStoreItem(cloudSessionKey,JSON.stringify(authJson));
  if(primaryMem){
   const posList=[primaryMem.primary_position||'school-director',...(Array.isArray(primaryMem.extra_positions)?primaryMem.extra_positions:[])];
   const uniquePos=[...new Set(posList)].filter(id=>roster.has(id));
   const roles=uniquePos.map(id=>{
    const r=roster.get(id);
    const customLabel=(id==='school-five-method-groups'&&primaryMem.custom_method_name)?primaryMem.custom_method_name:r.title;
    return {id,path:r.path,title:customLabel};
   });
   const schoolMap=Object.fromEntries(roles.map(r=>[r.id,primaryMem.organization_id]));
   const workspace={primary:roles[0].id,schools:schoolMap,roles};
   writeStoreItem('smartmaktab.demo.workspace.v1',JSON.stringify(workspace));
   writeStoreItem('smartmaktab.cloud.last_org.v1',primaryMem.organization_id);

   const profDetails=ctx?.profile?.profile_details||{};
   const savedProf={
    fullName:ctx?.profile?.full_name||'',
    loginName:ctx?.profile?.login_name||displayLoginIdentifier(email),
    person:{
     first:profDetails.first||ctx?.profile?.full_name?.split(' ')?.[0]||'',
     last:profDetails.last||ctx?.profile?.full_name?.split(' ')?.[1]||'',
     middle:profDetails.middle||'',
     birthYear:profDetails.birthYear||'',
     gender:profDetails.gender||'',
     specialty:profDetails.specialty||'',
     eduYears:profDetails.eduYears||'',
     education:profDetails.education||'',
     languages:Array.isArray(profDetails.languages)?profDetails.languages:['tg'],
     otherLanguage:profDetails.otherLanguage||'',
    },
    customMethodName:primaryMem.custom_method_name||'',
    includeAliya:Boolean(primaryMem.aliya_enabled),
    positions:primaryMem.position_profiles||{},
    organizationId:primaryMem.organization_id,
    organizationName:primaryMem.organization_name,
   };
   writeStoreItem(profileStorageKey,JSON.stringify(savedProf));

   const targetRow=roster.get(roles[0].id);
   const targetLang=ctx?.profile?.preferred_lang==='ru'?'ru':lang;
   const route=`${targetRow.path}?school=${primaryMem.organization_id}&lang=${targetLang}`;
   writeStoreItem(activeCabinetKey,JSON.stringify({role:roles[0].id,school:primaryMem.organization_id,lang:targetLang,route,savedAt:Date.now()}));
   try{globalThis.SmartMaktabSqlite?.saveResumeSession?.(roles[0].id,primaryMem.organization_id,targetLang,route);}catch{}
   await brandSplash.play(primaryMem.kind==='education_authority'?'maorif':'school',{school:primaryMem.organization_name,role:roles[0].title,lang:targetLang});
   location.assign('./'+route);
   return;
  }
  setStep(1);
 }catch{
  $('loginError').textContent=t('loginFail');
 }finally{
  $('loginSubmit').disabled=false;
 }
});

// Step 1 & Step 2 events
document.querySelectorAll('[data-back]').forEach(btn=>btn.addEventListener('click',()=>setStep(Number(btn.dataset.back))));

$('primaryChoices').addEventListener('change',ev=>{
 const id=ev.target.value;
 if(!schoolPositions().some(r=>r.id===id))return;
 state.primary=id;
 state.extras=state.extras.filter(ex=>canCombinePositions(id,ex));
 $('toExtras').disabled=false;
});

$('extraChoices').addEventListener('change',ev=>{
 const id=ev.target.value;
 if(!canCombinePositions(state.primary,id))return;
 if(ev.target.checked&&!state.extras.includes(id))state.extras.push(id);
 if(!ev.target.checked)state.extras=state.extras.filter(x=>x!==id);
 $('extraCount').textContent=`${state.extras.length}`;
 updateTotalBar();
});

$('aliyaAddonToggle').addEventListener('change',ev=>{
 state.includeAliya=ev.target.checked;
 updateTotalBar();
});

$('toExtras').addEventListener('click',()=>{if(state.primary)setStep(2);});
$('toProfile').addEventListener('click',()=>{if(state.primary)setStep(3);});

// Step 3 form sync & validation
$('primaryForm').inert=false;
const bindInput=(id,fn)=>$(id)?.addEventListener('input',ev=>fn(ev.target.value));
const bindChange=(id,fn)=>$(id)?.addEventListener('change',ev=>fn(ev.target.value));
bindInput('firstName',v=>{state.person.first=v;});
bindInput('lastName',v=>{state.person.last=v;});
bindInput('middleName',v=>{state.person.middle=v;});
bindInput('birthYear',v=>{state.person.birthYear=v;});
bindChange('genderSelect',v=>{state.person.gender=v;});
bindInput('specialtyInput',v=>{state.person.specialty=v;});
bindInput('eduYearsInput',v=>{state.person.eduYears=v;});
bindChange('educationSelect',v=>{state.person.education=v;});
bindInput('customMethodNameInput',v=>{state.customMethodName=v;});
bindInput('otherLangInput',v=>{state.person.otherLanguage=v;});
bindInput('regLogin',v=>{state.credentials.login=v;});
bindInput('regPassword',v=>{state.credentials.password=v;});
bindInput('regPassword2',v=>{state.credentials.password2=v;});

$('langChoices').addEventListener('change',()=>{
 const checked=[...$('langChoices').querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value);
 state.person.languages=checked;
 $('otherLangWrap').hidden=!checked.includes('other');
});

$('toSchoolStep').addEventListener('click',()=>{
 const p=state.person;
 p.first=clean($('firstName').value);
 p.last=clean($('lastName').value);
 p.middle=clean($('middleName').value);
 p.birthYear=clean($('birthYear').value);
 p.gender=$('genderSelect').value;
 p.specialty=clean($('specialtyInput').value);
 p.eduYears=clean($('eduYearsInput').value);
 p.education=$('educationSelect').value;
 state.customMethodName=clean($('customMethodNameInput').value);
 p.otherLanguage=clean($('otherLangInput').value);

 const yr=Number(p.birthYear);
 const exp=Number(p.eduYears);
 if(!p.first||!p.last||!p.gender||!p.specialty||!p.education||!Number.isFinite(yr)||yr<1940||yr>2015||!Number.isFinite(exp)||exp<0||exp>70){
  $('primaryError').textContent=t('invalidProfile');return;
 }
 const chosen=[state.primary,...state.extras];
 if(chosen.includes('school-five-method-groups')&&!state.customMethodName){
  $('primaryError').textContent=t('invalidMethodName');$('customMethodNameInput').focus();return;
 }
 if(p.languages.includes('other')&&!p.otherLanguage){
  $('primaryError').textContent=t('invalidOtherLang');$('otherLangInput').focus();return;
 }
 const loginVal=clean($('regLogin').value);
 const pass1=$('regPassword').value;
 const pass2=$('regPassword2').value;
 if(loginVal||pass1||pass2){
  const parsed=normalizeLoginIdentifier(loginVal);
  if(!parsed.valid||pass1.length<6||pass1!==pass2){
   $('primaryError').textContent=t('invalidCreds');return;
  }
  state.credentials={login:loginVal,password:pass1,password2:pass2};
 }
 const roleErr=checkRoleFields($('primaryRoleFields'));
 if(roleErr){$('primaryError').textContent=roleErr;return;}
 $('primaryError').textContent='';
 setStep(4);
});

$('primaryForm').addEventListener('keydown',ev=>{
 if(ev.key==='Enter'&&ev.target instanceof HTMLInputElement&&!ev.isComposing){ev.preventDefault();$('toSchoolStep').click();}
});

$('lang').addEventListener('change',event=>{
 lang=event.target.value==='ru'?'ru':'tg';
 saveLanguage(lang);
 if(!useFileViewer){
  const url=new URL(location.href);
  if(url.searchParams.has('lang')){url.searchParams.set('lang',lang);try{history.replaceState(null,'',url);}catch{}}
 }
 render();
});

$('schoolSearch').addEventListener('input',fillSchoolChoices);
$('schoolChoice').addEventListener('change',event=>{
 state.school=event.target.value;
 if(state.school&&state.creatingNewSchool){
  state.creatingNewSchool=false;
  $('newSchoolForm').hidden=true;
 }
 $('begin').disabled=!canSubmitStep4();
});

$('toggleNewSchoolBtn')?.addEventListener('click',()=>{
 state.creatingNewSchool=!state.creatingNewSchool;
 $('newSchoolForm').hidden=!state.creatingNewSchool;
 if(state.creatingNewSchool){
  populateNewSchoolTerritory();
  $('newSchoolRegion')?.focus();
 }
 $('begin').disabled=!canSubmitStep4();
});
$('newSchoolRegion')?.addEventListener('change',ev=>{
 state.newSchool.region_name=clean(ev.target.value);
 populateNewSchoolTerritory();
 $('begin').disabled=!canSubmitStep4();
});
$('newSchoolDistrict')?.addEventListener('input',ev=>{
 state.newSchool.district_name=clean(ev.target.value);
 $('begin').disabled=!canSubmitStep4();
});
$('newSchoolName')?.addEventListener('input',ev=>{
 state.newSchool.name=clean(ev.target.value);
 $('begin').disabled=!canSubmitStep4();
});
$('newSchoolCode')?.addEventListener('input',ev=>{
 state.newSchool.school_code=clean(ev.target.value);
});

let enteringCabinet=false;
$('begin').addEventListener('click',async()=>{
 if(enteringCabinet||step!==4||!state.primary||!canSubmitStep4())return;
 enteringCabinet=true;
 $('begin').disabled=true;
 $('beginError').textContent=t('opening');

 try{
  const loginVal=clean(state.credentials.login);
  const password=state.credentials.password;
  const fullName=[state.person.last,state.person.first,state.person.middle].filter(Boolean).join(' ').trim();
  const positionProfiles=Object.fromEntries(
   state.extras.map(id=>[id,{usePrimary:true,...state.person}])
  );

  let targetSchoolId=state.creatingNewSchool?'':state.school;
  let newSchoolPayload=null;
  if(state.creatingNewSchool){
   const matchedAuth=Array.isArray(state.cloudAuthorities)
    ? state.cloudAuthorities.find(a=>a.authority_tier==='maorif'&&a.district_name===state.newSchool.district_name&&(!state.newSchool.region_name||a.region_name===state.newSchool.region_name))
    : null;
   newSchoolPayload={
    name:clean(state.newSchool.name),
    region_name:clean(state.newSchool.region_name),
    district_name:clean(state.newSchool.district_name),
    school_code:clean(state.newSchool.school_code),
    parent_id:matchedAuth?.id||'',
   };
  }

  // If online & user created login+password (either existing UUID school OR self-registered new school), register on backend
  const isUuidSchool=/^[0-9a-f-]{36}$/i.test(targetSchoolId);
  if(loginVal&&password&&(isUuidSchool||newSchoolPayload)&&!useFileViewer&&navigator.onLine!==false){
   $('beginError').textContent=t('regBusy');
   const regRes=await fetch(`${cloudCfg.url}/functions/v1/register-user`,{
    method:'POST',
    headers:{apikey:cloudCfg.publishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({
     action:'register',
     login:loginVal,
     password,
     ...(isUuidSchool?{organization_id:targetSchoolId}:{new_school:newSchoolPayload}),
     primary_position:state.primary,
     extra_positions:state.extras,
     include_aliya:state.includeAliya,
     custom_method_name:state.customMethodName,
     full_name:fullName,
     preferred_lang:lang,
     profile_details:state.person,
     position_profiles:positionProfiles,
    }),
   }).catch(()=>null);
   if(regRes){
    const regJson=await regRes.json().catch(()=>({}));
    if(regRes.status===409){
     $('beginError').textContent=t('duplicateLogin');
     enteringCabinet=false;$('begin').disabled=false;return;
    }
    if(!regRes.ok){
     $('beginError').textContent=regJson?.error||t('blocked');
     enteringCabinet=false;$('begin').disabled=false;return;
    }
    if(regJson?.school?.id){
     targetSchoolId=regJson.school.id;
     state.school=targetSchoolId;
     if(!Array.isArray(state.cloudSchools))state.cloudSchools=[];
     if(!state.cloudSchools.some(s=>s.id===targetSchoolId))state.cloudSchools.push(regJson.school);
    }
    if(regJson?.session?.access_token){
     writeStoreItem(cloudSessionKey,JSON.stringify(regJson.session));
     writeStoreItem('smartmaktab.cloud.last_org.v1',targetSchoolId);
    }
   }
  }

  if(!targetSchoolId&&newSchoolPayload){
   const slugId='custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
   const localEntry={id:slugId,...newSchoolPayload};
   const existingCustoms=readLocalCustomSchools();
   existingCustoms.push(localEntry);
   writeStoreItem('smartmaktab.custom_schools.v1',JSON.stringify(existingCustoms));
   targetSchoolId=slugId;
   state.school=slugId;
  }

  const row=roster.get(state.primary);
  const roles=[state.primary,...state.extras].map(id=>{
   const item=roster.get(id);
   const customTitle=(id==='school-five-method-groups'&&state.customMethodName)?state.customMethodName:roleTitle(id);
   return {id,path:item.path,title:customTitle};
  });
  const schools=Object.fromEntries(roles.map(role=>[role.id,state.schools[role.id]||targetSchoolId]));
  const workspace={primary:state.primary,schools,roles};
  const unifiedProfile={
   fullName,
   loginName:loginVal,
   person:{...state.person},
   customMethodName:state.customMethodName,
   includeAliya:state.includeAliya,
   positions:positionProfiles,
   organizationId:targetSchoolId,
   organizationName:resolveSchoolTitle(targetSchoolId),
  };

  const payload={
   'smartmaktab.demo.workspace.v1':JSON.stringify(workspace),
   [profileStorageKey]:JSON.stringify(unifiedProfile),
  };
  for(const role of roles){
   const allowName=role.id!=='school-girls-council-chair';
   const pForRole=role.id===state.primary?state.person:(positionProfiles[role.id]||state.person);
   Object.assign(payload,buildRolePayload(role,schools[role.id],dataForRole(role.id),allowName?pForRole:{first:'',last:''}));
  }

  const nativeOrigin=location.protocol==='smapp:'||location.hostname==='appassets.androidplatform.net';
  const embeddedOnly=useFileViewer||(!nativeOrigin&&navigator.onLine===false&&!isUuidSchool&&!newSchoolPayload);
  const activeSchoolName=resolveSchoolTitle(schools[row.id]);
  const intro=brandSplash.play('school',{school:activeSchoolName,role:roles[0].title,lang});
  if(embeddedOnly)void getPack().catch(()=>{});
  await intro;

  const isHandoff=key=>key.startsWith('smartmaktab.demo.role-name.v2.')||key.startsWith('smartmaktab.demo.role-setup.v3.')||key.startsWith('smartmaktab.demo.saved-setup.v3.')||key.startsWith('smartmaktab.demo.saved-name.v2.')||key==='smartmaktab.demo.director-handoff.v1';
  const activeSchool=schools[row.id]||targetSchoolId;
  const qs=new URLSearchParams();
  if(validSchools.has(activeSchool)||/^(?:[0-9a-f-]{36}|custom-[a-z0-9-]+)$/i.test(activeSchool))qs.set('school',activeSchool);
  qs.set('lang',lang);
  const activeRoute=`${row.path}?${qs.toString()}`;
  const activePayload={role:state.primary,school:activeSchool,lang,route:activeRoute,savedAt:Date.now()};

  if(!embeddedOnly)try{
   for(const key of Object.keys(localStorage))if(isHandoff(key))removeStoreItem(key);
   localStorage.removeItem('smartmaktab.wizard.state');
   for(const [key,value] of Object.entries(payload))writeStoreItem(key,value);
   writeStoreItem(activeCabinetKey,JSON.stringify(activePayload));
   try{globalThis.SmartMaktabSqlite?.saveResumeSession?.(state.primary,activeSchool,lang,activeRoute);}catch{}
   location.assign('./'+activeRoute);$('beginError').textContent='';return;
  }catch{}

  for(const key of Object.keys(embeddedStore))if(isHandoff(key))delete embeddedStore[key];
  Object.assign(embeddedStore,payload);
  $('beginError').textContent=await openEmbedded(row.path,{lang,title:roles[0].title,school:activeSchool})?'':t('blocked');
 }catch{
  $('beginError').textContent=t('blocked');
 }finally{
  enteringCabinet=false;
  $('begin').disabled=!canSubmitStep4();
 }
});

render();
$('wizard').inert=false;
$('viewerNotReady').hidden=true;

if(resumeTarget){
 // Navigating directly to the saved cabinet; skip launch splash.
}else if(!useFileViewer&&openOfflineRoute&&rows.some(row=>row.path===openOfflineRoute)){
 const row=rows.find(row=>row.path===openOfflineRoute);
 try{for(const key of Object.keys(localStorage))if(key.startsWith('smartmaktab.demo.')||key===profileStorageKey)embeddedStore[key]=localStorage.getItem(key);}catch{}
 openEmbedded(row.path,{school:params.get('school'),lang,title:row.title});
}else{
 brandSplash.play('launch',{lang});
}

if(!useFileViewer&&location.protocol!=='smapp:'&&location.hostname!=='appassets.androidplatform.net'){
 try{navigator.serviceWorker?.register('./sw.js').catch(()=>{});}catch{}
}

if(globalThis.SmartMaktabAndroid)globalThis.smartMaktabBack=()=>{
 const splash=$('brandSplash');if(splash.open){$('splashSkip').click();return true;}
 if(updMenu?.open){updMenu.open=false;return true;}
 if($('offlineDeck')&&!$('offlineDeck').hidden){closeEmbedded();return true;}
 if(step<=0)return false;
 setStep(step-1);return true;
};
