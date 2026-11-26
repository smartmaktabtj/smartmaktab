import {mountWindowsContent} from './windows-content-ui.mjs';
import {setupNativeFiles,setupUnifiedUpdateMenu} from './native-shell.mjs';
import {initWorkspaceViews} from './workspace-view.mjs';
import {setupSchoolForms} from './school-forms.mjs';
import {setupDocxTemplates} from './docx-templates-ui.mjs';
import {setupCloudWorkspace} from './cloud-workspace-ui.mjs';
import {createCloudClient} from './cloud-client.mjs';
import {getCloudConfig} from './cloud-config.mjs';
import {cabinetFormAction,printCabinetSheet,clearActiveResume,appRoot,openCabinetView,persistentStore,tabStorage} from './cabinet-runtime.mjs';

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

function createProfileManager(cabinetId,tg,label,onOpenCloud){
 const card=document.createElement('section');
 card.className='section no-print';
 card.id='smUnifiedProfileCard';

 const head=document.createElement('div');
 head.className='pill-row';
 head.style.justifyContent='space-between';
 const title=document.createElement('h3');
 const cloudBtn=document.createElement('button');
 cloudBtn.type='button';
 cloudBtn.className='button alt';
 cloudBtn.id='openCloudSubBtn';
 head.append(title,cloudBtn);

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
  cloudBtn.textContent=label('Подписка и оплата','Обуна ва пардохт');
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
  loadData();
 }

 posSelect.addEventListener('change',()=>{editingRoleId=posSelect.value;statusEl.textContent='';loadData();});
 inheritCb.addEventListener('change',()=>{
  const prof=readJsonStore(profileKey)||{person:{},positions:{}};
  prof.positions=prof.positions||{};
  prof.positions[editingRoleId]={...(prof.positions[editingRoleId]||prof.person||{}),usePrimary:inheritCb.checked};
  writeJsonStore(profileKey,prof);
  loadData();
 });
 cloudBtn.addEventListener('click',onOpenCloud);

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

 return {card,syncLabels,loadData};
}

export function setupWorkspace({configured,school}){
 const overview=$('workspaceOverview');if(!overview)return;
 const article=overview.closest('article'),docs=$('workspaceDocs'),editor=$('workspaceDraft'),materials=$('workspaceMaterials');
 const cabinetId=article.dataset.cabinetId;
 const toggle=document.createElement('button');toggle.type='button';toggle.id='workspaceSettingsToggle';toggle.className='theme-toggle';
 toggle.setAttribute('aria-controls','workspaceSettings');
 const drawer=document.createElement('section');drawer.className='section no-print workspace-settings';drawer.id='workspaceSettings';
 const heading=document.createElement('h2');heading.id='workspaceSettingsTitle';heading.tabIndex=-1;drawer.setAttribute('aria-labelledby',heading.id);
 const settingsHeader=document.createElement('div');settingsHeader.className='pill-row';
 const headerActions=document.createElement('div');headerActions.className='control';headerActions.style.margin='0';
 const switchRole=document.createElement('button');switchRole.type='button';switchRole.className='button alt';switchRole.id='switchWorkspaceRole';
 const signOutApp=document.createElement('button');signOutApp.type='button';signOutApp.className='button alt';signOutApp.id='signOutWorkspaceBtn';
 const close=document.createElement('button');close.type='button';close.className='button alt';close.id='closeWorkspaceSettings';
 headerActions.append(switchRole,signOutApp,close);
 settingsHeader.append(heading,headerActions);drawer.append(settingsHeader);

 const tg=()=>document.documentElement.lang==='tg';
 const label=(ru,tj)=>tg()?tj:ru;

 const profCard=createProfileManager(cabinetId,tg,label,()=>{views.open('cloudWorkspacePanel',profCard.card);});
 drawer.append(profCard.card);

 const ids=['roleIntake','directorPersonnel','institutionPicker','directorInstitution','directorCourses','directorProfilePanel','teacherWorkplaceScope','teacherWorkplaces','teacherProfilePanel','libraryWorkplaceScope','libraryProfilePanel'];
 for(const id of ids){const element=$(id);if(element)drawer.append(element);}
 const hero=article.querySelector('.hero');hero.after(overview,drawer,docs,editor);
 const teacher=!!$('teacherSubjects');if(teacher){drawer.append($('teacherSubjects'));if(materials)docs.append(materials);for(const a of $('cabinetRailNav').querySelectorAll('a[href="#teacherSubjects"],a[href="#workspaceMaterials"]'))a.hidden=true;}
 if($('teacherBookPanel'))editor.after($('teacherBookPanel'));

 $('cabinetLang').before(toggle);
 setupNativeFiles($('cabinetLang'));

 setupSchoolForms(article,docs,school);setupDocxTemplates(article,docs,school);setupCloudWorkspace(article,docs,school);
 const views=initWorkspaceViews(article);mountWindowsContent(article,views);

 setupUnifiedUpdateMenu($('cabinetLang'),()=>{
  if($('windowsContent')){
   views.open('windowsContent',$('cabinetUpdateTrigger'));
   return true;
  }
  return false;
 });

 for(const id of ['workspaceSettings','workspaceDraft','teacherBookPanel','schoolOperations','schoolForms','pilotCertificate','docxTemplatesPanel','cloudWorkspacePanel'])$(id)?.classList.add('sm-screen');
 const entries={workspaceDocs:['Документы','Ҳуҷҷатҳо','▤'],workspaceMaterials:['Материалы','Мавод','◇'],teacherSubjects:['Классы и предметы','Синфҳо ва фанҳо','⊞'],teacherDocumentPanel:['План урока','Нақшаи дарс','▤'],directorPlanPanel:['План работы','Нақшаи кор','▤'],libraryPlanPanel:['План библиотеки','Нақшаи китобхона','▤'],adviserSchools:['Школы','Мактабҳо','▦'],adviserDocuments:['Документы направления','Ҳуҷҷатҳои самт','▤']};
 if(teacher){delete entries.teacherSubjects;delete entries.workspaceMaterials;}
 for(const [id,values] of Object.entries(entries))views.shortcut(id,...values);
 for(const anchor of $('cabinetRailNav').querySelectorAll('a[href^="#"]')){
  const id=anchor.hash.slice(1);if(anchor.hidden||id==='cabinetHome'||Object.hasOwn(entries,id))continue;const panel=$(id);if(!panel)continue;
  const entry=anchor.querySelector('[data-tg]')??anchor;views.shortcut(id,entry.textContent.trim(),entry.dataset.tg??entry.textContent.trim(),'◇');
 }

 // Dynamic Left Sidebar population: user multi-roles + Admin-added custom roles & categories from .smupdate
 function syncDynamicSidebar(payload){
  const rail=$('cabinetRailNav');
  if(!rail)return;
  rail.querySelectorAll('[data-sm-dynamic]').forEach(el=>el.remove());

  // 1) Multi-role links from user's selected primary + extra positions
  const ws=readJsonStore(workspaceKey);
  if(ws&&Array.isArray(ws.roles)&&ws.roles.length>1){
   const divider=document.createElement('div');
   divider.dataset.smDynamic='sep';
   divider.className='sm-rail-group';
   divider.textContent=label('Мои должности','Вазифаҳои ман');
   rail.append(divider);
   for(const role of ws.roles){
    const a=document.createElement('a');
    a.dataset.smDynamic='role';
    a.href='#';
    if(role.id===cabinetId){a.className='active';a.setAttribute('aria-current','page');}
    a.textContent=(role.id===ws.primary?'★ ':'• ')+role.title;
    a.addEventListener('click',ev=>{
     ev.preventDefault();
     if(role.id===cabinetId)return;
     const dest=new URL(role.path,appRoot);
     const sch=ws.schools?.[role.id];
     if(sch)dest.searchParams.set('school',sch);
     dest.searchParams.set('lang',tg()?'tg':'ru');
     openCabinetView(dest);
    });
    rail.append(a);
   }
  }

  // 2) Admin-added custom roles / categories from .smupdate
  if(payload){
   const curLang=tg()?'tg':'ru';
   const cats=Array.isArray(payload.cabinets?.[cabinetId])?payload.cabinets[cabinetId]:[];
   const customRoles=Array.isArray(payload.customRoles)?payload.customRoles:[];
   if(cats.length||customRoles.length){
    const divider=document.createElement('div');
    divider.dataset.smDynamic='admin-sep';
    divider.className='sm-rail-group';
    divider.textContent=label('Разделы обновления','Бахшҳои навсозӣ');
    rail.append(divider);

    for(const cat of cats){
     const a=document.createElement('a');
     a.dataset.smDynamic='cat';
     a.href='#windowsContent';
     a.textContent=`▤ ${cat.title?.[curLang]||cat.id}`;
     a.addEventListener('click',ev=>{ev.preventDefault();views.open('windowsContent',a,{replace:true});});
     rail.append(a);
    }

    for(const cr of customRoles){
     const crCats=Array.isArray(payload.cabinets?.[cr.id])?payload.cabinets[cr.id]:[];
     const secId=`smCustomRole-${cr.id}`;
     let sec=$(secId);
     if(!sec){
      sec=document.createElement('section');
      sec.id=secId;
      sec.className='section sm-screen no-print';
      article.append(sec);
     }
     const h2=document.createElement('h2');
     h2.textContent=cr.title?.[curLang]||cr.id;
     sec.replaceChildren(h2);
     if(!crCats.length){
      const p=document.createElement('p');
      p.className='small';
      p.textContent=label('Материалы для этой должности пока пусты.','Барои ин вазифа мавод ҳанӯз холӣ аст.');
      sec.append(p);
     }else{
      for(const cat of crCats){
       const det=document.createElement('details');det.open=true;
       const sum=document.createElement('summary');sum.textContent=cat.title?.[curLang]||cat.id;
       det.append(sum);
       for(const s of cat.sections||[]){
        const blk=document.createElement('section');
        const h=document.createElement('h4');h.textContent=s.title?.[curLang]||'';
        const p=document.createElement('p');p.textContent=s.text?.[curLang]||'';p.style.whiteSpace='pre-wrap';
        blk.append(h,p);det.append(blk);
       }
       sec.append(det);
      }
     }
     const a=document.createElement('a');
     a.dataset.smDynamic='custom-role';
     a.href=`#${secId}`;
     a.textContent=`◇ ${cr.title?.[curLang]||cr.id}`;
     a.addEventListener('click',ev=>{ev.preventDefault();views.open(secId,a,{replace:true});});
     rail.append(a);
    }
   }
  }
 }

 let lastContentPayload=null;
 document.addEventListener('sm:content-updated',ev=>{
  if(ev.detail)lastContentPayload=ev.detail;
  syncDynamicSidebar(lastContentPayload);
 });

 let chosen=null,snapshot=null;
 function sync(){
  const templateTitle=docs.querySelector('[data-template-heading]');if(templateTitle)templateTitle.textContent=label('Образцы · не утверждены','Намунаҳо · тасдиқ нашудаанд');
  const title=label('Профиль','Профил');
  toggle.textContent=`👤 ${title}`;toggle.setAttribute('aria-label',title);
  toggle.setAttribute('aria-expanded',String(views.current()==='workspaceSettings'));
  heading.textContent=label('Профиль и настройки','Профил ва танзимот');
  switchRole.textContent=label('Сменить должность','Иваз кардани вазифа');
  signOutApp.textContent=label('Выйти','Баромадан');
  close.textContent=label('Закрыть','Пӯшидан');
  $('workspaceSchool').textContent=school()?.name??label('Не выбрано','Интихоб нашудааст');
  profCard.syncLabels();
  if(chosen)$('workspaceDraftTitle').textContent=chosen.querySelector('strong').textContent;
  if(snapshot){$('workspaceSheetTitle').textContent=chosen.querySelector('strong').textContent;$('workspaceSheetSchool').textContent=snapshot.school;}
  syncDynamicSidebar(lastContentPayload);
  views.refresh();
 }
 function setSettings(open){if(open)views.open('workspaceSettings',toggle);else views.close('workspaceSettings');sync();}
 toggle.addEventListener('click',()=>setSettings(views.current()!=='workspaceSettings'));close.addEventListener('click',()=>setSettings(false));
 switchRole.addEventListener('click',()=>{
  clearActiveResume();
  const dest=new URL('index.html',appRoot);
  dest.searchParams.set('register','1');
  dest.searchParams.set('lang',tg()?'tg':'ru');
  openCabinetView(dest);
 });
 signOutApp.addEventListener('click',()=>{
  clearActiveResume();
  persistentStore.removeItem(cloudSessionKey);
  const dest=new URL('index.html',appRoot);
  dest.searchParams.set('setup','1');
  dest.searchParams.set('lang',tg()?'tg':'ru');
  openCabinetView(dest);
 });
 const navState=new MutationObserver(sync);navState.observe(article,{attributes:true,attributeFilter:['data-sm-screen']});
 const form=$('workspaceDraftForm');form.inert=false;
 const cards=[...docs.querySelectorAll('[data-doc-template]')];
 const tiles=docs.querySelector('.workspace-tiles');if(tiles){const title=document.createElement('h3');title.dataset.templateHeading='';tiles.before(title);}
 const specialized={'school-teacher':'teacherDocumentPanel','school-director':'directorPlanPanel','school-library-head':'libraryPlanPanel'}[cabinetId];
 for(const card of cards)card.addEventListener('click',()=>{
  if(card===cards[0]&&specialized){views.open(specialized,card);return;}
  if(chosen!==card){form.reset();snapshot=null;$('workspaceSheet').hidden=true;$('workspaceDraftStatus').textContent='';}
  chosen=card;editor.hidden=false;sync();views.open('workspaceDraft',card);
 });
 $('workspaceCloseDraft').addEventListener('click',()=>{views.close('workspaceDraft');editor.hidden=true;});
 cabinetFormAction(form,$('workspacePreview'),()=>{
  const period=$('workspaceDraftPeriod').value.trim(),topic=$('workspaceDraftTopic').value.trim(),details=$('workspaceDraftBody').value.trim();
  if(!period||!topic||!chosen)return;
  if(!school()){$('workspaceDraftStatus').textContent=label('Сначала выберите школу в настройках.','Аввал дар танзимот мактабро интихоб кунед.');return;}
  snapshot={school:school().name,period,topic,details};
  $('workspaceSheetPeriod').textContent=period;$('workspaceSheetTopic').textContent=topic;$('workspaceSheetBody').textContent=details||'—';
  $('workspaceDraftStatus').textContent=label('Печатный черновик готов.','Пешнавис барои чоп омода аст.');$('workspaceSheet').hidden=false;sync();views.open('workspaceSheet',$('workspacePreview'));
 });
 $('workspacePrint').addEventListener('click',event=>{if(snapshot)printCabinetSheet(event.currentTarget);});
 document.addEventListener('cabinet:language',sync);
 document.addEventListener('cabinet:school',()=>{if(snapshot){snapshot=null;$('workspaceSheet').hidden=true;}$('workspaceDraftStatus').textContent='';sync();});
 sync();
 if(!configured)views.open('workspaceSettings',toggle,{focus:false});
}
