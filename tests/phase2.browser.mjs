import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { fillStartupProfile, homeView, openView } from './onboarding-fixtures.mjs';
import { buildSimpleDocxBytes } from '../shared/spreadsheet-import.mjs';

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

test('Phase 2 browser: Step 4 new school self-registration, teacher zero-scroll, .docx import & workload', async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.route('https://*.supabase.co/**', route => route.abort());
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${base}/?register=1`);
    await page.locator('#primaryChoices input[value="school-teacher"]').check();
    await page.locator('#toExtras').click();
    await page.locator('#toProfile').click();
    await fillStartupProfile(page, { first: 'Нигина', last: 'Маҳмудова', teacherClass: '5А' });
    await page.locator('#toSchoolStep').click();

    await page.locator('#toggleNewSchoolBtn').click();
    await page.locator('#newSchoolRegion').selectOption('Вилояти Суғд');
    await page.locator('#newSchoolDistrict').fill('Хуҷанд');
    await page.locator('#newSchoolName').fill('МТМУ № 99');
    await page.waitForFunction(() => !document.getElementById('begin')?.disabled);
    await page.locator('#begin').click();

    await page.waitForURL(/\/cabinets\/school\/teacher\.html/);
    await page.locator('#smMainModules').waitFor();
    assert.match(await page.locator('#workspaceSchool').innerText(), /МТМУ № 99/);

    // Verify 1280x720 teacher home has zero vertical overflow
    const dims = await page.locator('#cabinetHome').evaluate(e => [e.scrollHeight, e.clientHeight, document.scrollingElement.scrollHeight, innerHeight]);
    assert.ok(dims[0] <= dims[1] + 1, `teacher #cabinetHome overflows 1280x720: ${dims}`);
    assert.equal(dims[2], dims[3]);

    // Open Student Registry via main module card and upload a real .docx
    await page.locator('#smMainModules [data-open-phase2="smStudentsPanel"]').click();
    await page.locator('#smStuFile').waitFor();
    const docxBytes = buildSimpleDocxBytes('5А', ['№', 'ФИО', 'Класс', 'Пол'], [
      ['1', 'Алиев Беҳрӯз', '5А', 'М'],
      ['2', 'Саидова Мадина', '5А', 'Ж'],
    ]);
    await page.locator('#smStuFile').setInputFiles({
      name: '5a.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from(docxBytes),
    });
    await page.waitForFunction(() => (document.getElementById('smStuStatus')?.textContent || '').includes('2'));
    assert.match(await page.locator('#smStudentsPanel').innerText(), /Алиев Беҳрӯз/);
    assert.match(await page.locator('#smStudentsPanel').innerText(), /Саидова Мадина/);

    // Return home & open Teacher Workload panel -> save 27h Higher category
    await homeView(page);
    await page.locator('#smMainModules [data-open-phase2="smTeacherWorkloadPanel"]').click();
    await page.locator('#smWkName').waitFor();
    await page.locator('#smWkName').fill('Нигина Маҳмудова');
    await page.locator('#smWkCat').selectOption('higher');
    await page.locator('#smWkHours').fill('27');
    await page.locator('#smWkSaveBtn').click();
    await page.waitForFunction(() => (document.getElementById('smTeacherWorkloadPanel')?.textContent || '').includes('1.50'));
    assert.match(await page.locator('#smTeacherWorkloadPanel').innerText(), /Нигина Маҳмудова/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Phase 2 browser: Accountant tariffs & Tajik holiday calendar exclusions', async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.route('https://*.supabase.co/**', route => route.abort());
    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${base}/cabinets/school/accountant.html?school=demo-88&lang=tg`);
    await homeView(page);

    // Add teacher workload first directly from main modules
    await page.locator('[data-open-phase2="smTeacherWorkloadPanel"]').click();
    await page.locator('#smWkName').waitFor();
    await page.locator('#smWkName').fill('Раҳимов Далер');
    await page.locator('#smWkCat').selectOption('higher');
    await page.locator('#smWkHours').fill('18');
    await page.locator('#smWkSaveBtn').click();
    await page.waitForFunction(() => (document.getElementById('smTeacherWorkloadPanel')?.textContent || '').includes('Раҳимов Далер'));

    // Return home -> Open Payroll & switch to March 2026 + Tajik official holidays (8 March + Navruz)
    await homeView(page);
    await page.locator('#smMainModules [data-open-phase2="smPayrollPanel"]').click();
    await page.locator('#smPayMonth').waitFor();
    await page.locator('#smPayMonth').fill('2026-03');
    await page.locator('#smPayMonth').dispatchEvent('change');
    const beforePay = await page.locator('#smPayrollPanel').innerText();
    await page.locator('#smPayPresetHolidays').click();
    await page.waitForFunction(() => (document.getElementById('smPayStatus')?.textContent || '').length > 0);
    const afterPay = await page.locator('#smPayrollPanel').innerText();
    assert.notEqual(beforePay, afterPay);
    assert.match(afterPay, /Раҳимов Далер/);
    assert.match(afterPay, /TJS/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Phase 2 browser: Staff grades & animated charts -> Director -> Maorif verification chain', async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.route('https://*.supabase.co/**', route => route.abort());
    const errors = [];

    // 1. Class Teacher enters quarter grades, checks live SVG charts, submits for verification
    const pTeacher = await ctx.newPage();
    pTeacher.on('pageerror', e => errors.push(e.message));
    await pTeacher.goto(`${base}/cabinets/school/class-teacher.html?school=demo-88&lang=tg`);
    await homeView(pTeacher);
    await pTeacher.locator('[data-open-phase2="smGradesPanel"]').click();
    await pTeacher.locator('#smGrAddStudent').waitFor();
    await pTeacher.locator('#smGrAddStudent').click();
    await pTeacher.locator('#smGrAddStudent').click();
    await pTeacher.locator('[data-gr-name="0"]').fill('Хонандаи 1');
    await pTeacher.locator('[data-gr-val="0"]').fill('9');
    await pTeacher.locator('[data-gr-name="1"]').fill('Хонандаи 2');
    await pTeacher.locator('[data-gr-val="1"]').fill('7');
    await pTeacher.locator('#smGrSaveBtn').click();
    await pTeacher.waitForFunction(() => (document.getElementById('smGrStatus')?.textContent || '').length > 0);
    assert.ok((await pTeacher.locator('#smGradesPanel .sm-ring-svg').count()) >= 1);
    assert.match((await pTeacher.locator('#smGradesPanel .sm-ring-svg').textContent()) || '', /50(\.0)?%/);
    await pTeacher.locator('#smGrSubmitVerif').click();
    await pTeacher.waitForFunction(() => (document.getElementById('smGrStatus')?.textContent || '').includes('директор'));

    // 2. Director approves & forwards to Maorif
    const pDir = await ctx.newPage();
    pDir.on('pageerror', e => errors.push(e.message));
    await pDir.goto(`${base}/cabinets/school/director.html?school=demo-88&lang=tg`);
    await homeView(pDir);
    await pDir.locator('#smMainModules [data-open-phase2="smVerificationPanel"]').click();
    await pDir.locator('[data-dir-act="approve-forward"]').first().waitFor();
    await pDir.locator('[data-dir-act="approve-forward"]').first().click();
    await pDir.waitForFunction(() => (document.getElementById('smVfStatus')?.textContent || '').includes('Маориф'));

    // 3. Maorif Head approves and checks animated analytics
    const pMaorif = await ctx.newPage();
    pMaorif.on('pageerror', e => errors.push(e.message));
    await pMaorif.goto(`${base}/cabinets/maorif/head.html?school=demo-88&lang=tg`);
    await homeView(pMaorif);
    await pMaorif.locator('#smMainModules [data-open-phase2="smVerificationPanel"]').click();
    await pMaorif.locator('[data-mao-act="approved"]').first().waitFor();
    await pMaorif.locator('[data-mao-act="approved"]').first().click();
    await pMaorif.waitForFunction(() => (document.getElementById('smVfStatus')?.textContent || '').includes('Маориф тасдиқ кард'));

    await homeView(pMaorif);
    await pMaorif.locator('#smMainModules [data-open-phase2="smAnalyticsPanel"]').click();
    await pMaorif.locator('#smAnalyticsPanel .sm-ring-svg').waitFor();
    assert.match(await pMaorif.locator('#smAnalyticsPanel').innerText(), /1 \/ 1/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('Phase 2 browser: Admin Territory Hierarchy tree expands and prefills child orgs', async () => {
  const browser = await chromium.launch();
  const adminSrv = await startAdminStaticServer();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    const mockOrgs = [
      { id: 'r-1', name: 'Раёсати маорифи Суғд', kind: 'education_authority', authority_tier: 'raesat', parent_id: null, region_name: 'Вилояти Суғд', district_name: '', school_code: 'SM-RAE-01' },
      { id: 'm-1', name: 'Шуъбаи маорифи Хуҷанд', kind: 'education_authority', authority_tier: 'maorif', parent_id: 'r-1', region_name: 'Вилояти Суғд', district_name: 'Хуҷанд', school_code: 'SM-MAO-01' },
      { id: 's-1', name: 'МТМУ № 88', kind: 'school', authority_tier: null, parent_id: 'm-1', region_name: 'Вилояти Суғд', district_name: 'Хуҷанд', school_code: 'SM-088' },
    ];
    await ctx.route('https://*.supabase.co/**', async route => {
      const url = route.request().url();
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.includes('/rpc/get_my_workspace_context')) return json({ is_super_admin: true, user_id: 'admin-1', memberships: [] });
      if (url.includes('/auth/v1/token')) return json({ access_token: 'mock_jwt', refresh_token: 'mock_ref', expires_at: Math.floor(Date.now() / 1000) + 3600 });
      if (url.includes('/rest/v1/organizations')) return json(mockOrgs);
      if (url.includes('/functions/v1/admin-users')) return json({ users: [] });
      return json([]);
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${adminSrv.url}/admin/index.html#access_token=mock_jwt&refresh_token=mock_ref`);
    await page.locator('#admWorkspace:not([hidden])').waitFor();
    await page.locator('#orgHierarchyTree').waitFor();
    await page.waitForFunction(() => (document.getElementById('orgHierarchyTree')?.textContent || '').includes('Раёсати маорифи Суғд'));

    // Expand Raesat node -> click "+ Мактаби нав" under Maorif node -> verify form prefill
    await page.locator('#orgHierarchyTree > details.adm-tree-node > summary').first().click();
    await page.getByRole('button', { name: '+ Мактаби нав' }).first().click();
    assert.equal(await page.locator('#orgTypePreset').inputValue(), 'school');
    assert.equal(await page.locator('#orgRegion').inputValue(), 'Вилояти Суғд');
    assert.equal(await page.locator('#orgDistrict').inputValue(), 'Хуҷанд');
    assert.equal(await page.locator('#orgParent').inputValue(), 'm-1');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await adminSrv.close();
  }
});
