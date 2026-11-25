import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {accountEmail,loadSmokeSettings} from '../scripts/dev-smoke.mjs';
const app='http://localhost:4173/dev/';

test('Chromium: IndexedDB keep/replay, real offline staging and a lost response after commit',{timeout:55000},async()=>{
  assert.equal(process.env.SM_APPROVAL_EXPERIMENT,'1','Outbox test requires a disposable local instance.');
  const {url,key,passwords}=await loadSmokeSettings();
  assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname),'Loopback only.');
  const browser=await chromium.launch();
  try {
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    page.setDefaultTimeout(5500);
    const config=await (await page.request.get(`${app}supabase-config.json`)).json();
    assert.ok(new URL(config.url).origin===url && config.publishableKey===key && config.approvalExperiment===true && config.approvalOutbox===true,
      'Expected local approval + outbox configuration.');
    const calls=[];
    const upstreamStatuses=[];
    await page.route('**/*',async route=>{
      const req=route.request(), dest=new URL(req.url());
      if (![new URL(app).origin,url].includes(dest.origin)) return route.abort();
      if (req.method()!=='POST' || dest.pathname!=='/rest/v1/rpc/submit_plan_creation') return route.continue();
      calls.push(req.postDataJSON());
      if (calls.length!==1) return route.continue();
      try { upstreamStatuses.push((await route.fetch({maxRedirects:0,timeout:5000})).status()); }
      catch { upstreamStatuses.push(0); }
      await route.abort('connectionreset');
    });
    const panel=page.locator('#approvalPanel');
    const queue=page.locator('#approvalQueue');
    const input=page.locator('#approvalTitle');
    const byButton=(name)=>page.getByRole('button',{name,exact:true});
    async function login(actor) {
      await page.locator('#language').selectOption('ru');
      await page.locator('#email').fill(accountEmail(actor));
      try { await page.locator('#password').fill(passwords[actor]); } catch { throw new Error('Could not populate test password.'); }
      await byButton('Войти').click();
      await input.waitFor();
    }
    async function logout() {
      await byButton('Выйти').click();
      await byButton('Войти').waitFor();
      assert.equal(await input.inputValue(),'');
      assert.equal(await panel.isVisible(),false);
    }
    await page.goto(app);
    await login('staff-a');
    const title=`DEV durable ${crypto.randomUUID()}`;
    await context.setOffline(true);
    await panel.getByText('Нет сети.',{exact:false}).waitFor();
    assert.ok(await byButton('Подать заявку').isDisabled());
    await input.fill(title);
    await byButton('Сохранить в очередь').click();
    await panel.getByText('Сохранено на этом устройстве.',{exact:false}).waitFor();
    assert.ok(await byButton('Отправить из очереди').isDisabled());
    assert.equal(calls.length,0);
    await context.setOffline(false);
    assert.equal(calls.length,0);
    await logout();
    await page.reload();
    await login('deputy-a'); // Same school, different account: no access to the queued draft.
    assert.equal(await input.inputValue(),'');
    assert.equal(await byButton('Отправить из очереди').count(),0);
    await logout();
    await login('staff-a');
    await byButton('Отправить из очереди').waitFor();
    assert.equal(await input.inputValue(),title);
    assert.equal(calls.length,0);
    assert.equal(await queue.getByText(title,{exact:true}).count(),0);
    await byButton('Отправить из очереди').click();
    await panel.getByText('Ответ не подтверждён.',{exact:false}).waitFor();
    assert.equal(await byButton('Удалить неотправленную').isVisible(),false);
    assert.deepEqual(upstreamStatuses,[200]);
    await page.reload();
    await login('staff-a');
    await byButton('Повторить отправку').waitFor();
    assert.equal(await input.inputValue(),title);
    await queue.getByText(title,{exact:true}).waitFor();
    await byButton('Повторить отправку').click();
    await panel.getByText('Заявка зарегистрирована.',{exact:false}).waitFor();
    assert.equal(await queue.getByText(title,{exact:true}).count(),1);
    assert.equal(calls.length,2);
    assert.deepEqual(calls[0],calls[1]);
    await page.reload();
    await login('staff-a');
    assert.equal(await byButton('Повторить отправку').count(),0);
    assert.equal(await input.inputValue(),'');
    await input.fill(`DEV discard ${crypto.randomUUID()}`);
    await byButton('Сохранить в очередь').click();
    await byButton('Удалить неотправленную').click();
    await panel.getByText('Неотправленная заявка удалена с устройства.',{exact:true}).waitFor();
    assert.equal(await input.inputValue(),'');
    assert.equal(calls.length,2);
    assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
    const testStorage = await page.evaluate(async()=>{
      const {createApprovalOutbox}=await import('/dev/approval-outbox.mjs');
      const api=createApprovalOutbox('http://127.0.0.1:1');
      const otherApi=createApprovalOutbox('http://127.0.0.1:2');
      const id=crypto.randomUUID(), rival=crypto.randomUUID();
      const [one,two]=await Promise.all([
        api.stage('synthetic-user','school-A',{id,title:'test one'}),
        api.stage('synthetic-user','school-A',{id:rival,title:'test two'})
      ]);
      const unique=one.id===two.id;
      const [wrongSchool,wrongUser,wrongOrigin]=await Promise.all([
        api.read('synthetic-user','school-B'),api.read('other-user','school-A'),otherApi.read('synthetic-user','school-A')
      ]);
      const wrongKey=await api.begin('synthetic-user','school-A',crypto.randomUUID());
      const attempted=await api.begin('synthetic-user','school-A',one.id);
      const stillPending=!(await api.remove('synthetic-user','school-A',one.id,{unattemptedOnly:true}));
      await api.remove('synthetic-user','school-A',one.id);
      return {unique,wrongSchool,wrongUser,wrongOrigin,wrongKey,attempted:attempted.attempted,stillPending,keys:Object.keys(attempted).sort()};
    });
    assert.deepEqual(testStorage,{unique:true,wrongSchool:null,wrongUser:null,wrongOrigin:null,wrongKey:null,attempted:true,stillPending:true,
      keys:['attempted','id','slot','title']});
    await logout();
    const blocked = await context.newPage();
    blocked.setDefaultTimeout(5500);
    let blockedCalls=0;
    await blocked.addInitScript(()=>Object.defineProperty(window,'indexedDB',{get(){throw new Error('storage blocked');}}));
    await blocked.route('**/rpc/submit_plan_creation',route=>{ blockedCalls++; return route.abort(); });
    await blocked.goto(app);
    await blocked.locator('#language').selectOption('ru');
    await blocked.locator('#email').fill(accountEmail('staff-a'));
    try { await blocked.locator('#password').fill(passwords['staff-a']); } catch { throw new Error('Could not populate test password.'); }
    await blocked.getByRole('button',{name:'Войти',exact:true}).click();
    await blocked.getByText('До восстановления хранилища отправка отключена.',{exact:false}).waitFor();
    assert.ok(await blocked.getByRole('button',{name:'Подать заявку',exact:true}).isDisabled());
    assert.ok(await blocked.getByRole('button',{name:'Сохранить в очередь',exact:true}).isDisabled());
    assert.equal(blockedCalls,0);
    await blocked.close();
  } finally {await browser.close();}
});
