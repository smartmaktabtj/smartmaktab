import {openView,backView,homeView} from './onboarding-fixtures.mjs';
import {pickClass} from './onboarding-fixtures.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.SM_BASE_URL??'http://localhost:4180';
async function fillDirector(page){
 for(const [key,value] of Object.entries({directorFirst:'Демо',directorLast:'Тест',directorBirth:'1980',directorEduYears:'20',directorLeadYears:'10',directorUniversity:'Демо-вуз',directorSpecialty:'Демо-специальность'})) await page.locator(`#${key}`).fill(value);
 await page.locator('#directorDiploma').selectOption('master');
 await page.locator('#directorCategory').selectOption('none');
 await page.locator('#directorPersonnelSave').click();
}
async function fillBasic(page){
 for(const node of await page.locator('#roleIntake input[required]').all())await node.fill('Демо');
 for(const node of await page.locator('#roleIntake [data-role-class]').all())await pickClass(node,'5В',(await node.locator('[data-add-class]').count())>0);
 await page.locator('#saveRoleIntake').click();
}
test('all 54 cabinets unlock a picker with the complete roster after their own profile',async()=>{
 const roster=JSON.parse(await readFile(new URL('../shared/cabinet-registry.json',import.meta.url),'utf8'));
 const browser=await chromium.launch();
 try{
  const workers=3;
  await Promise.all(Array.from({length:workers},async(_,worker)=>{
   const page=await browser.newPage({serviceWorkers:'block',reducedMotion:'reduce'});
   page.setDefaultTimeout(12000);
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   for(const role of roster.filter((_,i)=>i%workers===worker)){
    await page.goto(`${base}/${role.path}?lang=ru`);
    const picker=page.locator('#institutionPicker');assert.equal(await picker.isVisible(),false,role.id);
    await (role.id==='school-director'?fillDirector:fillBasic)(page);
    await picker.waitFor();
    const choices=await page.locator('#institutionChoice option').allTextContents();
    assert.deepEqual(choices.slice(1),Array.from({length:88},(_,i)=>`МТМУ № ${i+1}`),role.id);
    await page.locator('#institutionSearch').fill('МТМУ № 88');
    assert.equal(await page.locator('#institutionChoice').inputValue(),'demo-88');
    await page.locator('#confirmInstitution').click();
    assert.equal(new URL(page.url()).searchParams.get('school'),'demo-88',role.id);
    if(role.id==='school-director'){
     assert.match(await page.locator('#directorPersonnelValues').textContent(),/Демо-вуз/);
     assert.equal(await page.locator('#directorProfilePanel').isVisible(),true);
    }
    assert.match(await page.locator('#institutionStatus').textContent(),/МТМУ № 88/);
   }
   assert.deepEqual(errors,[]);
   await page.close();
  }));
 }finally{await browser.close();}
});
test('sidebar stays at the top when scrolling, can be collapsed, and closes itself after 15 seconds',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1150,height:640},serviceWorkers:'block'});
  await page.clock.install();
  await page.goto(`${base}/cabinets/school/director.html?school=demo-a&lang=ru`);
  const toggle=page.locator('#cabinetRailToggle'),rail=page.locator('.rail');
  await page.evaluate(()=>document.getElementById('cabinetHome').scrollTo(0,500));
  assert.ok(await page.evaluate(()=>scrollY===0&&document.getElementById('cabinetHome').scrollTop>100));
  assert.equal(Math.round((await rail.boundingBox()).y),0);
  await page.clock.fastForward(15_100);
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#cabinetRailNav').isVisible(),false);
  await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(Math.round((await rail.boundingBox()).y),0);
 }finally{await browser.close();}
});

test('role templates, materials and settings are separate and printable drafts retain their school',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/cabinets/school/class-teacher.html?school=demo-88&lang=ru`);
  await page.getByRole('button',{name:'Настройки'}).waitFor();
  assert.equal(await page.locator('#cabinetRailNav a[href="#roleIntake"]').count(),0);
  assert.equal(await page.locator('#cabinetRailNav a[href="#institutionPicker"]').count(),0);
  assert.equal(await page.locator('#cabinetRailNav a[href="#workspaceMaterials"]').count(),1);
  await page.locator('#closeWorkspaceSettings').click();
  await openView(page,'workspaceDocs');await page.getByRole('button',{name:/План классного руководителя/}).click();
  await page.locator('#workspaceDraftPeriod').fill('2026/27');
  await page.locator('#workspaceDraftTopic').fill('Общая встреча');
  await page.locator('#workspaceDraftBody').fill('<strong>Демо</strong>');
  await page.locator('#workspacePreview').click();
  assert.equal(await page.locator('#workspaceSheetSchool').textContent(),'МТМУ № 88');
  assert.equal(await page.locator('#workspaceSheetBody').textContent(),'<strong>Демо</strong>');
  assert.equal(await page.locator('#workspaceSheetBody strong').count(),0);
  assert.equal(await page.locator('#workspaceDraft').evaluate(node=>getComputedStyle(node).animationName),'none');
  await page.getByRole('button',{name:'Настройки'}).click();
  const picker=page.locator('#roleIntake [data-role-class]');
  await picker.locator('[data-class-grade]').selectOption('5');
  assert.deepEqual(await picker.locator('[data-class-letter] option').evaluateAll(nodes=>nodes.map(node=>node.value).slice(1,7)),['А','Б','В','Г','Ғ','Д']);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
