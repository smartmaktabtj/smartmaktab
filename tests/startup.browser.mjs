import {fillRoleFields,pickClass,chooseInitialSchool} from './onboarding-fixtures.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.SM_BASE_URL??'http://localhost:4180';
async function start(page,level,main){
 await page.locator(`[data-level=${level}]`).click();
 await page.locator(`#primaryChoices input[value=${main}]`).check();
 await page.locator('#toExtras').click();
}
async function person(page,first,last,school){
 await page.locator('#firstName').fill(first);await page.locator('#lastName').fill(last);
 await fillRoleFields(page.locator('[data-step="4"]'));
 await page.locator('#toReview').click();
}
test('startup: 20 school roles, at most ten extras, and per-field inheritance survives revisiting primary',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({serviceWorkers:'block',reducedMotion:'reduce',viewport:{width:390,height:844}});
  page.setDefaultTimeout(5000);
  const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
  await page.goto(`${base}/?lang=ru`);
  assert.deepEqual(await page.locator('[data-level]').evaluateAll(list=>list.map(el=>el.dataset.level)),['raesat','maorif','school']);
  await start(page,'school','school-director');
  assert.equal(await page.locator('#primaryChoices input').count(),20);
  assert.equal(await page.locator('#extraChoices input').count(),19);
  assert.equal(await page.locator('#extraChoices input[value=school-director]').count(),0);
  let roles=page.locator('#extraChoices input');
  for(let i=0;i<10;i++)await roles.nth(i).check();
  assert.equal(await roles.nth(10).isDisabled(),true);
  assert.equal(await page.locator('#extraCount').textContent(),'10 / 10');
  for(let i=9;i>1;i--)await roles.nth(i).uncheck();
  const a=await roles.nth(0).inputValue(),b=await roles.nth(1).inputValue();
  await page.locator('#toProfile').click();
  await person(page,'  Намуна  ','Санҷишӣ','demo-a');
  const extra=(id,field)=>page.locator(`[data-review-role=${id}] input[data-field=${field}]`);
  assert.equal(await extra(a,'first').inputValue(),'Намуна');
  assert.equal(await extra(b,'last').inputValue(),'Санҷишӣ');
  await extra(a,'first').fill('Дигар');
  await page.locator('[data-step="5"] [data-back="4"]').click();
  await person(page,'Нав','Озмоишӣ','demo-a');
  assert.equal(await extra(a,'first').inputValue(),'Дигар');
  assert.equal(await extra(a,'last').inputValue(),'Озмоишӣ');
  assert.equal(await extra(b,'first').inputValue(),'Нав');
  await page.locator('[data-review-role="'+a+'"]').getByRole('button',{name:'Подставить из основной'}).click();
  assert.equal(await extra(a,'first').inputValue(),'Нав');
  await extra(b,'last').fill('<strong>Тест</strong>');
  await page.locator('#lang').selectOption('tg');
  assert.equal(await extra(b,'last').inputValue(),'<strong>Тест</strong>');
  await fillRoleFields(page.locator(`[data-review-role=${a}]`));
  await fillRoleFields(page.locator(`[data-review-role=${b}]`));
  await page.locator('#finish').click();
  assert.equal(await page.locator('#results .row').count(),3);
  assert.equal(await page.locator('#results p strong').count(),0);
  assert.equal(await page.locator('#results a').count(),0);
  assert.equal(await page.locator('#begin').textContent(),'Оғоз');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),['smartmaktab.language.v1']);
  assert.equal(await page.evaluate(()=>sessionStorage.length),0);
  await page.locator('#schoolSearch').fill('88');
  assert.equal(await page.locator('#schoolChoice').inputValue(),'demo-88');
  await page.locator('#begin').click();
  await page.waitForURL('**/cabinets/school/director.html?school=demo-88&lang=tg');
  await page.locator('#workspaceSwitch').waitFor();
  assert.deepEqual(await page.locator('#workspaceSwitch option').evaluateAll(nodes=>nodes.map(node=>node.value)),['school-director',a,b]);
  assert.equal(await page.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  assert.equal(await page.locator('#workspaceSettings').isVisible(),false);
  assert.equal(await page.locator('#cabinetRailNav a[href="#directorPersonnel"]').count(),0);
  await page.locator('#workspaceSettingsToggle').click();
  assert.match(await page.locator('#directorPersonnelValues').textContent(),/Нав/);
  assert.match(await page.locator('#directorPersonnelValues').textContent(),/Озмоишӣ/);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('smartmaktab.demo.role-setup.v3.school-director')),null);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#workspaceSwitch').selectOption(a);
  await page.waitForURL('**/cabinets/school/academic-deputy.html?school=demo-88&lang=tg');
  assert.equal(await page.locator('#workspaceSwitch').inputValue(),a);
  await page.locator('#workspaceSwitch').selectOption('school-director');
  await page.waitForURL('**/cabinets/school/director.html?school=demo-88&lang=tg');
  assert.ok(requests.every(url=>!decodeURI(url).includes('Намуна')&&!decodeURI(url).includes('Озмоишӣ')));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('startup works inside the offline file viewer; other levels can proceed without extras',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(5000);
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  await page.route('**/*',route=>route.abort());
  await page.setContent('<iframe sandbox="allow-scripts"></iframe>');
  await page.locator('iframe').evaluate((frame,value)=>{frame.srcdoc=value;},html);
  const frame=page.frameLocator('iframe').first();
  await frame.locator('[data-level=maorif]').click();
  assert.equal(await frame.locator('#primaryChoices input').count(),33);
  await frame.locator('[data-step="2"] [data-back="1"]').click();
  await frame.locator('[data-level=raesat]').click();
  assert.equal(await frame.locator('#primaryChoices input').count(),1);
  await frame.locator('#primaryChoices input').check();
  await frame.locator('#toExtras').click();
  assert.equal(await frame.locator('#noExtras').isVisible(),true);
  await frame.locator('#toProfile').click();
  await person(frame,'Демо','Озмоиш');
  assert.equal(await frame.locator('#results .row').count(),1);
  await frame.locator('#schoolSearch').fill('88');await frame.locator('#begin').click();
  const cabinet=frame.frameLocator('#offlineFrameSlot iframe');
  await cabinet.getByRole('heading',{name:'Роҳбари раёсат',exact:true}).waitFor();
  assert.equal(await cabinet.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  await cabinet.locator('#workspaceSettingsToggle').click();
  assert.equal(await cabinet.locator('[data-intake-field=first]').inputValue(),'Демо');
  await cabinet.locator('#cabinetRailToggle').click();
  assert.equal(await cabinet.locator('#cabinetRailToggle').getAttribute('aria-expanded'),'false');
 }finally{await browser.close();}
});

test('teacher marks multiple workplaces and class profiles stay separate across school switches',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({serviceWorkers:'block',reducedMotion:'reduce',viewport:{width:390,height:844}});
  page.setDefaultTimeout(5500);
  await page.goto(`${base}/?lang=ru`);
  await start(page,'school','school-teacher');
  await page.locator('#extraChoices input[value=school-director]').check();
  await page.locator('#toProfile').click();
  await person(page,'Демо','Озмоиш','demo-a');
  await fillRoleFields(page.locator('[data-review-role=school-director]'));
  await page.locator('#finish').click();
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
  await page.locator('#workspaceSwitch').selectOption('school-director');
  await page.waitForURL('**/director.html?school=demo-a&lang=ru');
  assert.equal(await page.locator('#workspaceSettings').isVisible(),false);
 }finally{await browser.close();}
});

test('current version has no archive routes and the night setting persists across cabinets and reload',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({serviceWorkers:'block',colorScheme:'light',reducedMotion:'reduce'});
  await page.goto(`${base}/?lang=ru`);
  await page.locator('#lang').selectOption('ru');
  await page.getByRole('button',{name:'Ночной режим'}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  for(const route of ['/dashboard.html','/onboarding/index.html','/dev/'])assert.equal((await page.request.get(base+route)).status(),404,route);
  await start(page,'school','school-academic-deputy');
  await page.locator('#toProfile').click();await person(page,'Демо','Озмоиш');
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
