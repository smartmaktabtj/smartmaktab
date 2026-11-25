import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from 'playwright';
const base = process.env.SM_BASE_URL ?? 'http://localhost:4173';
const endpoint = 'https://abcdefghijklmnopqrst.supabase.co';

test('Chromium: local demo, fail-closed config and sign-in/read/sign-out with mocked HTTP', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({serviceWorkers:'block'});
    assert.equal((await page.request.get(`${base}/dashboard.html`)).status(),404);
    await page.route('**/dev/supabase-config.json', route => route.fulfill({status:404}));
    await page.goto(`${base}/dev/`);
    await page.locator('#language').selectOption('ru');
    await page.getByText('Supabase не настроен.', {exact:false}).waitFor();
    assert.equal(await page.locator('#login').isVisible(), false);
    await page.unroute('**/dev/supabase-config.json');
    await page.route('**/dev/supabase-config.json', route => route.fulfill({json:{url:endpoint,publishableKey:'sb_publishable_test',approvalExperiment:true}}));
    const calls = [];
    const jwt = 'header.payload.signature';
    await page.route(`${endpoint}/**`, async route => {
      const request = route.request();
      const url = new URL(request.url()); calls.push(url.pathname);
      const reply = (json,status=200) => route.fulfill({status,json,headers:{'access-control-allow-origin':'*'}});
      if (url.pathname === '/auth/v1/token') {
        assert.equal(request.postDataJSON().email,'staff-a@example.test');
        if (request.postDataJSON().password === 'wrong') return reply({message:'Invalid login credentials'},400);
        return reply({access_token:jwt, refresh_token:'synthetic-refresh', expires_in:3600, user:{id:'synthetic-user'}});
      }
      assert.equal(request.headers().authorization,`Bearer ${jwt}`);
      if (url.pathname === '/rest/v1/organizations') return reply([{id:'school-a',name:'Школа A',kind:'school'}]);
      if (url.pathname === '/rest/v1/school_records') {
        assert.equal(url.searchParams.get('organization_id'),'eq.school-a');
        return reply([{id:'row-a',record_type:'plan',title:'<strong>Синтетика</strong>',deleted_at:null}]);
      }
      if (url.pathname === '/auth/v1/logout') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
      throw new Error(`Unexpected route: ${url.pathname}`);
    });
    await page.reload();
    await page.locator('#language').selectOption('ru');
    await page.locator('#email').fill('staff-a@example.test');
    await page.locator('#password').fill('wrong');
    await page.getByRole('button',{name:'Войти'}).click();
    await page.getByText('Не удалось войти.',{exact:false}).waitFor();
    assert.equal(await page.locator('#password').inputValue(),'');
    assert.equal(await page.locator('#workspace').isVisible(),false);
    await page.locator('#password').fill('synthetic-password');
    await page.getByRole('button',{name:'Войти'}).click();
    await page.getByText('<strong>Синтетика</strong>',{exact:false}).waitFor();
    assert.equal(await page.locator('#records strong').count(),0);
    assert.equal(await page.locator('#approvalPanel').isVisible(),false);
    assert.ok(!calls.includes('/rest/v1/school_memberships')); 
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length),0);
    await page.getByRole('button',{name:'Выйти'}).click();
    await page.getByRole('button',{name:'Войти'}).waitFor();
    assert.equal(await page.locator('#records li').count(),0);
    assert.ok(calls.includes('/auth/v1/logout'));
    await page.reload();
    await page.locator('#login').waitFor();
    assert.equal(await page.locator('#workspace').isVisible(),false);
  } finally { await browser.close(); }
});
