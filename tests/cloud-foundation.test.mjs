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
    '../supabase/migrations/20261125000200_roles_library_licensing.sql'
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
  assert.deepEqual(prof, { full_name: 'Омӯзгор А', preferred_lang: 'tg' });
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
});
