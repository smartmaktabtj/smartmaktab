import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
import {fillStartupProfile,openView,backView} from './onboarding-fixtures.mjs';
const site=process.env.SM_BASE_URL??'http://localhost:4180';
async function ready(page){
 await page.locator('#goToRegister').click();await page.locator('#primaryChoices input[value=school-teacher]').check();
 await page.locator('#toExtras').click();await page.locator('#toProfile').click();
 await fillStartupProfile(page,{first:'Озмоиш',last:'Синф',teacherClass:'5'});
 await page.locator('#toSchoolStep').click();await page.locator('#schoolSearch').fill('88');
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
  const button=await ready(page);await button.click();
  const frame=page.frameLocator('#offlineFrameSlot iframe');await frame.locator('#workspaceOverview').waitFor();
  assert.equal(await frame.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  assert.match(await frame.locator('#profileClasses').textContent(),/^5 · /);
  const dims=await frame.locator('#cabinetHome').evaluate(e=>[e.scrollHeight,e.clientHeight,document.scrollingElement.scrollHeight,innerHeight]);
  assert.ok(dims[0]<=dims[1]+1,`home needs scroll: ${dims}`);assert.equal(dims[2],dims[3]);
  await openView(frame,'workspaceDocs');assert.equal(await frame.locator('#workspaceOverview').isVisible(),false);
  assert.equal(await frame.locator('#workspaceDocs').isVisible(),true);
  await backView(frame);assert.equal(await frame.locator('#workspaceDocs').isVisible(),false);
  assert.equal(await frame.locator('#workspaceOverview').isVisible(),true);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('Android viewport: installable manifest assets exist and the cached PWA opens Оғоз offline',async()=>{
 const browser=await chromium.launch();
 try{
  const ctx=await browser.newContext({...devices['Pixel 7'],reducedMotion:'reduce'});
  await ctx.route('https://*.supabase.co/**',route=>route.abort());
  const page=await ctx.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(site);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const manifest=await (await page.request.get(`${site}/manifest.webmanifest`)).json();
  assert.equal(manifest.display,'standalone');for(const icon of manifest.icons)assert.equal((await page.request.get(`${site}/${icon.src}`)).status(),200);
  await ctx.setOffline(true);await page.reload();
  await (await ready(page)).click();
  const frame=page.frameLocator('#offlineFrameSlot iframe');await frame.locator('#workspaceOverview').waitFor();
  assert.equal(await frame.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  await frame.locator('#workspaceSettingsToggle').click();assert.equal(await frame.locator('#teacherSubjects').isVisible(),true);
  assert.ok(await frame.locator('html').evaluate(node=>node.scrollWidth<=innerWidth));
  await backView(frame);await openView(frame,'teacherDocumentPanel');assert.equal(await frame.locator('#teacherDocumentPanel').isVisible(),true);
  assert.equal(await frame.locator('#teacherSubjects').isVisible(),false);assert.deepEqual(errors,[]);
  await page.goto(`${site}/cabinets/maorif/subjects/informatics.html?school=demo-b&lang=tg`);
  await page.frameLocator('#offlineFrameSlot iframe').locator('#workspaceSchool').waitFor({state:'attached'});
  assert.equal(await page.frameLocator('#offlineFrameSlot iframe').locator('#workspaceSchool').textContent(),'МТМУ № 4');
 }finally{await browser.close();}
});
