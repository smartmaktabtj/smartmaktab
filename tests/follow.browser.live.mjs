import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {accountEmail,loadSmokeSettings} from '../scripts/dev-smoke.mjs';
const app='http://localhost:4173/dev/';

test('Chromium with isolated sessions: read-only follow across approval, reconnect and sign-out', {timeout:55000},async()=>{
  assert.equal(process.env.SM_APPROVAL_EXPERIMENT,'1','Run only in the separate local synthetic sandbox.');
  const {url,key,passwords}=await loadSmokeSettings(process.env,['director-a']);
  assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Loopback only.');
  const browser=await chromium.launch();
  try {
    const sc=await browser.newContext({serviceWorkers:'block'});
    const dc=await browser.newContext({serviceWorkers:'block'});
    const staff=await sc.newPage(); const director=await dc.newPage();
    const config=await (await staff.request.get(`${app}supabase-config.json`)).json();
    assert.ok(new URL(config.url).origin===url && config.publishableKey===key && config.approvalExperiment===true
      && config.approvalFollow===true && config.approvalOutbox===true,'Expected the locally opted-in follow/outbox config.');
    const reads={staff:0,director:0}; const mutations={staff:0,director:0};
    for(const [name,page] of [['staff',staff],['director',director]]) {
      page.setDefaultTimeout(12500);
      await page.route('**/*',route=>{
        const dest=new URL(route.request().url());
        if (![new URL(app).origin,url].includes(dest.origin)) return route.abort();
        if(dest.pathname==='/rest/v1/plan_creation_requests') reads[name]++;
        if(dest.pathname.startsWith('/rest/v1/rpc/')) mutations[name]++;
        return route.continue();
      });
    }
    async function signIn(page,name) {
      await page.goto(app);
      await page.locator('#language').selectOption('ru');
      await page.locator('#email').fill(accountEmail(name));
      try { await page.locator('#password').fill(passwords[name]); } catch { throw new Error('Could not populate test password.'); }
      await page.getByRole('button',{name:'Войти',exact:true}).click();
      await page.getByText('Автообновление с сервера:',{exact:false}).waitFor();
    }
    async function signOut(page) {
      await page.getByRole('button',{name:'Выйти',exact:true}).click();
      await page.getByRole('button',{name:'Войти',exact:true}).waitFor();
      assert.equal(await page.locator('#approvalQueue li').count(),0);
    }
    await Promise.all([signIn(staff,'staff-a'),signIn(director,'director-a')]);
    await director.getByText('Директор · заявки этой школы',{exact:true}).waitFor();
    const title=`DEV foreground follow ${crypto.randomUUID()}`;
    const local=`DEV remain local ${crypto.randomUUID()}`;
    const staffRow=staff.locator('#approvalQueue li').filter({hasText:title});
    const directorRow=director.locator('#approvalQueue li').filter({hasText:title});
    await staff.getByLabel('Название нового плана').fill(title);
    await staff.getByRole('button',{name:'Подать заявку',exact:true}).click();
    await staffRow.getByText('Ожидает решения',{exact:true}).waitFor();
    // The director receives the request without a reload or pressing Refresh.
    await directorRow.getByText('Ожидает решения',{exact:true}).waitFor();
    const beforeOffline = reads.staff;
    await sc.setOffline(true);
    await staff.getByText('Автообновление на паузе:',{exact:false}).waitFor();
    await staff.getByLabel('Название нового плана').fill(local);
    await staff.getByRole('button',{name:'Сохранить в очередь',exact:true}).click();
    await staff.getByText('Сохранено на этом устройстве.',{exact:false}).waitFor();
    await directorRow.getByRole('button',{name:'Утвердить',exact:true}).click();
    await directorRow.getByText('Утверждена',{exact:true}).waitFor();
    assert.equal(await staff.locator('#records').getByText(title,{exact:false}).count(),0);
    assert.equal(reads.staff,beforeOffline);
    await sc.setOffline(false);
    await staffRow.getByText('Утверждена',{exact:true}).waitFor();
    await staff.locator('#records').getByText(title,{exact:false}).waitFor();
    assert.equal(await staff.locator('#approvalTitle').inputValue(),local);
    assert.deepEqual(mutations,{staff:1,director:1});
    await staff.getByRole('button',{name:'Удалить неотправленную',exact:true}).click();
    await staff.getByText('Неотправленная заявка удалена с устройства.',{exact:true}).waitFor();
    await Promise.all([signOut(staff),signOut(director)]);
    const stopped={...reads};
    await new Promise(resolve=>setTimeout(resolve,5200));
    assert.deepEqual(reads,stopped);
    assert.deepEqual(mutations,{staff:1,director:1});
  } finally { await browser.close(); }
});
