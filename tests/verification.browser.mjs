import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { fillStartupProfile } from './onboarding-fixtures.mjs';

function canonicalRegionName(raw) {
  const s = String(raw || '').trim();
  const low = s.toLocaleLowerCase();
  if (low.includes('суғд') || low.includes('сугд') || low.includes('согд')) return 'Суғд';
  if (low.includes('хатлон')) return 'Хатлон';
  if (low.includes('душанбе')) return 'Душанбе';
  if (low.includes('вмкб') || low.includes('бадахшон')) return 'ВМКБ';
  if (low.includes('тобе')) return 'Ноҳияҳои тобеи ҷумҳурӣ';
  return s;
}

const base = process.env.SM_BASE_URL ?? 'http://localhost:4180';
const repoRoot = resolve(new URL('..', import.meta.url).pathname);

function startAdminStaticServer() {
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const server = http.createServer(async (req, res) => {
    const cleanPath = (req.url || '/').split('?')[0];
    if (!/^\/(?:admin|shared)\/[a-zA-Z0-9._-]+$/.test(cleanPath)) {
      res.writeHead(404).end('Not found');
      return;
    }
    try {
      const data = await readFile(resolve(repoRoot, `.${cleanPath}`));
      res.writeHead(200, { 'Content-Type': mime[extname(cleanPath)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise(res => server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    res({ url: `http://127.0.0.1:${addr.port}`, close: () => new Promise(r => server.close(r)) });
  }));
}

test('Verification & Territory browser: empty schools bootstrap, Region->District->Jamoat->Village cascade & cloud registration', async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    let capturedRegisterPayload = null;
    const newSchoolId = '11111111-1111-4111-8111-111111111111';
    const maorifId = '22222222-2222-4222-8222-222222222222';
    const memId = '33333333-3333-4333-8333-333333333333';

    await ctx.route('https://*.supabase.co/**', async route => {
      const req = route.request();
      const url = req.url();
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.includes('/functions/v1/register-user?action=bootstrap')) {
        return json({
          schools: [],
          authorities: [{ id: maorifId, name: 'Маорифи ш. Исфара', authority_tier: 'maorif', region_name: 'Суғд', district_name: 'Исфара' }],
          locations: [{ region_name: 'Суғд', district_name: 'Исфара', jamoat_name: 'Ворух', village_name: 'Ворух' }],
          tariffs: [
            { position_code: 'school-director', base_price_tjs: 50, extra_price_tjs: 20, title_tg: 'Директор', title_ru: 'Директор' },
            { position_code: 'school-five-method-groups', base_price_tjs: 15, extra_price_tjs: 10, title_tg: 'Иттиҳодияи методӣ', title_ru: 'Методобъединение' },
          ],
        });
      }
      if (url.includes('/functions/v1/register-user') && req.method() === 'POST') {
        capturedRegisterPayload = JSON.parse(req.postData() || '{}');
        return json({
          user_id: '44444444-4444-4444-8444-444444444444',
          school: { id: newSchoolId, name: 'МТМУ № 77', region_name: 'Суғд', district_name: 'Исфара', jamoat_name: 'Ворух', village_name: 'Ворух', verification_status: 'pending' },
          session: { access_token: 'tok_dir_77', refresh_token: 'ref_dir_77', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '44444444-4444-4444-8444-444444444444' } },
        });
      }
      if (url.includes('/rpc/get_my_workspace_context')) {
        return json({
          is_super_admin: false,
          profile: { full_name: 'Каримов Бахтиёр', preferred_lang: 'ru', login_name: 'dir77' },
          memberships: [{
            membership_id: memId,
            organization_id: newSchoolId,
            organization_name: 'МТМУ № 77',
            organization_verification_status: 'pending',
            kind: 'school',
            region_name: 'Суғд',
            district_name: 'Исфара',
            jamoat_name: 'Ворух',
            village_name: 'Ворух',
            role: 'director',
            primary_position: 'school-director',
            extra_positions: ['school-five-method-groups'],
            max_extra_positions: 1,
            max_devices: 1,
            account_active: true,
            verification_status: 'unverified',
            subscription_status: 'trial',
            subscription_months: 1,
            subscription_days_left: 30,
          }],
        });
      }
      if (url.includes('/rpc/get_license_status')) {
        return json({
          configured: true,
          organization_id: newSchoolId,
          status: 'trial',
          effective_status: 'trial',
          grace_days: 0,
          access_allowed: true,
          days_left: 30,
          grace_days_left: 0,
          verification_status: 'unverified',
        });
      }
      if (url.includes('/rpc/claim_device_session')) {
        return json({ allowed: true, reason: 'registered', verification_status: 'unverified', primary_position: 'school-director', extra_positions: ['school-five-method-groups'] });
      }
      return json([]);
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${base}/?register=1&lang=ru`);
    await page.locator('#primaryChoices input[value="school-director"]').check();
    await page.locator('#toExtras').click();

    // Step 2 displays free first month & multi-month discount terms (30 days free + up to 15% discount)
    const step2Text = await page.locator('[data-step="2"]').innerText();
    assert.match(step2Text, /30|бесплат|ройгон/i);
    assert.match(step2Text, /15%/);

    await page.locator('#extraChoices input[value="school-five-method-groups"]').check();
    await page.locator('#methodGroupsList input[type="text"]').first().fill('Методобъединение точных наук');
    await page.locator('#methodGroupsList input[type="checkbox"]').first().check();
    await page.locator('#toProfile').click();
    await fillStartupProfile(page, { first: 'Бахтиёр', last: 'Каримов', login: 'dir77', password: 'Password77' });
    await page.locator('#toSchoolStep').click();

    // With empty schools: [], user adds their real school via Region -> District -> Jamoat -> Village cascade
    await page.locator('#toggleNewSchoolBtn').click();
    await page.locator('#newSchoolRegion').selectOption('Суғд');
    await page.locator('#newSchoolDistrictSelect').selectOption('Исфара');
    await page.locator('#newSchoolJamoatSelect option[value="Ворух"]').waitFor({ state: 'attached' });
    await page.locator('#newSchoolJamoatSelect').selectOption('Ворух');
    await page.locator('#newSchoolVillageSelect option[value="Ворух"]').waitFor({ state: 'attached' });
    await page.locator('#newSchoolVillageSelect').selectOption('Ворух');
    await page.locator('#newSchoolName').fill('МТМУ № 77');
    await page.waitForFunction(() => !document.getElementById('begin')?.disabled);
    await page.locator('#begin').click();

    await page.waitForURL(/\/cabinets\/school\/director\.html/);
    assert.ok(capturedRegisterPayload, 'register-user payload was not sent');
    assert.equal(canonicalRegionName(capturedRegisterPayload.new_school?.region_name), 'Суғд');
    assert.equal(capturedRegisterPayload.new_school?.district_name, 'Исфара');
    assert.equal(capturedRegisterPayload.new_school?.jamoat_name, 'Ворух');
    assert.equal(capturedRegisterPayload.new_school?.village_name, 'Ворух');
    assert.equal(capturedRegisterPayload.new_school?.parent_id, maorifId);
    assert.equal(capturedRegisterPayload.new_school?.name, 'МТМУ № 77');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Verification & Territory browser: verification form submission, primary-only Pay button, and discount calculation', async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const orgId = '11111111-1111-4111-8111-111111111111';
    const memId = '33333333-3333-4333-8333-333333333333';
    let submittedVerifPayload = null;
    let verifStatus = 'unverified';

    await ctx.route('https://*.supabase.co/**', async route => {
      const req = route.request();
      const url = req.url();
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.includes('/rest/v1/role_tariffs')) {
        return json([
          { position_code: 'school-director', group_code: 'school', access_role: 'director', title_tg: 'Директор', title_ru: 'Директор', base_price_tjs: 50, extra_price_tjs: 20, duration_days: 30, default_max_devices: 1, can_receive_login: true, is_active: true },
          { position_code: 'school-five-method-groups', group_code: 'school', access_role: 'teacher', title_tg: 'Иттиҳодияи методӣ', title_ru: 'Методобъединение', base_price_tjs: 15, extra_price_tjs: 10, duration_days: 30, default_max_devices: 1, can_receive_login: true, is_active: true },
        ]);
      }
      if (url.includes('/rest/v1/subscription_plans')) {
        return json([{ code: 'trial_10', title_tg: 'Обуна', title_ru: 'Подписка', price_tjs: 10, duration_days: 30, recipient_phone: '+992 907972295', recipient_account: '992907972295', is_active: true }]);
      }
      if (url.includes('/rpc/submit_account_verification')) {
        submittedVerifPayload = JSON.parse(req.postData() || '{}');
        verifStatus = 'pending';
        return json({ request_id: '99999999-9999-4999-8999-999999999999', membership_id: memId, verification_status: 'pending' });
      }
      if (url.includes('/rpc/get_my_workspace_context')) {
        return json({
          is_super_admin: false,
          profile: { full_name: 'Каримов Бахтиёр', preferred_lang: 'ru', login_name: 'dir77' },
          memberships: [{
            membership_id: memId,
            organization_id: orgId,
            organization_name: 'МТМУ № 77',
            organization_verification_status: 'pending',
            kind: 'school',
            role: 'director',
            primary_position: 'school-director',
            extra_positions: ['school-five-method-groups'],
            max_extra_positions: 1,
            max_devices: 1,
            account_active: true,
            verification_status: verifStatus,
            subscription_status: 'trial',
            subscription_months: 1,
            subscription_days_left: 30,
          }],
        });
      }
      if (url.includes('/rpc/get_license_status')) {
        const nowMs = Date.now();
        const expIso = new Date(nowMs + 30 * 86_400_000).toISOString();
        return json({
          configured: true,
          organization_id: orgId,
          status: 'trial',
          effective_status: 'trial',
          plan_code: 'personal_1m',
          starts_at: new Date(nowMs - 86_400_000).toISOString(),
          expires_at: expIso,
          grace_days: 0,
          grace_until: expIso,
          offline_token_version: 1,
          access_allowed: true,
          days_left: 30,
          grace_days_left: 0,
          subscription_months: 1,
          verification_status: verifStatus,
          server_now: new Date(nowMs).toISOString(),
        });
      }
      if (url.includes('/rpc/claim_device_session')) {
        return json({ allowed: true, reason: 'existing_device', verification_status: verifStatus, primary_position: 'school-director', extra_positions: ['school-five-method-groups'] });
      }
      return json([]);
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // Pre-seed cloud session, local workspace & profile in localStorage before opening primary cabinet (Director)
    await page.goto(`${base}/cabinets/school/director.html?school=${orgId}&lang=ru`);
    await page.evaluate(({ orgId }) => {
      localStorage.setItem('smartmaktab.cloud.session.v1', JSON.stringify({
        access_token: 'mock_dir_jwt',
        refresh_token: 'mock_dir_ref',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: '44444444-4444-4444-8444-444444444444' },
      }));
      localStorage.setItem('smartmaktab.cloud.last_org.v1', orgId);
      localStorage.setItem('smartmaktab.demo.workspace.v1', JSON.stringify({
        primary: 'school-director',
        schools: {
          'school-director': orgId,
          'school-five-method-groups': orgId,
        },
        roles: [
          { id: 'school-director', path: 'cabinets/school/director.html', title: 'Директор' },
          { id: 'school-five-method-groups', path: 'cabinets/school/five-method-groups.html', title: 'Методобъединение' },
        ],
      }));
      localStorage.setItem('smartmaktab.profile.v1', JSON.stringify({
        organizationId: orgId,
        organizationName: 'МТМУ № 77',
        primaryPosition: 'school-director',
        verificationStatus: 'unverified',
        primary: 'school-director',
        extras: ['school-five-method-groups'],
        roles: [
          { id: 'school-director', path: 'cabinets/school/director.html', title: 'Директор' },
          { id: 'school-five-method-groups', path: 'cabinets/school/five-method-groups.html', title: 'Методобъединение' },
        ],
        person: { first: 'Бахтиёр', last: 'Каримов' },
        lang: 'ru',
      }));
    }, { orgId });
    await page.reload();

    // Unverified banner & Verify button are visible right on the cabinet home screen; clicking opens Verification form
    await page.locator('#accountVerificationBanner .sm-verif-banner button').waitFor();
    await page.locator('#accountVerificationBanner .sm-verif-banner button').click();
    await page.locator('#smAccountVerifyForm:not([hidden])').waitFor();

    await page.locator('#smAccVerifFullName').fill('Каримов Бахтиёр');
    await page.locator('#smAccVerifBirthDate').fill('15.05.1980');
    await page.locator('#smAccVerifPhone').fill('+992 92 000 11 22');
    await page.locator('#smAccVerifPassport').fill('A7654321');
    await page.locator('#smAccVerifSubmitBtn').click();

    await page.waitForFunction(() => {
      const txt = document.getElementById('accountVerificationBanner')?.textContent || '';
      return /проверк|баррас/i.test(txt);
    });
    assert.equal(submittedVerifPayload?.p_org_id, orgId);
    assert.equal(submittedVerifPayload?.p_birth_date, '15.05.1980');
    assert.equal(submittedVerifPayload?.p_passport_number, 'A7654321');

    // Primary cabinet SHOWS payment form & recalculates 12-month 15% discount (50 * 12 * 0.85 = 510 TJS)
    assert.equal(await page.locator('#cloudReceiptForm').isHidden(), false);
    assert.equal(await page.locator('#cloudPayPrimaryOnlyNotice').isHidden(), true);
    await page.locator('#cloudSubscriptionMonths').selectOption('12');
    const amount12m = await page.locator('#cloudReceiptForm input[type="number"]').inputValue();
    assert.equal(Number(amount12m), 510);

    // Extra position cabinet (five-method-groups) HIDES payment form & shows primary-only notice!
    await page.goto(`${base}/cabinets/school/five-method-groups.html?school=${orgId}&lang=ru`);
    await page.locator('#workspaceSettingsToggle').click();
    await page.locator('[data-cloud-panel-trigger]').click();
    await page.locator('#cloudPayPrimaryOnlyNotice:not([hidden])').waitFor();
    assert.equal(await page.locator('#cloudReceiptForm').isHidden(), true);
    assert.match(await page.locator('#cloudPayPrimaryOnlyNotice').innerText(), /основной должности|асос/i);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Verification & Territory browser: Admin Verifications tab approves/rejects using p_membership_id + verified/rejected', async () => {
  const browser = await chromium.launch();
  const adminSrv = await startAdminStaticServer();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const reqMemId = '33333333-3333-4333-8333-333333333333';
    const orgId = '11111111-1111-4111-8111-111111111111';
    const reviewCalls = [];

    await ctx.route('https://*.supabase.co/**', async route => {
      const req = route.request();
      const url = req.url();
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.includes('/rpc/get_my_workspace_context')) return json({ is_super_admin: true, user_id: 'admin-1', memberships: [] });
      if (url.includes('/auth/v1/token')) return json({ access_token: 'mock_jwt', refresh_token: 'mock_ref', expires_at: Math.floor(Date.now() / 1000) + 3600 });
      if (url.includes('/rpc/get_pending_account_verifications')) {
        return json(reviewCalls.length ? [] : [{
          request_id: '99999999-9999-4999-8999-999999999999',
          membership_id: reqMemId,
          organization_id: orgId,
          organization_name: 'МТМУ № 77',
          district_name: 'Исфара',
          jamoat_name: 'Ворух',
          village_name: 'Ворух',
          primary_position: 'school-director',
          full_name: 'Каримов Бахтиёр',
          birth_date: '15.05.1980',
          phone: '+992920001122',
          passport_number: 'A7654321',
        }]);
      }
      if (url.includes('/rpc/review_account_verification')) {
        reviewCalls.push(JSON.parse(req.postData() || '{}'));
        return json({ membership_id: reqMemId, verification_status: 'verified', request_deleted: true });
      }
      if (url.includes('/functions/v1/admin-users')) return json({ users: [] });
      return json([]);
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${adminSrv.url}/admin/index.html#access_token=mock_jwt&refresh_token=mock_ref`);
    await page.locator('#admWorkspace:not([hidden])').waitFor();
    await page.locator('[data-tab="verifications"]').click();
    await page.locator('#verificationsTbody tr button').first().waitFor();
    assert.match(await page.locator('#verificationsTbody').innerText(), /Каримов Бахтиёр/);

    // Click approve button
    await page.locator('#verificationsTbody tr button').first().click();
    await page.waitForFunction(() => (document.getElementById('admStatus')?.textContent || '').length > 0);
    assert.equal(reviewCalls.length, 1);
    assert.equal(reviewCalls[0].p_membership_id, reqMemId);
    assert.equal(reviewCalls[0].p_decision, 'verified');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await adminSrv.close();
  }
});

test('Step 4 bootstrap falls back/uses Data API RPC when Edge Function bootstrap fails and omits demo schools for cloud login', async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const newSchoolId = '55555555-5555-4555-8555-555555555555';
    const maorifId = '22222222-2222-4222-8222-222222222222';
    const memId = '66666666-6666-4666-8666-666666666666';
    let capturedPayload = null;

    await ctx.route('https://*.supabase.co/**', async route => {
      const req = route.request();
      const url = req.url();
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.includes('/rest/v1/rpc/get_registration_bootstrap')) {
        return json({
          schools: [],
          authorities: [{ id: maorifId, name: 'Маорифи ш. Исфара', authority_tier: 'maorif', region_name: 'Суғд', district_name: 'Исфара' }],
          locations: [{ region_name: 'Суғд', district_name: 'Исфара', jamoat_name: 'Ворух', village_name: 'Ворух' }],
          tariffs: [{ position_code: 'school-director', base_price_tjs: 50, extra_price_tjs: 20, title_tg: 'Директор', title_ru: 'Директор' }],
          aliya_price_tjs: 30,
        });
      }
      if (url.includes('/functions/v1/register-user?action=bootstrap')) {
        return json({ error: 'edge_unavailable' }, 500);
      }
      if (url.includes('/functions/v1/register-user') && req.method() === 'POST') {
        capturedPayload = JSON.parse(req.postData() || '{}');
        return json({
          user_id: '77777777-7777-4777-8777-777777777777',
          school: { id: newSchoolId, name: 'МТМУ № 81', region_name: 'Суғд', district_name: 'Исфара', jamoat_name: 'Ворух', village_name: 'Ворух', verification_status: 'pending' },
          session: { access_token: 'tok_dir_81', refresh_token: 'ref_dir_81', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '77777777-7777-4777-8777-777777777777' } },
        });
      }
      if (url.includes('/rpc/get_my_workspace_context')) {
        return json({
          is_super_admin: false,
          profile: { full_name: 'Раҳимов Алишер', preferred_lang: 'tg', login_name: 'dir81' },
          memberships: [{
            membership_id: memId,
            organization_id: newSchoolId,
            organization_name: 'МТМУ № 81',
            organization_verification_status: 'pending',
            kind: 'school',
            region_name: 'Суғд',
            district_name: 'Исфара',
            role: 'director',
            primary_position: 'school-director',
            extra_positions: [],
            max_devices: 1,
            account_active: true,
            verification_status: 'unverified',
            subscription_status: 'trial',
            subscription_months: 1,
            subscription_days_left: 30,
          }],
        });
      }
      if (url.includes('/rpc/get_license_status')) {
        return json({
          configured: true,
          organization_id: newSchoolId,
          status: 'trial',
          effective_status: 'trial',
          grace_days: 0,
          access_allowed: true,
          days_left: 30,
          grace_days_left: 0,
          verification_status: 'unverified',
        });
      }
      if (url.includes('/rpc/claim_device_session')) {
        return json({ allowed: true, reason: 'registered', verification_status: 'unverified', primary_position: 'school-director', extra_positions: [] });
      }
      return json([]);
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(`${base}/?register=1&lang=tg`);
    await page.locator('#primaryChoices input[value="school-director"]').check();
    await page.locator('#toExtras').click();
    await page.locator('#toProfile').click();
    await fillStartupProfile(page, { first: 'Алишер', last: 'Раҳимов', login: 'dir81', password: 'Password81' });
    await page.locator('#toSchoolStep').click();

    // Even with Edge Function bootstrap failing (500), RPC bootstrap loaded cleanly: no demo schools (МТМУ № 45), retry hidden
    const optionTexts = await page.locator('#schoolChoice option').allInnerTexts();
    assert.ok(!optionTexts.some(t => t.includes('МТМУ № 45')), 'Demo school МТМУ № 45 must not appear for cloud signup');
    assert.equal(await page.locator('#retryBootstrapBtn').isHidden(), true);

    await page.locator('#toggleNewSchoolBtn').click();
    await page.locator('#newSchoolRegion').selectOption('Суғд');
    await page.locator('#newSchoolDistrictSelect').selectOption('Исфара');
    await page.locator('#newSchoolJamoatSelect option[value="Ворух"]').waitFor({ state: 'attached' });
    await page.locator('#newSchoolJamoatSelect').selectOption('Ворух');
    await page.locator('#newSchoolVillageSelect option[value="Ворух"]').waitFor({ state: 'attached' });
    await page.locator('#newSchoolVillageSelect').selectOption('Ворух');
    await page.locator('#newSchoolName').fill('МТМУ № 81');
    await page.waitForFunction(() => !document.getElementById('begin')?.disabled);
    await page.locator('#begin').click();

    await page.waitForURL(/\/cabinets\/school\/director\.html/);
    assert.equal(capturedPayload?.new_school?.parent_id, maorifId);
    assert.equal(capturedPayload?.new_school?.name, 'МТМУ № 81');
  } finally {
    await browser.close();
  }
});
