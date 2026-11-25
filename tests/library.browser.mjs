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
    await page.goto(`${base}/cabinets/school/library-head.html?school=demo-a&lang=ru`);
    assert.match(page.url(),/library-head\.html\?school=demo-a/);
    await page.locator('#libraryZone').waitFor();
    await page.locator('#libraryPlanPanel').waitFor({state:'hidden'});
    await page.locator('#libraryZone').selectOption('reading');
    await page.getByRole('button',{name:'Сохранить профиль'}).click();
    assert.match(await page.locator('#libraryProfileStatus').textContent(),/хотя бы один раздел/);
    await page.getByRole('checkbox',{name:'Учебники',exact:true}).check();
    await page.getByRole('checkbox',{name:'Художественная литература',exact:true}).check();
    await page.getByRole('button',{name:'Сохранить профиль'}).click();
    assert.deepEqual(await page.locator('#libraryFund option').allTextContents(),['Выберите раздел','Учебники','Художественная литература']);
    async function add(fund,audience,name){
      await page.locator('#libraryFund').selectOption(fund);
      await page.locator('#libraryAudience').selectOption(audience);
      await page.locator('#libraryAction').fill(name);
      await page.getByRole('button',{name:'Добавить в план'}).click();
    }
    await add('textbooks','primary','Выставка новых учебников');
    await add('fiction','all','<strong>Читательский день</strong>');
    await page.getByRole('button',{name:'Показать черновик'}).click();
    assert.match(await page.locator('#libraryPlanStatus').textContent(),/Укажите месяц/);
    await page.locator('#libraryMonth').fill('2027-02');
    await page.getByRole('button',{name:'Показать черновик'}).click();
    assert.equal(await page.locator('#librarySheetSchool').textContent(),'МТМУ № 1');
    assert.equal(await page.locator('#librarySheetZone').textContent(),'Читальный зал');
    assert.equal(await page.locator('#librarySheetRows tr').count(),2);
    assert.equal(await page.locator('#librarySheetRows strong').count(),0);
    await page.locator('#workspaceSettingsToggle').click();await page.getByRole('button',{name:'Изменить профиль'}).click();
    await page.getByRole('checkbox',{name:'Художественная литература',exact:true}).uncheck();
    await page.locator('#libraryZone').selectOption('main');
    await page.getByRole('button',{name:'Сохранить профиль'}).click();
    assert.match(await page.locator('#libraryRows').textContent(),/Раздел удалён из профиля/);
    assert.equal(await page.locator('#librarySheetZone').textContent(),'Читальный зал');
    await homeView(page);await openView(page,'libraryPlanPanel');await page.locator('#libraryRows tr').filter({hasText:'Читательский день'}).getByRole('button',{name:'Убрать'}).click();
    await page.getByRole('button',{name:'Показать черновик'}).click();
    assert.equal(await page.locator('#librarySheetRows tr').count(),1);
    assert.equal(await page.locator('#librarySheetZone').textContent(),'Основная библиотека');
    await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('#librarySheet').isVisible(),true);
    assert.equal(await page.locator('#libraryPlanHeading').isVisible(),false);
    await page.emulateMedia({media:'screen'});
    await page.reload();
    await page.locator('#librarySummary').waitFor();
    assert.equal(await page.locator('#librarySummaryFunds').textContent(),'Учебники');
    assert.equal(await page.locator('#librarySheet').isVisible(),false);
    await page.locator('#cabinetLang').selectOption('tg');
    await page.getByRole('heading',{name:'Профили китобхона'}).waitFor();
    await page.goto(`${base}/cabinets/school/library-head.html?school=demo-b&lang=ru`);
    await page.locator('#libraryZone').waitFor();
    assert.equal(await page.locator('#libraryZone').inputValue(),'');
    await page.locator('#libraryPlanPanel').waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});
