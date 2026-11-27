import {openView,backView,homeView} from './onboarding-fixtures.mjs';
import {pickClass} from './onboarding-fixtures.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.SM_BASE_URL??'http://localhost:4180';
const uri=(role,school='demo-a')=>`${base}/cabinets/school/${role}.html?school=${school}&lang=tg`;
const cfg={reducedMotion:'reduce',serviceWorkers:'block'};
const classCode=(scope,code)=>pickClass(scope,code,false);
const pick=(page,name)=>page.getByRole('button',{name,exact:true});
test('teacher duplicate guard, school-scoped subjects, and lazy book lookup',async()=>{
 const browser=await chromium.launch();try{
  const p=await browser.newPage({...cfg,viewport:{width:390,height:844}}),errors=[],remote=[];p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith(base))remote.push(r.url());});
  await p.goto(uri('teacher'));await p.locator('#instructionLanguage').selectOption('tg');const editor=p.locator('#teacherProfileClasses');
  for(const [code,id] of [['5','informatics'],['5','mathematics'],['5А','informatics']]){await classCode(editor,code);await editor.locator('[data-teaching-subject]').selectOption(id);await editor.locator('[data-add-class]').click();}
  await classCode(editor,'5');assert.equal(await editor.locator('[data-class-letter] option').first().textContent(),'Бе ҳарф');await editor.locator('[data-teaching-subject]').selectOption('informatics');assert.equal(await editor.locator('[data-add-class]').isDisabled(),true);
  await pick(p,'Сабти профил').click();await pick(p,'Пӯшидан').first().click();assert.equal(await p.locator('#workspaceSchool').textContent(),'МТМУ № 1');
  await p.locator('#workspaceSettingsToggle').click();const rows=p.locator('#teacherSubjectRows li');assert.equal(await rows.count(),3);
  await rows.filter({hasText:'Математика'}).locator('[data-book-shortcut]').click();assert.match(await p.locator('#teacherBookNote').textContent(),/ёфт нашуд/);
  await backView(p);await rows.filter({hasText:/^5 · Технологияи иттилоотӣ/}).locator('[data-book-shortcut]').click();assert.equal(await p.locator('#teacherBooks a').count(),2);assert.match(await p.locator('#teacherBooks a').first().getAttribute('href'),/^https:\/\/raw\.githubusercontent\.com\/sharipovip\/books\//);
  assert.deepEqual(remote,[]);await p.goto(uri('teacher','demo-b'));assert.equal(await p.locator('#teacherSubjectRows li').count(),0);assert.equal(await p.locator('#workspaceSchool').textContent(),'МТМУ № 4');assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('weekly print and summary matrix show selected scope and retain a genuine zero',async()=>{
 const browser=await chromium.launch();try{
  const p=await browser.newPage(cfg);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(uri('academic-deputy'));
  await homeView(p);await pick(p,'Ҷадвали ҳафтаина').click();const ops=p.locator('#schoolOperations');
  async function row(i,code,start,end){const g=ops.locator('fieldset.school-fields').nth(i);await classCode(g,code);for(const [k,v] of Object.entries({subject:'Математика',start,end,teacher:'Устод 1',room:String(10+i)}))await g.locator(`[data-operation-field=${k}]`).fill(v);}
  await row(0,'5','08:00','08:45');await pick(p,'Иловаи дарс').last().click();await row(1,'6Б','08:20','09:00');await ops.getByRole('button',{name:'Пешнамоиш',exact:true}).click();assert.match(await ops.locator('[role=status]').innerText(),/Омӯзгор/);
  await ops.locator('[data-operation-field=start]').nth(1).fill('08:45');await ops.getByRole('button',{name:'Пешнамоиш',exact:true}).click();assert.equal(await ops.locator('tbody tr').count(),2);
  await backView(p);await pick(p,'Ҳисоботи сифат аз рӯи давраҳо').click();await classCode(ops,'5');
  for(const [k,v] of Object.entries({year:'2026–2027',subject:'Информатика','q1-total':'25','q1-assessed':'20','q1-quality':'0','q1-passed':'17'}))await ops.locator(`[data-operation-field=${k}]`).fill(v);
  await ops.getByRole('button',{name:'Пешнамоиш',exact:true}).click();
  const quality=ops.locator('tr').filter({hasText:'Сифат, %'});assert.deepEqual(await quality.locator('td').allTextContents(),['0','—','—','—','—','—','—']);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('paper inventory and real local DOCX download',async()=>{
 const browser=await chromium.launch();try{
  const p=await browser.newPage({...cfg,acceptDownloads:true});await p.goto(uri('library-head'));const loan=p.locator('#libraryLoans');const loans=async()=>{await homeView(p);await openView(p,'libraryLoans');};await loans();
  const value=(k,v)=>loan.locator(`[data-loan-field=${k}]`).fill(v);
  await value('inventory','T-01');await value('name','Намунаи китоб');await pick(p,'Иловаи нусха').click();
  await value('reader','H-01');await value('issued','2026-07-01');await value('due','2026-07-05');await pick(p,'Додан').click();assert.equal(await pick(p,'Додан').isDisabled(),true);
  await pick(p,'Баргардондан').click();assert.equal(await pick(p,'Баргардондан').count(),0);await p.reload();await loans();assert.match(await loan.innerText(),/Намунаи китоб/);await p.goto(uri('library-head','demo-b'));await loans();assert.doesNotMatch(await loan.innerText(),/Намунаи китоб/);
  await p.goto(uri('records-clerk'));await homeView(p);await pick(p,'Маълумотнома · DOCX').click();const pilot=p.locator('#pilotCertificate');await classCode(pilot,'5');
  for(const [k,v] of Object.entries({district_name:'Ноҳияи шартӣ',document_number:'DOC-001',student_full_name:'Хонандаи шартӣ',issue_date:'2026-11-24'}))await pilot.locator(`[data-pilot-field=${k}]`).fill(v);
  await pick(p,'Омода кардани DOCX').click();const download=p.waitForEvent('download');await pick(p,'Боргирии DOCX').click();assert.match((await download).suggestedFilename(),/\.docx$/);
 }finally{await browser.close();}
});

test('PDF reader is loaded only on request, renders pages and handles an unreachable static source',async()=>{
 const browser=await chromium.launch();
 function pdf(){
  const stream='0.2 0.5 0.2 rg\n10 10 100 100 re f\n',objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 5 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}endstream`];
  let text='%PDF-1.4\n';const offsets=[0];for(const [i,item] of objects.entries()){offsets.push(text.length);text+=`${i+1} 0 obj\n${item}\nendobj\n`;}
  const pos=text.length;text+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(x=>`${String(x).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;return Buffer.from(text);
 }
 try{
  const p=await browser.newPage(cfg),requests=[];let fail=false;
  await p.addInitScript(()=>sessionStorage.setItem('smartmaktab.demo.teacher.v1.demo-a',JSON.stringify({language:'tg',teaching:[{classCode:'5А',subject:'informatics'}]})));
  await p.route('https://raw.githubusercontent.com/sharipovip/books/**',route=>route.fulfill({status:fail?404:200,headers:{'Content-Type':'application/pdf','Access-Control-Allow-Origin':'*'},body:fail?'':pdf()}));
  p.on('request',r=>requests.push(r.url()));await p.goto(uri('teacher'));
  await homeView(p);await p.locator('#workspaceSettingsToggle').click();await p.locator('[data-book-shortcut]').click();assert.ok(!requests.some(url=>url.includes('/vendor/pdf/')||url.includes('raw.githubusercontent')));
  const readers=p.locator('[data-reader-launch]');await readers.first().click();await p.locator('.pdf-reader output').getByText('1 / 2').waitFor();await p.waitForFunction(()=>document.querySelector('.pdf-stage canvas')?.width>0);await pick(p,'Саҳифаи баъдӣ').click();await p.locator('.pdf-reader output').getByText('2 / 2').waitFor();
  assert.ok(requests.some(url=>url.endsWith('pdf.worker.min.mjs')));await pick(p,'Пӯшидани китоб').click();
  fail=true;await readers.last().click();await p.locator('.pdf-reader [role=status]').getByText(/кушода нашуд/).waitFor();assert.equal(await p.locator('#teacherBooks a').count(),2);
 }finally{await browser.close();}
});
