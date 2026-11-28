import {setupUnifiedUpdateMenu} from './native-shell.mjs';
import {initWorkspaceViews} from './workspace-view.mjs';
import {setupSchoolForms} from './school-forms.mjs';
import {setupCloudWorkspace} from './cloud-workspace-ui.mjs';
import {setupPhase2Panels} from './phase2-panels.mjs';
import {createCloudClient} from './cloud-client.mjs';
import {getCloudConfig} from './cloud-config.mjs';
import {cabinetFormAction,clearActiveResume,appRoot,openCabinetView,persistentStore,tabStorage} from './cabinet-runtime.mjs';

const $=id=>document.getElementById(id);
const profileKey='smartmaktab.profile.v1';
const workspaceKey='smartmaktab.demo.workspace.v1';
const cloudSessionKey='smartmaktab.cloud.session.v1';

function readJsonStore(key){
 try{
  const raw=persistentStore.getItem(key)||tabStorage.getItem(key);
  return raw?JSON.parse(raw):null;
 }catch{return null;}
}
function writeJsonStore(key,obj){
 const str=JSON.stringify(obj);
 persistentStore.setItem(key,str);
 tabStorage.setItem(key,str);
}

function createProfileManager(cabinetId,tg,label){
 const card=document.createElement('section');
 card.className='section no-print';
 card.id='smUnifiedProfileCard';

 const head=document.createElement('div');
 head.className='pill-row';
 head.style.justifyContent='space-between';
 const title=document.createElement('h3');
 const cloudHost=document.createElement('div');
 cloudHost.className='control';
 cloudHost.style.margin='0';
 head.append(title,cloudHost);

 const posRow=document.createElement('div');
 posRow.className='steps';
 posRow.style.marginTop='10px';
 const posSelectWrap=document.createElement('label');
 posSelectWrap.className='field';
 const posSelectLbl=document.createElement('span');
 const posSelect=document.createElement('select');
 posSelectWrap.append(posSelectLbl,posSelect);

 const inheritWrap=document.createElement('label');
 inheritWrap.className='field';
 inheritWrap.style.justifyContent='end';
 const inheritBox=document.createElement('div');
 inheritBox.style.display='flex';
 inheritBox.style.alignItems='center';
 inheritBox.style.gap='8px';
 const inheritCb=document.createElement('input');
 inheritCb.type='checkbox';
 inheritCb.style.width='18px';
 inheritCb.style.height='18px';
 const inheritTxt=document.createElement('span');
 inheritBox.append(inheritCb,inheritTxt);
 inheritWrap.append(inheritBox);
 posRow.append(posSelectWrap,inheritWrap);

 const grid=document.createElement('div');
 grid.className='steps';
 grid.style.marginTop='10px';

 const makeInput=(id,type='text',opts={})=>{
  const lbl=document.createElement('label');
  lbl.className='field';
  const sp=document.createElement('span');
  const inp=document.createElement(type==='select'?'select':'input');
  inp.id=id;
  if(type!=='select')inp.type=type;
  if(opts.maxLength)inp.maxLength=opts.maxLength;
  if(opts.min!==undefined)inp.min=String(opts.min);
  if(opts.max!==undefined)inp.max=String(opts.max);
  lbl.append(sp,inp);
  return {lbl,sp,inp};
 };

 const fFirst=makeInput('profFirst','text',{maxLength:60});
 const fLast=makeInput('profLast','text',{maxLength:60});
 const fMiddle=makeInput('profMiddle','text',{maxLength:60});
 const fBirth=makeInput('profBirth','number',{min:1940,max:2015});
 const fGender=makeInput('profGender','select');
 const fSpec=makeInput('profSpec','text',{maxLength:100});
 const fExp=makeInput('profExp','number',{min:0,max:70});
 const fEdu=makeInput('profEdu','select');
 const fMethod=makeInput('profMethodName','text',{maxLength:120});
 const fLangs=makeInput('profLangsText','text',{maxLength:160});
 grid.append(fFirst.lbl,fLast.lbl,fMiddle.lbl,fBirth.lbl,fGender.lbl,fSpec.lbl,fExp.lbl,fEdu.lbl,fMethod.lbl,fLangs.lbl);

 const btnRow=document.createElement('div');
 btnRow.className='control';
 const saveBtn=document.createElement('button');
 saveBtn.type='button';
 saveBtn.className='button';
 saveBtn.id='saveUnifiedProfileBtn';
 const statusEl=document.createElement('p');
 statusEl.className='small';
 statusEl.setAttribute('role','status');
 btnRow.append(saveBtn);

 card.append(head,posRow,grid,btnRow,statusEl);

 let editingRoleId=cabinetId;

 function refreshOptions(){
  const gVal=fGender.inp.value;
  fGender.inp.replaceChildren(
   new Option(label('Выберите','Интихоб кунед'),''),
   new Option(label('Женский','Зан'),'female'),
   new Option(label('Мужской','Мард'),'male'),
  );
  fGender.inp.value=gVal;

  const eVal=fEdu.inp.value;
  fEdu.inp.replaceChildren(
   new Option(label('Выберите','Интихоб кунед'),''),
   new Option(label('Высшее','Олӣ'),'higher'),
   new Option(label('Бакалавр','Бакалавр'),'bachelor'),
   new Option(label('Специалист','Мутахассис'),'specialist'),
   new Option(label('Магистр','Магистр'),'master'),
   new Option(label('Среднее профессиональное','Миёнаи касбӣ'),'vocational'),
   new Option(label('Другое','Дигар'),'other'),
  );
  fEdu.inp.value=eVal;
 }

 function loadData(){
  refreshOptions();
  const prof=readJsonStore(profileKey)||{person:{},positions:{}};
  const ws=readJsonStore(workspaceKey);
  const roles=Array.isArray(ws?.roles)&&ws.roles.length?ws.roles:[{id:cabinetId,title:cabinetId}];
  const primaryId=ws?.primary||cabinetId;
  posRow.hidden=roles.length<=1;
  posSelect.replaceChildren(...roles.map(r=>new Option(r.title+(r.id===primaryId?label(' · основной',' · асосӣ'):''),r.id)));
  if(!roles.some(r=>r.id===editingRoleId))editingRoleId=primaryId;
  posSelect.value=editingRoleId;

  const isPrimary=editingRoleId===primaryId;
  inheritWrap.hidden=isPrimary;
  const posObj=!isPrimary?prof.positions?.[editingRoleId]:null;
  const usePrimary=isPrimary||(posObj?.usePrimary!==false);
  inheritCb.checked=usePrimary;

  const src=usePrimary?(prof.person||{}):(posObj||{});
  fFirst.inp.value=src.first||'';
  fLast.inp.value=src.last||'';
  fMiddle.inp.value=src.middle||'';
  fBirth.inp.value=src.birthYear||'';
  fGender.inp.value=src.gender||'';
  fSpec.inp.value=src.specialty||'';
  fExp.inp.value=src.eduYears||'';
  fEdu.inp.value=src.education||'';
  fMethod.lbl.hidden=!roles.some(r=>r.id==='school-five-method-groups');
  fMethod.inp.value=prof.customMethodName||'';
  fLangs.inp.value=Array.isArray(src.languages)?src.languages.join(', '):(src.languages||'');

  const disabled=!isPrimary&&usePrimary;
  for(const x of [fFirst,fLast,fMiddle,fBirth,fGender,fSpec,fExp,fEdu,fLangs])x.inp.disabled=disabled;
 }

 function syncLabels(){
  title.textContent=label('Личные данные и профиль','Маълумоти шахсӣ ва профил');
  posSelectLbl.textContent=label('Должность для редактирования','Вазифа барои таҳрир');
  inheritTxt.textContent=label('Использовать данные основной должности','Истифодаи маълумоти вазифаи асосӣ');
  fFirst.sp.textContent=label('Имя','Ном');
  fLast.sp.textContent=label('Фамилия','Насаб');
  fMiddle.sp.textContent=label('Отчество','Номи падар');
  fBirth.sp.textContent=label('Год рождения','Соли таваллуд');
  fGender.sp.textContent=label('Пол','Ҷинс');
  fSpec.sp.textContent=label('Специальность','Ихтисос');
  fExp.sp.textContent=label('Стаж в образовании (лет)','Собиқа дар маориф (сол)');
  fEdu.sp.textContent=label('Образование','Маълумот');
  fMethod.sp.textContent=label('Название методического объединения','Номи иттиҳодияи методӣ');
  fLangs.sp.textContent=label('Языки','Забонҳо');
  saveBtn.textContent=label('Сохранить анкету профиля','Сабти маълумоти профил');
  refreshOptions();
 }
 loadData();

 posSelect.addEventListener('change',()=>{editingRoleId=posSelect.value;statusEl.textContent='';loadData();});
 inheritCb.addEventListener('change',()=>{
  const prof=readJsonStore(profileKey)||{person:{},positions:{}};
  prof.positions=prof.positions||{};
  prof.positions[editingRoleId]={...(prof.positions[editingRoleId]||prof.person||{}),usePrimary:inheritCb.checked};
  writeJsonStore(profileKey,prof);
  loadData();
 });

 saveBtn.addEventListener('click',async()=>{
  const prof=readJsonStore(profileKey)||{person:{},positions:{}};
  const ws=readJsonStore(workspaceKey);
  const primaryId=ws?.primary||cabinetId;
  const entry={
   first:fFirst.inp.value.trim(),
   last:fLast.inp.value.trim(),
   middle:fMiddle.inp.value.trim(),
   birthYear:fBirth.inp.value.trim(),
   gender:fGender.inp.value,
   specialty:fSpec.inp.value.trim(),
   eduYears:fExp.inp.value.trim(),
   education:fEdu.inp.value,
   languages:fLangs.inp.value.split(',').map(s=>s.trim()).filter(Boolean),
  };
  if(editingRoleId===primaryId){
   prof.person=entry;
   prof.fullName=[entry.last,entry.first,entry.middle].filter(Boolean).join(' ').trim();
   prof.customMethodName=fMethod.inp.value.trim();
   for(const [k,v] of Object.entries(prof.positions||{})){
    if(v?.usePrimary!==false)prof.positions[k]={usePrimary:true,...entry};
   }
  }else{
   prof.positions=prof.positions||{};
   prof.positions[editingRoleId]={usePrimary:inheritCb.checked,...(inheritCb.checked?(prof.person||{}):entry)};
  }
  writeJsonStore(profileKey,prof);

  // Sync to Supabase if signed in
  try{
   const rawSess=persistentStore.getItem(cloudSessionKey);
   if(rawSess){
    const client=createCloudClient({config:getCloudConfig(persistentStore),storage:persistentStore,storageKey:cloudSessionKey});
    if(client.session?.access_token&&prof.organizationId){
     await client.upsertMyPositionProfiles({
      p_org_id:prof.organizationId,
      p_full_name:prof.fullName||null,
      p_profile_details:prof.person||{},
      p_position_profiles:prof.positions||{},
      p_custom_method_name:prof.customMethodName||null,
     });
    }
   }
  }catch{}
  statusEl.textContent=label('Профиль сохранён.','Профил сабт шуд.');
 });

 return {card,cloudHost,syncLabels,loadData};
}

export function setupWorkspace({configured,school}){
 const article=document.querySelector('article[data-cabinet-id]');if(!article)return;
 const cabinetId=article.dataset.cabinetId;
 const toggle=document.createElement('button');toggle.type='button';toggle.id='workspaceSettingsToggle';toggle.className='theme-toggle';
 toggle.setAttribute('aria-controls','workspaceSettings');
 const drawer=document.createElement('section');drawer.className='section no-print workspace-settings';drawer.id='workspaceSettings';
 const heading=document.createElement('h2');heading.id='workspaceSettingsTitle';heading.tabIndex=-1;drawer.setAttribute('aria-labelledby',heading.id);
 const settingsHeader=document.createElement('div');settingsHeader.className='pill-row';
 const switchRole=document.createElement('button');switchRole.type='button';switchRole.className='button alt';switchRole.id='switchWorkspaceRole';
 const signOutApp=document.createElement('button');signOutApp.type='button';signOutApp.className='button alt';signOutApp.id='signOutWorkspaceBtn';
 settingsHeader.append(heading);drawer.append(settingsHeader);

 const tg=()=>document.documentElement.lang==='tg';
 const label=(ru,tj)=>tg()?tj:ru;

 const profTopBar=document.createElement('div');
 profTopBar.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;margin:8px 0;border-radius:10px;border:1px solid var(--line,#d1d5db);background:rgba(255,255,255,0.03);';
 const profNameEl=document.createElement('strong');
 profNameEl.style.fontSize='15px';
 const profVerifEl=document.createElement('span');
 function syncProfTopBar(){
  let p=null;
  try{p=JSON.parse(persistentStore.getItem('smartmaktab.profile.v1')||'null');}catch{}
  profNameEl.textContent=(p?.fullName||[p?.person?.first,p?.person?.last].filter(Boolean).join(' ')||label('Пользователь','Корбар')).trim();
  const isVer=p?.verificationStatus==='verified';
  profVerifEl.replaceChildren();
  if(isVer){
   const ok=document.createElement('span');
   ok.textContent=label('✓ Подтверждён','✓ Тасдиқшуда');
   ok.style.cssText='color:#16a34a;font-weight:600;font-size:13px;';
   profVerifEl.append(ok);
  }else{
   const vb=document.createElement('button');
   vb.type='button';
   vb.className='button';
   vb.textContent=label('Верификация','Верификатсия');
   vb.style.cssText='background:#dc2626;border-color:#dc2626;color:#fff;padding:5px 12px;font-size:13px;';
   vb.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('sm:open-account-verification')));
   profVerifEl.append(vb);
  }
 }
 profTopBar.append(profNameEl,profVerifEl);
 drawer.append(profTopBar);

 const profSubBar=document.createElement('button');
 profSubBar.type='button';
 profSubBar.id='smProfSubBtn';
 profSubBar.style.cssText='width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;margin:0 0 8px 0;border-radius:10px;border:1px solid var(--line,#d1d5db);background:rgba(255,255,255,0.03);color:inherit;text-align:left;font-size:13px;';
 function syncProfSubBar(){
  let lic=null;
  try{lic=JSON.parse(persistentStore.getItem('smartmaktab.license.cache.v1')||'null');}catch{}
  const exp=lic?.expires_at||lic?.trial_ends_at||'';
  const expStr=exp?new Date(exp).toLocaleDateString('ru-RU'):'';
  const isPaid=Boolean(lic?.is_paid||(lic?.status==='active'&&lic?.plan_code&&lic?.plan_code!=='trial'));
  profSubBar.replaceChildren();
  const left=document.createElement('strong');
  left.textContent=label('Услуги','Хизматрасонӣ');
  const right=document.createElement('span');
  if(isPaid){
   right.style.cssText='color:#16a34a;font-weight:600;';
   right.textContent=expStr?label(`Активна · Следующая оплата: ${expStr}`,`Обуна фаъол · Пардохти навбатӣ: ${expStr}`):label('Оплата активна','Обуна фаъол');
   profSubBar.style.cursor='default';
   profSubBar.disabled=true;
  }else{
   right.style.cssText='color:#d97706;font-weight:600;';
   right.textContent=expStr?label(`Пробный период до ${expStr} →`,`Давраи санҷишӣ то ${expStr} →`):label('Пробный период · Оплатить →','Давраи санҷишӣ · Пардохт →');
   profSubBar.style.cursor='pointer';
   profSubBar.disabled=false;
  }
  profSubBar.append(left,right);
 }
 profSubBar.addEventListener('click',()=>{
  if(profSubBar.disabled)return;
  document.dispatchEvent(new CustomEvent('sm:open-payment-wizard'));
 });
 syncProfSubBar();
 drawer.append(profSubBar);

 const profCard=createProfileManager(cabinetId,tg,label);
 function wrapAccordion(el,customTitle){
  if(!el)return null;
  const det=document.createElement('details');
  det.className='sm-prof-accordion';
  det.style.cssText='margin:8px 0;border:1px solid var(--line,#d1d5db);border-radius:10px;padding:8px 12px;';
  const titleEl=el.querySelector('h2,h3,h4,.eyebrow');
  const sum=document.createElement('summary');
  sum.style.cssText='cursor:pointer;font-weight:600;font-size:14px;list-style:none;display:flex;align-items:center;justify-content:space-between;';
  sum.textContent=(customTitle||titleEl?.textContent||el.id).trim();
  const arrow=document.createElement('span');arrow.textContent='▾';arrow.style.opacity='0.6';
  sum.append(arrow);
  det.append(sum,el);
  return det;
 }
 drawer.append(wrapAccordion(profCard.card,label('Личные данные и профиль','Маълумоти шахсӣ ва профил')));
 const ids=['directorPersonnel','institutionPicker','directorInstitution','directorCourses','directorProfilePanel','teacherWorkplaces','teacherProfilePanel','libraryProfilePanel'];
 for(const id of ids){const element=$(id);if(element)drawer.append(wrapAccordion(element));}
 const mainModules=document.createElement('section');mainModules.id='smMainModules';mainModules.className='sm-module-grid no-print';
 const formsBar=document.createElement('section');formsBar.id='roleFormsBar';formsBar.className='role-forms-bar no-print';
 article.prepend(drawer,mainModules,formsBar);
 const teacher=!!$('teacherSubjects');if(teacher)drawer.append(wrapAccordion($('teacherSubjects')));
 const settingsFooter=document.createElement('div');
 settingsFooter.className='control';
 settingsFooter.style.cssText='margin-top:16px;padding-top:12px;border-top:1px solid var(--line,#d1d5db);display:flex;gap:10px;flex-wrap:wrap;';
 settingsFooter.append(switchRole,signOutApp);
 drawer.append(settingsFooter);
 if($('teacherBookPanel'))article.append($('teacherBookPanel'));

 const actionsEl=document.querySelector('header.top .actions');
 const themeEl=$('themeToggle');
 if(themeEl)themeEl.before(toggle); else actionsEl?.append(toggle);

 setupSchoolForms(article,formsBar,school);setupCloudWorkspace(article,profCard.cloudHost,school);
 const views=initWorkspaceViews(article);

 setupUnifiedUpdateMenu($('themeToggle')||actionsEl);

 for(const id of ['workspaceSettings','teacherBookPanel','schoolOperations','schoolForms','pilotCertificate','cloudWorkspacePanel'])$(id)?.classList.add('sm-screen');
 const entries={directorPlanPanel:['План работы','Нақшаи кор','▤'],libraryPlanPanel:['План библиотеки','Нақшаи китобхона','▤'],raesatCoverage:['Полнота сведений','Пуррагии маълумот','▤']};
 for(const [id,values] of Object.entries(entries))views.shortcut(id,...values);
 setupPhase2Panels(article,mainModules,school,views);

 function sync(){
  const title=label('Профиль','Профил');
  toggle.textContent=`👤 ${title}`;toggle.setAttribute('aria-label',title);
  toggle.setAttribute('aria-expanded',String(views.current()==='workspaceSettings'));
  heading.textContent=label('Профиль и настройки','Профил ва танзимот');
  switchRole.textContent=label('Сменить должность','Иваз кардани вазифа');
  signOutApp.textContent=label('Выйти','Баромадан');
  const badge=$('workspaceSchool');
  if(badge)badge.textContent=school()?.name??label('Не выбрано','Интихоб нашудааст');
  profCard.syncLabels();
  syncProfTopBar();
  views.refresh();
 }
 function setSettings(open){if(open)views.open('workspaceSettings',toggle);else views.close('workspaceSettings');sync();}
 toggle.addEventListener('click',()=>setSettings(views.current()!=='workspaceSettings'));
 switchRole.addEventListener('click',()=>{
  clearActiveResume();
  const dest=new URL('index.html',appRoot);
  dest.searchParams.set('register','1');
  dest.searchParams.set('lang','tg');
  openCabinetView(dest);
 });
 signOutApp.addEventListener('click',()=>{
  clearActiveResume();
  persistentStore.removeItem(cloudSessionKey);
  const dest=new URL('index.html',appRoot);
  dest.searchParams.set('setup','1');
  dest.searchParams.set('lang','tg');
  openCabinetView(dest);
 });
 const navState=new MutationObserver(sync);navState.observe(article,{attributes:true,attributeFilter:['data-sm-screen']});
 document.addEventListener('cabinet:language',sync);
 document.addEventListener('cabinet:school',()=>{profCard.loadData();sync();});
 sync();
 if(!configured)views.open('workspaceSettings',toggle,{focus:false});
}
