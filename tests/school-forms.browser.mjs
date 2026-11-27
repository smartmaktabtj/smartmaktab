import {openView,backView,homeView} from './onboarding-fixtures.mjs';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.SM_BASE_URL??'http://localhost:4180';
const route=(name,query='?school=demo-88')=>`${base}/cabinets/school/${name}.html${query}`;
const input=(p,name)=>p.locator(`[data-school-form-field=${name}]`);
const preview=(p,name='Пешнамоиш')=>p.locator('#schoolForms').getByRole('button',{name,exact:true});
async function selectClass(p){await p.locator('#schoolForms [data-class-grade]').selectOption('5');await p.locator('#schoolForms [data-class-letter]').selectOption('Ғ');}
test('Tajik default, saved optional Russian, copyright, and no demo UI across all 54 pages',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage({reducedMotion:'reduce',serviceWorkers:'block'});await page.goto(base);
  assert.equal(await page.locator('html').getAttribute('lang'),'tg');assert.equal(await page.locator('#lang').inputValue(),'tg');
  assert.match(await page.locator('.ownership-notice').innerText(),/Парвиз Шарипов.*Ҳамаи .*ҳуқуқҳо/);
  await page.locator('#lang').selectOption('ru');await page.reload();assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  await page.goto(route('records-clerk'));assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  await page.locator('#cabinetLang').selectOption('tg');await page.goto(base);assert.equal(await page.locator('html').getAttribute('lang'),'tg');
  const list=JSON.parse(await readFile(new URL('../shared/cabinet-registry.json',import.meta.url),'utf8'));
  for(const row of list){const raw=(await readFile(new URL(`../${row.path}`,import.meta.url),'utf8')).split('<!-- SMARTMAKTAB INLINE START -->')[0];assert.match(raw,/© Парвиз Шарипов/);assert.doesNotMatch(raw,/(?:\bDEMO\b|\bДемо[-\s])/iu);}
 }finally{await browser.close();}
});
test('certificate and characteristic use typed fields, variants and printing, never interpreting markup',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage({reducedMotion:'reduce',serviceWorkers:'block'});await page.goto(route('records-clerk'));
  await homeView(page);await page.getByRole('button',{name:'Маълумотнома',exact:true}).click();await selectClass(page);
  await input(page,'person').fill('<b>Намунаи шартӣ</b>');await input(page,'certificateType').selectOption('competition');
  await preview(page).click();assert.equal(await page.locator('.school-form-sheet').isVisible(),false);
  await input(page,'event').fill('Озмуни китобхонӣ');await input(page,'number').fill('11');await preview(page).click();
  const sheet=page.locator('.school-form-sheet');await sheet.waitFor();assert.match(await sheet.innerText(),/Маълумотнома барои озмун/);assert.match(await sheet.innerText(),/<b>Намунаи шартӣ<\/b>/);assert.equal(await sheet.locator('b').count(),0);assert.match(await sheet.innerText(),/МТМУ № 88 · Синф 5Ғ/);
  await page.evaluate(()=>{window.print=()=>{window.printTarget=document.querySelector('.sm-target-print')?.textContent;window.dispatchEvent(new Event('afterprint'));};});
  await sheet.getByRole('button',{name:'Чоп',exact:true}).click();assert.match(await page.evaluate(()=>window.printTarget),/Озмуни китобхонӣ/);
  await page.locator('#cabinetLang').selectOption('ru');await sheet.getByRole('heading',{name:'Справка для конкурса'}).waitFor();
  await page.goto(route('class-teacher','?school=demo-88&lang=tg'));
  await homeView(page);await page.getByRole('button',{name:'Тавсифнома',exact:true}).click();await selectClass(page);
  await input(page,'person').fill('Шахси шартӣ');await input(page,'behavior').fill('Хуб');await input(page,'details').fill('Дар машғулиятҳо фаъол аст.');await input(page,'achievement').fill('Хониши китоб');await preview(page).click();
  assert.match(await sheet.innerText(),/Дар машғулиятҳо фаъол аст/);assert.match(await sheet.innerText(),/Хониши китоб/);
  await backView(page);await input(page,'details').fill('Маълумоти нав');assert.equal(await sheet.isVisible(),false);
 }finally{await browser.close();}
});
test('quarter report validates totals, computes percentages, and opens in the opaque viewer',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage({reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());await page.setContent('<iframe sandbox="allow-scripts" style="width:100%;height:770px"></iframe>');
  const html=await readFile(new URL('../cabinets/school/education-quality.html',import.meta.url),'utf8');
  await page.locator('iframe').evaluate((frame,html)=>{frame.srcdoc=html;},html);
  const p=page.frameLocator('iframe');
  for(const field of await p.locator('#roleIntakeForm input[required]').all())await field.fill('Намуна');
  await p.locator('#saveRoleIntake').click();await p.locator('#institutionSearch').fill('88');await p.locator('#confirmInstitution').click();
  await homeView(p);await p.getByRole('button',{name:'Сифати таҳсилот',exact:true}).click();await selectClass(p);
  for(const [name,value] of Object.entries({year:'2026–2027',subject:'Математика',total:'25',assessed:'22',quality:'23',passed:'20',q1:'6',q2:'8,5',q3:'9',q4:'7'}))await input(p,name).fill(value);
  await input(p,'period').selectOption('h1');await preview(p).click();await p.locator('#schoolForms [role=status]').getByText(/Шумораҳо/).waitFor();
  await input(p,'quality').fill('14');await preview(p).click();
  const sheet=p.locator('.school-form-sheet');await sheet.waitFor();assert.match(await sheet.innerText(),/Нимсолаи 1/);assert.match(await sheet.innerText(),/56%/);assert.match(await sheet.innerText(),/80%/);assert.match(await sheet.innerText(),/7[.,]63/);
  await sheet.getByRole('button',{name:'Чоп',exact:true}).click();await p.locator('#cabinetViewerHint').waitFor();assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('class schedule adds lessons, rejects overlap, and prints in chronological order',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage({reducedMotion:'reduce',serviceWorkers:'block'});await page.goto(route('academic-deputy'));
  await homeView(page);await page.getByRole('button',{name:'Ҷадвали дарсҳо',exact:true}).click();await selectClass(page);
  await page.locator('#schoolForms').getByRole('button',{name:'Иловаи дарс'}).click();
  const row=(index,key)=>page.locator(`#schoolForms [data-lesson-field=${key}]`).nth(index);
  for(const [index,subject,start,end] of [[0,'Математика','09:00','09:45'],[1,'Забони тоҷикӣ','08:00','09:20']]){await row(index,'subject').fill(subject);await row(index,'start').fill(start);await row(index,'end').fill(end);}
  await preview(page).click();assert.match(await page.locator('#schoolForms [role=status]').innerText(),/ҳампӯшии/);
  await row(1,'end').fill('08:45');await preview(page).click();
  const lines=await page.locator('.schedule-print-list li').allTextContents();assert.deepEqual(lines,['08:00–08:45 · Забони тоҷикӣ','09:00–09:45 · Математика']);
 }finally{await browser.close();}
});
