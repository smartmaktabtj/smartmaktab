import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { TEST_SCHOOL_UUID_88, fillStartupProfile, installMockSupabase } from './onboarding-fixtures.mjs';
import { buildSimpleDocxBytes } from '../shared/spreadsheet-import.mjs';

const base = process.env.SM_BASE_URL ?? 'http://localhost:4180';
const repoRoot = resolve(new URL('..', import.meta.url).pathname);

function startAdminStaticServer() {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  };
  const server = http.createServer(async (req, res) => {
    const cleanPath = (req.url || '/').split('?')[0];
    if (!/^\/(?:admin|shared|vendor)(?:\/[a-zA-Z0-9._-]+)+$/.test(cleanPath) || cleanPath.includes('..')) {
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

function buildValidPdfBytes(text = 'SmartMaktab PDF Test') {
  const safe = String(text).replace(/[()\\]/g, '');
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${safe}) Tj\nET\n`;
  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  for (const o of objs) {
    offsets.push(Buffer.byteLength(out));
    out += o;
  }
  const xrefOffset = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'utf8'));
}

test('Stage 3 browser (Admin): category/subcategory/DOCX import/mini-Word tag bar/doc-storage & Pro pack badge', async () => {
  const browser = await chromium.launch();
  const adminSrv = await startAdminStaticServer();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, reducedMotion: 'reduce', serviceWorkers: 'block' });

    const cats = [];
    const subs = [];
    const tpls = [];
    let storageSaveCalls = 0;
    let pdfSaveCalls = 0;

    await ctx.route('https://*.supabase.co/**', async route => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

      if (url.pathname.endsWith('/auth/v1/token')) {
        return json({ access_token: 'adm-jwt', refresh_token: 'adm-ref', expires_at: Math.floor(Date.now() / 1000) + 3600 });
      }
      if (url.pathname.endsWith('/rpc/get_my_workspace_context')) {
        return json({ is_super_admin: true, user_id: 'admin-1', memberships: [] });
      }
      if (url.pathname.endsWith('/rest/v1/organizations')) {
        return json([{ id: TEST_SCHOOL_UUID_88, name: 'МТМУ № 88', kind: 'school', region_name: 'Суғд', district_name: 'Хуҷанд', school_code: 'SM-088' }]);
      }
      if (url.pathname.endsWith('/rest/v1/payment_submissions')) {
        return json([{
          id: 'pay-pro-1',
          organization_id: TEST_SCHOOL_UUID_88,
          plan_code: 'standard',
          amount_tjs: 35,
          declared_amount_tjs: 35,
          include_aliya: false,
          storage_pack_count: 2,
          provider_code: 'alif',
          transaction_id: 'TX-PRO-777',
          status: 'pending',
          created_at: new Date().toISOString(),
        }]);
      }
      if (url.pathname.endsWith('/functions/v1/admin-users')) return json({ users: [] });
      if (url.pathname.endsWith('/rpc/admin_list_document_catalog')) {
        return json({ categories: cats, subcategories: subs, templates: tpls });
      }
      if (url.pathname.endsWith('/rpc/admin_upsert_document_category')) {
        const b = req.postDataJSON();
        const id = b.p_id || `cat-${cats.length + 1}`;
        const row = {
          id,
          position_codes: b.p_position_codes || [],
          title_tg: b.p_title_tg,
          title_ru: b.p_title_ru || '',
          icon: b.p_icon || '📁',
          sort_order: b.p_sort_order ?? 100,
          is_active: b.p_is_active ?? true,
        };
        const idx = cats.findIndex(c => c.id === id);
        if (idx >= 0) cats[idx] = row; else cats.push(row);
        return json(id);
      }
      if (url.pathname.endsWith('/rpc/admin_upsert_document_subcategory')) {
        const b = req.postDataJSON();
        const id = b.p_id || `sub-${subs.length + 1}`;
        const row = {
          id,
          category_id: b.p_category_id,
          title_tg: b.p_title_tg,
          title_ru: b.p_title_ru || '',
          sort_order: b.p_sort_order ?? 100,
          is_active: b.p_is_active ?? true,
        };
        const idx = subs.findIndex(s => s.id === id);
        if (idx >= 0) subs[idx] = row; else subs.push(row);
        return json(id);
      }
      if (url.pathname.endsWith('/rpc/admin_upsert_document_template')) {
        const b = req.postDataJSON();
        const id = b.p_id || `tpl-${tpls.length + 1}`;
        const row = {
          id,
          category_id: b.p_category_id,
          subcategory_id: b.p_subcategory_id,
          position_codes: b.p_position_codes || [],
          title_tg: b.p_title_tg,
          title_ru: b.p_title_ru || '',
          description_tg: b.p_description_tg || '',
          page_orientation: b.p_page_orientation || 'portrait',
          page_margins_mm: b.p_page_margins_mm || { top: 20, right: 15, bottom: 20, left: 30 },
          lang: b.p_lang || 'both',
          school_type_filter: b.p_school_type_filter || 'all',
          shift_filter: b.p_shift_filter || 'all',
          edit_mode: b.p_edit_mode || 'full',
          strict_native_only: Boolean(b.p_strict_native_only),
          status: b.p_status || 'published',
          sort_order: b.p_sort_order ?? 100,
          doc_format: b.p_doc_format || 'word',
          storage_path: b.p_storage_path || '',
          pdf_storage_path: b.p_pdf_storage_path || '',
          pdf_size_bytes: b.p_pdf_size_bytes || 0,
          content_json: b.p_content_json || { html: '' },
        };
        const idx = tpls.findIndex(t => t.id === id);
        if (idx >= 0) tpls[idx] = row; else tpls.push(row);
        return json(id);
      }
      if (url.pathname.endsWith('/functions/v1/doc-storage')) {
        const b = req.postDataJSON();
        if (b.action === 'save_template_blob') {
          storageSaveCalls += 1;
          assert.ok(b.gzip_b64 && b.gzip_b64.length > 5);
          return json({ storage_path: `tpl/${b.template_id}/v1.html.gz` });
        }
        if (b.action === 'save_template_pdf') {
          pdfSaveCalls += 1;
          assert.ok(b.pdf_b64 && b.pdf_b64.length > 20);
          return json({ ok: true, pdf_storage_path: `templates/${b.template_id}/v1.pdf`, size_bytes: 512 });
        }
        return json({});
      }
      return json([]);
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto(`${adminSrv.url}/admin/index.html#access_token=adm-jwt&refresh_token=adm-ref`);
    await page.locator('#admWorkspace:not([hidden])').waitFor();

    // Check Pro×2 payment badge in Payments tab
    await page.locator('.adm-tabs button[data-tab="payments"]').click();
    await page.waitForFunction(() => (document.getElementById('paymentsTbody')?.textContent || '').includes('Pro×2'));

    // Open Documents & Templates tab
    await page.locator('.adm-tabs button[data-tab="documents"]').click();
    await page.locator('#docCatForm').waitFor();

    // 1. Create Category for Teacher
    await page.locator('#docCatTitleTg').fill('Ҳуҷҷатҳои таълимӣ');
    await page.locator('#docCatTitleRu').fill('Учебные документы');
    await page.locator('#docCatPositionsBox input[value="school-teacher"]').check();
    await page.locator('#docCatSaveBtn').click();
    await page.waitForFunction(() => document.querySelectorAll('#docSubCatSelect option').length >= 1);

    // 2. Create Subcategory
    await page.locator('#docSubTitleTg').fill('Ҳисоботҳои синфӣ');
    await page.locator('#docSubSaveBtn').click();
    await page.waitForFunction(() => document.querySelectorAll('#docTplSubSelect option').length >= 1);

    // 3. Import .docx into Mini-Word Editor, press Tajik button Қ and insert {{school.name}} tag
    const docxBytes = buildSimpleDocxBytes('Нақшаи омӯзгор', ['№', 'Фан', 'Соат'], [
      ['1', 'Математика', '18'],
    ]);
    await page.locator('#docTplFileInput').setInputFiles({
      name: 'plan.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from(docxBytes),
    });
    await page.waitForFunction(() => (document.querySelector('#docTplEditorHost .sm-we-sheet')?.innerText || '').includes('Математика'));

    await page.locator('#docTplEditorHost .sm-we-tags-bar button', { hasText: '{{school.name}}' }).click();
    await page.locator('#docTplEditorHost .sm-we-tajik-bar').getByRole('button', { name: 'Қ', exact: true }).click();

    await page.locator('#docTplTitleTg').fill('Ҳисоботи солонаи фаннӣ');
    await page.locator('#docTplStrictNative').uncheck();
    await page.locator('#docTplSaveBtn').click();

    await page.waitForFunction(() => (document.getElementById('docCatalogTree')?.textContent || '').includes('Ҳисоботи солонаи фаннӣ'));
    assert.equal(storageSaveCalls, 1);
    assert.ok(tpls.length === 1 && tpls[0].storage_path.includes('v1.html.gz'));
    assert.match(tpls[0].content_json.html, /\{\{school\.name\}\}/);
    assert.match(tpls[0].content_json.html, /Қ/);

    // 4. Import and publish read-only PDF / scan template
    const pdfBytes = buildValidPdfBytes('SmartMaktab Admin PDF');
    await page.locator('#docTplFileInput').setInputFiles({
      name: 'order-scan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBytes),
    });
    await page.locator('#docTplPdfBox:not([hidden])').waitFor();
    assert.equal(await page.locator('#docTplFormat').inputValue(), 'pdf');
    await page.locator('#docTplTitleTg').fill('Скан-фармоиши №15');
    await page.locator('#docTplSaveBtn').click();
    await page.waitForFunction(() => (document.getElementById('docCatalogTree')?.textContent || '').includes('Скан-фармоиши №15'));
    assert.equal(pdfSaveCalls, 1);
    assert.equal(tpls.length, 2);
    assert.equal(tpls[1].doc_format, 'pdf');
    assert.ok(tpls[1].pdf_storage_path.includes('.pdf'));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await adminSrv.close();
  }
});

test('Stage 3 browser (Teacher Cabinet): #smDocSidebar, autofill Word editor, PrintScreen veil, Favorites, Folders, +10 TJS Pro & strict-native block', async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await installMockSupabase(ctx, {
      schools: [{ id: TEST_SCHOOL_UUID_88, name: 'МТМУ № 88', kind: 'school', region_name: 'Суғд', district_name: 'Хуҷанд' }],
    });

    const catId = 'cat-teach-1';
    const subId = 'sub-teach-1';
    const tplOpenId = 'tpl-open-1';
    const tplNativeId = 'tpl-native-1';
    const tplPdfId = 'tpl-pdf-1';
    const samplePdfB64 = Buffer.from(buildValidPdfBytes('SmartMaktab ReadOnly PDF')).toString('base64');
    const folders = [{ id: 'fld-1', name: 'Архив', sort_order: 100 }];
    const items = [];
    const savedDrafts = [];
    const printLogs = [];

    // Wrap installMockSupabase route for Stage 3 document RPCs and doc-storage
    await ctx.route('https://*.supabase.co/**', async route => {
      const req = route.request();
      const url = new URL(req.url());
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

      if (url.pathname.endsWith('/rpc/get_position_document_library')) {
        const draftsUsed = items.filter(i => i.has_draft).length;
        return json({
          categories: [{ id: catId, position_codes: ['school-teacher'], title_tg: 'Ҳуҷҷатҳои омӯзгор', title_ru: '', icon: '📘', sort_order: 10 }],
          subcategories: [{ id: subId, category_id: catId, title_tg: 'Ҳисоботҳо', title_ru: '', sort_order: 10 }],
          templates: [
            {
              id: tplOpenId,
              category_id: catId,
              subcategory_id: subId,
              position_codes: ['school-teacher'],
              title_tg: 'Рӯйхати хонандагони синф',
              title_ru: 'Список учащихся',
              description_tg: 'Худкор пур мешавад',
              page_orientation: 'portrait',
              page_margins_mm: { top: 20, right: 15, bottom: 20, left: 30 },
              lang: 'tg',
              school_type_filter: 'all',
              shift_filter: 'all',
              edit_mode: 'full',
              strict_native_only: false,
              version: 1,
              storage_path: '',
              content_json: {
                html: '<p><strong>Мактаб:</strong> {{school.name}}</p><p><strong>Директор:</strong> {{director.full_name}}</p><p><strong>Омӯзгор:</strong> {{user.full_name}}</p>{{table.students}}',
              },
              sort_order: 10,
            },
            {
              id: tplNativeId,
              category_id: catId,
              subcategory_id: subId,
              position_codes: ['school-teacher'],
              title_tg: 'Ҳуҷҷати махфии аттестатсия',
              title_ru: '',
              description_tg: 'Танҳо Windows / Android',
              page_orientation: 'portrait',
              page_margins_mm: { top: 20, right: 15, bottom: 20, left: 30 },
              lang: 'tg',
              school_type_filter: 'all',
              shift_filter: 'all',
              edit_mode: 'fields_only',
              strict_native_only: true,
              version: 1,
              doc_format: 'word',
              storage_path: '',
              content_json: {
                html: '<p>Мактаб: {{school.name}}</p><p>Қайд: {{custom.note}}</p>',
              },
              sort_order: 20,
            },
            {
              id: tplPdfId,
              category_id: catId,
              subcategory_id: subId,
              position_codes: ['school-teacher'],
              title_tg: 'Фармоиши сканшуда №10',
              title_ru: 'Скан приказа №10',
              description_tg: 'Танҳо хондан ва чоп',
              page_orientation: 'portrait',
              page_margins_mm: { top: 20, right: 15, bottom: 20, left: 30 },
              lang: 'tg',
              school_type_filter: 'all',
              shift_filter: 'all',
              edit_mode: 'fields_only',
              strict_native_only: false,
              version: 1,
              doc_format: 'pdf',
              storage_path: '',
              pdf_storage_path: `templates/${tplPdfId}/v1.pdf`,
              pdf_size_bytes: 512,
              content_json: {},
              sort_order: 30,
            },
          ],
          folders,
          items,
          quota: {
            folders_used: folders.length,
            folders_limit: 20,
            drafts_used: draftsUsed,
            drafts_limit: 50,
            storage_pack_count: 0,
          },
          autofill: {
            organization: { id: TEST_SCHOOL_UUID_88, name: 'МТМУ № 88', kind: 'school', region_name: 'Суғд', district_name: 'Хуҷанд' },
            director: { full_name: 'Саидов Директор', phone: '+992900000001' },
            user: { full_name: 'Сафарова Озодамоҳ', position_code: 'school-teacher' },
            stats: {
              students_total: 2,
              students_boys: 1,
              students_girls: 1,
              students: [
                { full_name: 'Алиев Беҳрӯз', class_code: '5Б', birth_year: 2014, gender: 'male' },
                { full_name: 'Каримова Нигина', class_code: '5Б', birth_year: 2014, gender: 'female' },
              ],
              workloads: [],
            },
          },
        });
      }
      if (url.pathname.endsWith('/rpc/toggle_user_document_favorite')) {
        const b = req.postDataJSON();
        let row = items.find(i => i.template_id === b.p_template_id && !i.folder_id);
        if (!row) {
          row = { id: `itm-${items.length + 1}`, template_id: b.p_template_id, folder_id: null, is_favorite: Boolean(b.p_favorite), has_draft: false };
          items.push(row);
        } else {
          row.is_favorite = Boolean(b.p_favorite);
        }
        return json(row);
      }
      if (url.pathname.endsWith('/rpc/create_user_document_folder')) {
        const b = req.postDataJSON();
        const nf = { id: `fld-${folders.length + 1}`, name: b.p_name, sort_order: 100 };
        folders.push(nf);
        return json(nf);
      }
      if (url.pathname.endsWith('/rpc/copy_template_to_user_folder')) {
        const b = req.postDataJSON();
        const copy = { id: `itm-${items.length + 1}`, template_id: b.p_template_id, folder_id: b.p_folder_id, is_favorite: false, has_draft: false };
        items.push(copy);
        return json(copy);
      }
      if (url.pathname.endsWith('/functions/v1/doc-storage')) {
        const b = req.postDataJSON();
        if (b.action === 'load_template_pdf') {
          return json({ ok: true, pdf_b64: samplePdfB64, size_bytes: 512 });
        }
        if (b.action === 'save_draft') {
          savedDrafts.push(b);
          let row = items.find(i => i.template_id === b.template_id && (i.folder_id || null) === (b.folder_id || null));
          if (!row) {
            row = { id: `itm-${items.length + 1}`, template_id: b.template_id, folder_id: b.folder_id || null, is_favorite: false, has_draft: true, draft_storage_path: 'draft/test.gz' };
            items.push(row);
          } else {
            row.has_draft = true;
            row.draft_storage_path = 'draft/test.gz';
          }
          return json({
            ok: true,
            item_id: row.id,
            storage_path: 'draft/test.gz',
            quota: { folders_used: folders.length, folders_limit: 20, drafts_used: items.filter(i => i.has_draft).length, drafts_limit: 50 },
          });
        }
        return json({});
      }
      if (url.pathname.endsWith('/rpc/log_document_print')) {
        printLogs.push(req.postDataJSON());
        return json('audit-1');
      }
      return route.fallback();
    });

    const page = await ctx.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    let nativeDialogsCalled = 0;
    page.on('dialog', d => {
      nativeDialogsCalled += 1;
      d.dismiss();
    });

    // Register cloud teacher
    await page.goto(`${base}/?register=1`);
    await page.locator('#primaryChoices input[value="school-teacher"]').check();
    await page.locator('#toExtras').click();
    await page.locator('#toProfile').click();
    await fillStartupProfile(page, { first: 'Озодамоҳ', last: 'Сафарова', teacherClass: '5Б', login: 'ozodamoh88', password: 'Password88' });
    await page.locator('#toSchoolStep').click();
    await page.locator('#schoolSearch').fill('88');
    await page.waitForFunction(() => !document.getElementById('begin')?.disabled);
    await page.locator('#begin').click();

    await page.waitForURL(/\/cabinets\/school\/teacher\.html/);
    await page.locator('#smDocSidebar').waitFor();
    await page.waitForFunction(() => (document.getElementById('smDocSidebar')?.textContent || '').includes('Рӯйхати хонандагони синф'));

    // Verify no "абр" / "облак" wording anywhere in sidebar and larger sidebar width
    const sidebarMetrics = await page.evaluate(() => {
      const sb = document.getElementById('smDocSidebar');
      return { width: sb?.getBoundingClientRect().width || 0, text: sb?.innerText || '' };
    });
    assert.ok(sidebarMetrics.width >= 325, `Expected wider sidebar, got ${sidebarMetrics.width}`);
    assert.doesNotMatch(sidebarMetrics.text, /(?<!\p{L})(абр\p{L}*|облак\p{L}*|облач\p{L}*)/iu);

    // 1. Check collapse/expand toggle on #smDocSidebar and subcategory collapse on click
    await page.locator('#smDocSidebar .sm-doc-collapse-btn').click();
    assert.ok(await page.locator('#smHomeLayout.sm-doc-collapsed').count() === 1);
    await page.locator('#smDocSidebar .sm-doc-collapse-btn').click();
    assert.ok(await page.locator('#smHomeLayout.sm-doc-collapsed').count() === 0);

    const subDet = page.locator('#smDocSidebar .sm-doc-sub-details').first();
    assert.equal(await subDet.evaluate(el => el.open), true);
    await subDet.locator('summary').click();
    assert.equal(await subDet.evaluate(el => el.open), false);
    await subDet.locator('summary').click();
    assert.equal(await subDet.evaluate(el => el.open), true);

    // 2. Check main folders bar displays existing cloud folder chip
    await page.locator('#smMainFoldersBar').waitFor();
    assert.match(await page.locator('#smMainFoldersBar').innerText(), /Архив/);

    // 3. Open editable autofilled document in full-screen Russian MS Word modal
    await page.locator('#smDocSidebar .sm-doc-file-open', { hasText: 'Рӯйхати хонандагони синф' }).click();
    await page.locator('#smWordEditorModal').waitFor();
    assert.equal(await page.locator('#smWordEditorModal .sm-we-watermark').count(), 0);
    const editorHeaderText = await page.locator('#smWordEditorModal').innerText();
    assert.match(editorHeaderText, /Главная/);
    assert.match(editorHeaderText, /Вставка/);
    assert.match(editorHeaderText, /Макет/);
    assert.match(editorHeaderText, /Сохранить в систему/);
    assert.doesNotMatch(editorHeaderText, /(?<!\p{L})(абр\p{L}*|облак\p{L}*|облач\p{L}*)/iu);

    // Toggle Day / Night theme in Word editor
    await page.locator('#smWordEditorModal [data-we-theme]').click();
    assert.ok(await page.locator('#smWordEditorModal.night').count() === 1);
    await page.locator('#smWordEditorModal [data-we-theme]').click();
    assert.ok(await page.locator('#smWordEditorModal.night').count() === 0);

    const sheetText = await page.locator('#smWordEditorModal .sm-we-sheet').innerText();
    assert.match(sheetText, /МТМУ № 88/);
    assert.match(sheetText, /Саидов Директор/);
    assert.match(sheetText, /Алиев Беҳрӯз/);
    assert.match(sheetText, /Каримова Нигина/);

    // 4. Press Tajik button Ғ, save draft to private doc-storage
    await page.locator('#smWordEditorModal .sm-we-tajik-bar').getByRole('button', { name: 'Ғ', exact: true }).click();
    await page.locator('#smWordEditorModal [data-we-save]').click();
    await page.waitForFunction(() => (document.getElementById('smWeQuotaBadge')?.textContent || '').includes('1/50'));
    assert.equal(savedDrafts.length, 1);

    // 5. Press PrintScreen -> Privacy veil activates
    await page.keyboard.press('PrintScreen');
    await page.locator('#smWordEditorModal .sm-we-privacy-veil.active').waitFor();

    // Close Word editor
    await page.locator('#smWordEditorModal [data-we-close]').click();
    await page.waitForFunction(() => !document.getElementById('smWordEditorModal'));

    // 6. Toggle favorite ★ and check Favorites tab
    await page.locator('#smDocSidebar .sm-doc-file').first().locator('button', { hasText: '☆' }).click();
    await page.locator('#smDocSidebar .sm-doc-tab', { hasText: 'Интихобшуда' }).click();
    await page.waitForFunction(() => (document.getElementById('smDocSidebar')?.textContent || '').includes('Рӯйхати хонандагони синф'));

    // 7. Create a personal folder via centered in-app modal (NO native window.prompt!) and copy template into it
    await page.locator('#smMainCreateFolderBtn').click();
    await page.locator('.sm-dlg-backdrop .sm-dlg-input').fill('Ҷадвалҳои ман');
    await page.locator('.sm-dlg-backdrop .sm-dlg-btn.primary').click();
    await page.waitForFunction(() => (document.getElementById('smMainFoldersBar')?.textContent || '').includes('Ҷадвалҳои ман'));

    // Copy template to folder
    await page.locator('#smDocSidebar .sm-doc-tab', { hasText: 'Категорияҳо' }).click();
    await page.locator('#smDocSidebar .sm-doc-file').first().locator('button', { hasText: '📁+' }).click();
    await page.locator('.sm-doc-dialog button', { hasText: 'Ҷадвалҳои ман' }).click();
    await page.waitForFunction(() => (document.getElementById('smDocSidebar')?.textContent || '').includes('Ҷадвалҳои ман'));

    // 8. Check strict_native_only blocks web browser, then opens when smartmaktabDesktop bridge is present (fields_only mode)
    await page.locator('#smDocSidebar .sm-doc-tab', { hasText: 'Категорияҳо' }).click();
    await page.locator('#smDocSidebar .sm-doc-file-open', { hasText: 'Ҳуҷҷати махфии аттестатсия' }).click();
    await page.locator('#smWordEditorModal .sm-we-strict-block').waitFor();
    await page.locator('#smWordEditorModal [data-we-close]').first().click();

    await page.evaluate(() => {
      window.smartmaktabDesktop = {
        isDesktopApp: true,
        printProtected: async () => ({ ok: true }),
      };
    });
    await page.locator('#smDocSidebar .sm-doc-file-open', { hasText: 'Ҳуҷҷати махфии аттестатсия' }).click();
    await page.locator('#smWordEditorModal .sm-we-sheet').waitFor();
    assert.equal(await page.locator('#smWordEditorModal .sm-we-sheet').getAttribute('contenteditable'), 'false');
    assert.ok((await page.locator('#smWordEditorModal .sm-we-sheet [data-sm-field="1"]').count()) >= 1);
    await page.locator('#smWordEditorModal [data-we-print]').click();
    await new Promise(r => setTimeout(r, 150));
    await page.locator('#smWordEditorModal [data-we-close]').click();

    // 9. Open read-only PDF / scan document -> renders canvas via pdf.min.mjs, supports Day/Night, no download/save, printable!
    await page.locator('#smDocSidebar .sm-doc-file-open', { hasText: 'Фармоиши сканшуда №10' }).click();
    await page.locator('#smPdfViewerModal .sm-pdf-page-card canvas').waitFor();
    assert.equal(await page.locator('#smPdfViewerModal [download]').count(), 0);
    assert.equal(await page.locator('#smPdfViewerModal [data-we-save]').count(), 0);
    await page.locator('#smPdfViewerModal [data-we-theme]').click();
    assert.ok(await page.locator('#smPdfViewerModal.night').count() === 1);
    await page.locator('#smPdfViewerModal [data-we-print]').click();
    await page.waitForFunction(() => true);
    await new Promise(r => setTimeout(r, 150));
    await page.locator('#smPdfViewerModal [data-we-close]').click();
    await page.waitForFunction(() => !document.getElementById('smPdfViewerModal'));

    // 10. Click "+10 смн Pro" button in sidebar -> opens payment wizard with Storage Pack 1 preselected!
    await page.locator('#smDocSidebar .sm-doc-pro-link').click();
    await page.locator('#cloudStoragePackSelect').waitFor();
    assert.equal(await page.locator('#cloudStoragePackSelect').inputValue(), '1');
    assert.match(await page.locator('#cloudWorkspacePanel').innerText(), /10/);

    assert.equal(printLogs.length, 2);
    assert.equal(printLogs[0].p_platform, 'windows');
    assert.equal(printLogs[1].p_template_id, tplPdfId);
    assert.equal(nativeDialogsCalled, 0, 'Native browser alert/confirm/prompt dialogs must never appear');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
