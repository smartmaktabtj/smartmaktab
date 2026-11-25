-- Stage 2/3/Cloud Foundation: extended roles (super_admin, maorif, school_admin, teacher),
-- workspace records RPCs, server-side physical library circulation, and 30-day offline grace licensing + OCR payment queue.

-- 1. Organization hierarchy metadata
alter table public.organizations
  add column if not exists authority_tier text check (authority_tier in ('raesat','maorif')),
  add column if not exists region_name text check (region_name is null or length(btrim(region_name)) between 1 and 120),
  add column if not exists district_name text check (district_name is null or length(btrim(district_name)) between 1 and 120),
  add column if not exists school_code text check (school_code is null or length(btrim(school_code)) between 1 and 40);

alter table public.organizations drop constraint if exists organizations_tier_kind_chk;
alter table public.organizations
  add constraint organizations_tier_kind_chk check (kind = 'education_authority' or authority_tier is null);

grant select (authority_tier, region_name, district_name, school_code) on public.organizations to authenticated;

-- 2. Extend school_memberships roles to include teacher and maorif (while retaining director, deputy, staff, school_admin, authority_viewer)
alter table public.school_memberships drop constraint if exists school_memberships_organization_id_organization_kind_fkey;
alter table public.school_memberships drop constraint if exists school_memberships_role_check;
alter table public.school_memberships drop column organization_kind;
alter table public.school_memberships
  add constraint school_memberships_role_check
    check (role in ('school_admin','director','deputy','staff','teacher','authority_viewer','maorif')),
  add column organization_kind text generated always as (
    case when role in ('authority_viewer','maorif') then 'education_authority' else 'school' end
  ) stored,
  add constraint school_memberships_organization_id_organization_kind_fkey
    foreign key (organization_id, organization_kind) references public.organizations (id, kind);

-- Update org/summary authorization helpers to recognize both 'authority_viewer' and 'maorif', plus super_admin alias
create or replace function smartmaktab_private.is_super_admin() returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select smartmaktab_private.is_developer();
$$;

create or replace function smartmaktab_private.can_read_org(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and (
        m.organization_id = target
        or (m.role in ('authority_viewer','maorif') and exists (
          select 1 from public.organizations child
          where child.id = target and child.kind = 'school' and child.parent_id = m.organization_id
        ))
      )
  );
$$;

create or replace function smartmaktab_private.can_write_school(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = target
      and m.role in ('school_admin','director','deputy','staff','teacher')
  );
$$;

create or replace function smartmaktab_private.summary_allowed(target uuid, access text) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select case access
    when 'director' then exists (
      select 1 from public.school_memberships m
      where m.user_id = (select auth.uid()) and m.organization_id = target and m.role in ('director','school_admin')
    )
    when 'maorif' then exists (
      select 1 from public.school_memberships m
      join smartmaktab_private.summary_scope s on s.authority_id = m.organization_id
      where m.user_id = (select auth.uid()) and m.role in ('authority_viewer','maorif') and s.school_id = target and s.level = 'maorif'
    )
    else false
  end;
$$;

revoke all on function smartmaktab_private.is_super_admin(), smartmaktab_private.can_write_school(uuid) from public, anon, authenticated, service_role;
grant execute on function smartmaktab_private.is_super_admin(), smartmaktab_private.can_write_school(uuid) to authenticated;

create or replace function public.territory_summary(p_authority uuid, p_year integer, p_period text)
returns table(schools bigint, enrolled bigint, assessed bigint, passed bigint, quality bigint)
language plpgsql stable security definer set search_path = '' set row_security = off as $$
begin
  if auth.uid() is null
     or not exists (
       select 1 from public.school_memberships m
       where m.organization_id = p_authority and m.role in ('authority_viewer','maorif') and m.user_id = (select auth.uid())
     )
     or not exists (
       select 1 from smartmaktab_private.summary_scope s
       where s.authority_id = p_authority and s.level = 'raesat'
     ) then
    raise exception 'territory access denied' using errcode = '42501';
  end if;
  return query
  select count(*), sum(t.enrolled), sum(t.assessed), sum(t.passed), sum(t.quality)
  from public.school_summary_revisions t
  join smartmaktab_private.summary_scope s on s.school_id = t.organization_id and s.level = 'raesat'
  where s.authority_id = p_authority and t.year_start = p_year and t.period = p_period and t.status = 'approved';
end;
$$;

-- 3. User Profiles
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 160),
  preferred_lang text not null default 'tg' check (preferred_lang in ('tg','ru')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
drop policy if exists user_profiles_read on public.user_profiles;
create policy user_profiles_read on public.user_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select smartmaktab_private.is_developer()));
revoke all on public.user_profiles from public, anon, authenticated, service_role;
grant select on public.user_profiles to authenticated;

create or replace function public.upsert_my_profile(p_full_name text, p_preferred_lang text default 'tg')
returns jsonb language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  cleaned_name text := btrim(coalesce(p_full_name, ''));
begin
  if actor_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if length(cleaned_name) > 160 or p_preferred_lang not in ('tg','ru') then
    raise exception 'invalid profile' using errcode = '22023';
  end if;
  insert into public.user_profiles (user_id, full_name, preferred_lang)
  values (actor_id, cleaned_name, p_preferred_lang)
  on conflict (user_id) do update
    set full_name = excluded.full_name, preferred_lang = excluded.preferred_lang, updated_at = now();
  return jsonb_build_object('user_id', actor_id, 'full_name', cleaned_name, 'preferred_lang', p_preferred_lang);
end;
$$;
revoke all on function public.upsert_my_profile(text, text) from public, anon, authenticated, service_role;
grant execute on function public.upsert_my_profile(text, text) to authenticated;

-- 4. Workspace records write/read RPCs (preserving read-only direct column restrictions on payload)
alter table public.school_records drop constraint if exists school_records_record_type_check;
alter table public.school_records
  add constraint school_records_record_type_check
    check (record_type in ('staff','document','plan','task','meeting','source','schedule','quality_report','lesson_plan','director_plan','library_report','other'));
alter table public.school_records
  add column if not exists updated_by uuid references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.save_school_record(
  p_org_id uuid,
  p_record_type text,
  p_title text,
  p_payload jsonb default '{}'::jsonb,
  p_record_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  cleaned_title text := btrim(coalesce(p_title, ''));
  output uuid;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'school write denied' using errcode = '42501';
  end if;
  if length(cleaned_title) < 1 or length(cleaned_title) > 240 or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid record' using errcode = '22023';
  end if;
  if p_record_type not in ('staff','document','plan','task','meeting','source','schedule','quality_report','lesson_plan','director_plan','library_report','other') then
    raise exception 'invalid record type' using errcode = '22023';
  end if;
  if p_record_id is not null then
    update public.school_records
    set record_type = p_record_type, title = cleaned_title, payload = p_payload, updated_by = actor_id, updated_at = now()
    where id = p_record_id and organization_id = p_org_id and deleted_at is null
    returning id into output;
    if not found then raise exception 'record not found' using errcode = '55000'; end if;
  else
    insert into public.school_records (organization_id, record_type, title, payload, updated_by)
    values (p_org_id, p_record_type, cleaned_title, p_payload, actor_id)
    returning id into output;
  end if;
  return output;
end;
$$;

create or replace function public.set_school_record_deleted(p_org_id uuid, p_record_id uuid, p_deleted boolean)
returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  output uuid;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'school write denied' using errcode = '42501';
  end if;
  update public.school_records
  set deleted_at = case when p_deleted then now() else null end,
      updated_by = actor_id, updated_at = now()
  where id = p_record_id and organization_id = p_org_id
  returning id into output;
  if not found then raise exception 'record not found' using errcode = '55000'; end if;
  return output;
end;
$$;

create or replace function public.get_school_records_detail(p_org_id uuid, p_record_type text default null, p_include_deleted boolean default false)
returns table(id uuid, record_type text, title text, payload jsonb, deleted_at timestamptz, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' set row_security = off as $$
begin
  if auth.uid() is null or p_org_id is null
     or (not smartmaktab_private.is_developer() and not smartmaktab_private.can_read_org(p_org_id)) then
    raise exception 'access denied' using errcode = '42501';
  end if;
  return query
  select r.id, r.record_type, r.title, r.payload, r.deleted_at, r.created_at, r.updated_at
  from public.school_records r
  where r.organization_id = p_org_id
    and (p_record_type is null or r.record_type = p_record_type)
    and (r.deleted_at is null or (p_include_deleted and (smartmaktab_private.is_developer() or smartmaktab_private.can_write_school(p_org_id))))
  order by r.updated_at desc, r.id
  limit 200;
end;
$$;

revoke all on function public.save_school_record(uuid, text, text, jsonb, uuid),
  public.set_school_record_deleted(uuid, uuid, boolean),
  public.get_school_records_detail(uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.save_school_record(uuid, text, text, jsonb, uuid),
  public.set_school_record_deleted(uuid, uuid, boolean),
  public.get_school_records_detail(uuid, text, boolean) to authenticated;

-- 5. Stage 3: Physical Library Inventory & Circulation (transactional, separated from digital textbooks)
create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_kind text generated always as ('school'::text) stored,
  foreign key (organization_id, school_kind) references public.organizations (id, kind) on delete cascade,
  inventory_code text not null check (length(btrim(inventory_code)) between 1 and 60),
  title text not null check (length(btrim(title)) between 1 and 200),
  author text not null default '' check (length(author) <= 160),
  total_copies integer not null default 1 check (total_copies between 1 and 10000),
  available_copies integer not null default 1 check (available_copies between 0 and total_copies),
  created_at timestamptz not null default now(),
  unique (organization_id, inventory_code)
);
create index if not exists library_books_org_idx on public.library_books (organization_id);

create table if not exists public.library_loans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_kind text generated always as ('school'::text) stored,
  foreign key (organization_id, school_kind) references public.organizations (id, kind) on delete cascade,
  book_id uuid not null references public.library_books (id) on delete restrict,
  reader_code text not null check (length(btrim(reader_code)) between 1 and 60),
  reader_name text not null default '' check (length(reader_name) <= 160),
  issued_on date not null,
  due_on date not null check (due_on >= issued_on),
  returned_on date,
  status text not null default 'out' check (status in ('out','returned')),
  check ((status = 'returned') = (returned_on is not null)),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists library_loans_org_status_idx on public.library_loans (organization_id, status, due_on);
create unique index if not exists library_loans_active_reader_book_uidx on public.library_loans (book_id, reader_code) where status = 'out';

alter table public.library_books enable row level security;
alter table public.library_loans enable row level security;
drop policy if exists library_books_read on public.library_books;
create policy library_books_read on public.library_books for select to authenticated
  using ((select smartmaktab_private.is_developer()) or smartmaktab_private.can_read_org(organization_id));
drop policy if exists library_loans_read on public.library_loans;
create policy library_loans_read on public.library_loans for select to authenticated
  using ((select smartmaktab_private.is_developer()) or smartmaktab_private.can_read_org(organization_id));
revoke all on public.library_books, public.library_loans from public, anon, authenticated, service_role;
grant select on public.library_books, public.library_loans to authenticated;

drop trigger if exists audit_library_books on public.library_books;
create trigger audit_library_books after insert or update or delete on public.library_books
  for each row execute function smartmaktab_private.audit_write();
drop trigger if exists audit_library_loans on public.library_loans;
create trigger audit_library_loans after insert or update or delete on public.library_loans
  for each row execute function smartmaktab_private.audit_write();

create or replace function public.manage_library_book(
  p_org_id uuid,
  p_inventory_code text,
  p_title text,
  p_author text default '',
  p_total_copies integer default 1
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  code_clean text := btrim(coalesce(p_inventory_code, ''));
  title_clean text := btrim(coalesce(p_title, ''));
  output uuid;
begin
  if auth.uid() is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'library write denied' using errcode = '42501';
  end if;
  if length(code_clean) < 1 or length(code_clean) > 60 or length(title_clean) < 1 or length(title_clean) > 200 or p_total_copies < 1 or p_total_copies > 10000 then
    raise exception 'invalid library book' using errcode = '22023';
  end if;
  insert into public.library_books (organization_id, inventory_code, title, author, total_copies, available_copies)
  values (p_org_id, code_clean, title_clean, btrim(coalesce(p_author, '')), p_total_copies, p_total_copies)
  returning id into output;
  return output;
end;
$$;

create or replace function public.manage_library_loan(
  p_org_id uuid,
  p_action text,
  p_book_id uuid default null,
  p_loan_id uuid default null,
  p_reader_code text default null,
  p_reader_name text default '',
  p_action_date date default current_date,
  p_due_date date default null
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  book_row public.library_books%rowtype;
  loan_row public.library_loans%rowtype;
  output uuid;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'library write denied' using errcode = '42501';
  end if;
  if p_action = 'lend' then
    if p_book_id is null or length(btrim(coalesce(p_reader_code, ''))) < 1 or p_due_date is null or p_due_date < p_action_date then
      raise exception 'invalid loan input' using errcode = '22023';
    end if;
    select * into book_row from public.library_books where id = p_book_id and organization_id = p_org_id for update;
    if not found then raise exception 'book not found' using errcode = '55000'; end if;
    if book_row.available_copies < 1 then raise exception 'no copies available' using errcode = '55000'; end if;
    update public.library_books set available_copies = available_copies - 1 where id = book_row.id;
    insert into public.library_loans (organization_id, book_id, reader_code, reader_name, issued_on, due_on, status, created_by)
    values (p_org_id, book_row.id, btrim(p_reader_code), btrim(coalesce(p_reader_name, '')), p_action_date, p_due_date, 'out', actor_id)
    returning id into output;
    return output;
  elsif p_action = 'return' then
    if p_loan_id is null then raise exception 'loan ID required' using errcode = '22023'; end if;
    select * into loan_row from public.library_loans where id = p_loan_id and organization_id = p_org_id for update;
    if not found then raise exception 'loan not found' using errcode = '55000'; end if;
    if loan_row.status <> 'out' then raise exception 'already returned' using errcode = '55000'; end if;
    if p_action_date < loan_row.issued_on then raise exception 'invalid return date' using errcode = '22023'; end if;
    update public.library_loans set status = 'returned', returned_on = p_action_date where id = loan_row.id;
    update public.library_books set available_copies = available_copies + 1 where id = loan_row.book_id;
    return loan_row.id;
  else
    raise exception 'unsupported library action' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.manage_library_book(uuid, text, text, text, integer),
  public.manage_library_loan(uuid, text, uuid, uuid, text, text, date, date) from public, anon, authenticated, service_role;
grant execute on function public.manage_library_book(uuid, text, text, text, integer),
  public.manage_library_loan(uuid, text, uuid, uuid, text, text, date, date) to authenticated;

-- 6. Licensing (30-day offline grace) & Payment Receipt Submissions (anti-duplicate + OCR metadata)
create table if not exists public.school_licenses (
  id uuid not null default gen_random_uuid() unique,
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  status text not null default 'trial' check (status in ('trial','active','grace','expired','suspended')),
  plan_code text not null default 'trial' check (length(btrim(plan_code)) between 1 and 60),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  grace_days integer not null default 30 check (grace_days between 0 and 90),
  offline_token_version integer not null default 1,
  notes text not null default '' check (length(notes) <= 400),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  provider_code text not null default 'manual' check (length(btrim(provider_code)) between 1 and 40),
  receipt_hash text not null unique check (receipt_hash ~ '^[a-f0-9]{64}$'),
  amount_declared numeric(12,2) check (amount_declared is null or amount_declared >= 0),
  currency text not null default 'TJS' check (currency in ('TJS','USD','RUB')),
  ocr_text text not null default '' check (length(ocr_text) <= 8000),
  ocr_confidence numeric(5,2),
  ocr_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(ocr_payload) = 'object'),
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  review_note text not null default '' check (length(review_note) <= 400),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payment_submissions_org_idx on public.payment_submissions (organization_id, status, created_at desc);

alter table public.school_licenses enable row level security;
alter table public.payment_submissions enable row level security;

drop policy if exists school_licenses_read on public.school_licenses;
create policy school_licenses_read on public.school_licenses for select to authenticated
  using ((select smartmaktab_private.is_developer()) or smartmaktab_private.can_read_org(organization_id));

drop policy if exists payment_submissions_read on public.payment_submissions;
create policy payment_submissions_read on public.payment_submissions for select to authenticated
  using ((select smartmaktab_private.is_developer()) or smartmaktab_private.can_write_school(organization_id));

revoke all on public.school_licenses, public.payment_submissions from public, anon, authenticated, service_role;
grant select on public.school_licenses, public.payment_submissions to authenticated;

drop trigger if exists audit_school_licenses on public.school_licenses;
create trigger audit_school_licenses after insert or update or delete on public.school_licenses
  for each row execute function smartmaktab_private.audit_write();
drop trigger if exists audit_payment_submissions on public.payment_submissions;
create trigger audit_payment_submissions after insert or update or delete on public.payment_submissions
  for each row execute function smartmaktab_private.audit_write();

create or replace function public.get_license_status(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare
  lic public.school_licenses%rowtype;
  now_ts timestamptz := now();
  grace_end timestamptz;
  eff_status text;
  allowed boolean;
  days_left integer;
  grace_left integer;
begin
  if auth.uid() is null or p_org_id is null
     or (not smartmaktab_private.is_developer() and not smartmaktab_private.can_read_org(p_org_id)) then
    raise exception 'license read denied' using errcode = '42501';
  end if;
  select * into lic from public.school_licenses where organization_id = p_org_id;
  if not found then
    return jsonb_build_object(
      'configured', false, 'organization_id', p_org_id, 'status', 'none', 'effective_status', 'none',
      'plan_code', null, 'expires_at', null, 'grace_days', 30, 'grace_until', null,
      'access_allowed', false, 'days_left', 0, 'grace_days_left', 0, 'server_now', now_ts
    );
  end if;
  grace_end := lic.expires_at + make_interval(days => lic.grace_days);
  if lic.status = 'suspended' then
    eff_status := 'suspended';
    allowed := false;
    days_left := 0;
    grace_left := 0;
  elsif now_ts <= lic.expires_at and lic.status in ('trial','active') then
    eff_status := lic.status;
    allowed := true;
    days_left := greatest(0, ceil(extract(epoch from (lic.expires_at - now_ts)) / 86400.0)::integer);
    grace_left := lic.grace_days;
  elsif now_ts <= grace_end and lic.status <> 'expired' then
    eff_status := 'grace';
    allowed := true;
    days_left := 0;
    grace_left := greatest(0, ceil(extract(epoch from (grace_end - now_ts)) / 86400.0)::integer);
  else
    eff_status := 'expired';
    allowed := false;
    days_left := 0;
    grace_left := 0;
  end if;
  return jsonb_build_object(
    'configured', true,
    'organization_id', lic.organization_id,
    'status', lic.status,
    'effective_status', eff_status,
    'plan_code', lic.plan_code,
    'starts_at', lic.starts_at,
    'expires_at', lic.expires_at,
    'grace_days', lic.grace_days,
    'grace_until', grace_end,
    'offline_token_version', lic.offline_token_version,
    'access_allowed', allowed,
    'days_left', days_left,
    'grace_days_left', grace_left,
    'server_now', now_ts
  );
end;
$$;

create or replace function public.submit_payment_receipt(
  p_org_id uuid,
  p_receipt_hash text,
  p_provider_code text default 'manual',
  p_amount_declared numeric default null,
  p_currency text default 'TJS',
  p_ocr_text text default '',
  p_ocr_confidence numeric default null,
  p_ocr_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  hash_clean text := lower(btrim(coalesce(p_receipt_hash, '')));
  output uuid;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'payment submission denied' using errcode = '42501';
  end if;
  if hash_clean !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid receipt hash' using errcode = '22023';
  end if;
  insert into public.payment_submissions (
    organization_id, submitted_by, provider_code, receipt_hash, amount_declared, currency, ocr_text, ocr_confidence, ocr_payload
  ) values (
    p_org_id, actor_id, coalesce(nullif(btrim(p_provider_code), ''), 'manual'), hash_clean,
    p_amount_declared, coalesce(nullif(btrim(p_currency), ''), 'TJS'),
    left(coalesce(p_ocr_text, ''), 8000), p_ocr_confidence, coalesce(p_ocr_payload, '{}'::jsonb)
  ) returning id into output;
  return output;
end;
$$;

-- 7. Workspace Context & Super-Admin RPCs
create or replace function public.get_my_workspace_context()
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  prof jsonb;
  roles jsonb;
begin
  if actor_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select jsonb_build_object('full_name', p.full_name, 'preferred_lang', p.preferred_lang)
  into prof from public.user_profiles p where p.user_id = actor_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', m.id,
    'organization_id', o.id,
    'organization_name', o.name,
    'kind', o.kind,
    'authority_tier', o.authority_tier,
    'region_name', o.region_name,
    'district_name', o.district_name,
    'school_code', o.school_code,
    'role', m.role
  ) order by o.name, o.id), '[]'::jsonb)
  into roles
  from public.school_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = actor_id;
  return jsonb_build_object(
    'user_id', actor_id,
    'is_super_admin', smartmaktab_private.is_developer(),
    'profile', coalesce(prof, jsonb_build_object('full_name', '', 'preferred_lang', 'tg')),
    'memberships', roles
  );
end;
$$;

create or replace function public.admin_upsert_organization(
  p_name text,
  p_kind text,
  p_parent_id uuid default null,
  p_authority_tier text default null,
  p_region_name text default null,
  p_district_name text default null,
  p_school_code text default null,
  p_org_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  cleaned text := btrim(coalesce(p_name, ''));
  output uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if length(cleaned) < 1 or length(cleaned) > 160 or p_kind not in ('school','education_authority') then
    raise exception 'invalid organization' using errcode = '22023';
  end if;
  if p_org_id is not null then
    update public.organizations
    set name = cleaned, parent_id = p_parent_id, authority_tier = p_authority_tier,
        region_name = p_region_name, district_name = p_district_name, school_code = p_school_code
    where id = p_org_id and kind = p_kind returning id into output;
    if not found then raise exception 'organization not found' using errcode = '55000'; end if;
  else
    insert into public.organizations (name, kind, parent_id, authority_tier, region_name, district_name, school_code)
    values (cleaned, p_kind, p_parent_id, p_authority_tier, p_region_name, p_district_name, p_school_code)
    returning id into output;
  end if;
  return output;
end;
$$;

create or replace function public.admin_assign_membership(p_user_id uuid, p_org_id uuid, p_role text)
returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare output uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if p_user_id is null or p_org_id is null or p_role not in ('school_admin','director','deputy','staff','teacher','authority_viewer','maorif') then
    raise exception 'invalid membership' using errcode = '22023';
  end if;
  insert into public.school_memberships (user_id, organization_id, role)
  values (p_user_id, p_org_id, p_role)
  on conflict (user_id, organization_id) do update set role = excluded.role
  returning id into output;
  return output;
end;
$$;

create or replace function public.admin_remove_membership(p_membership_id uuid)
returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare output uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  delete from public.school_memberships where id = p_membership_id returning id into output;
  if not found then raise exception 'membership not found' using errcode = '55000'; end if;
  return output;
end;
$$;

create or replace function public.admin_set_license(
  p_org_id uuid,
  p_status text,
  p_plan_code text,
  p_expires_at timestamptz,
  p_grace_days integer default 30,
  p_notes text default ''
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  output uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  insert into public.school_licenses (organization_id, status, plan_code, expires_at, grace_days, notes, updated_by, updated_at)
  values (p_org_id, p_status, p_plan_code, p_expires_at, p_grace_days, left(coalesce(p_notes, ''), 400), actor_id, now())
  on conflict (organization_id) do update
    set status = excluded.status, plan_code = excluded.plan_code, expires_at = excluded.expires_at,
        grace_days = excluded.grace_days, notes = excluded.notes, updated_by = actor_id,
        offline_token_version = public.school_licenses.offline_token_version + 1, updated_at = now()
  returning id into output;
  return output;
end;
$$;

create or replace function public.admin_review_payment(
  p_payment_id uuid,
  p_decision text,
  p_review_note text default '',
  p_extend_days integer default 30,
  p_plan_code text default 'standard'
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  sub_row public.payment_submissions%rowtype;
  base_ts timestamptz;
  existing_exp timestamptz;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if p_decision not in ('verified','rejected') or p_extend_days < 0 or p_extend_days > 3650 then
    raise exception 'invalid payment decision' using errcode = '22023';
  end if;
  select * into sub_row from public.payment_submissions where id = p_payment_id for update;
  if not found then raise exception 'payment not found' using errcode = '55000'; end if;
  if sub_row.status <> 'pending' then raise exception 'payment already reviewed' using errcode = '55000'; end if;
  update public.payment_submissions
  set status = p_decision, review_note = left(coalesce(p_review_note, ''), 400), reviewed_by = actor_id, reviewed_at = now()
  where id = sub_row.id;
  if p_decision = 'verified' and p_extend_days > 0 then
    select expires_at into existing_exp from public.school_licenses where organization_id = sub_row.organization_id;
    base_ts := greatest(now(), coalesce(existing_exp, now()));
    perform public.admin_set_license(sub_row.organization_id, 'active', coalesce(nullif(btrim(p_plan_code), ''), 'standard'), base_ts + make_interval(days => p_extend_days), 30, p_review_note);
  end if;
  return sub_row.id;
end;
$$;

revoke all on function public.get_license_status(uuid),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb),
  public.get_my_workspace_context(),
  public.admin_upsert_organization(text, text, uuid, text, text, text, text, uuid),
  public.admin_assign_membership(uuid, uuid, text),
  public.admin_remove_membership(uuid),
  public.admin_set_license(uuid, text, text, timestamptz, integer, text),
  public.admin_review_payment(uuid, text, text, integer, text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_license_status(uuid),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb),
  public.get_my_workspace_context(),
  public.admin_upsert_organization(text, text, uuid, text, text, text, text, uuid),
  public.admin_assign_membership(uuid, uuid, text),
  public.admin_remove_membership(uuid),
  public.admin_set_license(uuid, text, text, timestamptz, integer, text),
  public.admin_review_payment(uuid, text, text, integer, text)
  to authenticated;
