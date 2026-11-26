-- Migration: 20261126000200_role_tariffs_quotas_devices_cleanup.sql
-- 1) Removes duplicate test organizations (e.g., Cyrillic 'Дангара' / code '2026' without real data)
--    and adds super_admin RPC public.admin_delete_organization(p_org_id, p_force).
-- 2) Adds public.role_tariffs so super_admin can set individual prices, durations, login eligibility,
--    and default device limits for every position (cabinet).
-- 3) Adds account quotas & device anti-sharing controls:
--    - school_licenses: max_accounts, max_positions_per_account, default_max_devices
--    - school_memberships: primary_position, extra_positions, max_extra_positions, max_devices, account_active
--    - user_device_sessions + RPC claim_device_session / admin_reset_user_devices.
-- 4) Extends payment receipt submission and review to price and unlock specific positions + extras.

-- 1. Clean up duplicate/test Danghara rows (only empty test stubs with code '2026')
delete from public.organizations o
where o.kind = 'school'
  and o.district_name = 'Дангара'
  and o.school_code = '2026'
  and o.parent_id is null
  and not exists (select 1 from public.school_memberships m where m.organization_id = o.id)
  and not exists (select 1 from public.school_licenses l where l.organization_id = o.id)
  and not exists (select 1 from public.payment_submissions p where p.organization_id = o.id)
  and not exists (select 1 from public.school_records r where r.organization_id = o.id);

-- Normalize any remaining Cyrillic-г 'Дангара' district spelling to Tajik 'Данғара'
update public.organizations
set district_name = 'Данғара'
where district_name = 'Дангара';

-- 2. Individual tariffs & access rules per position (54 cabinets)
create table if not exists public.role_tariffs (
  position_code text primary key check (position_code ~ '^[a-z0-9-]{2,80}$'),
  group_code text not null check (group_code in ('school','advisers','subjects','office','raesat')),
  access_role text not null check (access_role in ('school_admin','director','deputy','staff','teacher','authority_viewer','maorif')),
  title_tg text not null check (length(btrim(title_tg)) between 1 and 160),
  title_ru text not null check (length(btrim(title_ru)) between 1 and 160),
  base_price_tjs numeric(12,2) not null default 10.00 check (base_price_tjs >= 0),
  extra_price_tjs numeric(12,2) not null default 5.00 check (extra_price_tjs >= 0),
  duration_days integer not null default 30 check (duration_days between 1 and 3650),
  default_max_devices integer not null default 1 check (default_max_devices between 1 and 10),
  can_receive_login boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.role_tariffs enable row level security;
drop policy if exists role_tariffs_read on public.role_tariffs;
create policy role_tariffs_read on public.role_tariffs
  for select to authenticated
  using (is_active = true or (select smartmaktab_private.is_developer()));

revoke all on public.role_tariffs from public, anon, authenticated, service_role;
grant select on public.role_tariffs to authenticated;

insert into public.role_tariffs (
  position_code, group_code, access_role, title_tg, title_ru, base_price_tjs, extra_price_tjs, duration_days, default_max_devices, can_receive_login, sort_order
) values
  ('school-director', 'school', 'school_admin', 'Директор', 'Директор школы', 30.00, 15.00, 30, 1, true, 1),
  ('school-academic-deputy', 'school', 'deputy', 'Муовини таълимӣ', 'Зам. по учебной работе', 20.00, 10.00, 30, 1, true, 2),
  ('school-upbringing-deputy', 'school', 'deputy', 'Муовини тарбиягӣ', 'Зам. по воспитательной работе', 20.00, 10.00, 30, 1, true, 3),
  ('school-primary-deputy', 'school', 'deputy', 'Муовини ибтидоӣ', 'Зам. по начальным классам', 20.00, 10.00, 30, 1, true, 4),
  ('school-military-preparation-deputy', 'school', 'deputy', 'Муовини ҳарбӣ', 'Зам. по военной подготовке', 15.00, 8.00, 30, 1, true, 5),
  ('school-sozmon', 'school', 'staff', 'Созмон', 'Созмон (ученическая организация)', 10.00, 5.00, 30, 1, true, 6),
  ('school-facilities-head', 'school', 'staff', 'Мудири хоҷагӣ', 'Завхоз', 15.00, 8.00, 30, 1, true, 7),
  ('school-library-head', 'school', 'staff', 'Мудири китобхона', 'Библиотекарь', 10.00, 5.00, 30, 1, true, 8),
  ('school-canteen-head', 'school', 'staff', 'Мудири ошхона', 'Заведующий столовой', 10.00, 5.00, 30, 1, true, 9),
  ('school-education-quality', 'school', 'staff', 'Сифати таҳсилот', 'Контроль качества образования', 18.00, 9.00, 30, 1, true, 10),
  ('school-psychologist', 'school', 'staff', 'Равоншинос', 'Школьный психолог', 12.00, 6.00, 30, 1, true, 11),
  ('school-records-clerk', 'school', 'staff', 'Коргузор', 'Делопроизводитель', 15.00, 8.00, 30, 1, true, 12),
  ('school-accountant', 'school', 'staff', 'Бухгалтер', 'Бухгалтер школы', 25.00, 12.00, 30, 1, true, 13),
  ('school-class-teacher', 'school', 'staff', 'Роҳбари синф', 'Классный руководитель', 10.00, 5.00, 30, 1, true, 14),
  ('school-girls-council-chair', 'school', 'staff', 'Раиси Шӯрои духтарон', 'Председатель совета девушек', 10.00, 5.00, 30, 1, true, 15),
  ('school-upper-class-method-group', 'school', 'staff', 'Иттиҳодияи методии синфҳои боло', 'Методобъединение старших классов', 10.00, 5.00, 30, 1, true, 16),
  ('school-lower-class-method-group', 'school', 'staff', 'Иттиҳодияи методии синфҳои поён', 'Методобъединение младших классов', 10.00, 5.00, 30, 1, true, 17),
  ('school-five-method-groups', 'school', 'staff', 'Панҷ иттиҳодияи методӣ', 'Пять методических объединений', 10.00, 5.00, 30, 1, true, 18),
  ('school-subject-room-head', 'school', 'staff', 'Мудири кабинети фаннӣ', 'Заведующий предметным кабинетом', 10.00, 5.00, 30, 1, true, 19),
  ('school-teacher', 'school', 'teacher', 'Муаллим / Омӯзгор', 'Учитель', 10.00, 5.00, 30, 1, true, 20),
  ('office-head', 'office', 'maorif', 'Роҳбари маориф', 'Руководитель маорифа', 40.00, 15.00, 30, 1, true, 21),
  ('office-accounting', 'office', 'maorif', 'Муҳосиботи маориф', 'Бухгалтерия маорифа', 30.00, 12.00, 30, 1, true, 22),
  ('raesat-head', 'raesat', 'authority_viewer', 'Роҳбари раёсат', 'Руководитель раёсата', 50.00, 20.00, 30, 1, true, 23),
  ('advisers-school-leadership', 'advisers', 'maorif', 'Мушовир · Роҳбарони мактабҳо', 'Методист · Руководители школ', 20.00, 10.00, 30, 1, true, 30),
  ('advisers-academic-work', 'advisers', 'maorif', 'Мушовир · Кори таълимӣ', 'Методист · Учебная работа', 20.00, 10.00, 30, 1, true, 31),
  ('advisers-upbringing', 'advisers', 'maorif', 'Мушовир · Кори тарбиявӣ', 'Методист · Воспитательная работа', 20.00, 10.00, 30, 1, true, 32),
  ('advisers-primary-administration', 'advisers', 'maorif', 'Мушовир · Зинаи ибтидоӣ', 'Методист · Начальная ступень', 20.00, 10.00, 30, 1, true, 33),
  ('advisers-military-preparation', 'advisers', 'maorif', 'Мушовир · Омодагии ҳарбӣ', 'Методист · Военная подготовка', 20.00, 10.00, 30, 1, true, 34),
  ('advisers-sozmon', 'advisers', 'maorif', 'Мушовир · Созмон', 'Методист · Созмон', 20.00, 10.00, 30, 1, true, 35),
  ('advisers-facilities', 'advisers', 'maorif', 'Мушовир · Хоҷагӣ ва амвол', 'Методист · Хозяйственная работа', 20.00, 10.00, 30, 1, true, 36),
  ('advisers-libraries', 'advisers', 'maorif', 'Мушовир · Китобхонаҳо', 'Методист · Школьные библиотеки', 20.00, 10.00, 30, 1, true, 37),
  ('advisers-school-meals', 'advisers', 'maorif', 'Мушовир · Ғизои мактабӣ', 'Методист · Школьное питание', 20.00, 10.00, 30, 1, true, 38),
  ('advisers-education-quality', 'advisers', 'maorif', 'Мушовир · Сифати таҳсилот', 'Методист · Качество образования', 20.00, 10.00, 30, 1, true, 39),
  ('advisers-psychological-services', 'advisers', 'maorif', 'Мушовир · Хадамоти равоншиносӣ', 'Методист · Психологическая служба', 20.00, 10.00, 30, 1, true, 40),
  ('advisers-records-management', 'advisers', 'maorif', 'Мушовир · Коргузорӣ', 'Методист · Делопроизводство', 20.00, 10.00, 30, 1, true, 41),
  ('advisers-school-accounting', 'advisers', 'maorif', 'Мушовир · Муҳосиботи мактабҳо', 'Методист · Бухгалтерии школ', 20.00, 10.00, 30, 1, true, 42),
  ('advisers-class-leadership', 'advisers', 'maorif', 'Мушовир · Роҳбарии синф', 'Методист · Классное руководство', 20.00, 10.00, 30, 1, true, 43),
  ('advisers-girls-councils', 'advisers', 'maorif', 'Мушовир · Шӯроҳои духтарон', 'Методист · Советы девушек', 20.00, 10.00, 30, 1, true, 44),
  ('advisers-upper-class-method-work', 'advisers', 'maorif', 'Мушовир · Методикаи синфҳои боло', 'Методист · Старшие классы', 20.00, 10.00, 30, 1, true, 45),
  ('advisers-lower-class-method-work', 'advisers', 'maorif', 'Мушовир · Методикаи синфҳои поён', 'Методист · Младшие классы', 20.00, 10.00, 30, 1, true, 46),
  ('advisers-method-groups', 'advisers', 'maorif', 'Мушовир · Иттиҳодияҳои методӣ', 'Методист · Методобъединения', 20.00, 10.00, 30, 1, true, 47),
  ('advisers-subject-rooms', 'advisers', 'maorif', 'Мушовир · Кабинетҳои фаннӣ', 'Методист · Предметные кабинеты', 20.00, 10.00, 30, 1, true, 48),
  ('advisers-teaching-support', 'advisers', 'maorif', 'Мушовир · Дастгирии омӯзгорон', 'Методист · Сопровождение учителей', 20.00, 10.00, 30, 1, true, 49),
  ('subjects-tajik-language-literature', 'subjects', 'maorif', 'Мушовир · Забон ва адабиёти тоҷик', 'Предметник · Таджикский язык', 20.00, 10.00, 30, 1, true, 50),
  ('subjects-russian-language', 'subjects', 'maorif', 'Мушовир · Забони русӣ', 'Предметник · Русский язык', 20.00, 10.00, 30, 1, true, 51),
  ('subjects-english-language', 'subjects', 'maorif', 'Мушовир · Забони англисӣ', 'Предметник · Английский язык', 20.00, 10.00, 30, 1, true, 52),
  ('subjects-informatics', 'subjects', 'maorif', 'Мушовир · Информатика', 'Предметник · Информатика', 20.00, 10.00, 30, 1, true, 53),
  ('subjects-mathematics', 'subjects', 'maorif', 'Мушовир · Математика', 'Предметник · Математика', 20.00, 10.00, 30, 1, true, 54),
  ('subjects-physics', 'subjects', 'maorif', 'Мушовир · Физика', 'Предметник · Физика', 20.00, 10.00, 30, 1, true, 55),
  ('subjects-chemistry', 'subjects', 'maorif', 'Мушовир · Химия', 'Предметник · Химия', 20.00, 10.00, 30, 1, true, 56),
  ('subjects-biology', 'subjects', 'maorif', 'Мушовир · Биология', 'Предметник · Биология', 20.00, 10.00, 30, 1, true, 57),
  ('subjects-history', 'subjects', 'maorif', 'Мушовир · Таърих', 'Предметник · История', 20.00, 10.00, 30, 1, true, 58),
  ('subjects-geography', 'subjects', 'maorif', 'Мушовир · География', 'Предметник · География', 20.00, 10.00, 30, 1, true, 59),
  ('subjects-primary-teaching', 'subjects', 'maorif', 'Мушовир · Таълими ибтидоӣ', 'Предметник · Начальное обучение', 20.00, 10.00, 30, 1, true, 60)
on conflict (position_code) do nothing;

create or replace function public.admin_upsert_role_tariff(
  p_position_code text,
  p_base_price_tjs numeric,
  p_extra_price_tjs numeric,
  p_duration_days integer default 30,
  p_default_max_devices integer default 1,
  p_can_receive_login boolean default true,
  p_is_active boolean default true,
  p_title_tg text default null,
  p_title_ru text default null
) returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  code_clean text := lower(btrim(coalesce(p_position_code, '')));
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if p_base_price_tjs < 0 or p_extra_price_tjs < 0 or p_duration_days < 1 or p_duration_days > 3650 or p_default_max_devices < 1 or p_default_max_devices > 10 then
    raise exception 'invalid role tariff' using errcode = '22023';
  end if;
  update public.role_tariffs
  set base_price_tjs = p_base_price_tjs,
      extra_price_tjs = p_extra_price_tjs,
      duration_days = p_duration_days,
      default_max_devices = p_default_max_devices,
      can_receive_login = coalesce(p_can_receive_login, true),
      is_active = coalesce(p_is_active, true),
      title_tg = coalesce(nullif(btrim(p_title_tg), ''), title_tg),
      title_ru = coalesce(nullif(btrim(p_title_ru), ''), title_ru),
      updated_by = auth.uid(),
      updated_at = now()
  where position_code = code_clean;
  if not found then
    raise exception 'role tariff not found' using errcode = '55000';
  end if;
  return code_clean;
end;
$$;

-- 3. School license quotas (accounts per org, positions per account, devices per account)
alter table public.school_licenses
  add column if not exists max_accounts integer not null default 1 check (max_accounts between 1 and 1000),
  add column if not exists max_positions_per_account integer not null default 1 check (max_positions_per_account between 1 and 20),
  add column if not exists default_max_devices integer not null default 1 check (default_max_devices between 1 and 10);

drop function if exists public.admin_set_license(uuid, text, text, timestamptz, integer, text);
create or replace function public.admin_set_license(
  p_org_id uuid,
  p_status text,
  p_plan_code text,
  p_expires_at timestamptz,
  p_grace_days integer default 30,
  p_notes text default '',
  p_max_accounts integer default 1,
  p_max_positions_per_account integer default 1,
  p_default_max_devices integer default 1
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  output uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if p_max_accounts < 1 or p_max_accounts > 1000 or p_max_positions_per_account < 1 or p_max_positions_per_account > 20 or p_default_max_devices < 1 or p_default_max_devices > 10 then
    raise exception 'invalid license quotas' using errcode = '22023';
  end if;
  insert into public.school_licenses (
    organization_id, status, plan_code, expires_at, grace_days, notes,
    max_accounts, max_positions_per_account, default_max_devices, updated_by, updated_at
  ) values (
    p_org_id, p_status, p_plan_code, p_expires_at, p_grace_days, left(coalesce(p_notes, ''), 400),
    p_max_accounts, p_max_positions_per_account, p_default_max_devices, actor_id, now()
  )
  on conflict (organization_id) do update
    set status = excluded.status,
        plan_code = excluded.plan_code,
        expires_at = excluded.expires_at,
        grace_days = excluded.grace_days,
        notes = excluded.notes,
        max_accounts = excluded.max_accounts,
        max_positions_per_account = excluded.max_positions_per_account,
        default_max_devices = excluded.default_max_devices,
        updated_by = actor_id,
        offline_token_version = public.school_licenses.offline_token_version + 1,
        updated_at = now()
  returning id into output;
  return output;
end;
$$;

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
  used_accounts integer := 0;
begin
  if auth.uid() is null or p_org_id is null
     or (not smartmaktab_private.is_developer() and not smartmaktab_private.can_read_org(p_org_id)) then
    raise exception 'license read denied' using errcode = '42501';
  end if;
  select count(*)::integer into used_accounts from public.school_memberships where organization_id = p_org_id and account_active = true;
  select * into lic from public.school_licenses where organization_id = p_org_id;
  if not found then
    return jsonb_build_object(
      'configured', false, 'organization_id', p_org_id, 'status', 'none', 'effective_status', 'none',
      'plan_code', null, 'expires_at', null, 'grace_days', 30, 'grace_until', null,
      'max_accounts', 1, 'max_positions_per_account', 1, 'default_max_devices', 1, 'used_accounts', used_accounts,
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
    'max_accounts', lic.max_accounts,
    'max_positions_per_account', lic.max_positions_per_account,
    'default_max_devices', lic.default_max_devices,
    'used_accounts', used_accounts,
    'access_allowed', allowed,
    'days_left', days_left,
    'grace_days_left', grace_left,
    'server_now', now_ts
  );
end;
$$;

-- 4. Membership position scope, extra positions quota, and device limits
alter table public.school_memberships
  add column if not exists primary_position text references public.role_tariffs (position_code),
  add column if not exists extra_positions text[] not null default '{}',
  add column if not exists max_extra_positions integer not null default 0 check (max_extra_positions between 0 and 19),
  add column if not exists max_devices integer not null default 1 check (max_devices between 1 and 10),
  add column if not exists account_active boolean not null default true;

alter table public.school_memberships drop constraint if exists school_memberships_extras_quota_chk;
alter table public.school_memberships
  add constraint school_memberships_extras_quota_chk
    check (coalesce(array_length(extra_positions, 1), 0) <= max_extra_positions);

grant select (primary_position, extra_positions, max_extra_positions, max_devices, account_active)
  on public.school_memberships to authenticated;

-- 5. Device session binding (anti-password-sharing protection)
create table if not exists public.user_device_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  device_id text not null check (length(btrim(device_id)) between 8 and 128),
  device_label text not null default '' check (length(device_label) <= 160),
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, organization_id, device_id)
);

create index if not exists user_device_sessions_lookup_idx
  on public.user_device_sessions (user_id, organization_id, is_active);

alter table public.user_device_sessions enable row level security;
drop policy if exists user_device_sessions_read on public.user_device_sessions;
create policy user_device_sessions_read on public.user_device_sessions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select smartmaktab_private.is_developer()));

revoke all on public.user_device_sessions from public, anon, authenticated, service_role;
grant select on public.user_device_sessions to authenticated;

drop trigger if exists audit_user_device_sessions on public.user_device_sessions;
create trigger audit_user_device_sessions after insert or update or delete on public.user_device_sessions
  for each row execute function smartmaktab_private.audit_write();

-- Update admin_assign_membership preserving 3-arg backwards compatibility
drop function if exists public.admin_assign_membership(uuid, uuid, text);
create or replace function public.admin_assign_membership(
  p_user_id uuid,
  p_org_id uuid,
  p_role text,
  p_primary_position text default null,
  p_extra_positions text[] default '{}'::text[],
  p_max_extra_positions integer default 0,
  p_max_devices integer default 1,
  p_account_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  pos_clean text := nullif(lower(btrim(coalesce(p_primary_position, ''))), '');
  pos_row public.role_tariffs%rowtype;
  extras_clean text[];
  max_ext integer := coalesce(p_max_extra_positions, 0);
  max_dev integer := coalesce(p_max_devices, 1);
  resolved_role text := p_role;
  output uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if p_user_id is null or p_org_id is null or resolved_role not in ('school_admin','director','deputy','staff','teacher','authority_viewer','maorif') then
    raise exception 'invalid membership' using errcode = '22023';
  end if;
  if max_ext < 0 or max_ext > 19 or max_dev < 1 or max_dev > 10 then
    raise exception 'invalid position or device quota' using errcode = '22023';
  end if;

  if pos_clean is not null then
    select * into pos_row from public.role_tariffs where position_code = pos_clean;
    if not found then
      raise exception 'unknown primary position' using errcode = '22023';
    end if;
    if not pos_row.can_receive_login then
      raise exception 'position_login_disabled' using errcode = '22023';
    end if;
    if resolved_role is null or resolved_role = '' then
      resolved_role := pos_row.access_role;
    end if;
  end if;

  select coalesce(array_agg(distinct val order by val), '{}'::text[])
  into extras_clean
  from unnest(coalesce(p_extra_positions, '{}'::text[])) as val
  where val is not null and btrim(val) <> '' and (pos_clean is null or val <> pos_clean)
    and exists (select 1 from public.role_tariffs rt where rt.position_code = val);

  if coalesce(array_length(extras_clean, 1), 0) > max_ext then
    raise exception 'extra_positions_exceed_quota' using errcode = '22023';
  end if;

  insert into public.school_memberships (
    user_id, organization_id, role, primary_position, extra_positions, max_extra_positions, max_devices, account_active
  ) values (
    p_user_id, p_org_id, resolved_role, pos_clean, extras_clean, max_ext, max_dev, coalesce(p_account_active, true)
  )
  on conflict (user_id, organization_id) do update
    set role = excluded.role,
        primary_position = excluded.primary_position,
        extra_positions = excluded.extra_positions,
        max_extra_positions = excluded.max_extra_positions,
        max_devices = excluded.max_devices,
        account_active = excluded.account_active
  returning id into output;
  return output;
end;
$$;

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
    'role', m.role,
    'primary_position', m.primary_position,
    'extra_positions', m.extra_positions,
    'max_extra_positions', m.max_extra_positions,
    'max_devices', m.max_devices,
    'account_active', m.account_active,
    'active_devices_count', (
      select count(*)::integer from public.user_device_sessions ds
      where ds.user_id = m.user_id and ds.organization_id = m.organization_id and ds.is_active = true
    )
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

-- Device claim + cabinet position gate RPC
create or replace function public.claim_device_session(
  p_org_id uuid,
  p_device_id text,
  p_device_label text default '',
  p_cabinet_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  dev_clean text := btrim(coalesce(p_device_id, ''));
  cab_clean text := nullif(lower(btrim(coalesce(p_cabinet_id, ''))), '');
  cab_group text;
  m_row public.school_memberships%rowtype;
  lic_status jsonb;
  already_active boolean := false;
  active_cnt integer := 0;
  pos_allowed boolean := true;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_org_id is null or length(dev_clean) < 8 or length(dev_clean) > 128 then
    raise exception 'invalid device claim parameters' using errcode = '22023';
  end if;

  if smartmaktab_private.is_developer() then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'super_admin',
      'max_devices', 10,
      'active_devices', 0
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sm-device-claim:' || actor_id::text || ':' || p_org_id::text, 0));

  select * into m_row
  from public.school_memberships
  where user_id = actor_id and organization_id = p_org_id;

  if not found or not m_row.account_active then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'account_disabled'
    );
  end if;

  if cab_clean is not null then
    if m_row.primary_position is not null then
      pos_allowed := (cab_clean = m_row.primary_position) or (cab_clean = any(m_row.extra_positions));
    else
      select group_code into cab_group from public.role_tariffs where position_code = cab_clean;
      pos_allowed := case m_row.role
        when 'school_admin' then cab_group = 'school'
        when 'director' then cab_group = 'school'
        when 'deputy' then cab_group = 'school' and cab_clean <> 'school-director'
        when 'teacher' then cab_clean in ('school-teacher','school-class-teacher','school-subject-room-head')
        when 'staff' then cab_group = 'school' and cab_clean <> 'school-director'
        when 'maorif' then cab_group in ('office','advisers','subjects')
        when 'authority_viewer' then cab_group in ('raesat','office','advisers','subjects')
        else false
      end;
    end if;

    if not pos_allowed then
      return jsonb_build_object(
        'allowed', false,
        'reason', 'position_not_allowed',
        'cabinet_id', cab_clean,
        'primary_position', m_row.primary_position,
        'extra_positions', m_row.extra_positions,
        'max_extra_positions', m_row.max_extra_positions
      );
    end if;
  end if;

  lic_status := public.get_license_status(p_org_id);
  if (lic_status ->> 'configured')::boolean = true and (lic_status ->> 'access_allowed')::boolean = false then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'license_blocked',
      'license_status', lic_status ->> 'effective_status'
    );
  end if;

  select exists (
    select 1 from public.user_device_sessions
    where user_id = actor_id and organization_id = p_org_id and device_id = dev_clean and is_active = true
  ) into already_active;

  select count(*)::integer into active_cnt
  from public.user_device_sessions
  where user_id = actor_id and organization_id = p_org_id and is_active = true;

  if already_active then
    update public.user_device_sessions
    set last_seen_at = now(),
        device_label = coalesce(nullif(left(btrim(p_device_label), 160), ''), device_label)
    where user_id = actor_id and organization_id = p_org_id and device_id = dev_clean;
    return jsonb_build_object(
      'allowed', true,
      'reason', 'existing_device',
      'max_devices', m_row.max_devices,
      'active_devices', active_cnt,
      'primary_position', m_row.primary_position,
      'extra_positions', m_row.extra_positions
    );
  end if;

  if active_cnt >= m_row.max_devices then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'device_limit_reached',
      'max_devices', m_row.max_devices,
      'active_devices', active_cnt
    );
  end if;

  insert into public.user_device_sessions (user_id, organization_id, device_id, device_label, is_active, first_seen_at, last_seen_at)
  values (actor_id, p_org_id, dev_clean, left(btrim(coalesce(p_device_label, '')), 160), true, now(), now())
  on conflict (user_id, organization_id, device_id) do update
    set is_active = true,
        last_seen_at = now(),
        device_label = left(btrim(coalesce(p_device_label, '')), 160);

  return jsonb_build_object(
    'allowed', true,
    'reason', 'registered',
    'max_devices', m_row.max_devices,
    'active_devices', active_cnt + 1,
    'primary_position', m_row.primary_position,
    'extra_positions', m_row.extra_positions
  );
end;
$$;

create or replace function public.admin_reset_user_devices(
  p_user_id uuid,
  p_org_id uuid,
  p_device_id text default null
) returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  removed_count integer := 0;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if p_device_id is not null and btrim(p_device_id) <> '' then
    delete from public.user_device_sessions
    where user_id = p_user_id and organization_id = p_org_id and device_id = btrim(p_device_id);
  else
    delete from public.user_device_sessions
    where user_id = p_user_id and organization_id = p_org_id;
  end if;
  get diagnostics removed_count = row_count;
  return removed_count;
end;
$$;

-- 6. Safe organization deletion RPC for super_admin
create or replace function public.admin_delete_organization(
  p_org_id uuid,
  p_force boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  org_row public.organizations%rowtype;
  child_cnt integer := 0;
  mem_cnt integer := 0;
  lic_cnt integer := 0;
  pay_cnt integer := 0;
  rec_cnt integer := 0;
  sum_cnt integer := 0;
  lib_cnt integer := 0;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if p_org_id is null then
    raise exception 'organization ID required' using errcode = '22023';
  end if;

  select * into org_row from public.organizations where id = p_org_id;
  if not found then
    raise exception 'organization not found' using errcode = '55000';
  end if;

  select count(*)::integer into child_cnt from public.organizations where parent_id = p_org_id;
  if child_cnt > 0 and not p_force then
    raise exception 'has_child_organizations:%', child_cnt using errcode = '55000';
  end if;

  select count(*)::integer into mem_cnt from public.school_memberships where organization_id = p_org_id;
  select count(*)::integer into lic_cnt from public.school_licenses where organization_id = p_org_id;
  select count(*)::integer into pay_cnt from public.payment_submissions where organization_id = p_org_id;
  select count(*)::integer into rec_cnt from public.school_records where organization_id = p_org_id;
  select count(*)::integer into sum_cnt from public.school_summary_revisions where organization_id = p_org_id;
  select count(*)::integer into lib_cnt from public.library_books where organization_id = p_org_id;

  if (mem_cnt + lic_cnt + pay_cnt + rec_cnt + sum_cnt + lib_cnt) > 0 and not p_force then
    raise exception 'organization_has_data:members=%,licenses=%,payments=%,records=%', mem_cnt, lic_cnt, pay_cnt, rec_cnt using errcode = '55000';
  end if;

  if child_cnt > 0 then
    update public.organizations set parent_id = null where parent_id = p_org_id;
  end if;

  delete from smartmaktab_private.summary_requests
  where revision_id in (select id from public.school_summary_revisions where organization_id = p_org_id);
  delete from smartmaktab_private.summary_scope where school_id = p_org_id or authority_id = p_org_id;
  delete from public.school_summary_revisions where organization_id = p_org_id;
  delete from public.library_loans where organization_id = p_org_id;
  delete from public.library_books where organization_id = p_org_id;
  delete from public.school_records where organization_id = p_org_id;
  delete from public.user_device_sessions where organization_id = p_org_id;
  delete from public.payment_submissions where organization_id = p_org_id;
  delete from public.school_licenses where organization_id = p_org_id;
  delete from public.school_memberships where organization_id = p_org_id;
  delete from public.organizations where id = p_org_id;

  return jsonb_build_object(
    'deleted_id', p_org_id,
    'name', org_row.name,
    'detached_children', child_cnt,
    'removed_memberships', mem_cnt
  );
end;
$$;

-- 7. Position-aware payment submission and approval
drop function if exists public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text);
create or replace function public.submit_payment_receipt(
  p_org_id uuid,
  p_receipt_hash text,
  p_provider_code text default 'manual',
  p_amount_declared numeric default null,
  p_currency text default 'TJS',
  p_ocr_text text default '',
  p_ocr_confidence numeric default null,
  p_ocr_payload jsonb default '{}'::jsonb,
  p_transaction_id text default null,
  p_recipient_account text default null,
  p_status_confirmed boolean default false,
  p_plan_code text default 'trial_10',
  p_primary_position text default null,
  p_extra_positions text[] default '{}'::text[]
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  hash_clean text := lower(btrim(coalesce(p_receipt_hash, '')));
  prov_clean text := lower(coalesce(nullif(btrim(p_provider_code), ''), 'manual'));
  tx_clean text := nullif(regexp_replace(upper(btrim(coalesce(p_transaction_id, ''))), '[^A-Z0-9-]', '', 'g'), '');
  digits text := regexp_replace(coalesce(p_recipient_account, ''), '\D', '', 'g');
  recip_clean text := case
    when length(digits) = 9 then '992' || digits
    when length(digits) >= 10 then digits
    else null
  end;
  plan_row public.subscription_plans%rowtype;
  pos_clean text := nullif(lower(btrim(coalesce(p_primary_position, ''))), '');
  pos_row public.role_tariffs%rowtype;
  extras_clean text[] := '{}'::text[];
  extra_sum numeric := 0;
  required_amount numeric := 0;
  required_days integer := 30;
  required_devices integer := 1;
  chosen_plan text := coalesce(nullif(btrim(p_plan_code), ''), 'trial_10');
  ocr_source text := coalesce(p_ocr_payload ->> 'source', '');
  enriched_payload jsonb;
  auto_verified boolean := false;
  existing_exp timestamptz;
  base_ts timestamptz;
  output uuid;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'payment submission denied' using errcode = '42501';
  end if;
  if hash_clean !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid receipt hash' using errcode = '22023';
  end if;

  select * into plan_row from public.subscription_plans where code = chosen_plan and is_active = true;
  if not found then
    select * into plan_row from public.subscription_plans where is_active = true order by updated_at desc limit 1;
  end if;

  if pos_clean is not null then
    select * into pos_row from public.role_tariffs where position_code = pos_clean and is_active = true;
    if found then
      select coalesce(array_agg(distinct val order by val), '{}'::text[])
      into extras_clean
      from unnest(coalesce(p_extra_positions, '{}'::text[])) as val
      where val is not null and btrim(val) <> '' and val <> pos_clean
        and exists (select 1 from public.role_tariffs rt where rt.position_code = val and rt.is_active = true);

      select coalesce(sum(rt.extra_price_tjs), 0)
      into extra_sum
      from public.role_tariffs rt
      where rt.position_code = any(extras_clean);

      required_amount := pos_row.base_price_tjs + extra_sum;
      required_days := pos_row.duration_days;
      required_devices := pos_row.default_max_devices;
      chosen_plan := 'pos:' || pos_clean;
    else
      pos_clean := null;
    end if;
  end if;

  if pos_clean is null and plan_row.code is not null then
    required_amount := plan_row.price_tjs;
    required_days := plan_row.duration_days;
    chosen_plan := plan_row.code;
  end if;

  if plan_row.recipient_account is not null
     and ocr_source = 'ocr_space'
     and p_status_confirmed = true
     and tx_clean is not null
     and recip_clean = plan_row.recipient_account
     and coalesce(p_amount_declared, 0) >= required_amount then
    auto_verified := true;
  end if;

  enriched_payload := coalesce(p_ocr_payload, '{}'::jsonb) || jsonb_build_object(
    'primary_position', pos_clean,
    'extra_positions', to_jsonb(extras_clean),
    'expected_amount_tjs', required_amount,
    'expected_days', required_days
  );

  insert into public.payment_submissions (
    organization_id, submitted_by, provider_code, receipt_hash, amount_declared, currency,
    ocr_text, ocr_confidence, ocr_payload, transaction_id, recipient_account, status_confirmed, plan_code,
    status, review_note, reviewed_by, reviewed_at
  ) values (
    p_org_id, actor_id, prov_clean, hash_clean, p_amount_declared,
    coalesce(nullif(btrim(p_currency), ''), 'TJS'),
    left(coalesce(p_ocr_text, ''), 8000), p_ocr_confidence,
    enriched_payload, tx_clean, recip_clean, coalesce(p_status_confirmed, false),
    chosen_plan,
    case when auto_verified then 'verified' else 'pending' end,
    case when auto_verified then 'Auto-verified via server OCR' else '' end,
    case when auto_verified then actor_id else null end,
    case when auto_verified then now() else null end
  ) returning id into output;

  if auto_verified then
    select expires_at into existing_exp from public.school_licenses where organization_id = p_org_id;
    base_ts := greatest(now(), coalesce(existing_exp, now()));
    insert into public.school_licenses (
      organization_id, status, plan_code, expires_at, grace_days, notes,
      max_positions_per_account, default_max_devices, updated_by, updated_at
    ) values (
      p_org_id, 'active', chosen_plan, base_ts + make_interval(days => required_days), 30,
      'Auto-verified payment ' || tx_clean,
      greatest(1, 1 + coalesce(array_length(extras_clean, 1), 0)),
      required_devices, actor_id, now()
    )
    on conflict (organization_id) do update
      set status = 'active',
          plan_code = excluded.plan_code,
          expires_at = excluded.expires_at,
          grace_days = 30,
          notes = excluded.notes,
          max_positions_per_account = greatest(public.school_licenses.max_positions_per_account, excluded.max_positions_per_account),
          updated_by = actor_id,
          offline_token_version = public.school_licenses.offline_token_version + 1,
          updated_at = now();

    if pos_clean is not null then
      update public.school_memberships
      set primary_position = coalesce(primary_position, pos_clean),
          extra_positions = (
            select coalesce(array_agg(distinct val order by val), '{}'::text[])
            from unnest(coalesce(extra_positions, '{}'::text[]) || extras_clean) as val
            where val <> coalesce(primary_position, pos_clean)
          ),
          max_extra_positions = greatest(
            max_extra_positions,
            (
              select coalesce(count(distinct val)::integer, 0)
              from unnest(coalesce(extra_positions, '{}'::text[]) || extras_clean) as val
              where val <> coalesce(primary_position, pos_clean)
            )
          ),
          max_devices = least(max_devices, required_devices)
      where user_id = actor_id and organization_id = p_org_id;
    end if;
  end if;

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
  req_pos text;
  req_extras text[];
  cur_lic public.school_licenses%rowtype;
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
    select * into cur_lic from public.school_licenses where organization_id = sub_row.organization_id;
    existing_exp := cur_lic.expires_at;
    base_ts := greatest(now(), coalesce(existing_exp, now()));
    req_pos := nullif(btrim(coalesce(sub_row.ocr_payload ->> 'primary_position', '')), '');
    select coalesce(array_agg(x), '{}'::text[])
    into req_extras
    from jsonb_array_elements_text(coalesce(sub_row.ocr_payload -> 'extra_positions', '[]'::jsonb)) as x
    where exists (select 1 from public.role_tariffs rt where rt.position_code = x);

    perform public.admin_set_license(
      sub_row.organization_id,
      'active',
      coalesce(nullif(btrim(sub_row.plan_code), ''), nullif(btrim(p_plan_code), ''), 'standard'),
      base_ts + make_interval(days => p_extend_days),
      30,
      p_review_note,
      greatest(coalesce(cur_lic.max_accounts, 1), 1),
      greatest(coalesce(cur_lic.max_positions_per_account, 1), 1 + coalesce(array_length(req_extras, 1), 0)),
      greatest(coalesce(cur_lic.default_max_devices, 1), 1)
    );

    if req_pos is not null and exists (select 1 from public.role_tariffs rt where rt.position_code = req_pos) then
      update public.school_memberships
      set primary_position = coalesce(primary_position, req_pos),
          extra_positions = (
            select coalesce(array_agg(distinct val order by val), '{}'::text[])
            from unnest(coalesce(extra_positions, '{}'::text[]) || req_extras) as val
            where val <> coalesce(primary_position, req_pos)
          ),
          max_extra_positions = greatest(
            max_extra_positions,
            (
              select coalesce(count(distinct val)::integer, 0)
              from unnest(coalesce(extra_positions, '{}'::text[]) || req_extras) as val
              where val <> coalesce(primary_position, req_pos)
            )
          )
      where user_id = sub_row.submitted_by and organization_id = sub_row.organization_id;
    end if;
  end if;
  return sub_row.id;
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
  reg_clean text := nullif(btrim(coalesce(p_region_name, '')), '');
  dist_raw text := nullif(btrim(coalesce(p_district_name, '')), '');
  dist_clean text := case when dist_raw = 'Дангара' then 'Данғара' else dist_raw end;
  code_clean text := nullif(btrim(coalesce(p_school_code, '')), '');
  output uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if length(cleaned) < 1 or length(cleaned) > 160 or p_kind not in ('school','education_authority') then
    raise exception 'invalid organization' using errcode = '22023';
  end if;
  if p_org_id is not null then
    update public.organizations
    set name = cleaned, parent_id = p_parent_id, authority_tier = p_authority_tier,
        region_name = reg_clean, district_name = dist_clean, school_code = code_clean
    where id = p_org_id and kind = p_kind returning id into output;
    if not found then raise exception 'organization not found' using errcode = '55000'; end if;
  else
    insert into public.organizations (name, kind, parent_id, authority_tier, region_name, district_name, school_code)
    values (cleaned, p_kind, p_parent_id, p_authority_tier, reg_clean, dist_clean, code_clean)
    returning id into output;
  end if;
  return output;
end;
$$;

revoke all on function
  public.admin_upsert_organization(text, text, uuid, text, text, text, text, uuid),
  public.admin_upsert_role_tariff(text, numeric, numeric, integer, integer, boolean, boolean, text, text),
  public.admin_set_license(uuid, text, text, timestamptz, integer, text, integer, integer, integer),
  public.admin_assign_membership(uuid, uuid, text, text, text[], integer, integer, boolean),
  public.claim_device_session(uuid, text, text, text),
  public.admin_reset_user_devices(uuid, uuid, text),
  public.admin_delete_organization(uuid, boolean),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[]),
  public.admin_review_payment(uuid, text, text, integer, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.admin_upsert_organization(text, text, uuid, text, text, text, text, uuid),
  public.admin_upsert_role_tariff(text, numeric, numeric, integer, integer, boolean, boolean, text, text),
  public.admin_set_license(uuid, text, text, timestamptz, integer, text, integer, integer, integer),
  public.admin_assign_membership(uuid, uuid, text, text, text[], integer, integer, boolean),
  public.claim_device_session(uuid, text, text, text),
  public.admin_reset_user_devices(uuid, uuid, text),
  public.admin_delete_organization(uuid, boolean),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[]),
  public.admin_review_payment(uuid, text, text, integer, text)
  to authenticated;
