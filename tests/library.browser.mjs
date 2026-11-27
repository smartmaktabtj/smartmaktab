import {openView,backView,homeView} from './onboarding-fixtures.mjs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from 'playwright';
const base=process.env.SM_BASE_URL??'http://localhost:4180';

test('Chromium: separate library profile, monthly plan, later edits and clean print view',async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage({serviceWorkers:'block'});
    page.setDefaultTimeout(4500);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/cabinets/school/library-head.html?school=demo-a&lang=tg`);
    assert.match(page.url(),/library-head\.html\?school=demo-a/);
    await page.locator('#libraryZone').waitFor();
    await page.locator('#libraryPlanPanel').waitFor({state:'hidden'});
    await page.locator('#libraryZone').selectOption('reading');
    await page.getByRole('button',{name:'Сабти профил'}).click();
    assert.match(await page.locator('#libraryProfileStatus').textContent(),/камаш як қисми фонд/);
    await page.getByRole('checkbox',{name:'Китобҳои дарсӣ',exact:true}).check();
    await page.getByRole('checkbox',{name:'Адабиёти бадеӣ',exact:true}).check();
    await page.getByRole('button',{name:'Сабти профил'}).click();
    assert.deepEqual(await page.locator('#libraryFund option').allTextContents(),['Қисмро интихоб кунед','Китобҳои дарсӣ','Адабиёти бадеӣ']);
    async function add(fund,audience,name){
      await page.locator('#libraryFund').selectOption(fund);
      await page.locator('#libraryAudience').selectOption(audience);
      await page.locator('#libraryAction').fill(name);
      await page.getByRole('button',{name:'Илова ба нақша'}).click();
    }
    await add('textbooks','primary','Намоиши китобҳои нав');
    await add('fiction','all','<strong>Рӯзи хонанда</strong>');
    await page.getByRole('button',{name:'Дидани пешнавис'}).click();
    assert.match(await page.locator('#libraryPlanStatus').textContent(),/Моҳро интихоб/);
    await page.locator('#libraryMonth').fill('2027-02');
    await page.getByRole('button',{name:'Дидани пешнавис'}).click();
    assert.equal(await page.locator('#librarySheetSchool').textContent(),'МТМУ № 1');
    assert.equal(await page.locator('#librarySheetZone').textContent(),'Толори хониш');
    assert.equal(await page.locator('#librarySheetRows tr').count(),2);
    assert.equal(await page.locator('#librarySheetRows strong').count(),0);
    await page.locator('#workspaceSettingsToggle').click();await page.getByRole('button',{name:'Тағйири профил'}).click();
    await page.getByRole('checkbox',{name:'Адабиёти бадеӣ',exact:true}).uncheck();
    await page.locator('#libraryZone').selectOption('main');
    await page.getByRole('button',{name:'Сабти профил'}).click();
    assert.match(await page.locator('#libraryRows').textContent(),/Қисми фонд аз профил бароварда шуд/);
    assert.equal(await page.locator('#librarySheetZone').textContent(),'Толори хониш');
    await homeView(page);await openView(page,'libraryPlanPanel');await page.locator('#libraryRows tr').filter({hasText:'Рӯзи хонанда'}).getByRole('button',{name:'Хориҷ кардан'}).click();
    await page.getByRole('button',{name:'Дидани пешнавис'}).click();
    assert.equal(await page.locator('#librarySheetRows tr').count(),1);
    assert.equal(await page.locator('#librarySheetZone').textContent(),'Китобхонаи асосӣ');
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('#librarySheet').isVisible(),true);
    assert.equal(await page.locator('#libraryPlanHeading').isVisible(),false);
    await page.emulateMedia({media:'screen'});
    await page.reload();
    await page.locator('#librarySummary').waitFor();
    assert.equal(await page.locator('#librarySummaryFunds').textContent(),'Китобҳои дарсӣ');
    assert.equal(await page.locator('#librarySheet').isVisible(),false);
    await page.getByRole('heading',{name:'Профили китобхона'}).waitFor();
    await page.goto(`${base}/cabinets/school/library-head.html?school=demo-b&lang=tg`);
    await page.locator('#libraryZone').waitFor();
    assert.equal(await page.locator('#libraryZone').inputValue(),'');
    await page.locator('#libraryPlanPanel').waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
