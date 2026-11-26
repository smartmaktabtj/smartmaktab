import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {fillStartupProfile} from './onboarding-fixtures.mjs';
const base=process.env.SM_BASE_URL??'http://localhost:4180';
async function toSchool(page){
 await page.locator('#goToRegister').click();
 await page.locator('#primaryChoices input[value=school-academic-deputy]').check();
 await page.locator('#toExtras').click();await page.locator('#toProfile').click();
 await fillStartupProfile(page,{first:'Демо',last:'Проверка'});
 await page.locator('#toSchoolStep').click();
 await page.locator('#schoolSearch').fill('88');
 assert.equal(await page.locator('#schoolChoice').inputValue(),'demo-88');
}
test('SmartMaktab is typed in two different full-screen scenes, with keyboard and button skip',async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'no-preference'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.clock.install();
  await page.goto(`${base}/?lang=ru`);
  const intro=page.locator('#brandSplash'),letters=page.locator('#splashLetters');
  await intro.waitFor();
  assert.equal(await intro.getAttribute('data-scene'),'launch');
  assert.equal(await page.locator('.splash-orbit').first().isVisible(),true);
  await page.clock.runFor(450);
  const partial=await letters.textContent();
  assert.ok(partial.startsWith('Sm')&&partial.length<11,partial);
  await page.clock.runFor(830);
  assert.equal(await letters.textContent(),'SmartMaktab');
  assert.ok(await intro.evaluate(node=>Math.abs(node.getBoundingClientRect().width-innerWidth)<1));
  const wordBounds=await letters.boundingBox();assert.ok(wordBounds.x>=0&&wordBounds.x+wordBounds.width<=390);
  await page.keyboard.press('Escape');
  assert.equal(await intro.isVisible(),false);
  await toSchool(page);
  await page.locator('#begin').click();await intro.waitFor();
  assert.equal(await intro.getAttribute('data-scene'),'school');
  assert.equal(await page.locator('.splash-route').first().isVisible(),true);
  assert.equal(await page.locator('#splashCaption').textContent(),'МТМУ № 88');
  assert.equal(await page.locator('#splashRole').textContent(),'Муовини таълимӣ');
  await page.clock.runFor(1000);assert.equal(await letters.textContent(),'SmartMaktab');
  assert.equal(new URL(page.url()).pathname,'/');
  await page.locator('#splashSkip').click();await page.waitForURL('**/academic-deputy.html?school=demo-88&lang=ru');
  assert.equal(await page.locator('#workspaceSchool').textContent(),'МТМУ № 88');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('reduced motion skips both splash waits and the isolated viewer can play both normally',async()=>{
 const browser=await chromium.launch();
 try{
  const p=await browser.newPage({reducedMotion:'reduce',serviceWorkers:'block'});
  await p.goto(`${base}/?lang=ru`);
  assert.equal(await p.locator('#brandSplash').isVisible(),false);
  await toSchool(p);await p.locator('#begin').click();await p.waitForURL('**/academic-deputy.html?school=demo-88&lang=ru');
  assert.equal(await p.locator('#workspaceSchool').textContent(),'МТМУ № 88');await p.close();
  const page=await browser.newPage({reducedMotion:'no-preference',viewport:{width:620,height:790}});
  await page.route('**/*',route=>route.abort());
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  await page.setContent('<iframe sandbox="allow-scripts" style="width:100%;height:730px"></iframe>');
  await page.locator('iframe').evaluate((frame,source)=>{frame.srcdoc=source;},html);
  const frame=page.frameLocator('iframe').first();await frame.locator('#brandSplash[open]').waitFor();
  await frame.locator('#splashSkip').click();await toSchool(frame);
  await frame.locator('#begin').click();await frame.locator('#brandSplash[open]').waitFor();
  assert.equal(await frame.locator('#splashCaption').textContent(),'МТМУ № 88');
  await frame.locator('#splashSkip').click();
  await frame.frameLocator('#offlineFrameSlot iframe').locator('#workspaceSchool').getByText('МТМУ № 88').waitFor();
 }finally{await browser.close();}
});
