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

  // Step 3: Unified personal profile + custom method name
  await page.locator('#toProfile').click();
  assert.equal(await page.locator('#customMethodWrap').isVisible(),true);
  await page.locator('#customMethodNameInput').fill('Методобъединение точных наук');
  await fillStartupProfile(page,{first:'Нав',last:'Озмоишӣ',login:'nav_ozm'});
  await page.locator('#toSchoolStep').click();

  // Step 4: School choice & summary
  assert.equal(await page.locator('#results .row').count(),3);
  assert.match(await page.locator('#results').textContent(),/Методобъединение точных наук/);
  assert.equal(await page.locator('#results a').count(),0);
  assert.equal(await page.locator('#begin').textContent(),'Оғоз');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#schoolSearch').fill('88');
  assert.equal(await page.locator('#schoolChoice').inputValue(),'demo-88');
  await page.locator('#begin').click();

  // Cabinet view: unified Profile drawer + Update icon + dynamic multi-role sidebar
  await page.waitForURL('**/cabinets/school/director.html?school=demo-88&lang=ru');
  await page.locator('#workspaceSwitch').waitFor();
  assert.deepEqual(await page.locator('#workspaceSwitch option').evaluateAll(nodes=>nodes.map(node=>node.value)),['school-director',a,b]);
  assert.equal(await page.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  assert.equal(await page.locator('#workspaceSettings').isVisible(),false);
  assert.equal(await page.locator('#cabinetUpdateTrigger').isVisible(),true);
  assert.equal(await page.locator('#cabinetRailNav [data-sm-dynamic="role"]').count(),3);
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
  await cabinet.locator('#cabinetRailToggle').click();
  assert.equal(await cabinet.locator('#cabinetRailToggle').getAttribute('aria-expanded'),'false');
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
  await page.locator('#teacherDocumentPanel').waitFor({state:'hidden'});
  await settings('9Б','ru');
  assert.equal(await page.locator('#profileClasses').textContent(),'9Б · Информатика');
  await page.locator('#teacherSchoolLinks a').click();
  await page.waitForURL('**/teacher.html?school=demo-a&lang=ru');
  await page.locator('#workspaceSettingsToggle').click();
  await page.locator('#teacherProfileSummary').waitFor();
  assert.equal(await page.locator('#profileClasses').textContent(),'5Б · Информатика');
  assert.equal(await page.locator('#profileInstruction').textContent(),'Таджикский');
  await page.locator('#teacherSchoolLinks a').click();
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
