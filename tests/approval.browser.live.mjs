import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { accountEmail, loadSmokeSettings } from '../scripts/dev-smoke.mjs';
const app = 'http://localhost:4173/dev/';

test('Chromium: local approvals, lost responses after commit, repeat safely and isolate schools', {timeout:45000}, async () => {
  assert.equal(process.env.SM_APPROVAL_EXPERIMENT,'1','This test writes synthetic approvals on an isolated local stack.');
  const {url,key,passwords}=await loadSmokeSettings(process.env,['director-a']);
  assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Loopback only.');
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage({serviceWorkers:'block'});
    page.setDefaultTimeout(5000);
    const config=await (await page.request.get(`${app}supabase-config.json`)).json();
    assert.ok(new URL(config.url).origin===url && config.publishableKey===key && config.approvalExperiment===true,
      'Expected explicitly opted-in local configuration.');
    const payloads={submit_plan_creation:[], decide_plan_creation:[]};
    const failures=[];
    await page.route('**/*',async route=>{
      const req=route.request();const target=new URL(req.url());
      if (![new URL(app).origin,url].includes(target.origin)) return route.abort();
      const rpc=target.pathname.split('/').at(-1);
      if (req.method()!=='POST' || !Object.hasOwn(payloads,rpc)) return route.continue();
      const args=req.postDataJSON();payloads[rpc].push(args);
      if (payloads[rpc].length!==1) return route.continue();
      // The first request reaches the real PostgREST and commits. Only the response is lost.
      try {
        const upstream=await route.fetch({maxRedirects:0,timeout:5000});
        if (upstream.status()!==200) failures.push(rpc);
      } catch { failures.push(rpc); }
      await route.abort('connectionreset');
    });
    await page.goto(app);
    await page.locator('#language').selectOption('ru');
    const panel=page.locator('#approvalPanel');
    const queue=page.locator('#approvalQueue');
    const records=page.locator('#records');
    async function login(actor) {
      await page.locator('#email').fill(accountEmail(actor));
      try { await page.locator('#password').fill(passwords[actor]); } catch { throw new Error('Could not populate test password.'); }
      await page.getByRole('button',{name:'Войти',exact:true}).click();
      await page.locator('#workspace').waitFor();
    }
    async function logout() {
      await page.getByRole('button',{name:'Выйти',exact:true}).click();
      await page.getByRole('button',{name:'Войти',exact:true}).waitFor();
      assert.equal(await panel.isVisible(),false);
      assert.equal(await queue.locator('li').count(),0);
      assert.equal(await page.locator('#approvalTitle').inputValue(),'');
    }
    const id=crypto.randomUUID();
    const approved=`DEV <strong>browser plan</strong> ${id}`;
    const rejected=`DEV reject ${id}`;
    await login('staff-a');
    await panel.getByText('Мои заявки',{exact:false}).waitFor();
    await page.getByLabel('Название нового плана').fill(approved);
    await page.getByRole('button',{name:'Подать заявку',exact:true}).click();
    await panel.getByText('Ответ не подтверждён.',{exact:false}).waitFor();
    assert.ok(await page.locator('#approvalTitle').evaluate(el=>el.readOnly));
    await page.getByRole('button',{name:'Повторить отправку',exact:true}).click();
    const pending=queue.getByRole('listitem').filter({hasText:approved});
    await pending.getByText('Ожидает решения',{exact:true}).waitFor();
    assert.equal(await pending.count(),1);
    assert.equal(await pending.locator('strong strong').count(),0);
    assert.deepEqual(payloads.submit_plan_creation[0],payloads.submit_plan_creation[1]);
    assert.equal(await records.getByText(approved,{exact:false}).count(),0);
    await page.getByLabel('Название нового плана').fill(rejected);
    await page.getByRole('button',{name:'Подать заявку',exact:true}).click();
    await queue.getByText(rejected,{exact:true}).waitFor();
    await logout();

    await login('director-b');
    await panel.getByText('Директор · заявки этой школы',{exact:true}).waitFor();
    assert.equal(await queue.getByText(approved,{exact:true}).count(),0);
    await logout();

    await login('director-a');
    await pending.getByRole('button',{name:'Утвердить',exact:true}).click();
    await panel.getByText('Ответ не подтверждён.',{exact:false}).waitFor();
    // Even after reload shows a committed decision, the original retry stays possible.
    await page.getByRole('button',{name:'Обновить заявки',exact:true}).click();
    await pending.getByText('Утверждена',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Повторить утверждение',exact:true}).click();
    await records.getByText(approved,{exact:false}).waitFor();
    assert.equal(await records.getByText(approved,{exact:false}).count(),1);
    assert.deepEqual(payloads.decide_plan_creation[0],payloads.decide_plan_creation[1]);
    const toReject=queue.getByRole('listitem').filter({hasText:rejected});
    await toReject.getByRole('button',{name:'Отклонить',exact:true}).click();
    await toReject.getByText('Отклонена',{exact:true}).waitFor();
    assert.equal(await records.getByText(rejected,{exact:false}).count(),0);
    await page.locator('#language').selectOption('tg');
    await panel.getByRole('heading',{name:'Тасдиқи таъсиси нақша'}).waitFor();
    await toReject.getByText('Рад шуд',{exact:true}).waitFor();
    await page.locator('#language').selectOption('ru');
    assert.equal(await page.evaluate(()=>sessionStorage.length+localStorage.length),0);
    assert.deepEqual(failures,[]);
    await logout();
    await login('authority-a');
    await page.locator('#org option').last().waitFor({state:'attached'});
    await page.locator('#org').selectOption({label:'DEV · Мактаб A · школа'});
    await records.getByText(approved,{exact:false}).waitFor();
    await panel.waitFor({state:'hidden'});
    assert.equal(await queue.locator('li').count(),0);
    await logout();
  } finally { await browser.close(); }
});
