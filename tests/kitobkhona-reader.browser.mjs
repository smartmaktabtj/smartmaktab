import {openView,homeView,fillRoleFields} from './onboarding-fixtures.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
const base=process.env.SM_BASE_URL??'http://localhost:4180';
function textPdf(){
 const stream='BT /F1 12 Tf 20 170 Td (Algorithms describe a sequence of operations.) Tj 0 -20 Td (Algorithms make operations repeatable and testable.) Tj ET\n';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 340 230] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}endstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let text='%PDF-1.4\n';const offsets=[0];for(const [i,item] of objects.entries()){offsets.push(text.length);text+=`${i+1} 0 obj\n${item}\nendobj\n`;}
 const pos=text.length;text+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(x=>`${String(x).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;return Buffer.from(text);
}
test('mobile fullscreen Kitobkhona reader has a file size, download feedback and local Aliya tasks',async()=>{
 const browser=await chromium.launch();const requests=[];
 try{
  const p=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block',acceptDownloads:true});
  const body=textPdf();let wait,go;const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>sessionStorage.setItem('smartmaktab.demo.teacher.v1.demo-a',JSON.stringify({language:'tg',teaching:[{classCode:'1А',subject:'mathematics'}]})));
  await p.route('https://raw.githubusercontent.com/sharipovip/books/**',async route=>{if(wait)await wait;await route.fulfill({status:200,headers:{'Content-Type':'application/pdf','Access-Control-Allow-Origin':'*'},body});});
  p.on('request',r=>requests.push(r.url()));await p.goto(`${base}/cabinets/school/teacher.html?school=demo-a&lang=tg`);
  await homeView(p);await p.locator('[data-teacher-library]').click();assert.match(await p.locator('.book-file-size').innerText(),/26[.,]9 МБ/);
  assert.ok(!requests.some(x=>x.includes('raw.githubusercontent')||x.includes('pdf.min.mjs')));
  wait=new Promise(resolve=>go=resolve);await p.locator('[data-book-download]').click();
  const reader=p.locator('.pdf-reader[open]');await reader.waitFor();
  assert.equal(await reader.evaluate(n=>Math.abs(n.getBoundingClientRect().width-innerWidth)<1),true);
  assert.equal(await reader.locator('.reader-transfer progress').isVisible(),true);assert.match(await reader.locator('.reader-transfer [role=status]').innerText(),/0%/);
  const pending=p.waitForEvent('download');go();const download=await pending;assert.match(download.suggestedFilename(),/\.pdf$/);assert.deepEqual(await readFile(await download.path()),body);
  assert.match(await reader.locator('.reader-transfer [role=status]').innerText(),/100%/);
  await reader.getByRole('button',{name:'Хондан',exact:true}).click();await reader.locator('output').getByText('1 / 1').waitFor();
  await reader.getByRole('button',{name:/Алия/}).click();
  const stage=reader.locator('.aliya-reading-pane');assert.equal(await stage.locator('.aliya-actions').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length),2);
  const reference=process.env.SM_ALIYA_REFERENCE_DIR, output=process.env.SM_ALIYA_SCREENSHOT_DIR;
  if(reference&&output){
    await p.screenshot({path:`${output}/Aliya_SmartMaktab_390.png`});
    const baseline=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const ctx=await stage.locator('.aliya-book-context h1').innerText();const safeUrl=requests.find(x=>x.startsWith('https://raw.githubusercontent'));
    const params=new URLSearchParams({url:safeUrl,name:ctx,page:'1',embed:'1'});
    await baseline.route('**/_reference/**',async route=>{
      const path=new URL(route.request().url()).pathname.slice('/_reference/'.length);
      if(path==='harness.html')return route.fulfill({contentType:'text/html',body:`<style>body{margin:0}iframe{width:100%;height:100dvh;border:0;display:block}</style><script>window.__kkCloseAliya=()=>{};window.__kkReaderDoc={url:${JSON.stringify(safeUrl)},doc:{numPages:1}};</script><iframe src="./aliya/reader-aliya.html?${params.toString()}"></iframe>`});
      if(/^[\w/.-]+$/.test(path)&&!path.includes('..'))try{return await route.fulfill({path:`${reference}/${path}`});}catch{}
      return route.abort();
    });
    await baseline.route('https://**/*',route=>route.abort());
    await baseline.goto(`${base}/_reference/harness.html`);
    await baseline.frameLocator('iframe').locator('#raTasks .at-task').first().waitFor();
    await baseline.screenshot({path:`${output}/Aliya_Kitobkhona_390.png`});await baseline.close();
  }
  await reader.locator('[data-aliya-task=summary]').click();await reader.locator('.aliya-sheet .aliya-go').click();
  await reader.locator('.aliya-result').getByText(/Algorithms describe/).waitFor();
  await reader.locator('.aliya-result').getByRole('button',{name:'Сабти ёддошт'}).click();await reader.locator('summary').getByText(/Ёддоштҳо \(1\)/).waitFor();
  await reader.locator('[data-aliya-task=words]').click();await reader.locator('.aliya-result').getByText(/algorithms/).waitFor();
  assert.equal(await reader.getByRole('button',{name:/лайк|звезд|баҳо/i}).count(),0);
  assert.ok(requests.filter(x=>x.startsWith('https://raw.githubusercontent')).length===1);assert.ok(requests.every(x=>x.startsWith(base)||x.startsWith('https://raw.githubusercontent')));
  await p.keyboard.press('Escape');if(await reader.locator('.aliya-reading-pane').isVisible())await p.keyboard.press('Escape');assert.equal(await reader.locator('.aliya-reading-pane').isVisible(),false);assert.equal(await reader.isVisible(),true);
  await p.keyboard.press('Escape');assert.equal(await reader.isVisible(),false);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('Windows-style file launch: full-width setup, automatic teacher bookshelf and portable PDF/Aliya',async()=>{
 const browser=await chromium.launch();
 try{
  const p=await browser.newPage({viewport:{width:1568,height:754},reducedMotion:'reduce',acceptDownloads:true});p.setDefaultTimeout(9500);
  const errors=[];p.on('pageerror',e=>errors.push(e.message));const source='https://raw.githubusercontent.com/sharipovip/books/';const requested=[];
  await p.route(`${source}**`,r=>r.fulfill({status:200,headers:{'Content-Type':'application/pdf','Access-Control-Allow-Origin':'*'},body:textPdf()}));
  p.on('request',r=>{if(r.url().startsWith('https:'))requested.push(r.url());});
  await p.goto(new URL('../index.html',import.meta.url).href);
  const full=()=>p.locator('#startupShell').evaluate(n=>n.clientWidth===innerWidth&&n.clientHeight===innerHeight);
  assert.equal(await full(),true);
  await p.locator('#goToRegister').click();await p.locator('#primaryChoices input[value=school-teacher]').check();await p.locator('#toExtras').click();await p.locator('#toProfile').click();
  await p.locator('#firstName').fill('Озмоиш');await p.locator('#lastName').fill('Девор');
  await p.locator('#birthYear').fill('15.05.1985');await p.locator('#genderSelect').selectOption('male');
  await p.locator('#specialtyInput').fill('Информатика');await p.locator('#eduYearsInput').fill('5');
  await p.locator('#educationSelect').selectOption('higher');
  await p.locator('#institutionTypeSelect').selectOption('school');
  await p.locator('#institutionShiftsSelect').selectOption('one');
  await fillRoleFields(p.locator('[data-step="3"]'),{teacherClass:'5'});
  assert.equal(await full(),true);assert.equal(await p.locator('.hero').isVisible(),false);
  await p.locator('#toSchoolStep').click();await p.locator('#schoolSearch').fill('88');await p.locator('#begin').click();
  const f=p.frameLocator('#offlineFrameSlot iframe');const list=f.locator('#teacherShelf');
  await list.waitFor();assert.equal(await list.locator('li').count(),2);assert.match(await list.innerText(),/Технологияи иттилоотӣ|информатика/i);assert.deepEqual(requested,[]);
  await f.locator('html').evaluate(n=>n.dataset.theme='dark');
  await list.locator('[data-home-read]').first().click();const reader=f.locator('.pdf-reader[open]');await reader.locator('output').getByText('1 / 1').waitFor();
  assert.equal(await p.locator('#offlineDeckHeader').isVisible(),false);assert.equal(await reader.getAttribute('data-theme'),'light');
  assert.equal(await reader.getByText(/Нусхаи пайванд|Пайванди аслӣ/).count(),0);
  const r=await reader.evaluate(n=>{const d=n.getBoundingClientRect(),b=n.querySelector('.reader-bottom').getBoundingClientRect(),s=n.querySelector('.pdf-stage').getBoundingClientRect();return [d.height,b.bottom,d.bottom,s.height];});
  assert.ok(Math.abs(r[1]-r[2])<=2&&r[3]>.65*r[0],`toolbars/stage: ${r}`);
  await reader.getByRole('button',{name:/Алия/}).click();await reader.locator('[data-aliya-task=summary]').click();await reader.locator('.aliya-result').getByText(/Algorithms describe/).waitFor();
  await reader.locator('[data-aliya-task=notesTask]').click();await reader.locator('summary').getByText(/Ёддоштҳо \(1\)/).waitFor();
  await reader.locator('.aliya-phone-head button').first().click();await reader.locator('[data-reader-action=close]').click();await p.locator('#offlineDeckHeader').waitFor();
  await list.locator('[data-teacher-library]').click();const download=p.waitForEvent('download');await f.locator('#teacherBooks [data-book-download]').first().click();assert.deepEqual(await readFile(await (await download).path()),textPdf());
  assert.deepEqual(errors,[]);assert.equal(requested.length,1);
 }finally{await browser.close();}
});
