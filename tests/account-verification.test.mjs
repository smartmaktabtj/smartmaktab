import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  SUBSCRIPTION_PERIOD_PACKAGES,
  canPositionVerifySchoolStaff,
  computeSubscriptionPackagePrice,
} from '../shared/position-catalog.mjs';
import { evaluateLicenseState, mountLicenseGate } from '../shared/license-guard.mjs';
import { submitReceiptForVerification } from '../shared/ocr-receipt.mjs';

const db = new PGlite();
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
const uid = n => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
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

let raesatId, maorifId, schoolId, otherSchoolId;

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
  ]) {
    await db.exec(await read(m));
  }

  for (const [i, name] of ['super_admin', 'maorif', 'director', 'deputy', 'teacher', 'accountant', 'other_director'].entries()) {
    await q('insert into auth.users values ($1,$2,now())', [uid(i + 1), `${name}@example.test`]);
  }
  await q('insert into smartmaktab_private.platform_developers(user_id) values ($1)', [uid(1)]);

  raesatId = (await as(1, () => q("select public.admin_upsert_organization('Раёсати Суғд','education_authority',null,'raesat','Суғд',null,null) as id")))[0].id;
  maorifId = (await as(1, () => q("select public.admin_upsert_organization('Маорифи Исфара','education_authority',$1,'maorif','Суғд','Исфара',null) as id", [raesatId])))[0].id;
  schoolId = (await as(1, () => q("select public.admin_upsert_organization('МТМУ № 12','school',$1,null,'Суғд','Исфара','SCH-12',null,'Ворух','Ворух') as id", [maorifId])))[0].id;
  otherSchoolId = (await as(1, () => q("select public.admin_upsert_organization('МТМУ № 99','school',$1,null,'Суғд','Исфара','SCH-99',null,'Чоркӯҳ','Чоркӯҳ') as id", [maorifId])))[0].id;

  // Mark schoolId initially pending (as if self-registered)
  await q("update public.organizations set verification_status='pending' where id=$1", [schoolId]);

  await as(1, () => q("select public.admin_assign_membership($1,$2,'maorif','office-head',array[]::text[],0,2,true)", [uid(2), maorifId]));
  // Director, Deputy, Teacher, Accountant all start unverified with 30-day trial
  await as(1, () => q("select public.admin_assign_membership($1,$2,'director','school-director',array['school-five-method-groups']::text[],1,1,true)", [uid(3), schoolId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'deputy','school-academic-deputy',array[]::text[],0,1,true)", [uid(4), schoolId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'teacher','school-teacher',array[]::text[],0,1,true)", [uid(5), schoolId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'staff','school-accountant',array[]::text[],0,1,true)", [uid(6), schoolId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'director','school-director',array[]::text[],0,1,true)", [uid(7), otherSchoolId]));

  // Simulate newly registered unverified school users with 30-day free trial
  await q("update public.school_memberships set verification_status='verified' where user_id=$1", [uid(2)]);
  await q("update public.school_memberships set verification_status='unverified', subscription_status='trial', subscription_expires_at=now() + interval '30 days' where user_id in ($1,$2,$3,$4,$5)", [uid(3), uid(4), uid(5), uid(6), uid(7)]);
});

after(() => db.close());

test('Tajikistan locations table schema, Stage 0 tariff seed (24 positions), and generated parent_kind guard', async () => {
  const bootstrap = (await as(0, () => q('select public.get_registration_bootstrap() as b'), 'anon'))[0].b;
  assert.equal(bootstrap.tariffs.length, 20);
  const allTariffs = await as(1, () => q('select position_code from public.role_tariffs order by sort_order'));
  assert.equal(allTariffs.length, 24);
  assert.ok(allTariffs.some(r => r.position_code === 'office-clerk'));
  assert.ok(allTariffs.some(r => r.position_code === 'raesat-clerk'));
  assert.ok(Array.isArray(bootstrap.locations));

  const mig5 = await read('../supabase/migrations/20261126000500_account_verification.sql');
  assert.equal(/\bparent_kind\s*=/.test(mig5), false);
});

test('Subscription package discounts (0/3/5/10/15%), trial expiry lock, and primary-only payment button', async () => {
  assert.deepEqual(SUBSCRIPTION_PERIOD_PACKAGES.map(p => [p.months, p.discountPct]), [
    [1, 0],
    [3, 3],
    [6, 5],
    [9, 10],
    [12, 15],
  ]);

  assert.equal(computeSubscriptionPackagePrice(100, 1).totalTjs, 100);
  assert.equal(computeSubscriptionPackagePrice(100, 3).totalTjs, 291); // 300 * 0.97
  assert.equal(computeSubscriptionPackagePrice(100, 3).savedTjs, 9);
  assert.equal(computeSubscriptionPackagePrice(100, 6).totalTjs, 570); // 600 * 0.95
  assert.equal(computeSubscriptionPackagePrice(100, 9).totalTjs, 810); // 900 * 0.90
  assert.equal(computeSubscriptionPackagePrice(100, 12).totalTjs, 1020); // 1200 * 0.85
  assert.equal(computeSubscriptionPackagePrice(100, 12).savedTjs, 180);
  assert.equal(
    computeSubscriptionPackagePrice({
      primaryPosition: 'school-director',
      tariffs: [{ position_code: 'school-director', base_price_tjs: 50 }],
      months: 12,
    }).totalTjs,
    510,
  );

  // Trial expires with grace_days=0 -> hard lock with trial_expired
  const now = Date.UTC(2026, 10, 26, 0, 0, 0);
  const trialValid = evaluateLicenseState({
    configured: true,
    status: 'trial',
    expires_at: new Date(now + 10 * 86_400_000).toISOString(),
    grace_days: 0,
  }, now);
  assert.equal(trialValid.allowed, true);
  assert.equal(trialValid.status, 'trial');

  const trialExpired = evaluateLicenseState({
    configured: true,
    status: 'trial',
    expires_at: new Date(now - 60_000).toISOString(),
    grace_days: 0,
  }, now);
  assert.equal(trialExpired.allowed, false);
  assert.equal(trialExpired.reason, 'trial_expired');

  // submitReceiptForVerification passes months cleanly
  let postedBody = null;
  await submitReceiptForVerification({
    accessToken: 'jwt',
    organizationId: '11111111-1111-1111-1111-111111111111',
    bytes: new Uint8Array([1, 2, 3]),
    months: 6,
    fetchImpl: async (_url, init) => {
      postedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ submission_id: 's1' }), { status: 200 });
    },
  });
  assert.equal(postedBody.months, 6);

  // mountLicenseGate hides Pay button on extra position while showing status lock banner
  const prevDoc = globalThis.document;
  const makeNode = tag => ({
    tagName: tag.toUpperCase(),
    children: [],
    className: '',
    textContent: '',
    hidden: false,
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    addEventListener() {},
    append(...xs) { this.children.push(...xs); },
    replaceChildren(...xs) { this.children = [...xs]; },
  });
  globalThis.document = {
    documentElement: { lang: 'ru' },
    createElement: tag => makeNode(tag),
  };
  try {
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    const { cacheVerifiedLicense } = await import('../shared/license-guard.mjs');
    cacheVerifiedLicense('org-x', {
      configured: true,
      status: 'trial',
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      grace_days: 0,
      primary_position: 'school-director',
      extra_positions: ['school-five-method-groups'],
    }, storage);

    const hostPrimary = makeNode('div');
    mountLicenseGate(hostPrimary, {
      orgId: 'org-x',
      cabinetId: 'school-director',
      storage,
      isPrimaryPosition: true,
      primaryPosition: 'school-director',
      onVerifyOnline: () => {},
      onOpenPayment: () => {},
    });
    const primaryTexts = JSON.stringify(hostPrimary);
    assert.match(primaryTexts, /Тариф и оплата/);

    const hostExtra = makeNode('div');
    mountLicenseGate(hostExtra, {
      orgId: 'org-x',
      cabinetId: 'school-five-method-groups',
      storage,
      isPrimaryPosition: false,
      primaryPosition: 'school-director',
      onVerifyOnline: () => {},
      onOpenPayment: () => {},
    });
    const extraTexts = JSON.stringify(hostExtra);
    assert.equal(/Тариф и оплата/.test(extraTexts), false);
    assert.match(extraTexts, /только в окне вашей основной должности/);
  } finally {
    globalThis.document = prevDoc;
  }
});

test('DB blocks unverified accounts, Maorif verifies/rejects+hard-deletes Director, Director/Deputy verify staff, and packages extend trial', async () => {
  // Unverified teacher & unverified director cannot write DB records
  await denied(as(5, () => q("select public.save_school_record($1,'lesson_plan','T','{}'::jsonb)", [schoolId])));
  await denied(as(3, () => q("select public.upsert_school_students($1,$2::jsonb)", [schoolId, JSON.stringify([{ full_name: 'Али', class_code: '5А' }])])));

  // Invalid birth date format rejected
  await assert.rejects(
    as(3, () => q("select public.submit_account_verification($1,'Директор А','1980-05-15','+992920001122','A123456')", [schoolId])),
    /invalid_birth_date_format/,
  );

  // Director submits verification request
  const dirSubmit1 = (await as(3, () => q("select public.submit_account_verification($1,'Каримов Бахтиёр','15.05.1980','+992920001122','A7654321') as r", [schoolId])))[0].r;
  const dirReq1 = dirSubmit1.request_id;
  const dirMem1 = dirSubmit1.membership_id;
  const ctxDirPending = (await as(3, () => q('select public.get_my_workspace_context() as c')))[0].c;
  assert.equal(ctxDirPending.memberships[0].verification_status, 'pending');

  // Unverified teacher/director/other school director cannot view or review requests
  await denied(as(5, () => q('select public.get_pending_account_verifications($1)', [schoolId])));
  await denied(as(3, () => q("select public.review_account_verification($1,'verified')", [dirMem1])));
  await denied(as(7, () => q("select public.review_account_verification($1,'verified')", [dirMem1])));

  // Maorif sees Director request & rejects -> row is HARD DELETED and director status becomes 'rejected'
  const qByMaorif = (await as(2, () => q('select public.get_pending_account_verifications(null) as rows')))[0].rows;
  assert.equal(qByMaorif.length, 1);
  assert.equal(qByMaorif[0].full_name, 'Каримов Бахтиёр');
  assert.equal(qByMaorif[0].membership_id, dirMem1);

  const rejRes = (await as(2, () => q("select public.review_account_verification($1,'rejected','Нужна справка') as r", [dirMem1])))[0].r;
  assert.equal(rejRes.request_deleted, true);
  assert.equal((await q('select count(*)::int as cnt from public.account_verification_requests where id=$1', [dirReq1]))[0].cnt, 0);

  const ctxDirRej = (await as(3, () => q('select public.get_my_workspace_context() as c')))[0].c;
  assert.equal(ctxDirRej.memberships[0].verification_status, 'rejected');
  await denied(as(3, () => q("select public.save_school_record($1,'lesson_plan','Still blocked','{}'::jsonb)", [schoolId])));

  // Director re-submits -> Maorif approves -> both Director and School become verified
  const dirSubmit2 = (await as(3, () => q("select public.submit_account_verification($1,'Каримов Бахтиёр','15.05.1980','+992920001122','A7654321') as r", [schoolId])))[0].r;
  await as(2, () => q("select public.review_account_verification($1,'verified')", [dirSubmit2.membership_id]));

  const ctxDirOk = (await as(3, () => q('select public.get_my_workspace_context() as c')))[0].c;
  assert.equal(ctxDirOk.memberships[0].verification_status, 'verified');
  assert.equal((await q('select verification_status from public.organizations where id=$1', [schoolId]))[0].verification_status, 'verified');

  // Now verified Director can write to DB!
  const recId = (await as(3, () => q("select public.save_school_record($1,'director_plan','Нақшаи солона','{}'::jsonb) as id", [schoolId])))[0].id;
  assert.ok(recId);

  // Teacher & Deputy & Accountant submit requests
  const depSubmit = (await as(4, () => q("select public.submit_account_verification($1,'Муовин Салима','01.02.1985','927112233','B111222') as r", [schoolId])))[0].r;
  const teaSubmit = (await as(5, () => q("select public.submit_account_verification($1,'Омӯзгор Зафар','20.10.1990','928334455','C333444') as r", [schoolId])))[0].r;

  // Accountant cannot verify staff even if verified
  assert.equal(canPositionVerifySchoolStaff('school-accountant'), false);
  assert.equal(canPositionVerifySchoolStaff('school-academic-deputy'), true);
  assert.equal(canPositionVerifySchoolStaff('school-director'), true);
  await denied(as(6, () => q("select public.review_account_verification($1,'verified')", [teaSubmit.membership_id])));

  // Verified Director approves Deputy; then verified Deputy approves Teacher!
  await as(3, () => q("select public.review_account_verification($1,'verified')", [depSubmit.membership_id]));
  const qByDep = (await as(4, () => q('select public.get_pending_account_verifications($1) as rows', [schoolId])))[0].rows;
  assert.ok(qByDep.some(r => r.membership_id === teaSubmit.membership_id));
  await as(4, () => q("select public.review_account_verification($1,'verified')", [teaSubmit.membership_id]));

  // Verified Teacher can now write DB records
  const tRec = (await as(5, () => q("select public.save_school_record($1,'lesson_plan','Дарси 1','{}'::jsonb) as id", [schoolId])))[0].id;
  assert.ok(tRec);

  // Prepaying 6 months during active 30-day trial adds 180 days on top of remaining 30 days (~210 days)
  const payHash = 'f'.repeat(64);
  const payId = (await as(3, () => q(
    "select public.submit_payment_receipt($1,$2,'dcity',285,'TJS','Сумма операции: 285.00',0.95,'{}'::jsonb,'TX-6M-01','992907972295',false,'trial_10','school-director',array[]::text[],false,6) as id",
    [schoolId, payHash],
  )))[0].id;
  await as(1, () => q("select public.admin_review_payment($1,'verified','OK 6m',180,'monthly')", [payId]));

  const licAfter = (await as(3, () => q('select public.get_license_status($1) as s', [schoolId])))[0].s;
  assert.equal(licAfter.effective_status, 'active');
  assert.ok(licAfter.days_left >= 208 && licAfter.days_left <= 211, `expected ~210 days, got ${licAfter.days_left}`);

  const ctxAfterPay = (await as(3, () => q('select public.get_my_workspace_context() as c')))[0].c;
  assert.equal(ctxAfterPay.memberships[0].subscription_months, 6);
  assert.equal(ctxAfterPay.memberships[0].subscription_status, 'active');
});

test('anon and service_role can call public.get_registration_bootstrap(), and only service_role can call service_register_account()', async () => {
  for (const role of ['anon', 'service_role']) {
    const boot = (await as(0, () => q('select public.get_registration_bootstrap() as b'), role))[0].b;
    assert.ok(Array.isArray(boot.schools) && boot.schools.length >= 2);
    assert.ok(Array.isArray(boot.authorities) && boot.authorities.length >= 2);
    assert.ok(Array.isArray(boot.tariffs) && boot.tariffs.length >= 10);
    assert.ok(Array.isArray(boot.locations));
    assert.equal(boot.aliya_price_tjs, 30);
  }

  // Direct table access for anon and service_role must remain strictly denied
  for (const role of ['anon', 'service_role']) {
    await denied(as(0, () => q('select id from public.organizations'), role));
    await denied(as(0, () => q('select id from public.tajikistan_locations'), role));
    await denied(as(0, () => q('select position_code from public.role_tariffs'), role));
  }

  // service_register_account is forbidden for anon & authenticated
  const newUid = uid(88);
  await q('insert into auth.users values ($1,$2,now())', [newUid, 'new_reg@example.test']);
  await denied(as(0, () => q("select public.service_register_account($1,null,'{}'::jsonb,'school-director')", [newUid]), 'anon'));
  await denied(as(3, () => q("select public.service_register_account($1,null,'{}'::jsonb,'school-director')", [newUid]), 'authenticated'));

  // service_role provisions a new school (auto-matching Maorif even with "ш." prefix), profile, and trial membership
  const regOut = (await as(0, () => q(
    "select public.service_register_account($1,null,$2::jsonb,'school-director',array['school-teacher']::text[],'Навбаҳор Азиз','tg','aziz88','',jsonb_build_object('requested_aliya',true),'{}'::jsonb) as r",
    [
      newUid,
      JSON.stringify({ name: 'МТМУ № 888', region_name: 'Вилояти Суғд', district_name: 'ш. Исфара', jamoat_name: 'Ворух', village_name: 'Ворух' }),
    ],
  ), 'service_role'))[0].r;

  assert.equal(regOut.school?.name, 'МТМУ № 888');
  assert.equal(regOut.school?.parent_id, maorifId);
  assert.equal(regOut.school?.verification_status, 'pending');
  assert.equal(regOut.created_school, true);

  const ctxNew = (await as(88, () => q('select public.get_my_workspace_context() as c')))[0].c;
  assert.equal(ctxNew.profile.full_name, 'Навбаҳор Азиз');
  assert.equal(ctxNew.memberships[0].organization_id, regOut.school.id);
  assert.equal(ctxNew.memberships[0].verification_status, 'unverified');
  assert.equal(ctxNew.memberships[0].subscription_status, 'trial');
});
