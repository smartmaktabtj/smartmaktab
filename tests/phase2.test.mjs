import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { zipSync, strToU8 } from 'fflate';
import {
  parseStudentImportFile,
  buildStudentsCsv,
  buildSimpleDocxBytes,
  formatBirthDateDisplay,
} from '../shared/spreadsheet-import.mjs';
import {
  computeMonthlyPayroll,
  computeGradeMetrics,
  buildMonthCalendar,
  TAHLIL_SUBJECTS_BY_CLASS,
  getSubjectsForClassCode,
  roundTajikGrade,
  computeTahlilScore,
  computePeriodDatesStatus,
} from '../shared/phase2-store.mjs';

function makeTestXlsxBytes() {
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="8" uniqueCount="8">`
    + `<si><t>Ному насаб</t></si><si><t>Синф</t></si><si><t>Соли таваллуд</t></si><si><t>Ҷинс</t></si>`
    + `<si><t>Раҳимов Далер</t></si><si><t>7Б</t></si><si><t>Писар</t></si><si><t>Каримова Мадина</t></si>`
    + `</sst>`;
  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`
    + `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>`
    + `<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2"><v>2012</v></c><c r="D2" t="s"><v>6</v></c></row>`
    + `<row r="3"><c r="A3" t="s"><v>7</v></c><c r="B3" t="inlineStr"><is><t>7Б</t></is></c><c r="C3"><v>2012</v></c><c r="D3" t="inlineStr"><is><t>Духтар</t></is></c></row>`
    + `</sheetData></worksheet>`;
  return zipSync({
    'xl/sharedStrings.xml': strToU8(sharedStrings),
    'xl/worksheets/sheet1.xml': strToU8(sheet1),
  });
}

test('Phase 2 unit: Word (.docx), Excel (.xlsx), and CSV import/export round-trip cleanly', () => {
  const docxBytes = buildSimpleDocxBytes(
    'Рӯйхати хонандагон',
    ['№', 'Ному насаб', 'Синф', 'Соли таваллуд'],
    [
      ['1', 'Алиев Беҳрӯз', '5А', '2014'],
      ['2', 'Сафарова Нигина', '5А', '2015'],
    ],
  );
  const docxRes = parseStudentImportFile(docxBytes, '5a-students.docx', '5А');
  assert.equal(docxRes.format, 'docx');
  assert.equal(docxRes.rows.length, 2);
  assert.equal(docxRes.rows[0].full_name, 'Алиев Беҳрӯз');
  assert.equal(docxRes.rows[0].class_code, '5А');
  assert.equal(docxRes.rows[0].birth_year, 2014);

  const xlsxBytes = makeTestXlsxBytes();
  const xlsxRes = parseStudentImportFile(xlsxBytes, '7b.xlsx', '7Б');
  assert.equal(xlsxRes.format, 'xlsx');
  assert.equal(xlsxRes.rows.length, 2);
  assert.equal(xlsxRes.rows[0].full_name, 'Раҳимов Далер');
  assert.equal(xlsxRes.rows[0].gender, 'male');
  assert.equal(xlsxRes.rows[1].full_name, 'Каримова Мадина');
  assert.equal(xlsxRes.rows[1].gender, 'female');

  const csvStr = buildStudentsCsv(xlsxRes.rows);
  const csvRes = parseStudentImportFile(csvStr, 'export.csv', '7Б');
  assert.equal(csvRes.format, 'csv');
  assert.equal(csvRes.rows.length, 2);
  assert.equal(csvRes.rows[1].birth_year, 2012);
});

test('Phase 2 unit: Accountant payroll tariffs, category bonuses, and calendar exclusions compute accurately', () => {
  const calBase = buildMonthCalendar('2026-11', [0], []);
  assert.equal(calBase.daysInMonth, 30);
  assert.equal(calBase.possibleWorkingDays, 25); // Nov 2026 has 5 Sundays (1,8,15,22,29)
  assert.equal(calBase.effectiveWorkingDays, 25);

  const calHoliday = buildMonthCalendar('2026-11', [0], ['2026-11-06', '2026-11-16', '2026-11-24']);
  assert.equal(calHoliday.excludedHolidayWorkingDays, 3);
  assert.equal(calHoliday.effectiveWorkingDays, 22);

  const workloads = [
    { teacher_name: 'Омӯзгор 1', category: 'higher', weekly_hours: 18, class_leadership: true, notebook_check: false },
    { teacher_name: 'Омӯзгор 2', category: 'none', weekly_hours: 9, class_leadership: false, notebook_check: true },
  ];
  const cfg = {
    base_rate_18h_tjs: 1800,
    category_bonus_pct: { higher: 20, first: 15, second: 10, none: 0 },
    class_leadership_tjs: 180,
    notebook_check_tjs: 120,
    income_tax_pct: 13,
    social_tax_pct: 1,
    holiday_dates: ['2026-11-06'],
    excluded_weekdays: [0],
    pro_rate_holidays: true,
  };
  const out = computeMonthlyPayroll(cfg, workloads, '2026-11');
  assert.equal(out.calendar.effectiveWorkingDays, 24);
  // 1800 * (24/25) = 1728 base + 20% (345.6) + 180 = 2253.6 gross; tax 292.97 + social 22.54 = 315.51 -> net 1938.09
  assert.equal(out.rows[0].basePay, 1728);
  assert.equal(out.rows[0].categoryBonus, 345.6);
  assert.equal(out.rows[0].grossPay, 2253.6);
  assert.equal(out.rows[0].netPay, 1938.09);
  // 9h = 0.5 stavka * 1728 = 864 + 120 = 984 gross
  assert.equal(out.rows[1].basePay, 864);
  assert.equal(out.rows[1].grossPay, 984);
});

test('Phase 2 unit: Quarter grade metrics follow 10-point quality (>=8) and pass (>=4) rules', () => {
  const m = computeGradeMetrics([
    { student_name: 'A', grade: 10 },
    { student_name: 'B', grade: 8 },
    { student_name: 'C', grade: 6 },
    { student_name: 'D', grade: 3 },
    { student_name: 'E', grade: null },
  ]);
  assert.equal(m.assessed, 4);
  assert.equal(m.qualityCount, 2);
  assert.equal(m.passedCount, 3);
  assert.equal(m.qualityPct, 50);
  assert.equal(m.passPct, 75);
  assert.equal(m.avgGrade, 6.75);
});

test('Stage 4 unit: birth_date extraction (.docx/.csv/.txt) & Tahlil 10-point calculator/subjects/periods', () => {
  // Birth date parsing: DD.MM.YYYY, YYYY-MM-DD, and year-only
  const txtSample = [
    '№;Ному насаб;Синф;Санаи таваллуд;Ҷинс',
    '1;Сафарова Меҳрона;6А;14.05.2013;Духтар',
    '2;Зоиров Сомон;6А;2013-11-02;Писар',
    '3;Расулова Нилуфар;6А;2013;Д',
  ].join('\n');
  const txtRes = parseStudentImportFile(txtSample, 'students.txt', '6А');
  assert.equal(txtRes.rows.length, 3);
  assert.equal(txtRes.rows[0].birth_date, '2013-05-14');
  assert.equal(txtRes.rows[0].birth_year, 2013);
  assert.equal(txtRes.rows[1].birth_date, '2013-11-02');
  assert.equal(txtRes.rows[2].birth_date, null);
  assert.equal(txtRes.rows[2].birth_year, 2013);
  assert.equal(formatBirthDateDisplay('2013-05-14'), '14.05.2013');

  const csvOut = buildStudentsCsv(txtRes.rows);
  assert.match(csvOut, /14\.05\.2013/);

  // Tahlil rounding, score, prognosis, subjects, and dates
  assert.equal(roundTajikGrade(8.5), 9);
  assert.equal(roundTajikGrade(8.49), 8);
  const sc = computeTahlilScore('8, 9, 7', '9, 8');
  assert.equal(sc.avgCurrent, 8);
  assert.equal(sc.avgControl, 8.5);
  assert.equal(sc.exactAvg, 8.25);
  assert.equal(sc.finalGrade, 8);
  assert.ok(sc.prognosis);
  assert.equal(sc.prognosis.targetGrade, 9);
  assert.equal(sc.prognosis.neededScore, 10);

  assert.ok(Array.isArray(TAHLIL_SUBJECTS_BY_CLASS['1']));
  assert.ok(getSubjectsForClassCode('5А').includes('Математика'));
  assert.ok(getSubjectsForClassCode('11Б').includes('Алгебра'));

  const futureEnd = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const stSoon = computePeriodDatesStatus('2026-09-01', futureEnd);
  assert.equal(stSoon.tone, 'danger');
});

// ============================================================================
// PGlite Full Database RLS, Hierarchy, Verification & Analytics Tests
// ============================================================================
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
    '../supabase/migrations/20261128000100_stage0_cleanup.sql',
    '../supabase/migrations/20261128000200_stage1_locations_tariffs_devices.sql',
    '../supabase/migrations/20261128000300_stage1_registration_payments_quotas.sql',
    '../supabase/migrations/20261128000400_stage1_self_devices_and_users.sql',
    '../supabase/migrations/20261128000500_stage1_fix_assign_membership_and_ctx.sql',
    '../supabase/migrations/20261129000100_stage2_5_cleanup_and_devices.sql',
    '../supabase/migrations/20261130000100_document_library_editor_storage.sql',
    '../supabase/migrations/20261130000200_stage3_pdf_templates_support.sql',
    '../supabase/migrations/20261201000100_stage4_admin_managers_students_tahlil.sql',
  ]) {
    await db.exec(await read(m));
  }
  for (const [i, name] of ['super_admin', 'raesat_head', 'maorif_head', 'director_a', 'teacher_a', 'teacher_b', 'mgr_sughd', 'class_teacher_a'].entries()) {
    await q('insert into auth.users values ($1,$2,now())', [uid(i + 1), `${name}@example.test`]);
  }
  await q('insert into smartmaktab_private.platform_developers(user_id) values ($1)', [uid(1)]);

  raesatId = (await as(1, () => q("select public.admin_upsert_organization('Раёсати Суғд','education_authority',null,'raesat','Суғд',null,null) as id")))[0].id;
  maorifId = (await as(1, () => q("select public.admin_upsert_organization('Маорифи Хуҷанд','education_authority',$1,'maorif','Суғд','Хуҷанд',null) as id", [raesatId])))[0].id;
  schoolAId = (await as(1, () => q("select public.admin_upsert_organization('МТМУ № 1','school',$1,null,'Суғд','Хуҷанд','MTMU-01') as id", [maorifId])))[0].id;
  schoolBId = (await as(1, () => q("select public.admin_upsert_organization('МТМУ № 2','school',null,null,'Хатлон','Бохтар','MTMU-02') as id")))[0].id;

  await as(1, () => q("select public.admin_assign_membership($1,$2,'authority_viewer','raesat-head')", [uid(2), raesatId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'maorif','office-head')", [uid(3), maorifId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'director','school-director')", [uid(4), schoolAId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'teacher','school-teacher')", [uid(5), schoolAId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'teacher','school-teacher')", [uid(6), schoolBId]));
  await as(1, () => q("select public.admin_assign_membership($1,$2,'teacher','school-class-teacher')", [uid(8), schoolAId]));
  await q("insert into public.user_profiles(user_id, full_name, preferred_lang) values ($1,'Устод Карим','tg') on conflict (user_id) do update set full_name=excluded.full_name", [uid(5)]);
  await q("insert into public.user_profiles(user_id, full_name, preferred_lang) values ($1,'Роҳбари синф Нодира','tg') on conflict (user_id) do update set full_name=excluded.full_name", [uid(8)]);
});

after(() => db.close());

test('Phase 2 DB: territory hierarchy & strict RLS across students, workloads, payroll, grades, and anon isolation', async () => {
  // 1) Anon gets zero access to new Phase 2 tables
  for (const tbl of ['school_students', 'teacher_workloads', 'accountant_payroll_configs', 'quarter_grades', 'verification_submissions']) {
    await denied(as(0, () => q(`select * from public.${tbl}`), 'anon'));
  }

  // 2) Raesat can read child Maorif AND schoolA under that Maorif, but NOT schoolB
  const raesatVisibleOrgs = await as(2, () => q('select id from public.organizations order by name'));
  assert.ok(raesatVisibleOrgs.some(o => o.id === raesatId));
  assert.ok(raesatVisibleOrgs.some(o => o.id === maorifId));
  assert.ok(raesatVisibleOrgs.some(o => o.id === schoolAId));
  assert.ok(!raesatVisibleOrgs.some(o => o.id === schoolBId));

  // 3) Students registry RPC + tenant isolation
  await as(5, () => q('select public.upsert_school_students($1,$2)', [
    schoolAId,
    JSON.stringify([{ class_code: '5А', full_name: 'Алиев Беҳрӯз', birth_year: 2014, gender: 'male' }]),
  ]));
  await denied(as(6, () => q('select public.upsert_school_students($1,$2)', [
    schoolAId,
    JSON.stringify([{ class_code: '5А', full_name: 'Intruder' }]),
  ])));
  assert.equal((await as(6, () => q('select * from public.school_students where organization_id=$1', [schoolAId]))).length, 0);
  assert.equal((await as(2, () => q('select * from public.school_students where organization_id=$1', [schoolAId]))).length, 1);

  // 4) Workloads + Payroll config + Quarter grades
  await as(5, () => q("select public.upsert_teacher_workload($1,'Устод Ҳасан','higher',2026,24,'Математика',array['5А'],true,false,'')", [schoolAId]));
  await as(4, () => q("select public.save_accountant_payroll_config($1,2000,'{\"higher\":20,\"first\":15,\"second\":10,\"none\":0}'::jsonb,200,100,13,1,array['2026-11-06'],array[0])", [schoolAId]));
  await as(5, () => q('select public.save_quarter_grades($1,2026,$2,$3,$4,$5)', [
    schoolAId,
    'q1',
    '5А',
    'Математика',
    JSON.stringify([{ student_name: 'Алиев Беҳрӯз', grade: 9, absent_hours: 0 }]),
  ]));
  await assert.rejects(as(5, () => q('select public.save_quarter_grades($1,2026,$2,$3,$4,$5)', [
    schoolAId, 'q1', '5А', 'Математика', JSON.stringify([{ student_name: 'Bad', grade: 15 }]),
  ])), { code: '22023' });

  // 5) Hierarchical verification: Staff submits -> Teacher cannot director-approve -> Maorif cannot approve early -> Director approves & forwards -> Maorif approves
  const subId = (await as(5, () => q("select public.submit_for_verification($1,'school-class-teacher','grades','Чоряки 1 · 5А','2026-Q1','{}'::jsonb,'Устод Ҳасан',false) as id", [schoolAId])))[0].id;
  await denied(as(5, () => q("select public.director_review_submission($1,'approved','',true)", [subId])));
  await assert.rejects(as(3, () => q("select public.maorif_review_submission($1,'approved','ok')", [subId])), { code: '55000' });

  await as(4, () => q("select public.director_review_submission($1,'approved','Хуб аст',true)", [subId]));
  await as(3, () => q("select public.maorif_review_submission($1,'approved','Тасдиқ шуд')", [subId]));

  // 6) Analytics summary aggregates cleanly for School, Maorif, and Raesat!
  const schoolAnalytics = (await as(4, () => q('select public.get_analytics_summary($1,2026,null) as res', [schoolAId])))[0].res;
  assert.equal(schoolAnalytics.student_count, 1);
  assert.equal(schoolAnalytics.grades.assessed, 1);
  assert.equal(schoolAnalytics.grades.quality_count, 1);
  assert.equal(schoolAnalytics.verifications.maorif_approved, 1);

  const raesatAnalytics = (await as(2, () => q('select public.get_analytics_summary($1,2026,null) as res', [raesatId])))[0].res;
  assert.equal(raesatAnalytics.student_count, 1);
  assert.equal(raesatAnalytics.schools.length, 1);
  assert.equal(raesatAnalytics.schools[0].id, schoolAId);
});

test('Stage 4 DB: admin_managers scoped permissions, student birth_date + update requests, colleagues directory & Tahlil grades', async () => {
  // 1) Non-super-admin cannot manage admin_managers
  await denied(as(4, () => q("select public.admin_upsert_admin_manager($1,'Hack','hack',array['orgs']::text[],null,true,'')", [uid(7)])));

  // 2) Super-admin creates a Sughd-scoped admin manager with ['orgs','verifications'] only
  await as(1, () => q(
    "select public.admin_upsert_admin_manager($1,'Менеҷер Суғд','mgr_sughd',array['orgs','verifications']::text[],'Суғд',true,'Назорати вилояти Суғд')",
    [uid(7)],
  ));
  const mgrCtx = (await as(7, () => q('select public.get_my_workspace_context() as ctx')))[0].ctx;
  assert.equal(mgrCtx.is_super_admin, false);
  assert.equal(mgrCtx.is_admin_manager, true);
  assert.deepEqual(mgrCtx.admin_permissions, ['orgs', 'verifications']);
  assert.equal(mgrCtx.admin_region_scope, 'Суғд');

  // Manager sees Sughd orgs via RLS, NOT Khatlon (schoolBId)
  const mgrOrgs = await as(7, () => q('select id from public.organizations'));
  assert.ok(mgrOrgs.some(o => o.id === schoolAId));
  assert.ok(!mgrOrgs.some(o => o.id === schoolBId));

  // Manager can upsert org inside Sughd, denied inside Khatlon, denied on licenses/plans without permission
  await as(7, () => q("select public.admin_upsert_organization('МТМУ № 19','school',$1,null,'Суғд','Хуҷанд','MTMU-19')", [maorifId]));
  await denied(as(7, () => q("select public.admin_upsert_organization('МТМУ Хатлон','school',null,null,'Хатлон','Бохтар','MTMU-KH')")));
  await denied(as(7, () => q("select public.admin_set_license($1,'active','std',now() + interval '30 days',30,'',10,1,2)", [schoolAId])));

  // 3) Student full birth_date + non-anonymous update request + approval flow
  await as(5, () => q('select public.upsert_school_students($1,$2)', [
    schoolAId,
    JSON.stringify([{ class_code: '6А', full_name: 'Саидова Шабнам', birth_date: '14.05.2013', gender: 'female' }]),
  ]));
  const stuRows = await as(5, () => q("select id, birth_date::text as bd, birth_year from public.school_students where organization_id=$1 and full_name='Саидова Шабнам'", [schoolAId]));
  assert.equal(stuRows.length, 1);
  assert.equal(stuRows[0].bd, '2013-05-14');
  assert.equal(stuRows[0].birth_year, 2013);

  const reqId = (await as(5, () => q(
    "select public.submit_student_update_request($1,'6А','add',false,$2::jsonb,'Хонандаи нав омад','','') as id",
    [schoolAId, JSON.stringify([{ class_code: '6А', full_name: 'Сафаров Рустам', birth_date: '2013-09-21', gender: 'male' }])],
  )))[0].id;
  const reqRow = (await as(4, () => q('select requested_by_name, requested_by_position, status from public.student_update_requests where id=$1', [reqId])))[0];
  assert.equal(reqRow.requested_by_name, 'Устод Карим');
  assert.ok(reqRow.requested_by_position.length > 0);
  assert.equal(reqRow.status, 'pending');

  // Ordinary teacher cannot approve student update request; class-teacher (uid 8) CAN approve -> auto-inserts student
  await denied(as(5, () => q("select public.review_student_update_request($1,'approved','ok')", [reqId])));
  await as(8, () => q("select public.review_student_update_request($1,'approved','Тасдиқ')", [reqId]));
  const addedByReq = await as(5, () => q("select full_name, birth_date::text as bd from public.school_students where organization_id=$1 and full_name='Сафаров Рустам'", [schoolAId]));
  assert.equal(addedByReq.length, 1);
  assert.equal(addedByReq[0].bd, '2013-09-21');

  // 4) Colleagues directory accessible to ordinary verified staff (uid 5), denied for school B (uid 6)
  const colleagues = (await as(5, () => q('select public.get_school_colleagues_directory($1) as list', [schoolAId])))[0].list;
  assert.ok(Array.isArray(colleagues));
  assert.ok(colleagues.length >= 3);
  assert.ok(colleagues.some(c => c.primary_position === 'school-director'));
  await denied(as(6, () => q('select public.get_school_colleagues_directory($1)', [schoolAId])));

  // 5) Extended Tahlil quarter_grades (current_grades, control_grades, period_start, period_end)
  await as(5, () => q('select public.save_quarter_grades($1,2026,$2,$3,$4,$5::jsonb)', [
    schoolAId,
    'q1',
    '6А',
    'Математика',
    JSON.stringify([{
      student_name: 'Саидова Шабнам',
      grade: 9,
      current_grades: [8, 9, 10],
      control_grades: [9],
      period_start: '2026-09-01',
      period_end: '2026-10-31',
      absent_hours: 1,
    }]),
  ]));
  const savedGr = (await as(5, () => q("select current_grades, control_grades, period_start::text as ps, period_end::text as pe from public.quarter_grades where organization_id=$1 and student_name='Саидова Шабнам'", [schoolAId])))[0];
  assert.deepEqual(savedGr.current_grades, [8, 9, 10]);
  assert.deepEqual(savedGr.control_grades, [9]);
  assert.equal(savedGr.ps, '2026-09-01');
  assert.equal(savedGr.pe, '2026-10-31');
});
