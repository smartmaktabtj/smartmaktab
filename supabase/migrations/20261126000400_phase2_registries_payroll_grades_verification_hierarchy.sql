-- Phase 2 Migration:
-- 1) Territory hierarchy (Raesat -> Maorif -> School) + backfill parent_id for Maorif -> Raesat
-- 2) School Students Registry (school_students + bulk/row RPCs)
-- 3) Teacher Workload & Attestation Categories (teacher_workloads)
-- 4) Accountant Payroll Tariffs & Calendar Exclusions (accountant_payroll_configs, school_payroll_entries)
-- 5) Class Teacher Quarter Grades (quarter_grades)
-- 6) Hierarchical Verification (verification_submissions: School staff -> Director -> Maorif)
-- 7) Aggregated Analytics RPC (get_analytics_summary for School / Maorif / Raesat)

-- ============================================================================
-- 1. TERRITORY HIERARCHY (Raesat -> Maorif -> School)
-- ============================================================================
alter table public.organizations drop constraint if exists organizations_check;
alter table public.organizations
  add constraint organizations_hierarchy_check check (
    (kind = 'school' and parent_id is distinct from id)
    or (kind = 'education_authority' and (authority_tier is distinct from 'raesat' or parent_id is null) and parent_id is distinct from id)
  );

-- Backfill Maorif -> Raesat parent_id by region_name where missing
update public.organizations m
set parent_id = r.id
from public.organizations r
where m.kind = 'education_authority'
  and m.authority_tier = 'maorif'
  and m.parent_id is null
  and r.kind = 'education_authority'
  and r.authority_tier = 'raesat'
  and r.region_name is not null
  and r.region_name = m.region_name;

-- Backfill School -> Maorif parent_id by district_name where missing
update public.organizations s
set parent_id = m.id
from public.organizations m
where s.kind = 'school'
  and s.parent_id is null
  and m.kind = 'education_authority'
  and m.authority_tier = 'maorif'
  and m.district_name is not null
  and m.district_name = s.district_name
  and (m.region_name is null or s.region_name is null or m.region_name = s.region_name);

-- Update can_read_org so Raesat can read child Maorifs AND schools under those Maorifs
create or replace function smartmaktab_private.can_read_org(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and (
        m.organization_id = target
        or (m.role in ('authority_viewer','maorif') and exists (
          select 1 from public.organizations child
          where child.id = target
            and (
              child.parent_id = m.organization_id
              or exists (
                select 1 from public.organizations mid
                where mid.id = child.parent_id
                  and mid.kind = 'education_authority'
                  and mid.parent_id = m.organization_id
              )
            )
        ))
      )
  );
$$;

-- Helper: check whether actor belongs to a Maorif/Raesat authority governing target school
create or replace function smartmaktab_private.can_review_school_as_authority(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    join public.organizations s on s.id = target and s.kind = 'school'
    where m.user_id = (select auth.uid())
      and m.role in ('authority_viewer','maorif')
      and (
        s.parent_id = m.organization_id
        or exists (
          select 1 from public.organizations mid
          where mid.id = s.parent_id
            and mid.kind = 'education_authority'
            and mid.parent_id = m.organization_id
        )
        or exists (
          select 1 from smartmaktab_private.summary_scope sc
          where sc.school_id = s.id and sc.authority_id = m.organization_id
        )
      )
  );
$$;

-- Helper: check whether actor is Director / School Admin of target school
create or replace function smartmaktab_private.is_school_director(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = target
      and (
        m.role in ('director','school_admin')
        or m.primary_position = 'school-director'
        or 'school-director' = any(coalesce(m.extra_positions, '{}'::text[]))
      )
  );
$$;

revoke all on function
  smartmaktab_private.can_review_school_as_authority(uuid),
  smartmaktab_private.is_school_director(uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  smartmaktab_private.can_review_school_as_authority(uuid),
  smartmaktab_private.is_school_director(uuid)
  to authenticated;

-- Extend school_records allowed types
alter table public.school_records drop constraint if exists school_records_record_type_check;
alter table public.school_records
  add constraint school_records_record_type_check
    check (record_type in (
      'staff','document','plan','task','meeting','source','schedule',
      'quality_report','lesson_plan','director_plan','library_report',
      'student_registry','teacher_workload','payroll_run','quarter_grades','verification_submission','other'
    ));

-- Keep summary_scope synced when admin creates/updates a school with parent_id
create or replace function smartmaktab_private.sync_school_summary_scope() returns trigger
language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  raesat_id uuid;
begin
  if new.kind = 'school' and new.parent_id is not null then
    insert into smartmaktab_private.summary_scope (school_id, authority_id, level)
    values (new.id, new.parent_id, 'maorif')
    on conflict (school_id, level) do update set authority_id = excluded.authority_id;

    select p.parent_id into raesat_id
    from public.organizations p
    where p.id = new.parent_id and p.kind = 'education_authority';

    if raesat_id is not null then
      insert into smartmaktab_private.summary_scope (school_id, authority_id, level)
      values (new.id, raesat_id, 'raesat')
      on conflict (school_id, level) do update set authority_id = excluded.authority_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function smartmaktab_private.sync_school_summary_scope() from public, anon, authenticated, service_role;
drop trigger if exists sync_school_scope_trg on public.organizations;
create trigger sync_school_scope_trg
  after insert or update of parent_id on public.organizations
  for each row execute function smartmaktab_private.sync_school_summary_scope();

-- ============================================================================
-- 2. SCHOOL STUDENTS REGISTRY
-- ============================================================================
create table if not exists public.school_students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_kind text generated always as ('school'::text) stored,
  class_code text not null check (length(btrim(class_code)) between 1 and 12),
  full_name text not null check (length(btrim(full_name)) between 1 and 180),
  birth_year integer check (birth_year is null or birth_year between 1995 and 2026),
  gender text not null default '' check (gender in ('','male','female')),
  guardian_name text not null default '' check (length(guardian_name) <= 160),
  guardian_phone text not null default '' check (length(guardian_phone) <= 40),
  student_code text not null default '' check (length(student_code) <= 40),
  status text not null default 'active' check (status in ('active','transferred','graduated')),
  extra_data jsonb not null default '{}'::jsonb check (jsonb_typeof(extra_data) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (organization_id, organization_kind) references public.organizations (id, kind)
);
create index if not exists school_students_org_cls_idx on public.school_students (organization_id, class_code) where deleted_at is null;

alter table public.school_students enable row level security;
drop policy if exists school_students_read on public.school_students;
create policy school_students_read on public.school_students
  for select to authenticated
  using ((select smartmaktab_private.is_developer()) or (deleted_at is null and smartmaktab_private.can_read_org(organization_id)));

revoke all on public.school_students from public, anon, authenticated, service_role;
grant select on public.school_students to authenticated;

create or replace function public.upsert_school_students(
  p_org_id uuid,
  p_rows jsonb,
  p_replace_class text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  rec jsonb;
  v_id uuid;
  v_cls text;
  v_name text;
  v_birth integer;
  v_gender text;
  v_guard text;
  v_phone text;
  v_code text;
  v_status text;
  inserted_count integer := 0;
  updated_count integer := 0;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'student write denied' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows array required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 1500 then
    raise exception 'too many rows in single import' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_replace_class, '')), '') is not null then
    update public.school_students
    set deleted_at = now(), updated_by = actor_id, updated_at = now()
    where organization_id = p_org_id
      and upper(class_code) = upper(btrim(p_replace_class))
      and deleted_at is null;
  end if;

  for rec in select * from jsonb_array_elements(p_rows) loop
    v_id := null;
    if coalesce(rec ->> 'id', '') ~ '^[0-9a-f-]{36}$' then
      v_id := (rec ->> 'id')::uuid;
    end if;
    v_cls := upper(left(btrim(coalesce(rec ->> 'class_code', '')), 12));
    v_name := left(btrim(coalesce(rec ->> 'full_name', '')), 180);
    if v_cls = '' or v_name = '' then
      continue;
    end if;
    v_birth := case when coalesce(rec ->> 'birth_year', '') ~ '^\d{4}$' then (rec ->> 'birth_year')::integer else null end;
    if v_birth is not null and (v_birth < 1995 or v_birth > 2026) then v_birth := null; end if;
    v_gender := case when lower(coalesce(rec ->> 'gender', '')) in ('male','female') then lower(rec ->> 'gender') else '' end;
    v_guard := left(btrim(coalesce(rec ->> 'guardian_name', '')), 160);
    v_phone := left(btrim(coalesce(rec ->> 'guardian_phone', '')), 40);
    v_code := left(btrim(coalesce(rec ->> 'student_code', '')), 40);
    v_status := case when lower(coalesce(rec ->> 'status', '')) in ('active','transferred','graduated') then lower(rec ->> 'status') else 'active' end;

    if v_id is not null then
      update public.school_students
      set class_code = v_cls,
          full_name = v_name,
          birth_year = v_birth,
          gender = v_gender,
          guardian_name = v_guard,
          guardian_phone = v_phone,
          student_code = v_code,
          status = v_status,
          deleted_at = null,
          updated_by = actor_id,
          updated_at = now()
      where id = v_id and organization_id = p_org_id;
      if found then
        updated_count := updated_count + 1;
        continue;
      end if;
    end if;

    insert into public.school_students (
      organization_id, class_code, full_name, birth_year, gender, guardian_name, guardian_phone, student_code, status, created_by, updated_by
    ) values (
      p_org_id, v_cls, v_name, v_birth, v_gender, v_guard, v_phone, v_code, v_status, actor_id, actor_id
    );
    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object('inserted', inserted_count, 'updated', updated_count);
end;
$$;

create or replace function public.delete_school_student(p_org_id uuid, p_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  out_id uuid;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'student delete denied' using errcode = '42501';
  end if;
  update public.school_students
  set deleted_at = now(), updated_by = actor_id, updated_at = now()
  where id = p_student_id and organization_id = p_org_id and deleted_at is null
  returning id into out_id;
  if not found then raise exception 'student not found' using errcode = '55000'; end if;
  return out_id;
end;
$$;

-- ============================================================================
-- 3. TEACHER WORKLOADS & CATEGORIES
-- ============================================================================
create table if not exists public.teacher_workloads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_kind text generated always as ('school'::text) stored,
  user_id uuid references auth.users (id) on delete set null,
  teacher_name text not null check (length(btrim(teacher_name)) between 1 and 160),
  category text not null default 'none' check (category in ('higher','first','second','none')),
  attestation_year integer check (attestation_year is null or attestation_year between 1980 and 2099),
  weekly_hours numeric(5,2) not null default 18.00 check (weekly_hours between 0 and 60),
  subject text not null default '' check (length(subject) <= 120),
  class_codes text[] not null default '{}'::text[],
  class_leadership boolean not null default false,
  notebook_check boolean not null default false,
  notes text not null default '' check (length(notes) <= 400),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, organization_kind) references public.organizations (id, kind)
);
create index if not exists teacher_workloads_org_idx on public.teacher_workloads (organization_id);

alter table public.teacher_workloads enable row level security;
drop policy if exists teacher_workloads_read on public.teacher_workloads;
create policy teacher_workloads_read on public.teacher_workloads
  for select to authenticated
  using ((select smartmaktab_private.is_developer()) or smartmaktab_private.can_read_org(organization_id));

revoke all on public.teacher_workloads from public, anon, authenticated, service_role;
grant select on public.teacher_workloads to authenticated;

create or replace function public.upsert_teacher_workload(
  p_org_id uuid,
  p_teacher_name text,
  p_category text default 'none',
  p_attestation_year integer default null,
  p_weekly_hours numeric default 18,
  p_subject text default '',
  p_class_codes text[] default '{}'::text[],
  p_class_leadership boolean default false,
  p_notebook_check boolean default false,
  p_notes text default '',
  p_workload_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  name_clean text := left(btrim(coalesce(p_teacher_name, '')), 160);
  cat_clean text := lower(btrim(coalesce(p_category, 'none')));
  out_id uuid;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'workload write denied' using errcode = '42501';
  end if;
  if name_clean = '' or cat_clean not in ('higher','first','second','none') or coalesce(p_weekly_hours, 0) < 0 or coalesce(p_weekly_hours, 0) > 60 then
    raise exception 'invalid workload data' using errcode = '22023';
  end if;

  if p_workload_id is not null then
    update public.teacher_workloads
    set teacher_name = name_clean,
        category = cat_clean,
        attestation_year = p_attestation_year,
        weekly_hours = p_weekly_hours,
        subject = left(btrim(coalesce(p_subject, '')), 120),
        class_codes = coalesce(p_class_codes, '{}'::text[]),
        class_leadership = coalesce(p_class_leadership, false),
        notebook_check = coalesce(p_notebook_check, false),
        notes = left(btrim(coalesce(p_notes, '')), 400),
        updated_by = actor_id,
        updated_at = now()
    where id = p_workload_id and organization_id = p_org_id
    returning id into out_id;
    if found then return out_id; end if;
  end if;

  insert into public.teacher_workloads (
    organization_id, user_id, teacher_name, category, attestation_year, weekly_hours, subject, class_codes, class_leadership, notebook_check, notes, updated_by
  ) values (
    p_org_id, actor_id, name_clean, cat_clean, p_attestation_year, p_weekly_hours,
    left(btrim(coalesce(p_subject, '')), 120),
    coalesce(p_class_codes, '{}'::text[]),
    coalesce(p_class_leadership, false),
    coalesce(p_notebook_check, false),
    left(btrim(coalesce(p_notes, '')), 400),
    actor_id
  ) returning id into out_id;
  return out_id;
end;
$$;

-- ============================================================================
-- 4. ACCOUNTANT PAYROLL CONFIGS & CALENDAR EXCLUSIONS
-- ============================================================================
create table if not exists public.accountant_payroll_configs (
  organization_id uuid primary key,
  organization_kind text generated always as ('school'::text) stored,
  base_rate_18h_tjs numeric(12,2) not null default 1800.00 check (base_rate_18h_tjs >= 0),
  category_bonus_pct jsonb not null default '{"higher":20,"first":15,"second":10,"none":0}'::jsonb,
  class_leadership_tjs numeric(10,2) not null default 180.00 check (class_leadership_tjs >= 0),
  notebook_check_tjs numeric(10,2) not null default 120.00 check (notebook_check_tjs >= 0),
  income_tax_pct numeric(5,2) not null default 13.00 check (income_tax_pct between 0 and 60),
  social_tax_pct numeric(5,2) not null default 1.00 check (social_tax_pct between 0 and 40),
  holiday_dates text[] not null default '{}'::text[],
  excluded_weekdays integer[] not null default '{0}'::integer[],
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, organization_kind) references public.organizations (id, kind)
);

alter table public.accountant_payroll_configs enable row level security;
drop policy if exists accountant_payroll_configs_read on public.accountant_payroll_configs;
create policy accountant_payroll_configs_read on public.accountant_payroll_configs
  for select to authenticated
  using ((select smartmaktab_private.is_developer()) or smartmaktab_private.can_read_org(organization_id));

revoke all on public.accountant_payroll_configs from public, anon, authenticated, service_role;
grant select on public.accountant_payroll_configs to authenticated;

create or replace function public.save_accountant_payroll_config(
  p_org_id uuid,
  p_base_rate numeric,
  p_category_bonus jsonb,
  p_class_leadership numeric,
  p_notebook_check numeric,
  p_income_tax_pct numeric,
  p_social_tax_pct numeric,
  p_holiday_dates text[] default '{}'::text[],
  p_excluded_weekdays integer[] default '{0}'::integer[]
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'payroll config write denied' using errcode = '42501';
  end if;
  if coalesce(p_base_rate, 0) < 0 or coalesce(p_income_tax_pct, 0) < 0 or coalesce(p_income_tax_pct, 0) > 60 then
    raise exception 'invalid payroll config' using errcode = '22023';
  end if;

  insert into public.accountant_payroll_configs (
    organization_id, base_rate_18h_tjs, category_bonus_pct, class_leadership_tjs, notebook_check_tjs,
    income_tax_pct, social_tax_pct, holiday_dates, excluded_weekdays, updated_by, updated_at
  ) values (
    p_org_id, p_base_rate,
    coalesce(p_category_bonus, '{"higher":20,"first":15,"second":10,"none":0}'::jsonb),
    coalesce(p_class_leadership, 180), coalesce(p_notebook_check, 120),
    coalesce(p_income_tax_pct, 13), coalesce(p_social_tax_pct, 1),
    coalesce(p_holiday_dates, '{}'::text[]), coalesce(p_excluded_weekdays, '{0}'::integer[]),
    actor_id, now()
  )
  on conflict (organization_id) do update
    set base_rate_18h_tjs = excluded.base_rate_18h_tjs,
        category_bonus_pct = excluded.category_bonus_pct,
        class_leadership_tjs = excluded.class_leadership_tjs,
        notebook_check_tjs = excluded.notebook_check_tjs,
        income_tax_pct = excluded.income_tax_pct,
        social_tax_pct = excluded.social_tax_pct,
        holiday_dates = excluded.holiday_dates,
        excluded_weekdays = excluded.excluded_weekdays,
        updated_by = actor_id,
        updated_at = now();
  return p_org_id;
end;
$$;

-- ============================================================================
-- 5. CLASS TEACHER QUARTER GRADES
-- ============================================================================
create table if not exists public.quarter_grades (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_kind text generated always as ('school'::text) stored,
  year_start integer not null check (year_start between 2000 and 2099),
  period text not null check (period in ('q1','q2','h1','q3','q4','h2','year')),
  class_code text not null check (length(btrim(class_code)) between 1 and 12),
  subject text not null check (length(btrim(subject)) between 1 and 120),
  student_id uuid references public.school_students (id) on delete set null,
  student_name text not null check (length(btrim(student_name)) between 1 and 180),
  grade numeric(4,2) check (grade is null or (grade >= 0 and grade <= 10)),
  absent_hours integer not null default 0 check (absent_hours between 0 and 1000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, organization_kind) references public.organizations (id, kind),
  unique (organization_id, year_start, period, class_code, subject, student_name)
);
create index if not exists quarter_grades_scope_idx on public.quarter_grades (organization_id, year_start, period, class_code);

alter table public.quarter_grades enable row level security;
drop policy if exists quarter_grades_read on public.quarter_grades;
create policy quarter_grades_read on public.quarter_grades
  for select to authenticated
  using ((select smartmaktab_private.is_developer()) or smartmaktab_private.can_read_org(organization_id));

revoke all on public.quarter_grades from public, anon, authenticated, service_role;
grant select on public.quarter_grades to authenticated;

create or replace function public.save_quarter_grades(
  p_org_id uuid,
  p_year_start integer,
  p_period text,
  p_class_code text,
  p_subject text,
  p_entries jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  cls_clean text := upper(left(btrim(coalesce(p_class_code, '')), 12));
  subj_clean text := left(btrim(coalesce(p_subject, '')), 120);
  rec jsonb;
  s_name text;
  s_id uuid;
  g_val numeric;
  abs_val integer;
  saved_cnt integer := 0;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'grade write denied' using errcode = '42501';
  end if;
  if p_year_start not between 2000 and 2099 or p_period not in ('q1','q2','h1','q3','q4','h2','year') or cls_clean = '' or subj_clean = '' then
    raise exception 'invalid grade scope' using errcode = '22023';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'entries array required' using errcode = '22023';
  end if;

  for rec in select * from jsonb_array_elements(p_entries) loop
    s_name := left(btrim(coalesce(rec ->> 'student_name', '')), 180);
    if s_name = '' then continue; end if;
    s_id := case when coalesce(rec ->> 'student_id', '') ~ '^[0-9a-f-]{36}$' then (rec ->> 'student_id')::uuid else null end;
    g_val := case when rec ? 'grade' and rec ->> 'grade' is not null and btrim(rec ->> 'grade') <> '' then (rec ->> 'grade')::numeric else null end;
    if g_val is not null and (g_val < 0 or g_val > 10) then
      raise exception 'grade out of range 0..10' using errcode = '22023';
    end if;
    abs_val := greatest(0, least(1000, coalesce((rec ->> 'absent_hours')::integer, 0)));

    insert into public.quarter_grades (
      organization_id, year_start, period, class_code, subject, student_id, student_name, grade, absent_hours, updated_by, updated_at
    ) values (
      p_org_id, p_year_start, p_period, cls_clean, subj_clean, s_id, s_name, g_val, abs_val, actor_id, now()
    )
    on conflict (organization_id, year_start, period, class_code, subject, student_name) do update
      set student_id = coalesce(excluded.student_id, public.quarter_grades.student_id),
          grade = excluded.grade,
          absent_hours = excluded.absent_hours,
          updated_by = actor_id,
          updated_at = now();
    saved_cnt := saved_cnt + 1;
  end loop;

  return jsonb_build_object('saved', saved_cnt);
end;
$$;

-- ============================================================================
-- 6. HIERARCHICAL VERIFICATION (School Staff -> Director -> Maorif)
-- ============================================================================
create table if not exists public.verification_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_kind text generated always as ('school'::text) stored,
  source_cabinet text not null check (length(btrim(source_cabinet)) between 1 and 80),
  category text not null check (category in ('lesson_plan','director_plan','quality_report','grades','payroll','library_report','student_registry','document')),
  title text not null check (length(btrim(title)) between 1 and 240),
  period_label text not null default '' check (length(period_label) <= 80),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  submitted_by uuid not null references auth.users (id) on delete cascade,
  submitted_by_name text not null default '' check (length(submitted_by_name) <= 160),
  submitted_at timestamptz not null default now(),
  director_status text not null default 'pending' check (director_status in ('pending','approved','rejected','changes')),
  director_by uuid references auth.users (id) on delete set null,
  director_note text not null default '' check (length(director_note) <= 500),
  director_at timestamptz,
  maorif_status text not null default 'not_sent' check (maorif_status in ('not_sent','pending','approved','rejected','changes')),
  maorif_org_id uuid,
  maorif_by uuid references auth.users (id) on delete set null,
  maorif_note text not null default '' check (length(maorif_note) <= 500),
  maorif_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, organization_kind) references public.organizations (id, kind)
);
create index if not exists verification_org_idx on public.verification_submissions (organization_id, director_status, maorif_status);

alter table public.verification_submissions enable row level security;
drop policy if exists verification_submissions_read on public.verification_submissions;
create policy verification_submissions_read on public.verification_submissions
  for select to authenticated
  using (
    (select smartmaktab_private.is_developer())
    or smartmaktab_private.can_write_school(organization_id)
    or (maorif_status <> 'not_sent' and smartmaktab_private.can_review_school_as_authority(organization_id))
  );

revoke all on public.verification_submissions from public, anon, authenticated, service_role;
grant select on public.verification_submissions to authenticated;

drop trigger if exists audit_verification_submissions on public.verification_submissions;
create trigger audit_verification_submissions
  after insert or update or delete on public.verification_submissions
  for each row execute function smartmaktab_private.audit_write();

create or replace function public.submit_for_verification(
  p_org_id uuid,
  p_source_cabinet text,
  p_category text,
  p_title text,
  p_period_label text default '',
  p_payload jsonb default '{}'::jsonb,
  p_submitted_by_name text default '',
  p_direct_to_maorif boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  is_dir boolean := false;
  maorif_id uuid;
  out_id uuid;
  dir_st text := 'pending';
  mao_st text := 'not_sent';
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'verification submit denied' using errcode = '42501';
  end if;
  if p_category not in ('lesson_plan','director_plan','quality_report','grades','payroll','library_report','student_registry','document') then
    raise exception 'invalid verification category' using errcode = '22023';
  end if;
  if btrim(coalesce(p_title, '')) = '' or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'title and object payload required' using errcode = '22023';
  end if;

  is_dir := smartmaktab_private.is_school_director(p_org_id);
  if p_direct_to_maorif and is_dir then
    select o.parent_id into maorif_id from public.organizations o where o.id = p_org_id;
    dir_st := 'approved';
    mao_st := 'pending';
  end if;

  insert into public.verification_submissions (
    organization_id, source_cabinet, category, title, period_label, payload,
    submitted_by, submitted_by_name, director_status, director_by, director_at,
    maorif_status, maorif_org_id
  ) values (
    p_org_id,
    left(btrim(coalesce(p_source_cabinet, 'school')), 80),
    p_category,
    left(btrim(p_title), 240),
    left(btrim(coalesce(p_period_label, '')), 80),
    p_payload,
    actor_id,
    left(btrim(coalesce(p_submitted_by_name, '')), 160),
    dir_st,
    case when dir_st = 'approved' then actor_id else null end,
    case when dir_st = 'approved' then now() else null end,
    mao_st,
    maorif_id
  ) returning id into out_id;

  return out_id;
end;
$$;

create or replace function public.director_review_submission(
  p_submission_id uuid,
  p_decision text,
  p_note text default '',
  p_forward_to_maorif boolean default false
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  sub_row public.verification_submissions%rowtype;
  maorif_id uuid;
begin
  if actor_id is null or p_submission_id is null or p_decision not in ('approved','rejected','changes') then
    raise exception 'invalid director review decision' using errcode = '22023';
  end if;
  select * into sub_row from public.verification_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission not found' using errcode = '55000'; end if;
  if not smartmaktab_private.is_school_director(sub_row.organization_id) and not smartmaktab_private.is_developer() then
    raise exception 'director role required' using errcode = '42501';
  end if;

  if p_decision = 'approved' and coalesce(p_forward_to_maorif, false) then
    select o.parent_id into maorif_id from public.organizations o where o.id = sub_row.organization_id;
  end if;

  update public.verification_submissions
  set director_status = p_decision,
      director_by = actor_id,
      director_note = left(btrim(coalesce(p_note, '')), 500),
      director_at = now(),
      maorif_status = case
        when p_decision = 'approved' and coalesce(p_forward_to_maorif, false) then 'pending'
        when p_decision in ('rejected','changes') then 'not_sent'
        else maorif_status
      end,
      maorif_org_id = coalesce(maorif_id, maorif_org_id),
      updated_at = now()
  where id = sub_row.id;
  return sub_row.id;
end;
$$;

create or replace function public.maorif_review_submission(
  p_submission_id uuid,
  p_decision text,
  p_note text default ''
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  sub_row public.verification_submissions%rowtype;
begin
  if actor_id is null or p_submission_id is null or p_decision not in ('approved','rejected','changes') then
    raise exception 'invalid maorif review decision' using errcode = '22023';
  end if;
  select * into sub_row from public.verification_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission not found' using errcode = '55000'; end if;
  if not smartmaktab_private.can_review_school_as_authority(sub_row.organization_id) and not smartmaktab_private.is_developer() then
    raise exception 'authority review denied' using errcode = '42501';
  end if;
  if sub_row.director_status <> 'approved' or sub_row.maorif_status = 'not_sent' then
    raise exception 'director must approve and forward first' using errcode = '55000';
  end if;

  update public.verification_submissions
  set maorif_status = p_decision,
      maorif_by = actor_id,
      maorif_note = left(btrim(coalesce(p_note, '')), 500),
      maorif_at = now(),
      updated_at = now()
  where id = sub_row.id;
  return sub_row.id;
end;
$$;

-- ============================================================================
-- 7. AGGREGATED ANALYTICS SUMMARY (School / Maorif / Raesat)
-- ============================================================================
create or replace function public.get_analytics_summary(
  p_org_id uuid,
  p_year_start integer default 2026,
  p_period text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  org_row public.organizations%rowtype;
  student_count bigint := 0;
  grade_stats jsonb;
  period_series jsonb;
  child_breakdown jsonb;
  verif_counts jsonb;
begin
  if actor_id is null or p_org_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not smartmaktab_private.is_developer() and not smartmaktab_private.can_read_org(p_org_id) then
    raise exception 'analytics access denied' using errcode = '42501';
  end if;

  select * into org_row from public.organizations where id = p_org_id;
  if not found then raise exception 'organization not found' using errcode = '55000'; end if;

  -- Scoped schools CTE logic inline per organization kind/tier
  with scoped_schools as (
    select o.id, o.name, o.district_name
    from public.organizations o
    where o.kind = 'school'
      and (
        (org_row.kind = 'school' and o.id = org_row.id)
        or (org_row.kind = 'education_authority' and org_row.authority_tier = 'maorif' and o.parent_id = org_row.id)
        or (org_row.kind = 'education_authority' and org_row.authority_tier = 'raesat' and (
          o.parent_id = org_row.id
          or exists (select 1 from public.organizations m where m.id = o.parent_id and m.parent_id = org_row.id)
        ))
      )
  )
  select
    (select count(*) from public.school_students st join scoped_schools sc on sc.id = st.organization_id where st.deleted_at is null),
    (
      select jsonb_build_object(
        'assessed', count(*) filter (where qg.grade is not null),
        'quality_count', count(*) filter (where qg.grade >= 8),
        'passed_count', count(*) filter (where qg.grade >= 4),
        'avg_grade', round(coalesce(avg(qg.grade), 0), 2)
      )
      from public.quarter_grades qg
      join scoped_schools sc on sc.id = qg.organization_id
      where qg.year_start = p_year_start
        and (p_period is null or qg.period = p_period)
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'period', t.period,
        'assessed', t.assessed,
        'quality_pct', case when t.assessed > 0 then round((t.quality_count::numeric / t.assessed) * 100, 1) else 0 end,
        'pass_pct', case when t.assessed > 0 then round((t.passed_count::numeric / t.assessed) * 100, 1) else 0 end
      ) order by array_position(array['q1','q2','h1','q3','q4','h2','year'], t.period)), '[]'::jsonb)
      from (
        select qg.period,
          count(*) filter (where qg.grade is not null) as assessed,
          count(*) filter (where qg.grade >= 8) as quality_count,
          count(*) filter (where qg.grade >= 4) as passed_count
        from public.quarter_grades qg
        join scoped_schools sc on sc.id = qg.organization_id
        where qg.year_start = p_year_start
        group by qg.period
      ) t
    ),
    (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sc.id,
        'name', sc.name,
        'district', sc.district_name,
        'students', (select count(*) from public.school_students st where st.organization_id = sc.id and st.deleted_at is null),
        'assessed', (select count(*) from public.quarter_grades qg where qg.organization_id = sc.id and qg.year_start = p_year_start and qg.grade is not null),
        'quality_pct', coalesce((
          select round((count(*) filter (where qg.grade >= 8)::numeric / nullif(count(*) filter (where qg.grade is not null), 0)) * 100, 1)
          from public.quarter_grades qg where qg.organization_id = sc.id and qg.year_start = p_year_start
        ), 0)
      ) order by sc.name), '[]'::jsonb)
      from scoped_schools sc
    ),
    (
      select jsonb_build_object(
        'total', count(*),
        'director_pending', count(*) filter (where v.director_status = 'pending'),
        'director_approved', count(*) filter (where v.director_status = 'approved'),
        'maorif_pending', count(*) filter (where v.maorif_status = 'pending'),
        'maorif_approved', count(*) filter (where v.maorif_status = 'approved')
      )
      from public.verification_submissions v
      join scoped_schools sc on sc.id = v.organization_id
    )
  into student_count, grade_stats, period_series, child_breakdown, verif_counts;

  return jsonb_build_object(
    'organization_id', org_row.id,
    'organization_name', org_row.name,
    'kind', org_row.kind,
    'authority_tier', org_row.authority_tier,
    'student_count', coalesce(student_count, 0),
    'grades', coalesce(grade_stats, '{}'::jsonb),
    'periods', coalesce(period_series, '[]'::jsonb),
    'schools', coalesce(child_breakdown, '[]'::jsonb),
    'verifications', coalesce(verif_counts, '{}'::jsonb)
  );
end;
$$;

revoke all on function
  public.upsert_school_students(uuid, jsonb, text),
  public.delete_school_student(uuid, uuid),
  public.upsert_teacher_workload(uuid, text, text, integer, numeric, text, text[], boolean, boolean, text, uuid),
  public.save_accountant_payroll_config(uuid, numeric, jsonb, numeric, numeric, numeric, numeric, text[], integer[]),
  public.save_quarter_grades(uuid, integer, text, text, text, jsonb),
  public.submit_for_verification(uuid, text, text, text, text, jsonb, text, boolean),
  public.director_review_submission(uuid, text, text, boolean),
  public.maorif_review_submission(uuid, text, text),
  public.get_analytics_summary(uuid, integer, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.upsert_school_students(uuid, jsonb, text),
  public.delete_school_student(uuid, uuid),
  public.upsert_teacher_workload(uuid, text, text, integer, numeric, text, text[], boolean, boolean, text, uuid),
  public.save_accountant_payroll_config(uuid, numeric, jsonb, numeric, numeric, numeric, numeric, text[], integer[]),
  public.save_quarter_grades(uuid, integer, text, text, text, jsonb),
  public.submit_for_verification(uuid, text, text, text, text, jsonb, text, boolean),
  public.director_review_submission(uuid, text, text, boolean),
  public.maorif_review_submission(uuid, text, text),
  public.get_analytics_summary(uuid, integer, text)
  to authenticated;
