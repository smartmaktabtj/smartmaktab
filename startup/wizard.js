'use strict';
try{
 const _q=new URLSearchParams(location.search);
 if(!_q.get('setup')&&!_q.get('register')&&localStorage.getItem('smartmaktab.active-cabinet.v1')&&localStorage.getItem('smartmaktab.cloud.session.v1')){
  document.documentElement.style.visibility='hidden';
 }
}catch{}
const params=new URLSearchParams(location.search);
const wantsSetup=params.get('setup')==='1'||params.get('changeRole')==='1';
const wantsRegister=params.get('register')==='1';
const activeCabinetKey='smartmaktab.active-cabinet.v1';
const profileStorageKey='smartmaktab.profile.v1';
const cloudSessionKey='smartmaktab.cloud.session.v1';
const licenseCacheKey='smartmaktab.cloud.license.v1';
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
function checkResumeCandidate(){
 if(useFileViewer||openOfflineRoute||wantsSetup||wantsRegister)return null;
 hydrateFromSqlite();
 try{
  const rawActive=localStorage.getItem(activeCabinetKey)||globalThis.SmartMaktabSqlite?.getItem?.(activeCabinetKey)||'';
  const rawWorkspace=localStorage.getItem('smartmaktab.demo.workspace.v1')||globalThis.SmartMaktabSqlite?.getItem?.('smartmaktab.demo.workspace.v1')||'';
  const rawSession=localStorage.getItem(cloudSessionKey)||globalThis.SmartMaktabSqlite?.getItem?.(cloudSessionKey)||'';
  if(!rawActive||!rawWorkspace||!rawSession)return null;
  const active=JSON.parse(rawActive);
  const workspace=JSON.parse(rawWorkspace);
  const session=JSON.parse(rawSession);
  if(!active||!workspace?.primary||!Array.isArray(workspace.roles)||!session?.access_token)return null;
  if(typeof active.route==='string'&&validResumeRoute.test(active.route)){
   return {active,workspace,session};
  }
 }catch{}
 return null;
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
 methodGroups:[{id:'mg-1',name:'',subjects:[]}],
 person:{
  first:'',
  last:'',
  middle:'',
  birthDate:'',
  birthYear:'',
  gender:'',
  specialty:'',
  eduYears:'',
  education:'',
  institutionType:'',
  institutionShifts:'',
  languages:['tg'],
  otherLanguage:'',
 },
 credentials:{login:'',password:'',password2:''},
 overrides:new Map(),
 fields:new Map(),
 school:'',
 schools:Object.create(null),
 creatingNewSchool:false,
 newSchool:{region_name:'',district_name:'',jamoat_name:'',village_name:'',name:'',school_code:''},
 cloudSchools:null,
 cloudAuthorities:null,
 cloudLocations:null,
 cloudTariffs:null,
 bootstrapStatus:'idle',
 bootstrapError:'',
});
let state=empty();
let step=wantsRegister?1:0;
let authorityLoginMode=false;
let lang='tg';
saveLanguage('tg');

const copy={
 primary:['Основная', 'Асосӣ'],
 extra:['Дополнительная','Иловагӣ'],
 somoni:['сомони','сомонӣ'],
 perMonth:['/ мес','/ моҳ'],
 totalPrefix:['Итого:','Ҳамагӣ:'],
 aliyaYes:['+ Алия (30 сомони)','+ Алия (30 сомонӣ)'],
 selectedMain:['Основная должность: ','Вазифаи асосӣ: '],
 invalidProfile:['Заполните все обязательные поля анкеты (ФИО, дата рождения ДД.ММ.ГГГГ, пол, специальность, стаж, образование, тип учреждения и смены).','Ҳамаи майдонҳои ҳатмии варақаро пур кунед (Ном, насаб, санаи таваллуд рр.мм.сссс, ҷинс, ихтисос, собиқа, маълумот, навъи муассиса ва баст).'],
 invalidMethodGroups:['Укажите название и хотя бы один предмет для каждого методического объединения (от 1 до 5 групп).','Номи ҳар як иттиҳодияи методӣ ва ҳадди ақал як фанни онро интихоб кунед (аз 1 то 5 гурӯҳ).'],
 invalidMethodName:['Укажите название вашего методического объединения.','Номи иттиҳодияи методии худро ворид кунед.'],
 invalidOtherLang:['Укажите другой язык.','Забони дигарро нависед.'],
 invalidCreds:['Введите логин латиницей (a-z, 0-9, минимум 3 символа), номер телефона или Email и пароль не менее 6 символов, совпадающий в обоих полях.','Логинро бо ҳуруфи лотинӣ (a-z, 0-9, на кам аз 3 аломат), рақами телефон ё Email ва пароли на кам аз 6-аломатаро дар ҳар ду майдон якхела ворид кунед.'],
 invalidLoginCreds:['Введите логин (или телефон/Email) и пароль.','Логин (ё телефон/Email) ва паролро ворид кунед.'],
 loginFail:['Неверный логин или пароль. Убедитесь, что учётная запись создана при подключённом интернете.','Логин ё парол нодуруст аст. Боварӣ ҳосил кунед, ки ҳисоб ҳангоми пайваст будани интернет сохта шудааст.'],
 loginNetworkFail:['Сервер входа недоступен. Проверьте подключение к интернету и попробуйте снова.','Сервери воридшавӣ дастрас нест. Пайвасти интернетро санҷед ва боз кӯшиш кунед.'],
 authorityDenied:['Этот аккаунт не относится к Мудири маориф или Сардори раёсат.','Ин ҳисоб ба Мудири маориф ё Сардори раёсат тааллуқ надорад.'],
 deviceLimitErr:['Достигнут лимит активных устройств для этого аккаунта. Отвяжите одно из устройств ниже, чтобы войти.','Шумораи ниҳоии дастгоҳҳои фаъол барои ин ҳисоб пур шуд. Барои ворид шудан яке аз дастгоҳҳои поёниро ҷудо кунед.'],
 deviceDisabledErr:['Доступ для этого аккаунта временно отключён. Обратитесь к руководителю или администратору.','Дастрасӣ барои ин ҳисоб муваққатан қатъ шудааст. Ба роҳбар ё маъмур муроҷиат кунед.'],
 deviceListTitle:['Активные устройства:','Дастгоҳҳои фаъол:'],
 deviceUnlinkBtn:['Отвязать','Ҷудо кардан'],
 deviceUnlinkedOk:['Устройство отвязано. Нажмите «Войти» снова.','Дастгоҳ ҷудо карда шуд. Тугмаи «Ворид шудан»-ро аз нав пахш кунед.'],
 loginBusy:['Выполняется вход…','Воридшавӣ иҷро мешавад…'],
 regBusy:['Создание аккаунта на сервере…','Сохтани ҳисоб дар сервер…'],
 regFileViewerErr:['Нельзя создать аккаунт в системе при открытии локального HTML-файла. Откройте сайт SmartMaktab или установленное приложение с интернетом.','Ҳангоми кушодани файли маҳаллии HTML сохтани ҳисоб дар система имконнопазир аст. Сомонаи SmartMaktab ё барномаи насбшударо бо интернет кушоед.'],
 regOfflineErr:['Нет подключения к интернету. Чтобы сохранить аккаунт в базе и входить с других устройств, подключитесь к интернету.','Пайвасти интернет нест. Барои сабти ҳисоб дар пойгоҳи додаҳо ва воридшавӣ аз дастгоҳҳои дигар интернетро фаъол кунед.'],
 regSchoolsUnavailable:['Не удалось загрузить список учреждений с сервера — аккаунт не создан. Проверьте интернет и нажмите «Повторить» либо добавьте учреждение вручную.','Рӯйхати муассисаҳо аз сервер бор нашуд — ҳисоб сохта нашуд. Интернетро санҷида «Аз нав бор кардан»-ро пахш кунед ё муассисаро дастӣ илова намоед.'],
 regSchoolPickCloud:['Список учреждений обновлён с сервера. Выберите ваше учреждение в списке и нажмите «Оғоз».','Рӯйхати муассисаҳо аз сервер нав шуд. Муассисаи худро аз рӯйхат интихоб карда, «Оғоз»-ро пахш кунед.'],
 regNetworkFail:['Не удалось связаться с сервером регистрации — аккаунт НЕ создан. Проверьте интернет и попробуйте снова.','Бо сервери бақайдгирӣ пайваст шуда нашуд — ҳисоб сохта НАШУД. Интернетро санҷида боз кӯшиш кунед.'],
 regSessionMissing:['Аккаунт создан, но не удалось подтвердить вход. Попробуйте войти на стартовом экране с этим логином и паролем.','Ҳисоб сохта шуд, вале воридшавӣ тасдиқ нашуд. Дар саҳифаи асосӣ бо ҳамин логин ва парол ворид шавед.'],
 duplicateLogin:['Этот логин или телефон уже зарегистрирован. Нажмите «Войти» на стартовом экране.','Ин логин ё телефон аллакай ба қайд гирифта шудааст. Дар саҳифаи асосӣ «Ворид шудан»-ро пахш кунед.'],
 blocked:['Кабинет не открылся. Попробуйте снова или откройте index.html в Chrome/Edge.','Утоқи корӣ кушода нашуд. Боз кӯшиш кунед ё index.html-ро дар Chrome/Edge кушоед.'],
 opening:['Открываем кабинет…','Утоқи корӣ кушода мешавад…'],
 authTitleSchool:['Вход в SmartMaktab','Воридшавӣ ба SmartMaktab'],
 authSubSchool:['Введите логин, номер телефона или Email и пароль.','Логин, рақами телефон ё Email ва пароли худро ворид кунед.'],
 authTitleAuthority:['Вход: Мудири маориф / Сардори раёсат / Коргаргузор','Вуруд: Мудири маориф / Сардори раёсат / Коргаргузор'],
 authSubAuthority:['Введите логин и пароль, выданные администратором.','Логин ва пароли аз ҷониби маъмур додашударо ворид кунед.'],
};
const t=key=>copy[key][lang==='tg'?1:0];
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const clean=value=>String(value||'').trim();
const hasCyrillic=value=>/[\u0400-\u04FF]/.test(String(value||''));

function parseBirthDateValue(raw){
 const s=clean(raw);
 const m=s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
 if(!m)return {valid:false};
 const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]);
 if(y<1940||y>2015||mo<1||mo>12||d<1||d>31)return {valid:false};
 const dt=new Date(y,mo-1,d);
 if(dt.getFullYear()!==y||dt.getMonth()!==mo-1||dt.getDate()!==d)return {valid:false};
 return {valid:true,birthDate:`${m[1]}.${m[2]}.${m[3]}`,birthYear:m[3]};
}

function updateLatinWarnings(){
 const lw=$('loginLatinWarn');
 if(lw)lw.hidden=!(hasCyrillic($('loginIdentifier')?.value)||hasCyrillic($('loginPassword')?.value));
 const rw=$('regLatinWarn');
 if(rw)rw.hidden=!(hasCyrillic($('regLogin')?.value)||hasCyrillic($('regPassword')?.value)||hasCyrillic($('regPassword2')?.value));
}

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
  if(globalThis.SmartMaktabWindows?.checkAppRelease){
   const r=await globalThis.SmartMaktabWindows.checkAppRelease().catch(()=>({status:'network'}));
   if(r.status==='available'&&r.downloadUrl){
    await globalThis.SmartMaktabWindows.openAppDownload(r.downloadUrl).catch(()=>{});
   }else{
    updStatusLine.hidden=false;
    updStatusLine.textContent=r.status==='up-to-date'
     ?`Нусхаи навтарин (${r.currentVersion}) насб аст.`
     :'Санҷиш имконнопазир (интернет лозим).';
    updMenu.open=true;
   }
   return;
  }
  try{
   const regs=await navigator.serviceWorker?.getRegistrations?.();
   if(regs)await Promise.all(regs.map(r=>r.unregister()));
   const keys=await globalThis.caches?.keys?.();
   if(keys)await Promise.all(keys.map(k=>caches.delete(k)));
  }catch{}
  if(globalThis.SmartMaktabAndroid){location.reload();return;}
  updStatusLine.hidden=false;
  updStatusLine.textContent='Барнома санҷида шуд.';
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
 const warn=$('priceWarning');
 if(warn){
  const devQuota=computeAllowedDeviceQuota(state.extras.length);
  const perKind=Math.max(1,Math.ceil(devQuota/2));
  warn.textContent=`Дастрасӣ ба то ${devQuota} дастгоҳ (${perKind} мобайл + ${perKind} компютер) · Моҳи 1-ум ройгон (30 рӯз) · Баъд барои 3, 6, 9, 12 моҳ тахфиф то 15%.`;
 }
}

function setStep(n){
 step=n;
 if(step>=1&&!useFileViewer&&state.bootstrapStatus!=='ready'){
  void loadRegistrationBootstrap();
 }
 if(step===4&&$('beginError'))$('beginError').textContent='';
 render();
 const active=sections.find(s=>Number(s.dataset.step)===n);
 if(active){
  const body=active.querySelector('.setup-step-body');
  if(body)body.scrollTop=0;
  active.querySelector('h2')?.focus({preventScroll:true});
 }
}

function hasMethodGroupsRole(){
 return state.primary==='school-five-method-groups'||state.extras.includes('school-five-method-groups');
}

function renderMethodGroups(){
 const box=$('methodGroupsSetupBox'),list=$('methodGroupsList'),addBtn=$('addMethodGroupBtn');
 if(!box||!list)return;
 const active=hasMethodGroupsRole();
 box.hidden=!active;
 if(!active)return;
 if(!Array.isArray(state.methodGroups)||!state.methodGroups.length){
  state.methodGroups=[{id:'mg-1',name:'',subjects:[]}];
 }
 const subs=typeof subjectLabels!=='undefined'?Object.entries(subjectLabels):[];
 const cards=state.methodGroups.map((g,idx)=>{
  const card=el('div',undefined,'row');
  card.style.marginTop='10px';
  const head=el('div',undefined,'role-head');
  head.append(el('strong',`Гурӯҳи ${idx+1}`));
  if(state.methodGroups.length>1){
   const rm=el('button','✕','button alt');
   rm.type='button';
   rm.style.padding='4px 9px';
   rm.addEventListener('click',()=>{
    state.methodGroups.splice(idx,1);
    renderMethodGroups();
   });
   head.append(rm);
  }
  const nameField=el('label',undefined,'field');
  nameField.style.marginTop='6px';
  const nameInp=el('input');
  nameInp.type='text';
  nameInp.maxLength=120;
  nameInp.placeholder='Масалан: Иттиҳодияи методии фанҳои дақиқ';
  nameInp.value=g.name||'';
  nameInp.addEventListener('input',()=>{
   g.name=nameInp.value;
   if($('step2Error'))$('step2Error').textContent='';
  });
  nameField.append(el('span','Номи иттиҳодияи методӣ *'),nameInp);

  const subSet=new Set(Array.isArray(g.subjects)?g.subjects:[]);
  const subBox=el('div',undefined,'checkboxes');
  subBox.style.marginTop='8px';
  for(const [k,label] of subs){
   const lbl=el('label');
   const cb=el('input');
   cb.type='checkbox';
   cb.value=k;
   cb.checked=subSet.has(k);
   cb.addEventListener('change',()=>{
    if(cb.checked)subSet.add(k);else subSet.delete(k);
    g.subjects=[...subSet];
    if($('step2Error'))$('step2Error').textContent='';
   });
   lbl.append(cb,el('span',label));
   subBox.append(lbl);
  }
  card.append(head,nameField,el('p','Фанҳои гурӯҳ *','small'),subBox);
  return card;
 });
 list.replaceChildren(...cards);
 if(addBtn)addBtn.disabled=state.methodGroups.length>=5;
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
 if($('step2Error'))$('step2Error').textContent='';
 renderMethodGroups();
 updateTotalBar();
}

function renderProfileStep(){
 const needsMethodName=hasMethodGroupsRole();
 $('customMethodWrap').hidden=!needsMethodName;
 $('customMethodNameInput').required=needsMethodName;
 if(needsMethodName&&!clean(state.customMethodName)&&Array.isArray(state.methodGroups)){
  const joined=state.methodGroups.map(g=>clean(g.name)).filter(Boolean).join(', ');
  if(joined)state.customMethodName=joined;
 }
 $('customMethodNameInput').value=state.customMethodName||'';

 $('firstName').value=state.person.first||'';
 $('lastName').value=state.person.last||'';
 $('middleName').value=state.person.middle||'';
 $('birthYear').value=state.person.birthDate||state.person.birthYear||'';
 $('genderSelect').value=state.person.gender||'';
 $('specialtyInput').value=state.person.specialty||'';
 $('eduYearsInput').value=state.person.eduYears||'';
 $('educationSelect').value=state.person.education||'';
 $('institutionTypeSelect').value=state.person.institutionType||'';
 $('institutionShiftsSelect').value=state.person.institutionShifts||'';
 $('otherLangInput').value=state.person.otherLanguage||'';
 const langSet=new Set(Array.isArray(state.person.languages)?state.person.languages:['tg']);
 for(const cb of $('langChoices').querySelectorAll('input[type=checkbox]')){
  cb.checked=langSet.has(cb.value);
 }
 $('otherLangWrap').hidden=!langSet.has('other');
 const credBox=$('regCredentialsBox');
 if(credBox)credBox.hidden=Boolean(useFileViewer);
 $('regLogin').required=!useFileViewer;
 $('regPassword').required=!useFileViewer;
 $('regPassword2').required=!useFileViewer;
 $('regLogin').value=state.credentials.login||'';
 $('regPassword').value=state.credentials.password||'';
 $('regPassword2').value=state.credentials.password2||'';
 $('primaryError').textContent='';
 updateLatinWarnings();
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
 document.documentElement.lang='tg';startupTheme.refresh();
 for(const [node] of staticText)node.textContent=node.dataset.tg;

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

function describeRegError(code,statusCode){
 const c=String(code||'');
 if(c==='invalid_login')return t('invalidCreds');
 if(c==='password_too_short')return t('invalidCreds');
 if(c==='login_already_exists')return t('duplicateLogin');
 if(c==='school_name_required'||c==='region_and_district_required'||c==='school_not_found'||c==='invalid_school'||c==='school_create_failed'||c==='invalid_parent_authority'){
  return lang==='tg'
   ?'Маълумоти мактаб нодуруст аст. Мактабро аз рӯйхат интихоб кунед ё номи мактабу ноҳияро пурра ворид намоед.'
   :'Проверьте данные школы: выберите школу из списка или полностью укажите регион, район и название школы.';
 }
 if(c)return statusCode?`${c} (HTTP ${statusCode})`:c;
 return statusCode?`${t('regNetworkFail')} (HTTP ${statusCode})`:t('regNetworkFail');
}

function applyBootstrapPayload(data){
 state.cloudSchools=data.schools;
 if(Array.isArray(data?.authorities)&&data.authorities.length)state.cloudAuthorities=data.authorities;
 if(Array.isArray(data?.locations)&&data.locations.length)state.cloudLocations=data.locations;
 if(Array.isArray(data?.tariffs)&&data.tariffs.length)state.cloudTariffs=data.tariffs;
 state.bootstrapStatus='ready';
 state.bootstrapError='';
}

// Fetch real schools, authorities, locations & tariffs via Data API RPC first, falling back to Edge Function
let bootstrapPromise=null;
async function loadRegistrationBootstrap(opts={}){
 const force=Boolean(opts?.force);
 if(useFileViewer){state.bootstrapStatus='offline';state.bootstrapError='';return false;}
 if(navigator.onLine===false){state.bootstrapStatus='error';state.bootstrapError='offline';if(step===4)fillSchoolChoices();return false;}
 if(!force&&state.bootstrapStatus==='ready'&&Array.isArray(state.cloudSchools))return true;
 if(bootstrapPromise)return bootstrapPromise;
 state.bootstrapStatus='loading';
 state.bootstrapError='';
 if(step===4)fillSchoolChoices();
 bootstrapPromise=(async()=>{
  const ctrl=typeof AbortController==='function'?new AbortController():null;
  const timer=ctrl?setTimeout(()=>ctrl.abort(),25000):0;
  let lastErr='';
  try{
   try{
    const rpcRes=await fetch(`${cloudCfg.url}/rest/v1/rpc/get_registration_bootstrap`,{
     method:'POST',
     headers:{apikey:cloudCfg.publishableKey,'Content-Type':'application/json'},
     body:'{}',
     ...(ctrl?{signal:ctrl.signal}:{}),
    });
    if(rpcRes.ok){
     const rpcData=await rpcRes.json().catch(()=>null);
     if(rpcData&&Array.isArray(rpcData.schools)){
      applyBootstrapPayload(rpcData);
      return true;
     }
     lastErr='RPC invalid';
    }else{
     lastErr=`RPC HTTP ${rpcRes.status}`;
    }
   }catch(err){
    lastErr=err?.name==='AbortError'?'Timeout':'RPC network';
   }

   try{
    const fnRes=await fetch(`${cloudCfg.url}/functions/v1/register-user?action=bootstrap`,{
     method:'GET',
     headers:{apikey:cloudCfg.publishableKey},
     ...(ctrl?{signal:ctrl.signal}:{}),
    });
    if(fnRes.ok){
     const fnData=await fnRes.json().catch(()=>null);
     if(fnData&&Array.isArray(fnData.schools)){
      applyBootstrapPayload(fnData);
      return true;
     }
     lastErr='FN invalid';
    }else{
     lastErr=`FN HTTP ${fnRes.status}`;
    }
   }catch(err){
    lastErr=err?.name==='AbortError'?'Timeout':'FN network';
   }

   state.bootstrapStatus='error';
   state.bootstrapError=lastErr||'Network';
   return false;
  }finally{
   if(timer)clearTimeout(timer);
   bootstrapPromise=null;
   if(step===4){fillSchoolChoices();renderExtraSchools();}
   else if(step===1||step===2){renderPrimaryAndExtraChoices();}
  }
 })();
 return bootstrapPromise;
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

function getOrCreateDeviceId(){
 const key='smartmaktab.device.id.v1';
 const legacyKey='smartmaktab.device_id.v1';
 let id='';
 try{
  id=localStorage.getItem(key)||'';
  if(!id){
   const legacy=localStorage.getItem(legacyKey)||'';
   if(legacy&&legacy.length>=12){
    id=legacy;
    localStorage.setItem(key,id);
   }
  }
 }catch{}
 if(!id||id.length<12){
  const rnd=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():('dev-'+Date.now()+'-'+Math.random().toString(36).slice(2,12));
  id=rnd;
  try{localStorage.setItem(key,id);}catch{}
 }
 return id;
}
function detectDeviceKind(){
 if(typeof window!=='undefined'&&window.SmartMaktabAndroid)return 'mobile';
 if(typeof navigator!=='undefined'&&/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||''))return 'mobile';
 return 'desktop';
}
function detectDeviceLabel(){
 if(typeof window!=='undefined'&&window.SmartMaktabAndroid)return 'Android App';
 const ua=typeof navigator!=='undefined'?(navigator.userAgent||''):'';
 if(/Android/i.test(ua))return 'Android Browser';
 if(/iPhone|iPad|iPod/i.test(ua))return 'iOS Browser';
 if(/Windows/i.test(ua))return 'Windows Browser';
 if(/Mac OS/i.test(ua))return 'macOS Browser';
 if(/Linux/i.test(ua))return 'Linux Browser';
 return 'Web Browser';
}
function clearLoginDeviceBlock(){
 const box=$('loginDeviceBlock');
 if(box)box.hidden=true;
 const list=$('loginDeviceList');
 if(list)list.replaceChildren();
}
async function showLoginDeviceLimit(accessToken,orgId){
 const box=$('loginDeviceBlock'),title=$('loginDeviceTitle'),list=$('loginDeviceList');
 if(!box||!list)return;
 if(title)title.textContent=t('deviceListTitle');
 list.replaceChildren();
 box.hidden=false;
 try{
  const res=await fetch(`${cloudCfg.url}/rest/v1/rpc/get_my_device_sessions`,{
   method:'POST',
   headers:{apikey:cloudCfg.publishableKey,Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
   body:JSON.stringify({p_org_id:orgId}),
  });
  const rows=res.ok?await res.json().catch(()=>[]):[];
  if(!Array.isArray(rows)||!rows.length){box.hidden=true;return;}
  for(const d of rows){
   const row=document.createElement('div');
   row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#fff;border:1px solid #fecaca;border-radius:8px;font-size:13px;';
   const info=document.createElement('div');
   const kindTag=d.device_kind==='mobile'?'📱':'💻';
   const lbl=d.device_label||d.device_id||'Device';
   const dt=d.last_seen_at?new Date(d.last_seen_at).toLocaleDateString():'';
   info.textContent=`${kindTag} ${lbl}${dt?' · '+dt:''}`;
   const btn=document.createElement('button');
   btn.type='button';
   btn.textContent=t('deviceUnlinkBtn');
   btn.style.cssText='padding:4px 10px;border-radius:6px;border:1px solid #dc2626;background:#dc2626;color:#fff;font-size:12px;cursor:pointer;flex-shrink:0;';
   btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{
     const r=await fetch(`${cloudCfg.url}/rest/v1/rpc/revoke_my_device_session`,{
      method:'POST',
      headers:{apikey:cloudCfg.publishableKey,Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({p_device_id:d.device_id,p_org_id:orgId}),
     });
     if(r.ok){
      row.remove();
      $('loginError').textContent=t('deviceUnlinkedOk');
      if(!list.children.length)box.hidden=true;
     }else{btn.disabled=false;}
    }catch{btn.disabled=false;}
   });
   row.append(info,btn);
   list.append(row);
  }
 }catch{box.hidden=true;}
}

function wirePasswordToggle(btnId,inputId){
 $(btnId)?.addEventListener('click',()=>{
  const inp=$(inputId);
  if(!inp)return;
  const show=inp.type==='password';
  inp.type=show?'text':'password';
  $(btnId).textContent=show?'🙈':'👁️';
 });
}
wirePasswordToggle('toggleLoginPassword','loginPassword');
wirePasswordToggle('toggleRegPassword','regPassword');
wirePasswordToggle('toggleRegPassword2','regPassword2');
$('loginIdentifier')?.addEventListener('input',updateLatinWarnings);
$('loginPassword')?.addEventListener('input',updateLatinWarnings);

$('loginForm')?.addEventListener('submit',async ev=>{
 ev.preventDefault();
 clearLoginDeviceBlock();
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
  if(!ctxRes.ok){
   $('loginError').textContent=t('loginNetworkFail');
   return;
  }
  const ctx=await ctxRes.json().catch(()=>null);
  const memberships=Array.isArray(ctx?.memberships)?ctx.memberships:[];
  const primaryMem=memberships[0]||null;
  if(authorityLoginMode){
   const isAuth=Boolean(ctx?.is_super_admin)||memberships.some(m=>m.kind==='education_authority'||['office-head','office-clerk','raesat-head','raesat-clerk'].includes(m.primary_position)||['maorif','authority_viewer','district_observer'].includes(m.role));
   if(!isAuth){
    $('loginError').textContent=t('authorityDenied');
    return;
   }
  }
  if(primaryMem){
   if(primaryMem.account_active===false){
    $('loginError').textContent=t('deviceDisabledErr');
    return;
   }
   const claimRes=await fetch(`${cloudCfg.url}/rest/v1/rpc/claim_device_session`,{
    method:'POST',
    headers:{apikey:cloudCfg.publishableKey,Authorization:`Bearer ${authJson.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({
     p_org_id:primaryMem.organization_id,
     p_device_id:getOrCreateDeviceId(),
     p_device_label:detectDeviceLabel(),
     p_cabinet_id:primaryMem.primary_position||null,
     p_device_kind:detectDeviceKind(),
    }),
   });
   if(!claimRes.ok){
    $('loginError').textContent=t('loginNetworkFail');
    return;
   }
   const claim=await claimRes.json().catch(()=>null);
   if(claim&&claim.allowed===false){
    if(claim.reason==='account_disabled'){
     $('loginError').textContent=t('deviceDisabledErr');
     return;
    }
    $('loginError').textContent=t('deviceLimitErr');
    await showLoginDeviceLimit(authJson.access_token,primaryMem.organization_id);
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
     birthDate:profDetails.birthDate||profDetails.birthYear||'',
     birthYear:profDetails.birthYear||'',
     gender:profDetails.gender||'',
     specialty:profDetails.specialty||'',
     eduYears:profDetails.eduYears||'',
     education:profDetails.education||'',
     institutionType:profDetails.institutionType||'',
     institutionShifts:profDetails.institutionShifts||'',
     languages:Array.isArray(profDetails.languages)?profDetails.languages:['tg'],
     otherLanguage:profDetails.otherLanguage||'',
    },
    methodGroups:Array.isArray(profDetails.methodGroups)?profDetails.methodGroups:[],
    customMethodName:primaryMem.custom_method_name||'',
    includeAliya:Boolean(primaryMem.aliya_enabled),
    positions:primaryMem.position_profiles||{},
    organizationId:primaryMem.organization_id,
    organizationName:primaryMem.organization_name,
    verificationStatus:ctx?.is_super_admin?'verified':(primaryMem.verification_status||'unverified'),
    primaryPosition:primaryMem.primary_position||'',
    canManageUsers:Boolean(ctx?.is_super_admin)||(primaryMem.verification_status==='verified'&&(canPositionManageUsers(primaryMem.primary_position)||(primaryMem.extra_positions||[]).some(canPositionManageUsers))),
    canReviewVerifications:Boolean(ctx?.is_super_admin)||(primaryMem.kind==='education_authority'?primaryMem.verification_status==='verified':(primaryMem.verification_status==='verified'&&canPositionVerifySchoolStaff(primaryMem.primary_position))),
   };
   writeStoreItem(profileStorageKey,JSON.stringify(savedProf));

   const targetRow=roster.get(roles[0].id);
   const targetLang='tg';
   const route=`${targetRow.path}?school=${primaryMem.organization_id}&lang=${targetLang}`;
   writeStoreItem(activeCabinetKey,JSON.stringify({role:roles[0].id,school:primaryMem.organization_id,lang:targetLang,route,savedAt:Date.now()}));
   try{globalThis.SmartMaktabSqlite?.saveResumeSession?.(roles[0].id,primaryMem.organization_id,targetLang,route);}catch{}
   await brandSplash.play(primaryMem.kind==='education_authority'?'maorif':'school',{school:primaryMem.organization_name,role:roles[0].title,lang:targetLang});
   location.assign('./'+route);
   return;
  }
  setStep(1);
 }catch{
  $('loginError').textContent=t('loginNetworkFail');
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
 renderMethodGroups();
 updateTotalBar();
});

$('addMethodGroupBtn')?.addEventListener('click',()=>{
 if(!Array.isArray(state.methodGroups))state.methodGroups=[];
 if(state.methodGroups.length>=5)return;
 state.methodGroups.push({id:`mg-${Date.now()}-${state.methodGroups.length+1}`,name:'',subjects:[]});
 renderMethodGroups();
});

$('aliyaAddonToggle').addEventListener('change',ev=>{
 state.includeAliya=ev.target.checked;
 updateTotalBar();
});

$('toExtras').addEventListener('click',()=>{if(state.primary)setStep(2);});
$('toProfile').addEventListener('click',()=>{
 if(!state.primary)return;
 if(hasMethodGroupsRole()){
  const groups=Array.isArray(state.methodGroups)?state.methodGroups:[];
  const validGroups=groups.length>=1&&groups.length<=5&&groups.every(g=>clean(g.name).length>=2&&Array.isArray(g.subjects)&&g.subjects.length>=1);
  if(!validGroups){
   if($('step2Error'))$('step2Error').textContent=t('invalidMethodGroups');
   return;
  }
  state.customMethodName=groups.map(g=>clean(g.name)).filter(Boolean).join(', ');
 }
 if($('step2Error'))$('step2Error').textContent='';
 setStep(3);
});

// Step 3 form sync & validation
$('primaryForm').inert=false;
const bindInput=(id,fn)=>$(id)?.addEventListener('input',ev=>fn(ev.target.value));
const bindChange=(id,fn)=>$(id)?.addEventListener('change',ev=>fn(ev.target.value));
bindInput('firstName',v=>{state.person.first=v;});
bindInput('lastName',v=>{state.person.last=v;});
bindInput('middleName',v=>{state.person.middle=v;});
$('birthYear')?.addEventListener('input',ev=>{
 const elInp=ev.target;
 const raw=elInp.value;
 if(ev.inputType!=='deleteContentBackward'&&/^\d{1,8}$/.test(raw)){
  if(raw.length>=3&&raw.length<=4)elInp.value=`${raw.slice(0,2)}.${raw.slice(2)}`;
  else if(raw.length>=5)elInp.value=`${raw.slice(0,2)}.${raw.slice(2,4)}.${raw.slice(4,8)}`;
 }
 state.person.birthDate=elInp.value;
 const parsed=parseBirthDateValue(elInp.value);
 if(parsed.valid)state.person.birthYear=parsed.birthYear;
});
bindChange('genderSelect',v=>{state.person.gender=v;});
bindInput('specialtyInput',v=>{state.person.specialty=v;});
bindInput('eduYearsInput',v=>{state.person.eduYears=v;});
bindChange('educationSelect',v=>{state.person.education=v;});
bindChange('institutionTypeSelect',v=>{state.person.institutionType=v;});
bindChange('institutionShiftsSelect',v=>{state.person.institutionShifts=v;});
bindInput('customMethodNameInput',v=>{state.customMethodName=v;});
bindInput('otherLangInput',v=>{state.person.otherLanguage=v;});
bindInput('regLogin',v=>{state.credentials.login=v;updateLatinWarnings();});
bindInput('regPassword',v=>{state.credentials.password=v;updateLatinWarnings();});
bindInput('regPassword2',v=>{state.credentials.password2=v;updateLatinWarnings();});

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
 const birthRaw=clean($('birthYear').value);
 const birthParsed=parseBirthDateValue(birthRaw);
 p.gender=$('genderSelect').value;
 p.specialty=clean($('specialtyInput').value);
 p.eduYears=clean($('eduYearsInput').value);
 p.education=$('educationSelect').value;
 p.institutionType=$('institutionTypeSelect').value;
 p.institutionShifts=$('institutionShiftsSelect').value;
 state.customMethodName=clean($('customMethodNameInput').value);
 p.otherLanguage=clean($('otherLangInput').value);

 const exp=Number(p.eduYears);
 if(!p.first||!p.last||!birthParsed.valid||!p.gender||!p.specialty||!p.education||!p.institutionType||!p.institutionShifts||!Number.isFinite(exp)||exp<0||exp>70){
  $('primaryError').textContent=t('invalidProfile');return;
 }
 p.birthDate=birthParsed.birthDate;
 p.birthYear=birthParsed.birthYear;
 if(hasMethodGroupsRole()&&!state.customMethodName){
  $('primaryError').textContent=t('invalidMethodName');$('customMethodNameInput').focus();return;
 }
 if(p.languages.includes('other')&&!p.otherLanguage){
  $('primaryError').textContent=t('invalidOtherLang');$('otherLangInput').focus();return;
 }
 const loginVal=clean($('regLogin').value);
 const pass1=$('regPassword').value;
 const pass2=$('regPassword2').value;
 if(!useFileViewer){
  const parsed=normalizeLoginIdentifier(loginVal);
  if(!loginVal||!parsed.valid||pass1.length<6||pass1!==pass2){
   $('primaryError').textContent=t('invalidCreds');return;
  }
  state.credentials={login:loginVal,password:pass1,password2:pass2};
 }else{
  state.credentials={login:'',password:'',password2:''};
 }
 const roleErr=checkRoleFields($('primaryRoleFields'));
 if(roleErr){$('primaryError').textContent=roleErr;return;}
 $('primaryError').textContent='';
 setStep(4);
});

$('primaryForm').addEventListener('keydown',ev=>{
 if(ev.key==='Enter'&&ev.target instanceof HTMLInputElement&&!ev.isComposing){ev.preventDefault();$('toSchoolStep').click();}
});

$('schoolSearch').addEventListener('input',fillSchoolChoices);
$('retryBootstrapBtn')?.addEventListener('click',()=>{void loadRegistrationBootstrap({force:true});});
$('schoolChoice').addEventListener('change',event=>{
 state.school=event.target.value;
 if(state.school&&state.creatingNewSchool){
  state.creatingNewSchool=false;
  $('newSchoolForm').hidden=true;
 }
 $('beginError').textContent='';
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
 state.newSchool.region_name=canonicalRegionName(clean(ev.target.value));
 state.newSchool.district_name='';
 state.newSchool.jamoat_name='';
 state.newSchool.village_name='';
 if($('newSchoolDistrictSelect'))$('newSchoolDistrictSelect').value='';
 if($('newSchoolJamoatSelect'))$('newSchoolJamoatSelect').value='';
 if($('newSchoolVillageSelect'))$('newSchoolVillageSelect').value='';
 populateNewSchoolTerritory();
 $('begin').disabled=!canSubmitStep4();
});
$('newSchoolDistrictSelect')?.addEventListener('change',ev=>{
 state.newSchool.district_name=clean(ev.target.value);
 state.newSchool.jamoat_name='';
 state.newSchool.village_name='';
 if($('newSchoolJamoatSelect'))$('newSchoolJamoatSelect').value='';
 if($('newSchoolVillageSelect'))$('newSchoolVillageSelect').value='';
 populateNewSchoolTerritory();
 $('begin').disabled=!canSubmitStep4();
});
$('newSchoolJamoatSelect')?.addEventListener('change',ev=>{
 state.newSchool.jamoat_name=clean(ev.target.value);
 state.newSchool.village_name='';
 if($('newSchoolVillageSelect'))$('newSchoolVillageSelect').value='';
 populateNewSchoolTerritory();
});
$('newSchoolVillageSelect')?.addEventListener('change',ev=>{
 const v=ev.target.value;
 if(v==='__custom__'){
  if($('newSchoolVillageCustomWrap'))$('newSchoolVillageCustomWrap').hidden=false;
  state.newSchool.village_name=clean($('newSchoolVillageCustom')?.value);
 }else{
  if($('newSchoolVillageCustomWrap'))$('newSchoolVillageCustomWrap').hidden=true;
  state.newSchool.village_name=clean(v);
 }
});
$('newSchoolVillageCustom')?.addEventListener('input',ev=>{
 state.newSchool.village_name=clean(ev.target.value);
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
  if(!useFileViewer&&(!loginVal||!password||password.length<6)){
   $('beginError').textContent=t('invalidCreds');
   return;
  }
  const fullName=[state.person.last,state.person.first,state.person.middle].filter(Boolean).join(' ').trim();
  const methodGroups=hasMethodGroupsRole()?(state.methodGroups||[]):[];
  const profileDetails={...state.person,methodGroups};
  const positionProfiles=Object.fromEntries(
   state.extras.map(id=>[id,{usePrimary:true,...state.person}])
  );

  let targetSchoolId=state.creatingNewSchool?'':state.school;
  let newSchoolPayload=null;
  if(state.creatingNewSchool){
   const distVal=clean($('newSchoolDistrictSelect')?.value||state.newSchool.district_name);
   const regVal=canonicalRegionName(state.newSchool.region_name);
   const normDist=s=>clean(s).toLocaleLowerCase().replace(/^(?:ш\.|н\.|шаҳри|ноҳияи|г\.|р-н)\s+/i,'').replace(/\s+/g,' ');
   const distLower=normDist(distVal);
   const canonReg=regVal.toLocaleLowerCase();
   const matchedAuth=Array.isArray(state.cloudAuthorities)
    ? state.cloudAuthorities.find(a=>{
       if(a.authority_tier!=='maorif')return false;
       const aDist=normDist(a.district_name);
       const aReg=canonicalRegionName(a.region_name).toLocaleLowerCase();
       const distHit=aDist===distLower||(distLower.length>=3&&(aDist.includes(distLower)||distLower.includes(aDist)));
       return distHit&&(!canonReg||aReg===canonReg);
      })
    : null;
   const jamVal=clean($('newSchoolJamoatSelect')?.value||state.newSchool.jamoat_name);
   const vilVal=$('newSchoolVillageSelect')?.value==='__custom__'
    ? clean($('newSchoolVillageCustom')?.value)
    : clean($('newSchoolVillageSelect')?.value||state.newSchool.village_name);
   newSchoolPayload={
    name:clean(state.newSchool.name),
    region_name:regVal,
    district_name:distVal,
    jamoat_name:jamVal,
    village_name:vilVal,
    school_code:clean(state.newSchool.school_code),
    parent_id:matchedAuth?.id||'',
   };
  }

  if(!useFileViewer){
   if(navigator.onLine===false){
    $('beginError').textContent=t('regOfflineErr');
    return;
   }
   if(!newSchoolPayload&&!/^[0-9a-f-]{36}$/i.test(targetSchoolId)){
    $('beginError').textContent=t('regBusy');
    const ok=await loadRegistrationBootstrap({force:true});
    const matched=ok?findCloudSchoolMatch(targetSchoolId):null;
    if(matched?.id){
     targetSchoolId=matched.id;
     state.school=matched.id;
    }else if(ok){
     $('beginError').textContent=t('regSchoolPickCloud');
     return;
    }else{
     $('beginError').textContent=t('regSchoolsUnavailable');
     return;
    }
   }
   const isUuidSchool=/^[0-9a-f-]{36}$/i.test(targetSchoolId);
   $('beginError').textContent=t('regBusy');
   const regCtrl=typeof AbortController==='function'?new AbortController():null;
   const regTimer=regCtrl?setTimeout(()=>regCtrl.abort(),20000):0;
   let regRes=null;
   try{
    regRes=await fetch(`${cloudCfg.url}/functions/v1/register-user`,{
     method:'POST',
     headers:{apikey:cloudCfg.publishableKey,'Content-Type':'application/json'},
     ...(regCtrl?{signal:regCtrl.signal}:{}),
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
      profile_details:profileDetails,
      position_profiles:positionProfiles,
     }),
    });
   }catch{
    $('beginError').textContent=t('regNetworkFail');
    return;
   }finally{
    if(regTimer)clearTimeout(regTimer);
   }
   const regJson=await regRes.json().catch(()=>({}));
   if(regRes.status===409){
    $('beginError').textContent=t('duplicateLogin');
    return;
   }
   if(!regRes.ok||!regJson?.user_id){
    $('beginError').textContent=describeRegError(regJson?.error,regRes.status);
    return;
   }
   if(regJson?.school?.id){
    targetSchoolId=regJson.school.id;
    state.school=targetSchoolId;
    if(!Array.isArray(state.cloudSchools))state.cloudSchools=[];
    if(!state.cloudSchools.some(s=>s.id===targetSchoolId))state.cloudSchools.push(regJson.school);
   }
   let sessionObj=regJson?.session||null;
   if(!sessionObj?.access_token){
    const parsedLogin=normalizeLoginIdentifier(loginVal);
    if(parsedLogin.valid){
     const signRes=await fetch(`${cloudCfg.url}/auth/v1/token?grant_type=password`,{
      method:'POST',
      headers:{apikey:cloudCfg.publishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({email:parsedLogin.email,password}),
     }).catch(()=>null);
     if(signRes?.ok)sessionObj=await signRes.json().catch(()=>null);
    }
   }
   if(!sessionObj?.access_token){
    $('beginError').textContent=t('regSessionMissing');
    return;
   }
   if(targetSchoolId){
    try{
     const claimRes=await fetch(`${cloudCfg.url}/rest/v1/rpc/claim_device_session`,{
      method:'POST',
      headers:{apikey:cloudCfg.publishableKey,Authorization:`Bearer ${sessionObj.access_token}`,'Content-Type':'application/json'},
      body:JSON.stringify({
       p_org_id:targetSchoolId,
       p_device_id:getOrCreateDeviceId(),
       p_device_label:detectDeviceLabel(),
       p_cabinet_id:state.primary||null,
       p_device_kind:detectDeviceKind(),
      }),
     });
     if(claimRes.ok){
      const claim=await claimRes.json().catch(()=>null);
      if(claim&&claim.allowed===false){
       $('beginError').textContent=claim.reason==='account_disabled'?t('deviceDisabledErr'):t('deviceLimitErr');
       return;
      }
     }
    }catch{}
   }
   writeStoreItem(cloudSessionKey,JSON.stringify(sessionObj));
   writeStoreItem('smartmaktab.cloud.last_org.v1',targetSchoolId);
  }else if(!targetSchoolId&&newSchoolPayload){
   const slugId='custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,6);
   const localEntry={id:slugId,...newSchoolPayload};
   const existingCustoms=readLocalCustomSchools();
   existingCustoms.push(localEntry);
   writeStoreItem('smartmaktab.custom_schools.v1',JSON.stringify(existingCustoms));
   targetSchoolId=slugId;
   state.school=slugId;
  }

  const finalIsUuid=/^[0-9a-f-]{36}$/i.test(targetSchoolId);
  const row=roster.get(state.primary);
  const roles=[state.primary,...state.extras].map(id=>{
   const item=roster.get(id);
   const customTitle=(id==='school-five-method-groups'&&state.customMethodName)?state.customMethodName:roleTitle(id);
   return {id,path:item.path,title:customTitle};
  });
  const resolveExtraSchool=id=>{
   const chosen=state.schools[id];
   if(!chosen)return targetSchoolId;
   if(finalIsUuid&&!/^[0-9a-f-]{36}$/i.test(chosen)){
    return findCloudSchoolMatch(chosen)?.id||targetSchoolId;
   }
   return chosen;
  };
  const schools=Object.fromEntries(roles.map(role=>[role.id,resolveExtraSchool(role.id)]));
  const workspace={primary:state.primary,schools,roles};
  const unifiedProfile={
   fullName,
   loginName:loginVal,
   person:{...state.person},
   methodGroups,
   customMethodName:state.customMethodName,
   includeAliya:state.includeAliya,
   positions:positionProfiles,
   organizationId:targetSchoolId,
   organizationName:resolveSchoolTitle(targetSchoolId),
   verificationStatus:useFileViewer?'offline':'unverified',
   primaryPosition:state.primary,
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

  const activeSchoolName=resolveSchoolTitle(schools[row.id]);
  const intro=brandSplash.play('school',{school:activeSchoolName,role:roles[0].title,lang});
  if(useFileViewer)void getPack().catch(()=>{});
  await intro;

  const isHandoff=key=>key.startsWith('smartmaktab.demo.role-name.v2.')||key.startsWith('smartmaktab.demo.role-setup.v3.')||key.startsWith('smartmaktab.demo.saved-setup.v3.')||key.startsWith('smartmaktab.demo.saved-name.v2.')||key==='smartmaktab.demo.director-handoff.v1';
  const activeSchool=schools[row.id]||targetSchoolId;
  const qs=new URLSearchParams();
  if(validSchools.has(activeSchool)||/^(?:[0-9a-f-]{36}|custom-[a-z0-9-]+)$/i.test(activeSchool))qs.set('school',activeSchool);
  qs.set('lang',lang);
  const activeRoute=`${row.path}?${qs.toString()}`;
  const activePayload={role:state.primary,school:activeSchool,lang,route:activeRoute,savedAt:Date.now()};

  if(useFileViewer){
   for(const key of Object.keys(embeddedStore))if(isHandoff(key))delete embeddedStore[key];
   Object.assign(embeddedStore,payload);
   $('beginError').textContent=await openEmbedded(row.path,{lang,title:roles[0].title,school:activeSchool})?'':t('blocked');
   return;
  }

  for(const key of Object.keys(localStorage))if(isHandoff(key))removeStoreItem(key);
  localStorage.removeItem('smartmaktab.wizard.state');
  for(const [key,value] of Object.entries(payload))writeStoreItem(key,value);
  writeStoreItem(activeCabinetKey,JSON.stringify(activePayload));
  try{globalThis.SmartMaktabSqlite?.saveResumeSession?.(state.primary,activeSchool,lang,activeRoute);}catch{}
  location.assign('./'+activeRoute);$('beginError').textContent='';return;
 }catch{
  $('beginError').textContent=t('blocked');
 }finally{
  enteringCabinet=false;
  $('begin').disabled=!canSubmitStep4();
 }
});

function hasValidOfflineLicense(orgId){
 try{
  const raw=localStorage.getItem(licenseCacheKey)||globalThis.SmartMaktabSqlite?.getItem?.(licenseCacheKey)||'';
  if(!raw)return false;
  const cached=JSON.parse(raw);
  if(!cached||typeof cached!=='object')return false;
  if(orgId&&cached.orgId&&cached.orgId!==orgId)return false;
  return Number(cached.expiresAt)>Date.now()&&cached.blocked!==true;
 }catch{return false;}
}

function clearResumeSession(){
 removeStoreItem(activeCabinetKey);
 removeStoreItem(cloudSessionKey);
}

async function validateResumeAndNavigate(candidate){
 try{
  const {active,session}=candidate;
  const orgId=active.school||'';
  if(navigator.onLine===false){
   if(hasValidOfflineLicense(orgId)){
    location.replace('./'+active.route);
    return;
   }
   document.documentElement.style.visibility='';
   return;
  }
  const ctrl=typeof AbortController==='function'?new AbortController():null;
  const timer=ctrl?setTimeout(()=>ctrl.abort(),10000):0;
  try{
   const ctxRes=await fetch(`${cloudCfg.url}/rest/v1/rpc/get_my_workspace_context`,{
    method:'POST',
    headers:{apikey:cloudCfg.publishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:'{}',
    ...(ctrl?{signal:ctrl.signal}:{}),
   });
   if(ctxRes.status===401||ctxRes.status===403){
    clearResumeSession();
    document.documentElement.style.visibility='';
    return;
   }
   if(!ctxRes.ok){
    if(hasValidOfflineLicense(orgId)){location.replace('./'+active.route);return;}
    document.documentElement.style.visibility='';
    return;
   }
   const ctx=await ctxRes.json().catch(()=>null);
   const memberships=Array.isArray(ctx?.memberships)?ctx.memberships:[];
   const mem=(orgId?memberships.find(m=>m.organization_id===orgId):null)||memberships[0]||null;
   if(!mem&&!ctx?.is_super_admin){
    clearResumeSession();
    document.documentElement.style.visibility='';
    return;
   }
   if(mem&&mem.account_active===false){
    clearResumeSession();
    document.documentElement.style.visibility='';
    $('loginError').textContent=t('deviceDisabledErr');
    return;
   }
   if(mem){
    const claimRes=await fetch(`${cloudCfg.url}/rest/v1/rpc/claim_device_session`,{
     method:'POST',
     headers:{apikey:cloudCfg.publishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
     body:JSON.stringify({
      p_org_id:mem.organization_id,
      p_device_id:getOrCreateDeviceId(),
      p_device_label:detectDeviceLabel(),
      p_cabinet_id:active.role||mem.primary_position||null,
      p_device_kind:detectDeviceKind(),
     }),
     ...(ctrl?{signal:ctrl.signal}:{}),
    });
    if(claimRes.ok){
     const claim=await claimRes.json().catch(()=>null);
     if(claim&&claim.allowed===false){
      clearResumeSession();
      document.documentElement.style.visibility='';
      $('loginError').textContent=claim.reason==='account_disabled'?t('deviceDisabledErr'):t('deviceLimitErr');
      return;
     }
    }
   }
   location.replace('./'+active.route);
  }catch{
   if(hasValidOfflineLicense(orgId)){
    location.replace('./'+active.route);
    return;
   }
   document.documentElement.style.visibility='';
  }finally{
   if(timer)clearTimeout(timer);
  }
 }catch{
  document.documentElement.style.visibility='';
 }
}

render();
$('wizard').inert=false;
$('viewerNotReady').hidden=true;

const resumeCandidate=checkResumeCandidate();
if(resumeCandidate){
 void validateResumeAndNavigate(resumeCandidate);
}else{
 document.documentElement.style.visibility='';
 if(!useFileViewer&&openOfflineRoute&&rows.some(row=>row.path===openOfflineRoute)){
  const row=rows.find(row=>row.path===openOfflineRoute);
  try{for(const key of Object.keys(localStorage))if(key.startsWith('smartmaktab.demo.')||key===profileStorageKey)embeddedStore[key]=localStorage.getItem(key);}catch{}
  openEmbedded(row.path,{school:params.get('school'),lang,title:row.title});
 }else{
  brandSplash.play('launch',{lang});
 }
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
