import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
import {TEST_SCHOOL_UUID_88,fillStartupProfile,installMockSupabase,openView,backView} from './onboarding-fixtures.mjs';
const site=process.env.SM_BASE_URL??'http://localhost:4180';
async function ready(page,expectedSchoolId='demo-88'){
 await page.locator('#goToRegister').click();await page.locator('#primaryChoices input[value=school-teacher]').check();
 await page.locator('#toExtras').click();await page.locator('#toProfile').click();
 await fillStartupProfile(page,{first:'Озмоиш',last:'Синф',teacherClass:'5',login:'port_user',password:'Password123'});
 await page.locator('#toSchoolStep').click();await page.locator('#schoolSearch').fill('88');
 assert.equal(await page.locator('#schoolChoice').inputValue(),expectedSchoolId);
 const button=page.locator('#begin');assert.equal(await button.isEnabled(),true);
 assert.ok(await button.evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
 return button;
}
test('desktop: portable file opens Оғоз without native gzip, and opens separate screens with no page scroll',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce',serviceWorkers:'block'});
  page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{globalThis.DecompressionStream=undefined;});
  await page.goto(new URL('../index.html',import.meta.url).href);
  const button=await ready(page,'demo-88');await button.click();
  const frame=page.frameLocator('#offlineFrameSlot iframe');await frame.locator('#smMainModules').waitFor();
  assert.equal(await frame.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  assert.match(await frame.locator('#profileClasses').textContent(),/^5 · /);
  const dims=await frame.locator('#cabinetHome').evaluate(e=>[e.scrollHeight,e.clientHeight,document.scrollingElement.scrollHeight,innerHeight]);
  assert.ok(dims[0]<=dims[1]+1,`home needs scroll: ${dims}`);assert.equal(dims[2],dims[3]);
  await frame.locator('#smMainModules [data-open-phase2="smStudentsPanel"]').click();assert.equal(await frame.locator('#smMainModules').isVisible(),false);
  await frame.locator('#smStudentsPanel').waitFor();
  await backView(frame);assert.equal(await frame.locator('#smStudentsPanel').isVisible(),false);
  assert.equal(await frame.locator('#smMainModules').isVisible(),true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('Android viewport: manifest assets exist, self-cleaning SW unregisters, and online cabinets work on mobile',async()=>{
 const browser=await chromium.launch();
 try{
  const ctx=await browser.newContext({...devices['Pixel 7'],reducedMotion:'reduce'});
  await installMockSupabase(ctx);
  const page=await ctx.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site);
  const manifest=await (await page.request.get(`${site}/manifest.webmanifest`)).json();
  assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert.equal((await page.request.get(`${site}/${icon.src}`)).status(),200);
  const swRes=await page.request.get(`${site}/sw.js`);
  assert.equal(swRes.status(),200);
  assert.match(await swRes.text(),/unregister/);
  await (await ready(page,TEST_SCHOOL_UUID_88)).click();
  await page.waitForURL(`**/cabinets/school/teacher.html?school=${TEST_SCHOOL_UUID_88}&lang=tg`);
  assert.equal(await page.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  await page.locator('#workspaceSettingsToggle').click();assert.equal(await page.locator('#teacherSubjects').isVisible(),true);
  assert.ok(await page.locator('html').evaluate(node=>node.scrollWidth<=innerWidth));
  await backView(page);await page.locator('#smMainModules [data-open-phase2="smGradesPanel"]').click();assert.equal(await page.locator('#smGradesPanel').isVisible(),true);
  assert.equal(await page.locator('#teacherSubjects').isVisible(),false);assert.deepEqual(errors,[]);
  await page.goto(`${site}/cabinets/maorif/head.html?school=demo-b&lang=tg`);
  await page.locator('#workspaceSchool').waitFor({state:'attached'});
  assert.equal(await page.locator('#workspaceSchool').textContent(),'МТМУ № 4');
 }finally{await browser.close();}
});
