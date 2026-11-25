import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';
import { accountEmail, loadSmokeSettings } from '../scripts/dev-smoke.mjs';

const app = 'http://localhost:4173/dev/';
test('Chromium: Auth and PostgREST on loopback, without HTTP mocks', {timeout:35000}, async () => {
  const {url,key,passwords} = await loadSmokeSettings();
  assert.ok(['localhost','127.0.0.1'].includes(new URL(url).hostname), 'The live browser smoke is loopback-only.');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ serviceWorkers:'block' });
    page.setDefaultTimeout(5000);
    const response = await page.request.get(`${app}supabase-config.json`);
    const actual = await response.json();
    assert.ok(new URL(actual.url).origin === url && actual.publishableKey === key, 'Unexpected served config.');
    // Allow only the static local server and the expected Auth/API endpoint.
    await page.route('**/*', route => {
      const requestURL = new URL(route.request().url());
      return [new URL(app).origin,url].includes(requestURL.origin) ? route.continue() : route.abort();
    });
    await page.goto(app);
    await page.locator('#language').selectOption('ru');
    async function signIn(name) {
      await page.locator('#email').fill(accountEmail(name));
      try { await page.locator('#password').fill(passwords[name]); }
      catch { throw new Error('Could not populate the test password field.'); }
      await page.getByRole('button',{name:'Войти',exact:true}).click();
    }
    async function signOut() {
      await page.getByRole('button',{name:'Выйти'}).click();
      await page.getByRole('button',{name:'Войти',exact:true}).waitFor();
      assert.equal(await page.locator('#records li').count(),0);
    }
    await signIn('authority-a');
    await page.locator('#org option').last().waitFor({state:'attached'});
    const choices = await page.locator('#org option').allTextContents();
    assert.equal(choices.length,3);
    assert.ok(!choices.some(text => text.includes('Мактаб B')));
    await page.locator('#org').selectOption({label:'DEV · Мактаб A · школа'});
    await page.getByText('Синтетический план A',{exact:false}).waitFor();
    assert.equal(await page.locator('#approvalPanel').isVisible(),false);
    await page.locator('#org').selectOption({label:'DEV · Мактаб A2 · школа'});
    await page.getByText('Синтетическое поручение A2',{exact:false}).waitFor();
    assert.equal(await page.getByText('Синтетический план A',{exact:false}).count(),0);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length),0);
    await signOut();
    await signIn('no-membership');
    await page.getByText('Нет доступных учреждений.',{exact:false}).waitFor();
    assert.equal(await page.locator('#org option').count(),0);
    await signOut();
    await page.reload();
    await page.locator('#login').waitFor();
    assert.equal(await page.locator('#workspace').isVisible(),false);
  } finally { await browser.close(); }
});
