import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { zipSync, strToU8 } from 'fflate';
import {
  compressDocPayload,
  decompressDocPayload,
  parseDocxBytesToDocModel,
  renderTemplateWithAutofill,
  sanitizeDocHtml,
} from '../shared/doc-template-engine.mjs';
import {
  STORAGE_PACK_PRICE_TJS,
  computePositionTariffTotal,
  computeSubscriptionPackagePrice,
} from '../shared/position-catalog.mjs';

const db = new PGlite();
const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const uid = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (sql, args = []) => db.query(sql, args).then((r) => r.rows);
const denied = (p) => assert.rejects(p, { code: '42501' });

async function as(n, fn, role = 'authenticated') {
  await db.exec(`set role ${role}`);
  try {
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(n ? { sub: uid(n), role } : { role })]);
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claims','{}',false)");
  }
}

let raesatId, maorifId, schoolId;

before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
  `);

  for (const m of [
    '../supabase/migrations/20261124000100_dev_read_only.sql',
    '../supabase/migrations/20261125000100_summary_review.sql',
    '../supabase/migrations/20261125000200_roles_library_licensing.sql',
    '../supabase/migrations/20261125000300_payment_tariffs_tx_unique.sql',
    '../supabase/migrations/20261126000100_fix_grants_seed_and_content.sql',
    '../supabase/migrations/20261126000200_role_tariffs_quotas_devices_cleanup.sql',
    '../supabase/migrations/20261126000300_aliya_addon_profiles_positions.sql',
    '../supabase/migrations/20261126000400_phase2_registries_payroll_grades_verification_hierarchy.sql',
    '../supabase/migrations/20261126000500_account_verification.sql',
    '../supabase/migrations/20261127000100_public_bootstrap_rpc.sql',
    '../supabase/migrations/20261128000100_stage0_cleanup.sql',
    '../supabase/migrations/20261128000200_stage1_locations_tariffs_devices.sql',
    '../supabase/migrations/20261128000300_stage1_registration_payments_quotas.sql',
    '../supabase/migrations/20261128000400_stage1_self_devices_and_users.sql',
    '../supabase/migrations/20261128000500_stage1_fix_assign_membership_and_ctx.sql',
    '../supabase/migrations/20261129000100_stage2_5_cleanup_and_devices.sql',
    '../supabase/migrations/20261130000100_document_library_editor_storage.sql',
  ]) {
    await db.exec(await read(m));
  }

  for (const [i, name] of ['super_admin', 'director', 'teacher1', 'teacher2'].entries()) {
    await q('insert into auth.users values ($1,$2,now())', [uid(i + 1), `${name}@example.test`]);
  }
  await q('insert into smartmaktab_private.platform_developers(user_id) values ($1)', [uid(1)]);

  raesatId = (await as(1, () => q("select public.admin_upsert_organization('Раёсати Суғд','education_authority',null,'raesat','Суғд',null,null) as id")))[0].id;
  maorifId = (await as(1, () => q("select public.admin_upsert_organization('Маорифи Хуҷанд','education_authority',$1,'maorif','Суғд','Хуҷанд',null) as id", [raesatId])))[0].id;
  schoolId = (await as(1, () => q("select public.admin_upsert_organization('МТМУ № 25','school',$1,null,'Суғд','Хуҷанд','SCH-25',null,'Бобоҷон','Хуҷанд') as id", [maorifId])))[0].id;

  await as(1, () => q("select public.admin_assign_membership($1,$2,'director','school-director',array[]::text[],0,2,true)", [uid(2), schoolId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'teacher','school-teacher',array[]::text[],0,2,true)", [uid(3), schoolId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'teacher','school-teacher',array[]::text[],0,2,true)", [uid(4), schoolId]));

  await q("update public.school_memberships set verification_status='verified' where user_id in ($1,$2,$3)", [uid(2), uid(3), uid(4)]);
  await q("insert into public.user_profiles(user_id, full_name, preferred_lang, profile_details) values ($1,'Каримов Акмал','tg','{\"phone\":\"+992920001122\"}'), ($2,'Раҳимова Нигора','tg','{\"institutionType\":\"Гимназия\",\"institutionShifts\":\"1\",\"phone\":\"+992927778899\"}')", [uid(2), uid(3)]);
  await q("insert into public.school_students(organization_id, class_code, full_name, birth_year, gender, created_by) values ($1,'9А','Алиева Мадина',2011,'female',$2), ($1,'9А','Собиров Фаридун',2011,'male',$2)", [schoolId, uid(2)]);
});

after(() => db.close());

test('Stage 3 DB: position-scoped document catalog, autofill, 20/50 quotas, +10 TJS Pro pack expansion & RLS isolation', async () => {
  // Non-super_admin cannot mutate catalog
  await denied(as(3, () => q("select public.admin_upsert_document_category(null, array['school-teacher']::text[], 'Хак', 'Хак', '📁', 1, true)")));
  await denied(as(2, () => q('select public.admin_list_document_catalog()')));

  // Super admin creates teacher+director category, office-only category, subcategories & templates
  const catTeacherId = (await as(1, () => q("select public.admin_upsert_document_category(null, array['school-teacher','school-director']::text[], 'Ҳуҷҷатҳои таълимӣ', 'Учебные документы', '📘', 10, true) as id")))[0].id;
  const catOfficeId = (await as(1, () => q("select public.admin_upsert_document_category(null, array['office-head']::text[], 'Маориф махфӣ', 'Только Маориф', '🏛️', 20, true) as id")))[0].id;

  const subTeacherId = (await as(1, () => q("select public.admin_upsert_document_subcategory(null, $1, 'Журнал ва нақша', 'Журнал и планы', 10, true) as id", [catTeacherId])))[0].id;
  const subOfficeId = (await as(1, () => q("select public.admin_upsert_document_subcategory(null, $1, 'Фармоишҳо', 'Приказы', 10, true) as id", [catOfficeId])))[0].id;

  const tplTeacherId = (await as(1, () => q(
    "select public.admin_upsert_document_template(null,$1,$2,array['school-teacher']::text[],'Нақшаи дарсӣ','План урока','','portrait','{\"top\":20,\"right\":15,\"bottom\":20,\"left\":30}'::jsonb,'both','all','all','full',false,'published',10,'','{\"html\":\"<p>{{school.name}} — {{director.full_name}}</p>{{table.students}}\"}'::jsonb) as id",
    [catTeacherId, subTeacherId],
  )))[0].id;
  await as(1, () => q(
    "select public.admin_upsert_document_template(null,$1,$2,array['office-head']::text[],'Ҳисоботи Маориф','Отчёт Маориф','','portrait','{\"top\":20,\"right\":15,\"bottom\":20,\"left\":30}'::jsonb,'both','all','all','full',true,'published',10,'','{\"html\":\"<p>Маориф</p>\"}'::jsonb) as id",
    [catOfficeId, subOfficeId],
  ));
  await as(1, () => q(
    "select public.admin_upsert_document_template(null,$1,$2,array['school-teacher']::text[],'Лоиҳаи пинҳон','Скрытый черновик','','portrait','{\"top\":20,\"right\":15,\"bottom\":20,\"left\":30}'::jsonb,'both','all','all','full',false,'draft',20,'','{\"html\":\"<p>Draft</p>\"}'::jsonb) as id",
    [catTeacherId, subTeacherId],
  ));

  // Teacher sees only published school-teacher template + live school/director/Phase2 autofill
  const lib = (await as(3, () => q("select public.get_position_document_library('school-teacher', $1) as lib", [schoolId])))[0].lib;
  assert.equal(lib.categories.length, 1);
  assert.equal(lib.templates.length, 1);
  assert.equal(lib.templates[0].id, tplTeacherId);
  assert.equal(lib.autofill.organization.name, 'МТМУ № 25');
  assert.equal(lib.autofill.director.full_name, 'Каримов Акмал');
  assert.equal(lib.autofill.user.full_name, 'Раҳимова Нигора');
  assert.equal(lib.autofill.stats.students_total, 2);
  assert.equal(lib.quota.folders_limit, 20);
  assert.equal(lib.quota.drafts_limit, 50);

  // Favorites & clean folder copies are unlimited and do NOT consume drafts_used
  const favRes = (await as(3, () => q('select public.toggle_user_document_favorite($1, true) as res', [tplTeacherId])))[0].res;
  assert.equal(favRes.item.is_favorite, true);
  assert.equal(favRes.quota.drafts_used, 0);

  // Create 20 folders (free base limit) -> 21st folder fails with folder_quota_exceeded
  const folderIds = [];
  for (let i = 1; i <= 20; i += 1) {
    const fRes = (await as(3, () => q('select public.create_user_document_folder($1) as res', [`Папка ${i}`])))[0].res;
    folderIds.push(fRes.folder.id);
  }
  await assert.rejects(
    as(3, () => q("select public.create_user_document_folder('Папка 21')")),
    /folder_quota_exceeded/,
  );

  // Copy unmodified template to a folder: still 0 drafts_used
  const copyRes = (await as(3, () => q("select public.copy_template_to_user_folder($1, $2, 'Нусхаи ман') as res", [tplTeacherId, folderIds[0]])))[0].res;
  assert.equal(copyRes.quota.drafts_used, 0);

  // Another user cannot see or mutate teacher1's folder
  const otherLib = (await as(4, () => q("select public.get_position_document_library('school-teacher', $1) as lib", [schoolId])))[0].lib;
  assert.equal(otherLib.folders.length, 0);
  const renamed = (await as(4, () => q("select public.rename_user_document_folder($1, 'Хакери') as ok", [folderIds[0]])))[0].ok;
  assert.equal(renamed, false);

  // Save 50 distinct edited drafts across templates -> 51st draft fails with draft_quota_exceeded
  const extraTplIds = [];
  for (let i = 1; i <= 50; i += 1) {
    const tid = (await as(1, () => q(
      "select public.admin_upsert_document_template(null,$1,$2,array['school-teacher']::text[],$3,'','','portrait','{\"top\":20,\"right\":15,\"bottom\":20,\"left\":30}'::jsonb,'both','all','all','full',false,'published',100,'','{\"html\":\"<p>ok</p>\"}'::jsonb) as id",
      [catTeacherId, subTeacherId, `Қолаб ${i}`],
    )))[0].id;
    extraTplIds.push(tid);
  }

  for (let i = 0; i < 50; i += 1) {
    const dRes = (await as(3, () => q("select public.save_user_document_draft($1, null, '', '', 'H4sIAAAAAAAAAytIzAAA', 120) as res", [extraTplIds[i]])))[0].res;
    assert.equal(dRes.quota.drafts_used, i + 1);
  }
  // Updating an existing draft does NOT consume another slot
  const repeatRes = (await as(3, () => q("select public.save_user_document_draft($1, null, '', '', 'H4sIAAAAAAAAAytIzAAA', 135) as res", [extraTplIds[0]])))[0].res;
  assert.equal(repeatRes.quota.drafts_used, 50);

  // Saving a 51st edited draft hits free quota limit
  await assert.rejects(
    as(3, () => q("select public.save_user_document_draft($1, null, '', '', 'H4sIAAAAAAAAAytIzAAA', 120)", [tplTeacherId])),
    /draft_quota_exceeded/,
  );

  // User buys +1 Pro Storage Pack (+10 TJS/mo -> +20 folders, +50 drafts) & super_admin verifies payment
  const receiptHash = 'a'.repeat(64);
  const payId = (await as(3, () => q(
    "select public.submit_payment_receipt($1,$2,'dcity',25,'TJS','',null,'{}'::jsonb,'TX123','992510022404',true,'trial_10','school-teacher',array[]::text[],false,1,1) as id",
    [schoolId, receiptHash],
  )))[0].id;
  await as(1, () => q("select public.admin_review_payment($1, 'verified', 'Pro pack OK', 30, 'monthly')", [payId]));

  // Quota immediately expands to 40 folders & 100 drafts!
  const ctxAfter = (await as(3, () => q('select public.get_my_workspace_context() as ctx')))[0].ctx;
  assert.equal(ctxAfter.document_quota.storage_pack_count, 1);
  assert.equal(ctxAfter.document_quota.folders_limit, 40);
  assert.equal(ctxAfter.document_quota.drafts_limit, 100);

  const f21 = (await as(3, () => q("select public.create_user_document_folder('Папка 21') as res")))[0].res;
  assert.equal(f21.quota.folders_used, 21);
  const d51 = (await as(3, () => q("select public.save_user_document_draft($1, null, '', '', 'H4sIAAAAAAAAAytIzAAA', 150) as res", [tplTeacherId])))[0].res;
  assert.equal(d51.quota.drafts_used, 51);

  // Print audit records cleanly
  const printId = (await as(3, () => q("select public.log_document_print($1, $2, null, 'Нақшаи дарсӣ', 'windows') as id", [tplTeacherId, schoolId])))[0].id;
  assert.ok(printId);
});

test('Document engine: XSS sanitizer, rich .docx parser, autofill tables/fields_only, and gzip round-trip', async () => {
  // 1. XSS sanitization strips scripts, handlers, styles, javascript:
  const dirty = '<p onclick="alert(1)" style="text-align:center;background-image:url(x)">Салом</p><script>evil()</script><iframe src="x"></iframe><img src=x onerror="steal()"><b>{{school.name}}</b>';
  const cleaned = sanitizeDocHtml(dirty);
  assert.doesNotMatch(cleaned, /script|iframe|onerror|onclick|url\(/i);
  assert.match(cleaned, /text-align:center/);
  assert.match(cleaned, /<strong>|<b>/);

  // 2. Real .docx zip with landscape orientation, margins, bold heading & table
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Фармоиши {{school.name}}</w:t></w:r></w:p>
        <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Синф</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>{{stats.students_total}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        <w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="1134"/></w:sectPr>
      </w:body>
    </w:document>`;
  const docxBytes = zipSync({ 'word/document.xml': strToU8(docXml) });
  const model = parseDocxBytesToDocModel(docxBytes);
  assert.equal(model.pageOrientation, 'landscape');
  assert.equal(model.pageMarginsMm.left, 20);
  assert.match(model.html, /<h1[^>]*text-align:center/);
  assert.match(model.html, /<table>|<tbody>|<table /);

  // 3. Autofill + dynamic table + HTML escaping + fields_only mode
  const renderedFull = renderTemplateWithAutofill(
    '<p>{{school.name}} · {{director.full_name}}</p>{{table.students}}',
    {
      organization: { name: 'Мактаби <Тест> № 1' },
      director: { full_name: 'Каримов А.' },
      stats: {
        students_total: 1,
        students: [{ full_name: 'Саидов М.', class_code: '10А', birth_year: 2009, gender: 'male' }],
      },
    },
    { lang: 'tg', editMode: 'full' },
  );
  assert.match(renderedFull, /Мактаби &lt;Тест&gt; № 1/);
  assert.match(renderedFull, /Саидов М\./);
  assert.match(renderedFull, /sm-doc-auto-table/);

  const renderedFields = renderTemplateWithAutofill(
    '<p>Ба: {{director.full_name}}</p>',
    { director: { full_name: 'Каримов А.' } },
    { editMode: 'fields_only' },
  );
  assert.match(renderedFields, /contenteditable="true"/);

  // 4. Gzip round-trip
  const packed = compressDocPayload({
    title: 'Нақша',
    html: renderedFull,
    pageOrientation: 'landscape',
    pageMarginsMm: { top: 12, right: 12, bottom: 12, left: 12 },
  });
  const unpacked = decompressDocPayload(packed.gzipB64);
  assert.equal(unpacked.pageOrientation, 'landscape');
  assert.equal(unpacked.pageMarginsMm.top, 12);
  assert.match(unpacked.html, /Саидов М\./);
});

test('Pro Storage Pack pricing (+10 TJS/mo) and Windows/Android native capture & print protections', async () => {
  assert.equal(STORAGE_PACK_PRICE_TJS, 10);
  const calc = computePositionTariffTotal({
    primaryPosition: 'school-teacher',
    storagePackCount: 2,
  });
  assert.equal(calc.storagePackPrice, 20);
  assert.equal(calc.totalTjs, calc.basePrice + 20);

  const pkg = computeSubscriptionPackagePrice({
    primaryPosition: 'school-teacher',
    storagePackCount: 1,
    months: 12,
  });
  assert.equal(pkg.months, 12);
  assert.equal(pkg.discountPct, 15);
  assert.ok(pkg.totalTjs > 0);

  const winMain = await read('../native/windows/main.cjs');
  assert.match(winMain, /setContentProtection\(true\)/);
  assert.match(winMain, /VIRTUAL_PRINTER_RE/);
  assert.match(winMain, /sm:print-protected/);

  const androidMain = await read('../native/android/app/src/main/java/tj/smartmaktab/app/MainActivity.java');
  assert.match(androidMain, /FLAG_SECURE/);
  assert.match(androidMain, /SmartMaktabNative/);
  assert.match(androidMain, /PrintManager/);
});
