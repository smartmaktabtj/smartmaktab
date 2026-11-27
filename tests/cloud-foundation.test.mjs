import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const uid = n => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const q = (sql, args = []) => db.query(sql, args).then(r => r.rows);
const denied = p => assert.rejects(p, { code: '42501' });

async function as(n, fn, role = 'authenticated') {
  await db.exec(`set role ${role}`);
  try {
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(n ? { sub: uid(n), role } : { role })]);
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claims','{}',false)");
  }
}

let raesatId, maorifId, schoolAId, schoolBId;

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
    '../supabase/migrations/20261128000100_stage0_cleanup.sql'
  ]) {
    await db.exec(await read(m));
  }
  for (const [i, name] of ['super_admin', 'maorif', 'school_admin_a', 'teacher_a', 'teacher_b', 'outsider'].entries()) {
    await q('insert into auth.users values ($1,$2,now())', [uid(i + 1), `${name}@example.test`]);
  }
  await q('insert into smartmaktab_private.platform_developers(user_id) values ($1)', [uid(1)]);

  // Provision orgs & memberships strictly through super_admin RPCs
  raesatId = (await as(1, () => q("select public.admin_upsert_organization('Раёсати Суғд','education_authority',null,'raesat','Суғд',null,null) as id")))[0].id;
  maorifId = (await as(1, () => q("select public.admin_upsert_organization('Маорифи Хуҷанд','education_authority',null,'maorif','Суғд','Хуҷанд',null) as id")))[0].id;
  schoolAId = (await as(1, () => q("select public.admin_upsert_organization('МТМУ № 1','school',$1,null,'Суғд','Хуҷанд','MTMU-01') as id", [maorifId])))[0].id;
  schoolBId = (await as(1, () => q("select public.admin_upsert_organization('МТМУ № 2','school',null,null,'Суғд','Истаравшан','MTMU-02') as id")))[0].id;

  await as(1, () => q("select public.admin_assign_membership($1,$2,'maorif')", [uid(2), maorifId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'school_admin')", [uid(3), schoolAId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'teacher')", [uid(4), schoolAId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'teacher')", [uid(5), schoolBId]));
});

after(() => db.close());

test('super_admin, maorif, school_admin, teacher roles and workspace context isolate schools', async () => {
  await denied(as(4, () => q("select public.admin_upsert_organization('Hack','school')")));
  await denied(as(3, () => q("select public.admin_assign_membership($1,$2,'school_admin')", [uid(6), schoolAId])));

  const ctxAdmin = (await as(1, () => q('select public.get_my_workspace_context() as ctx')))[0].ctx;
  assert.equal(ctxAdmin.is_super_admin, true);

  const ctxTeacher = (await as(4, () => q('select public.get_my_workspace_context() as ctx')))[0].ctx;
  assert.equal(ctxTeacher.is_super_admin, false);
  assert.equal(ctxTeacher.memberships.length, 1);
  assert.equal(ctxTeacher.memberships[0].role, 'teacher');
  assert.equal(ctxTeacher.memberships[0].school_code, 'MTMU-01');

  const maorifOrgs = await as(2, () => q('select id from public.organizations order by id'));
  assert.deepEqual(new Set(maorifOrgs.map(r => r.id)), new Set([maorifId, schoolAId]));

  await as(4, () => q("select public.upsert_my_profile('Омӯзгор А','tg')"));
  const prof = (await as(4, () => q('select public.get_my_workspace_context() as ctx')))[0].ctx.profile;
  assert.equal(prof.full_name, 'Омӯзгор А');
  assert.equal(prof.preferred_lang, 'tg');
});

test('school workspace records save, isolate cross-school, soft-delete and restore via audited RPCs', async () => {
  const recId = (await as(4, () => q("select public.save_school_record($1,'lesson_plan','Нақшаи 5А',$2) as id", [schoolAId, JSON.stringify({ classCode: '5А', subject: 'informatics' })])))[0].id;
  await denied(as(5, () => q('select * from public.get_school_records_detail($1)', [schoolAId])));
  const rowsA = await as(4, () => q('select id,title,payload from public.get_school_records_detail($1)', [schoolAId]));
  assert.equal(rowsA.length, 1);
  assert.equal(rowsA[0].payload.classCode, '5А');

  await as(4, () => q('select public.set_school_record_deleted($1,$2,true)', [schoolAId, recId]));
  assert.equal((await as(4, () => q('select id from public.get_school_records_detail($1)', [schoolAId]))).length, 0);
  assert.equal((await as(4, () => q('select id from public.get_school_records_detail($1,null,true)', [schoolAId]))).length, 1);
  await as(4, () => q('select public.set_school_record_deleted($1,$2,false)', [schoolAId, recId]));
  assert.equal((await as(4, () => q('select id from public.get_school_records_detail($1)', [schoolAId]))).length, 1);
});

test('physical library circulation blocks double-lending and double-return transactionally', async () => {
  const bookId = (await as(3, () => q("select public.manage_library_book($1,'INV-100','Алгебра 11','Муаллиф',1) as id", [schoolAId])))[0].id;
  await denied(as(5, () => q("select public.manage_library_loan($1,'lend',$2,null,'R-1','Хонанда','2026-11-25','2026-12-05')", [schoolAId, bookId])));

  const loanId = (await as(3, () => q("select public.manage_library_loan($1,'lend',$2,null,'R-1','Хонанда','2026-11-25','2026-12-05') as id", [schoolAId, bookId])))[0].id;
  await assert.rejects(as(3, () => q("select public.manage_library_loan($1,'lend',$2,null,'R-2','Хонанда 2','2026-11-25','2026-12-05')", [schoolAId, bookId])), { code: '55000' });

  await as(3, () => q("select public.manage_library_loan($1,'return',null,$2,null,null,'2026-11-26',null)", [schoolAId, loanId]));
  await assert.rejects(as(3, () => q("select public.manage_library_loan($1,'return',null,$2,null,null,'2026-11-26',null)", [schoolAId, loanId])), { code: '55000' });
  const book = (await as(3, () => q('select available_copies from public.library_books where id=$1', [bookId])))[0];
  assert.equal(book.available_copies, 1);
});

test('licensing 30-day offline grace, anti-duplicate receipt hash, and super_admin review work safely', async () => {
  const noneLic = (await as(3, () => q('select public.get_license_status($1) as s', [schoolAId])))[0].s;
  assert.equal(noneLic.access_allowed, false);

  // Set an expired license within the 30-day grace window (-5 days)
  await as(1, () => q("select public.admin_set_license($1,'active','annual',now() - interval '5 days',30,'test grace')", [schoolAId]));
  const graceLic = (await as(3, () => q('select public.get_license_status($1) as s', [schoolAId])))[0].s;
  assert.equal(graceLic.effective_status, 'grace');
  assert.equal(graceLic.access_allowed, true);
  assert.ok(graceLic.grace_days_left >= 24 && graceLic.grace_days_left <= 26);

  // Set an expired license beyond 30-day grace window (-35 days)
  await as(1, () => q("select public.admin_set_license($1,'active','annual',now() - interval '35 days',30,'expired')", [schoolAId]));
  const expLic = (await as(3, () => q('select public.get_license_status($1) as s', [schoolAId])))[0].s;
  assert.equal(expLic.effective_status, 'expired');
  assert.equal(expLic.access_allowed, false);

  // Submit receipt + prevent duplicate receipt hash + super_admin verify activates license
  const receiptHash = 'a'.repeat(64);
  const payId = (await as(3, () => q("select public.submit_payment_receipt($1,$2,'manual',120,'TJS','Чек 120 сомонӣ',0.91,$3) as id", [schoolAId, receiptHash, JSON.stringify({ amount: 120 })])))[0].id;
  await assert.rejects(as(3, () => q("select public.submit_payment_receipt($1,$2,'manual',120,'TJS','Чек 120 сомонӣ',0.91,$3)", [schoolAId, receiptHash, '{}'])), { code: '23505' });
  await denied(as(3, () => q("select public.admin_review_payment($1,'verified','hack',365,'annual')", [payId])));

  await as(1, () => q("select public.admin_review_payment($1,'verified','OK',30,'monthly')", [payId]));
  const activeLic = (await as(3, () => q('select public.get_license_status($1) as s', [schoolAId])))[0].s;
  assert.equal(activeLic.effective_status, 'active');
  assert.equal(activeLic.access_allowed, true);
  assert.ok(activeLic.days_left >= 29);

  // Default 10 TJS / +992 907972295 tariff, duplicate transaction_id block, and server-OCR auto-activation
  const plans = await as(3, () => q('select code, price_tjs::float8 as price, duration_days, recipient_phone, recipient_account from public.subscription_plans'));
  assert.equal(plans[0].code, 'trial_10');
  assert.equal(plans[0].price, 10);
  assert.equal(plans[0].duration_days, 30);
  assert.equal(plans[0].recipient_account, '992907972295');

  await denied(as(3, () => q("select public.admin_upsert_subscription_plan('trial_10','T','R',25,30,'+992 907972295')")));
  await as(1, () => q("select public.admin_upsert_subscription_plan('trial_10','Обунаи озмоишӣ','Пробный тариф',10,30,'+992 907972295')"));

  const hash2 = 'b'.repeat(64);
  const hash3 = 'c'.repeat(64);
  await as(3, () => q(
    "select public.submit_payment_receipt($1,$2,'dcity',10,'TJS','Сумма операции: 10.00',0.95,$3,'2248620182','992907972295',true,'trial_10')",
    [schoolAId, hash2, JSON.stringify({ source: 'ocr_space' })],
  ));
  // Different screenshot bytes (hash3) of the SAME transaction_id must still fail 23505
  await assert.rejects(as(3, () => q(
    "select public.submit_payment_receipt($1,$2,'dcity',10,'TJS','Сумма операции: 10.00',0.95,$3,'2248620182','992907972295',true,'trial_10')",
    [schoolAId, hash3, JSON.stringify({ source: 'ocr_space' })],
  )), { code: '23505' });

  const autoSub = (await as(1, () => q("select status, transaction_id, recipient_account from public.payment_submissions where receipt_hash=$1", [hash2])))[0];
  assert.equal(autoSub.status, 'verified');
  assert.equal(autoSub.transaction_id, '2248620182');
  assert.equal(autoSub.recipient_account, '992907972295');
});

test('authenticated orgs parent_id/memberships created_at grants and content_pack_revisions sync/rollback work', async () => {
  const orgCols = await as(1, () => q('select id,name,kind,parent_id,authority_tier,region_name,district_name,school_code,created_at from public.organizations order by name'));
  assert.ok(orgCols.length >= 4);
  const memCols = await as(1, () => q('select id,user_id,organization_id,role,created_at from public.school_memberships order by created_at desc'));
  assert.ok(memCols.length >= 4);

  const packV1 = { schema: 1, sequence: 1, cabinets: { 'school-director': [{ id: 'docs', title: { tg: 'Ҳуҷҷатҳо', ru: 'Документы' }, icon: 'folder', sections: [] }] } };
  const packV2 = { schema: 1, sequence: 2, cabinets: { 'school-director': [{ id: 'docs', title: { tg: 'Нақшаҳо', ru: 'Планы' }, icon: 'book', sections: [] }] } };

  await denied(as(3, () => q("select * from public.admin_save_content_revision($1,'hack')", [JSON.stringify(packV1)])));
  await denied(as(4, () => q('select * from public.admin_list_content_revisions()')));

  const r1 = (await as(1, () => q("select * from public.admin_save_content_revision($1,'Initial pack',0)", [JSON.stringify(packV1)])))[0];
  assert.equal(r1.sequence, 1);
  assert.equal(r1.payload.sequence, 1);

  // Optimistic lock mismatch must raise 40001
  await assert.rejects(as(1, () => q("select * from public.admin_save_content_revision($1,'Stale',0)", [JSON.stringify(packV2)])), { code: '40001' });

  const r2 = (await as(1, () => q("select * from public.admin_save_content_revision($1,'Second version',1)", [JSON.stringify(packV2)])))[0];
  assert.equal(r2.sequence, 2);

  const r3 = (await as(1, () => q("select * from public.admin_rollback_content_revision($1,'Restore initial')", [r1.id])))[0];
  assert.equal(r3.sequence, 3);
  assert.equal(r3.payload.sequence, 3);
  assert.equal(r3.payload.cabinets['school-director'][0].title.ru, 'Документы');

  const marked = (await as(1, () => q("select * from public.admin_mark_content_published($1,'content-v3','https://raw.githubusercontent.com/smartmaktabtj/smartmaktab/main/latest.smupdate')", [r3.id])))[0];
  assert.equal(marked.published_tag, 'content-v3');
});

test('role tariffs, extra position limits, anti-sharing device locks, and organization deletion work', async () => {
  // All 24 roles seeded with individual prices
  const tariffs = await as(3, () => q('select position_code, base_price_tjs::float8 as base, extra_price_tjs::float8 as extra from public.role_tariffs'));
  assert.equal(tariffs.length, 24);

  await denied(as(3, () => q("select public.admin_upsert_role_tariff('school-director', 25, 10, 30, 2, true, true)")));
  await as(1, () => q("select public.admin_upsert_role_tariff('school-director', 25, 10, 30, 2, true, true)"));
  const dirTariff = (await as(3, () => q("select base_price_tjs::float8 as b, extra_price_tjs::float8 as e, default_max_devices from public.role_tariffs where position_code='school-director'")))[0];
  assert.equal(dirTariff.b, 25);
  assert.equal(dirTariff.e, 10);
  assert.equal(dirTariff.default_max_devices, 2);

  // Assign teacher_a (uid 4) to schoolAId with 1 device max, primary=school-teacher, extra=['school-class-teacher']
  await as(1, () => q(
    "select public.admin_assign_membership($1,$2,'teacher','school-teacher',$3,1,1,true)",
    [uid(4), schoolAId, ['school-class-teacher']],
  ));

  const ctx4 = (await as(4, () => q('select public.get_my_workspace_context() as c')))[0].c;
  assert.equal(ctx4.memberships[0].primary_position, 'school-teacher');
  assert.deepEqual(ctx4.memberships[0].extra_positions, ['school-class-teacher']);
  assert.equal(ctx4.memberships[0].max_devices, 1);

  // Claim device 1 on permitted cabinets -> allowed
  const d1Teacher = (await as(4, () => q("select public.claim_device_session($1,'dev-alpha','Phone A','school-teacher') as r", [schoolAId])))[0].r;
  assert.equal(d1Teacher.allowed, true);
  assert.equal(d1Teacher.active_devices, 1);

  const d1Extra = (await as(4, () => q("select public.claim_device_session($1,'dev-alpha','Phone A','school-class-teacher') as r", [schoolAId])))[0].r;
  assert.equal(d1Extra.allowed, true);

  // Opening unpurchased cabinet on same device -> position_not_allowed
  const d1Director = (await as(4, () => q("select public.claim_device_session($1,'dev-alpha','Phone A','school-director') as r", [schoolAId])))[0].r;
  assert.equal(d1Director.allowed, false);
  assert.equal(d1Director.reason, 'position_not_allowed');

  // Sharing login+password with a second device -> device_limit_reached
  const d2Blocked = (await as(4, () => q("select public.claim_device_session($1,'dev-beta','Phone B','school-teacher') as r", [schoolAId])))[0].r;
  assert.equal(d2Blocked.allowed, false);
  assert.equal(d2Blocked.reason, 'device_limit_reached');

  // Reset devices by super_admin -> second device can now claim
  await denied(as(4, () => q('select public.admin_reset_user_devices($1,$2,null)', [uid(4), schoolAId])));
  await as(1, () => q('select public.admin_reset_user_devices($1,$2,null)', [uid(4), schoolAId]));
  const d2Allowed = (await as(4, () => q("select public.claim_device_session($1,'dev-beta','Phone B','school-teacher') as r", [schoolAId])))[0].r;
  assert.equal(d2Allowed.allowed, true);

  // Disabled account cannot claim session
  await as(1, () => q("select public.admin_assign_membership($1,$2,'teacher','school-teacher',$3,1,1,false)", [uid(4), schoolAId, ['school-class-teacher']]));
  const disabledClaim = (await as(4, () => q("select public.claim_device_session($1,'dev-beta','Phone B','school-teacher') as r", [schoolAId])))[0].r;
  assert.equal(disabledClaim.allowed, false);
  assert.equal(disabledClaim.reason, 'account_disabled');

  // Organization deletion: empty org deletes directly, org with dependencies requires force=true
  const emptyOrgId = (await as(1, () => q("select public.admin_upsert_organization('Test 45','school',$1,null,'Хатлон','Дангара','DEL-45') as id", [maorifId])))[0].id;
  const normalizedDistrict = (await as(1, () => q('select district_name from public.organizations where id=$1', [emptyOrgId])))[0].district_name;
  assert.ok(['Дангара', 'Данғара'].includes(normalizedDistrict));
  await denied(as(3, () => q('select public.admin_delete_organization($1,false)', [emptyOrgId])));
  await as(1, () => q('select public.admin_delete_organization($1,false)', [emptyOrgId]));
  assert.equal((await as(1, () => q('select id from public.organizations where id=$1', [emptyOrgId]))).length, 0);

  // Force delete removes org with memberships, library books/loans, licenses, payments, device sessions
  await assert.rejects(as(1, () => q('select public.admin_delete_organization($1,false)', [schoolAId])), /organization_has_data/);
  await as(1, () => q('select public.admin_delete_organization($1,true)', [schoolAId]));
  assert.equal((await as(1, () => q('select id from public.organizations where id=$1', [schoolAId]))).length, 0);
});

test('phone/login canonicalization aligns client & Edge Functions and Android WebView permits Supabase host', async () => {
  const { normalizeLoginIdentifier } = await import('../shared/position-catalog.mjs');

  // All 3 forms of a Tajik mobile number must canonicalize identically
  for (const variant of ['+992 92 700 11 22', '992927001122', '92-700-11-22', '927001122']) {
    const parsed = normalizeLoginIdentifier(variant);
    assert.equal(parsed.valid, true, variant);
    assert.equal(parsed.email, '927001122@login.smartmaktab.tj', variant);
  }
  const lat = normalizeLoginIdentifier('Alijon_2026');
  assert.equal(lat.valid, true);
  assert.equal(lat.email, 'alijon_2026@login.smartmaktab.tj');
  const mail = normalizeLoginIdentifier('Teacher@Example.TJ');
  assert.equal(mail.valid, true);
  assert.equal(mail.email, 'teacher@example.tj');
  assert.equal(normalizeLoginIdentifier('Алиҷон').valid, false);

  // Edge Functions must include the exact 992 -> 9-digit canonicalization
  for (const fnPath of ['../supabase/functions/register-user/index.ts', '../supabase/functions/admin-users/index.ts']) {
    const src = await read(fnPath);
    assert.match(src, /\^992\(\\d\{9\}\)\$/, `${fnPath} missing 992 Tajik phone canonicalization`);
  }

  // Android WebView shouldInterceptRequest must allow Supabase subrequests (not return 404 missing())
  const java = await read('../native/android/app/src/main/java/tj/smartmaktab/app/MainActivity.java');
  assert.match(java, /SUPABASE_HOST\s*=\s*"waorfkkavzzpbrsvjjln\.supabase\.co"/);
  assert.match(java, /cloud\(Uri u\)/);
  assert.match(java, /if\s*\(\s*r\.isForMainFrame\(\)\s*\)\s*return missing\(\);[\s\S]*cloud\(u\)/);
});


