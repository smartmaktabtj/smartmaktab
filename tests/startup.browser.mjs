import {fillStartupProfile,pickClass,chooseInitialSchool} from './onboarding-fixtures.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.SM_BASE_URL??'http://localhost:4180';

test('startup: auth screen, 20 school roles, compatibility matrix, Aliya add-on, unified profile and dynamic sidebar',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({serviceWorkers:'block',reducedMotion:'reduce',viewport:{width:390,height:844}});
  page.setDefaultTimeout(5500);
  const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
  await page.route('https://*.supabase.co/**',route=>route.abort());
  await page.goto(`${base}/?lang=ru`);

  // Step 0: Auth screen + authority toggle + update icon
  assert.equal(await page.locator('#loginForm').isVisible(),true);
  assert.equal(await page.locator('#startupUpdateMenu').isVisible(),true);
  await page.locator('#goAuthorityLogin').click();
  assert.equal(await page.locator('#goToRegister').isVisible(),false);
  await page.locator('#backAuthorityLogin').click();
  assert.equal(await page.locator('#goToRegister').isVisible(),true);

  // Step 1: 20 school positions only (clean single names + prices)
  await page.locator('#goToRegister').click();
  assert.equal(await page.locator('#primaryChoices input').count(),20);

  // Accountant (Group D) -> 0 extras
  await page.locator('#primaryChoices input[value=school-accountant]').check();
  await page.locator('#toExtras').click();
  assert.equal(await page.locator('#extraChoices input').count(),0);
  assert.equal(await page.locator('#noExtras').isVisible(),true);
  assert.match(await page.locator('#totalPriceAmount').textContent(),/50\s+сомони/);
  await page.locator('[data-step="2"] [data-back="1"]').click();

  // Facilities head (Group B) -> only Canteen head (1 extra)
  await page.locator('#primaryChoices input[value=school-facilities-head]').check();
  await page.locator('#toExtras').click();
  assert.deepEqual(await page.locator('#extraChoices input').evaluateAll(list=>list.map(el=>el.value)),['school-canteen-head']);
  await page.locator('[data-step="2"] [data-back="1"]').click();

  // Teacher (Group C) -> 9 compatible Group C extras (no director, no accountant, no facilities)
  await page.locator('#primaryChoices input[value=school-teacher]').check();
  await page.locator('#toExtras').click();
  const teacherExtras=await page.locator('#extraChoices input').evaluateAll(list=>list.map(el=>el.value));
  assert.equal(teacherExtras.length,9);
  assert.equal(teacherExtras.includes('school-director'),false);
  assert.equal(teacherExtras.includes('school-accountant'),false);
  assert.equal(teacherExtras.includes('school-facilities-head'),false);
  await page.locator('[data-step="2"] [data-back="1"]').click();

  // Director (Group A) -> 19 compatible extras + Aliya (+30) full price sum
  await page.locator('#primaryChoices input[value=school-director]').check();
  await page.locator('#toExtras').click();
  assert.equal(await page.locator('#extraChoices input').count(),19);
  assert.equal(await page.locator('#extraChoices input[value=school-director]').count(),0);
  const a='school-academic-deputy',b='school-five-method-groups';
  await page.locator(`#extraChoices input[value=${a}]`).check();
  await page.locator(`#extraChoices input[value=${b}]`).check();
  await page.locator('#aliyaAddonToggle').check();
  // 50 (Director) + 40 (Academic Deputy) + 20 (Method Group) + 30 (Aliya) = 140 somoni
  assert.match(await page.locator('#totalPriceAmount').textContent(),/140\s+сомони/);

  // Step 3: Unified personal profile + custom method name (demo-mode without credentials)
  await page.locator('#toProfile').click();
  assert.equal(await page.locator('#customMethodWrap').isVisible(),true);
  await page.locator('#customMethodNameInput').fill('Методобъединение точных наук');
  await fillStartupProfile(page,{first:'Нав',last:'Озмоишӣ'});
  await page.locator('#toSchoolStep').click();

  // Step 4: School choice & summary
  assert.equal(await page.locator('#results .row').count(),3);
  assert.match(await page.locator('#results').textContent(),/Методобъединение точных наук/);
  assert.equal(await page.locator('#results a').count(),0);
  assert.equal(await page.locator('#demoModeWarning').isVisible(),true);
  assert.equal(await page.locator('#retryBootstrapBtn').isVisible(),true);
  assert.equal(await page.locator('#begin').textContent(),'Оғоз');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#schoolSearch').fill('88');
  assert.equal(await page.locator('#schoolChoice').inputValue(),'demo-88');
  await page.locator('#begin').click();

  // Cabinet view: unified Profile drawer + Update icon + clean header workspace switcher
  await page.waitForURL('**/cabinets/school/director.html?school=demo-88&lang=ru');
  await page.locator('#workspaceSwitch').waitFor();
  assert.deepEqual(await page.locator('#workspaceSwitch option').evaluateAll(nodes=>nodes.map(node=>node.value)),['school-director',a,b]);
  assert.equal(await page.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  assert.equal(await page.locator('#workspaceSettings').isVisible(),false);
  assert.equal(await page.locator('#cabinetUpdateTrigger').isVisible(),true);
  assert.equal(await page.locator('#smMainModules [data-open-phase2]').count(),3);
  await page.locator('#workspaceSettingsToggle').click();
  assert.equal(await page.locator('#profFirst').inputValue(),'Нав');
  assert.equal(await page.locator('#profLast').inputValue(),'Озмоишӣ');
  assert.match(await page.locator('#directorPersonnelValues').textContent(),/Нав/);
  assert.match(await page.locator('#directorPersonnelValues').textContent(),/Озмоишӣ/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

  await page.locator('#workspaceSwitch').selectOption(b);
  await page.waitForURL('**/cabinets/school/five-method-groups.html?school=demo-88&lang=ru');
  await page.locator('#workspaceSwitch').selectOption('school-director');
  await page.waitForURL('**/cabinets/school/director.html?school=demo-88&lang=ru');
  assert.ok(requests.every(url=>!decodeURI(url).includes('Озмоишӣ')));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('startup works inside the offline file viewer with independent profile edits',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(5500);
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  await page.route('**/*',route=>route.abort());
  await page.setContent('<iframe sandbox="allow-scripts"></iframe>');
  await page.locator('iframe').evaluate((frame,value)=>{frame.srcdoc=value;},html);
  const frame=page.frameLocator('iframe').first();
  await frame.locator('#goToRegister').click();
  await frame.locator('#primaryChoices input[value=school-teacher]').check();
  await frame.locator('#toExtras').click();
  await frame.locator('#extraChoices input[value=school-class-teacher]').check();
  await frame.locator('#toProfile').click();
  await fillStartupProfile(frame,{first:'Демо',last:'Озмоиш',teacherClass:'5'});
  await frame.locator('#toSchoolStep').click();
  await frame.locator('#schoolSearch').fill('88');await frame.locator('#begin').click();
  const cabinet=frame.frameLocator('#offlineFrameSlot iframe');
  await cabinet.getByRole('heading',{name:'Омӯзгор',exact:true}).waitFor();
  assert.equal(await cabinet.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  await cabinet.locator('#workspaceSettingsToggle').click();
  assert.equal(await cabinet.locator('#profFirst').inputValue(),'Демо');
 }finally{await browser.close();}
});

test('teacher marks multiple workplaces and class profiles stay separate across school switches',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({serviceWorkers:'block',reducedMotion:'reduce',viewport:{width:390,height:844}});
  page.setDefaultTimeout(5500);
  await page.route('https://*.supabase.co/**',route=>route.abort());
  await page.goto(`${base}/?lang=ru`);
  await page.locator('#goToRegister').click();
  await page.locator('#primaryChoices input[value=school-teacher]').check();
  await page.locator('#toExtras').click();
  await page.locator('#extraChoices input[value=school-library-head]').check();
  await page.locator('#toProfile').click();
  await fillStartupProfile(page,{first:'Демо',last:'Озмоиш',teacherClass:'5Б'});
  await page.locator('#toSchoolStep').click();
  await chooseInitialSchool(page);
  await page.waitForURL('**/teacher.html?school=demo-a&lang=ru');
  await page.locator('#workspaceSettingsToggle').click();
  await page.locator('#teacherSchoolChecks input[value=demo-b]').check();
  await page.locator('#teacherSaveWorkplaces').click();
  assert.deepEqual(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('smartmaktab.demo.teacher-workplaces.v1'))),['demo-a','demo-b']);
  assert.equal(await page.locator('#teacherSchoolLinks a').count(),1);
  async function settings(classCode,lang){
   if(!await page.locator('#workspaceSettings').isVisible())await page.locator('#workspaceSettingsToggle').click();
   await pickClass(page.locator('#teacherProfileClasses'),classCode);
   await page.locator('#instructionLanguage').selectOption(lang);
   await page.locator('#teacherProfile').getByRole('button',{name:'Сохранить профиль'}).click();
  }
  await page.locator('#teacherSchoolLinks a').click();
  await page.waitForURL('**/teacher.html?school=demo-b&lang=ru');
  assert.equal(await page.locator('#selectedSchool').textContent(),'МТМУ № 4');
  assert.equal(await page.locator('#workspaceSchool').textContent(),'МТМУ № 4');
  await settings('9Б','ru');
  assert.equal(await page.locator('#profileClasses').textContent(),'9Б · Информатика');
  await page.locator('#teacherSchoolLinks a').click();
  await page.waitForURL('**/teacher.html?school=demo-a&lang=ru');
  await page.locator('#workspaceSettingsToggle').click();
  await page.locator('#teacherProfileSummary').waitFor();
  assert.equal(await page.locator('#profileClasses').textContent(),'5Б · Информатика');
  assert.equal(await page.locator('#profileInstruction').textContent(),'Таджикский');
  await page.locator('#teacherSchoolLinks a').click();
  await page.waitForURL('**/teacher.html?school=demo-b&lang=ru');
  await page.locator('#workspaceSwitch').selectOption('school-library-head');
  await page.waitForURL('**/library-head.html?school=demo-a&lang=ru');
  assert.equal(await page.locator('#workspaceSettings').isVisible(),false);
 }finally{await browser.close();}
});

test('current version has no archive routes and the night setting persists across cabinets and reload',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({serviceWorkers:'block',colorScheme:'light',reducedMotion:'reduce'});
  await page.route('https://*.supabase.co/**',route=>route.abort());
  await page.goto(`${base}/?lang=ru`);
  await page.locator('#lang').selectOption('ru');
  await page.getByRole('button',{name:'Ночной режим'}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  for(const route of ['/dashboard.html','/onboarding/index.html','/dev/'])assert.equal((await page.request.get(base+route)).status(),404,route);
  await page.locator('#goToRegister').click();
  await page.locator('#primaryChoices input[value=school-academic-deputy]').check();
  await page.locator('#toExtras').click();
  await page.locator('#toProfile').click();
  await fillStartupProfile(page,{first:'Демо',last:'Озмоиш'});
  await page.locator('#toSchoolStep').click();
  await chooseInitialSchool(page);
  await page.waitForURL('**/academic-deputy.html?school=demo-a&lang=ru');
  await page.getByRole('button',{name:'Дневной режим'}).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('body').evaluate(body=>getComputedStyle(body).backgroundColor),'rgb(17, 26, 23)');
  await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.getByRole('button',{name:'Дневной режим'}).click();
  await page.locator('.brand').click();
  await page.getByRole('button',{name:'Ночной режим'}).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 }finally{await browser.close();}
});

test('cloud registration fails closed when backend is unreachable with login credentials',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({serviceWorkers:'block',reducedMotion:'reduce',viewport:{width:390,height:844}});
  page.setDefaultTimeout(5500);
  await page.route('https://*.supabase.co/**',route=>route.abort());
  await page.goto(`${base}/?lang=ru`);
  await page.locator('#goToRegister').click();
  await page.locator('#primaryChoices input[value=school-director]').check();
  await page.locator('#toExtras').click();
  await page.locator('#toProfile').click();
  await fillStartupProfile(page,{first:'Олим',last:'Сангов',login:'olim_fail',password:'secret123'});
  await page.locator('#toSchoolStep').click();

  assert.equal(await page.locator('#demoModeWarning').isVisible(),false);
  // Demo schools must NOT appear when user provided cloud login+password
  const cloudOpts=await page.locator('#schoolChoice option').evaluateAll(o=>o.map(x=>x.value));
  assert.equal(cloudOpts.includes('demo-88'),false);
  assert.equal(await page.locator('#begin').isDisabled(),true);

  // Adding a school manually enables Оғоз, but offline/unreachable backend fails closed
  await page.locator('#toggleNewSchoolBtn').click();
  await page.locator('#newSchoolRegion').selectOption('Вилояти Суғд');
  await page.locator('#newSchoolDistrict').fill('Исфара');
  await page.locator('#newSchoolName').fill('МТМУ № 88');
  await page.waitForFunction(()=>!document.getElementById('begin')?.disabled);
  await page.locator('#begin').click();

  // Must stay on Step 4 with visible error and no silent cabinet entry or resume session saved
  await page.waitForFunction(()=>Boolean(document.getElementById('beginError')?.textContent?.trim())&&!document.getElementById('begin')?.disabled);
  assert.equal(new URL(page.url()).pathname,'/');
  assert.equal(await page.evaluate(()=>localStorage.getItem('smartmaktab.active-cabinet.v1')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('smartmaktab.cloud.session.v1')),null);

  // Going back to Step 3 and clearing login/password switches cleanly to explicit demo mode
  await page.locator('#toggleNewSchoolBtn').click();
  await page.locator('[data-step="4"] [data-back="3"]').click();
  await page.locator('#regLogin').fill('');
  await page.locator('#regPassword').fill('');
  await page.locator('#regPassword2').fill('');
  await page.locator('#toSchoolStep').click();
  assert.equal(await page.locator('#demoModeWarning').isVisible(),true);
  await page.locator('#schoolSearch').fill('88');
  assert.equal(await page.locator('#schoolChoice').inputValue(),'demo-88');
  await page.locator('#begin').click();
  await page.waitForURL('**/cabinets/school/director.html?school=demo-88&lang=ru');
 }finally{await browser.close();}
});

test('cloud self-registration saves account with canonical Tajik phone and signs in on a fresh device',async()=>{
 const browser=await chromium.launch();
 const schoolUuid='11111111-1111-4111-8111-111111111088';
 const maorifUuid='22222222-2222-4222-8222-222222222001';
 const userUuid='33333333-3333-4333-8333-333333333001';
 let registeredBody=null;

 async function mockSupabase(context){
  await context.route('https://*.supabase.co/**',async route=>{
   const req=route.request();
   const url=new URL(req.url());
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname.endsWith('/functions/v1/register-user')&&req.method()==='GET'){
    return json({
     schools:[{id:schoolUuid,name:'МТМУ № 88',region_name:'Суғд',district_name:'Хуҷанд',school_code:'SM-088',kind:'school'}],
     authorities:[{id:maorifUuid,name:'Маорифи Хуҷанд',authority_tier:'maorif',region_name:'Суғд',district_name:'Хуҷанд'}],
     tariffs:[],
    });
   }
   if(url.pathname.endsWith('/functions/v1/register-user')&&req.method()==='POST'){
    registeredBody=req.postDataJSON();
    return json({
     user_id:userUuid,
     login:'927001122',
     email:'927001122@login.smartmaktab.tj',
     school:{id:schoolUuid,name:'МТМУ № 88',region_name:'Суғд',district_name:'Хуҷанд',school_code:'SM-088',kind:'school'},
     session:{access_token:'tok-reg-1',refresh_token:'ref-reg-1',expires_in:3600,user:{id:userUuid,email:'927001122@login.smartmaktab.tj'}},
    },201);
   }
   if(url.pathname.endsWith('/auth/v1/token')&&req.method()==='POST'){
    const body=req.postDataJSON();
    if(body?.email==='927001122@login.smartmaktab.tj'&&body?.password==='secret123'){
     return json({access_token:'tok-login-2',refresh_token:'ref-login-2',expires_in:3600,user:{id:userUuid,email:'927001122@login.smartmaktab.tj'}});
    }
    return json({error:'invalid_grant',error_description:'Invalid login credentials'},400);
   }
   if(url.pathname.endsWith('/rest/v1/rpc/get_my_workspace_context')){
    return json({
     user_id:userUuid,
     is_super_admin:false,
     profile:{full_name:'Сангов Олим',preferred_lang:'ru',login_name:'927001122',profile_details:{first:'Олим',last:'Сангов',birthYear:'1985',gender:'male',specialty:'Педагогика',eduYears:'10',education:'higher',languages:['tg']}},
     memberships:[{organization_id:schoolUuid,organization_name:'МТМУ № 88',kind:'school',role:'director',primary_position:'school-director',extra_positions:[],aliya_enabled:false,active_devices_count:1,max_devices:2}],
    });
   }
   return json([]);
  });
 }

 try{
  // Device 1: register using +992 phone format and cloud school
  const ctx1=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',viewport:{width:390,height:844}});
  await mockSupabase(ctx1);
  const page1=await ctx1.newPage();
  page1.setDefaultTimeout(5500);
  await page1.goto(`${base}/?lang=ru`);
  await page1.locator('#goToRegister').click();
  await page1.locator('#primaryChoices input[value=school-director]').check();
  await page1.locator('#toExtras').click();
  await page1.locator('#toProfile').click();
  await fillStartupProfile(page1,{first:'Олим',last:'Сангов',login:'+992 92 700 11 22',password:'secret123'});
  await page1.locator('#toSchoolStep').click();

  await page1.locator('#schoolSearch').fill('88');
  assert.equal(await page1.locator('#schoolChoice').inputValue(),schoolUuid);
  await page1.locator('#begin').click();

  await page1.waitForURL(`**/cabinets/school/director.html?school=${schoolUuid}&lang=ru`);
  assert.equal(registeredBody?.action,'register');
  assert.equal(registeredBody?.organization_id,schoolUuid);
  assert.equal(registeredBody?.login,'+992 92 700 11 22');
  const savedSess=await page1.evaluate(()=>JSON.parse(localStorage.getItem('smartmaktab.cloud.session.v1')||'null'));
  assert.equal(savedSess?.access_token,'tok-reg-1');
  await ctx1.close();

  // Device 2: clean storage, sign in using 9-digit local phone format without +992
  const ctx2=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce',viewport:{width:390,height:844}});
  await mockSupabase(ctx2);
  const page2=await ctx2.newPage();
  page2.setDefaultTimeout(5500);
  await page2.goto(`${base}/?lang=ru`);
  await page2.locator('#loginIdentifier').fill('927001122');
  await page2.locator('#loginPassword').fill('secret123');
  await page2.locator('#loginSubmit').click();

  await page2.waitForURL(`**/cabinets/school/director.html?school=${schoolUuid}&lang=ru`);
  await page2.locator('#workspaceSettingsToggle').click();
  assert.equal(await page2.locator('#profFirst').inputValue(),'Олим');
  await ctx2.close();
 }finally{await browser.close();}
});

