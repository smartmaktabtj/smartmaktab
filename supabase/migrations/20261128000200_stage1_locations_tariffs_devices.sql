-- Stage 1 migration:
-- 1) Clean duplicate regions/districts in tajikistan_locations and organizations (merge 'Ҳамадонӣ' -> 'Мир Сайид Алии Ҳамадонӣ', keep 'МТМУ 45' normalized to 'Хатлон').
-- 2) Update method-group role_tariffs titles and set default_max_devices = 2 (1 mobile + 1 desktop per role slot, up to 40).
-- 3) Split device tracking into 'mobile' and 'desktop' slots (1 mobile + 1 desktop per role) in user_device_sessions & claim_device_session.
-- 4) Add self-device list/revoke RPCs (get_my_device_sessions, revoke_my_device_session) and leadership hierarchy RPCs for 'Корбарон' (get_managed_users, manage_reset_user_devices, manage_set_user_active, service_* helpers).

-- ---------------------------------------------------------------------------
-- 1. Normalize region names and deduplicate locations / districts
-- ---------------------------------------------------------------------------
update public.organizations
set region_name = case
  when lower(btrim(coalesce(region_name, ''))) in ('вилояти суғд', 'вилояти сугд', 'сугд') then 'Суғд'
  when lower(btrim(coalesce(region_name, ''))) in ('вилояти хатлон') then 'Хатлон'
  when lower(btrim(coalesce(region_name, ''))) in ('шаҳри душанбе', 'ш. душанбе') then 'Душанбе'
  when lower(btrim(coalesce(region_name, ''))) in ('вилояти мухтори кӯҳистони бадахшон', 'гбао') then 'ВМКБ'
  when lower(btrim(coalesce(region_name, ''))) in ('нтҷ', 'нтм', 'нохияхои тобеи чумхури') then 'Ноҳияҳои тобеи ҷумҳурӣ'
  else nullif(btrim(region_name), '')
end
where region_name is not null;

-- Merge duplicate authority 'Маорифи н. Ҳамадонӣ' into 'Маорифи н. Мир Сайид Алии Ҳамадонӣ' if both exist
do $$
declare
  v_keep_id uuid;
  v_dup_id uuid;
begin
  select id into v_keep_id
  from public.organizations
  where kind = 'education_authority' and authority_tier = 'maorif'
    and district_name = 'Мир Сайид Алии Ҳамадонӣ'
  limit 1;

  select id into v_dup_id
  from public.organizations
  where kind = 'education_authority' and authority_tier = 'maorif'
    and district_name = 'Ҳамадонӣ'
  limit 1;

  if v_keep_id is not null and v_dup_id is not null and v_keep_id <> v_dup_id then
    update public.organizations set parent_id = v_keep_id where parent_id = v_dup_id;
    update public.school_memberships set organization_id = v_keep_id
    where organization_id = v_dup_id
      and not exists (
        select 1 from public.school_memberships m2
        where m2.user_id = public.school_memberships.user_id and m2.organization_id = v_keep_id
      );
    delete from public.school_memberships where organization_id = v_dup_id;
    update public.user_device_sessions set organization_id = v_keep_id
    where organization_id = v_dup_id
      and not exists (
        select 1 from public.user_device_sessions d2
        where d2.user_id = public.user_device_sessions.user_id and d2.organization_id = v_keep_id and d2.device_id = public.user_device_sessions.device_id
      );
    delete from public.user_device_sessions where organization_id = v_dup_id;
    delete from smartmaktab_private.summary_scope where authority_id = v_dup_id;
    delete from public.school_licenses where organization_id = v_dup_id;
    delete from public.payment_submissions where organization_id = v_dup_id;
    delete from public.school_records where organization_id = v_dup_id;
    delete from public.organizations where id = v_dup_id;
  elsif v_keep_id is null and v_dup_id is not null then
    update public.organizations
    set district_name = 'Мир Сайид Алии Ҳамадонӣ',
        name = 'Маорифи н. Мир Сайид Алии Ҳамадонӣ'
    where id = v_dup_id;
  end if;
end;
$$;

update public.organizations
set district_name = 'Мир Сайид Алии Ҳамадонӣ'
where district_name = 'Ҳамадонӣ';

-- Clean tajikistan_locations safely without breaking unique index
drop index if exists tajikistan_locations_unique_idx;

update public.tajikistan_locations
set
  region_name = case
    when lower(btrim(coalesce(region_name, ''))) in ('вилояти суғд', 'вилояти сугд', 'сугд') then 'Суғд'
    when lower(btrim(coalesce(region_name, ''))) in ('вилояти хатлон') then 'Хатлон'
    when lower(btrim(coalesce(region_name, ''))) in ('шаҳри душанбе', 'ш. душанбе') then 'Душанбе'
    when lower(btrim(coalesce(region_name, ''))) in ('вилояти мухтори кӯҳистони бадахшон', 'гбао') then 'ВМКБ'
    when lower(btrim(coalesce(region_name, ''))) in ('нтҷ', 'нтм', 'нохияхои тобеи чумхури') then 'Ноҳияҳои тобеи ҷумҳурӣ'
    else btrim(region_name)
  end,
  district_name = case
    when btrim(district_name) = 'Ҳамадонӣ' then 'Мир Сайид Алии Ҳамадонӣ'
    else btrim(district_name)
  end,
  jamoat_name = btrim(jamoat_name),
  village_name = btrim(village_name);

with ranked_locs as (
  select id,
    row_number() over (
      partition by lower(btrim(region_name)), lower(btrim(district_name)), lower(btrim(jamoat_name)), lower(btrim(village_name))
      order by created_at asc, id asc
    ) as rn
  from public.tajikistan_locations
)
delete from public.tajikistan_locations l
using ranked_locs r
where l.id = r.id and r.rn > 1;

create unique index if not exists tajikistan_locations_unique_idx
  on public.tajikistan_locations (lower(region_name), lower(district_name), lower(jamoat_name), lower(village_name));

-- Update get_registration_bootstrap to sort cleanly and include default_max_devices
create or replace function public.get_registration_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_schools jsonb;
  v_authorities jsonb;
  v_tariffs jsonb;
  v_locations jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'region_name', o.region_name,
    'district_name', o.district_name,
    'jamoat_name', o.jamoat_name,
    'village_name', o.village_name,
    'school_code', o.school_code,
    'parent_id', o.parent_id,
    'verification_status', o.verification_status
  ) order by o.region_name, o.district_name, o.name), '[]'::jsonb)
  into v_schools
  from public.organizations o
  where o.kind = 'school';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'authority_tier', o.authority_tier,
    'region_name', o.region_name,
    'district_name', o.district_name,
    'parent_id', o.parent_id
  ) order by o.region_name, o.district_name, o.name), '[]'::jsonb)
  into v_authorities
  from public.organizations o
  where o.kind = 'education_authority';

  select coalesce(jsonb_agg(jsonb_build_object(
    'position_code', rt.position_code,
    'group_code', rt.group_code,
    'access_role', rt.access_role,
    'title_tg', rt.title_tg,
    'title_ru', rt.title_ru,
    'base_price_tjs', rt.base_price_tjs,
    'extra_price_tjs', rt.extra_price_tjs,
    'duration_days', rt.duration_days,
    'default_max_devices', rt.default_max_devices,
    'sort_order', rt.sort_order
  ) order by rt.sort_order), '[]'::jsonb)
  into v_tariffs
  from public.role_tariffs rt
  where rt.group_code = 'school' and rt.is_active = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'region_name', l.region_name,
    'district_name', l.district_name,
    'jamoat_name', l.jamoat_name,
    'village_name', l.village_name
  ) order by l.region_name, l.district_name, l.jamoat_name, l.village_name), '[]'::jsonb)
  into v_locations
  from public.tajikistan_locations l;

  return jsonb_build_object(
    'schools', v_schools,
    'authorities', v_authorities,
    'tariffs', v_tariffs,
    'locations', v_locations,
    'aliya_price_tjs', 30
  );
end;
$$;

revoke all on function public.get_registration_bootstrap() from public, anon, authenticated, service_role;
grant execute on function public.get_registration_bootstrap() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Role tariffs & expanded device quotas (1 mobile + 1 desktop per role, up to 40)
-- ---------------------------------------------------------------------------
alter table public.role_tariffs drop constraint if exists role_tariffs_default_max_devices_check;
alter table public.role_tariffs add constraint role_tariffs_default_max_devices_check
  check (default_max_devices between 1 and 40);

alter table public.school_licenses drop constraint if exists school_licenses_default_max_devices_check;
alter table public.school_licenses add constraint school_licenses_default_max_devices_check
  check (default_max_devices between 1 and 40);

alter table public.school_memberships drop constraint if exists school_memberships_max_devices_check;
alter table public.school_memberships add constraint school_memberships_max_devices_check
  check (max_devices between 1 and 40);

update public.role_tariffs
set default_max_devices = 2,
    updated_at = now()
where is_active = true and default_max_devices < 2;

update public.role_tariffs
set title_tg = 'Иттиҳодияи методии роҳбарони синфҳои 5-11',
    title_ru = 'Иттиҳодияи методии роҳбарони синфҳои 5-11',
    updated_at = now()
where position_code = 'school-upper-class-method-group';

update public.role_tariffs
set title_tg = 'Иттиҳодияи методии роҳбарони синфҳои 1-4',
    title_ru = 'Иттиҳодияи методии роҳбарони синфҳои 1-4',
    updated_at = now()
where position_code = 'school-lower-class-method-group';

update public.school_memberships
set max_devices = least(40, greatest(max_devices, (1 + coalesce(array_length(extra_positions, 1), 0)) * 2));

create or replace function public.admin_upsert_role_tariff(
  p_position_code text,
  p_base_price_tjs numeric,
  p_extra_price_tjs numeric,
  p_duration_days integer default 30,
  p_default_max_devices integer default 2,
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
  if p_base_price_tjs < 0 or p_extra_price_tjs < 0 or p_duration_days < 1 or p_duration_days > 3650 or p_default_max_devices < 1 or p_default_max_devices > 40 then
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

create or replace function public.admin_set_license(
  p_org_id uuid,
  p_status text,
  p_plan_code text,
  p_expires_at timestamptz,
  p_grace_days integer default 30,
  p_notes text default '',
  p_max_accounts integer default 1,
  p_max_positions_per_account integer default 1,
  p_default_max_devices integer default 2
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
  if p_max_accounts < 1 or p_max_accounts > 1000 or p_max_positions_per_account < 1 or p_max_positions_per_account > 20 or p_default_max_devices < 1 or p_default_max_devices > 40 then
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

create or replace function public.admin_assign_membership(
  p_user_id uuid,
  p_org_id uuid,
  p_role text,
  p_primary_position text default null,
  p_extra_positions text[] default '{}'::text[],
  p_max_extra_positions integer default 0,
  p_max_devices integer default 2,
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
  max_dev integer := coalesce(p_max_devices, 2);
  resolved_role text := p_role;
  output uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if p_user_id is null or p_org_id is null or resolved_role not in ('school_admin','director','deputy','staff','teacher','authority_viewer','maorif') then
    raise exception 'invalid membership' using errcode = '22023';
  end if;
  if max_ext < 0 or max_ext > 19 or max_dev < 1 or max_dev > 40 then
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

-- ---------------------------------------------------------------------------
-- 3. Per-device-kind sessions ('mobile' / 'desktop') + claim_device_session
-- ---------------------------------------------------------------------------
alter table public.user_device_sessions
  add column if not exists device_kind text not null default 'desktop'
  check (device_kind in ('mobile', 'desktop'));

grant select (device_kind) on public.user_device_sessions to authenticated;

drop function if exists public.claim_device_session(uuid, text, text, text);
drop function if exists public.claim_device_session(uuid, text, text, text, text);
create or replace function public.claim_device_session(
  p_org_id uuid,
  p_device_id text,
  p_device_label text default '',
  p_cabinet_id text default null,
  p_device_kind text default 'desktop'
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
  kind_clean text := case
    when lower(btrim(coalesce(p_device_kind, ''))) = 'mobile' then 'mobile'
    else 'desktop'
  end;
  cab_group text;
  m_row public.school_memberships%rowtype;
  lic_status jsonb;
  already_active boolean := false;
  active_cnt integer := 0;
  active_kind_cnt integer := 0;
  active_mobile integer := 0;
  active_desktop integer := 0;
  pos_count integer := 1;
  effective_max integer := 2;
  per_kind_limit integer := 1;
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
      'device_kind', kind_clean,
      'max_devices', 40,
      'max_per_kind', 20,
      'active_devices', 0,
      'active_mobile', 0,
      'active_desktop', 0,
      'verification_status', 'verified'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sm-device-claim:' || actor_id::text || ':' || p_org_id::text, 0));

  select * into m_row
  from public.school_memberships
  where user_id = actor_id and organization_id = p_org_id;

  if not found or not m_row.account_active then
    return jsonb_build_object('allowed', false, 'reason', 'account_disabled');
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
        when 'maorif' then cab_group in ('office','raesat')
        when 'authority_viewer' then cab_group in ('raesat','office')
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
        'max_extra_positions', m_row.max_extra_positions,
        'verification_status', m_row.verification_status
      );
    end if;
  end if;

  lic_status := public.get_license_status(p_org_id);
  if (lic_status ->> 'configured')::boolean = true and (lic_status ->> 'access_allowed')::boolean = false then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'license_blocked',
      'license_status', lic_status ->> 'effective_status',
      'verification_status', m_row.verification_status
    );
  end if;

  pos_count := case
    when m_row.primary_position is not null then 1 + coalesce(array_length(m_row.extra_positions, 1), 0)
    else 1
  end;
  effective_max := greatest(1, coalesce(m_row.max_devices, pos_count * 2));
  per_kind_limit := greatest(1, ceil(effective_max / 2.0)::integer);

  select exists (
    select 1 from public.user_device_sessions
    where user_id = actor_id and organization_id = p_org_id and device_id = dev_clean and is_active = true
  ) into already_active;

  select
    count(*)::integer,
    count(*) filter (where device_kind = kind_clean)::integer,
    count(*) filter (where device_kind = 'mobile')::integer,
    count(*) filter (where device_kind = 'desktop')::integer
  into active_cnt, active_kind_cnt, active_mobile, active_desktop
  from public.user_device_sessions
  where user_id = actor_id and organization_id = p_org_id and is_active = true;

  if already_active then
    update public.user_device_sessions
    set last_seen_at = now(),
        device_kind = kind_clean,
        device_label = coalesce(nullif(left(btrim(p_device_label), 160), ''), device_label)
    where user_id = actor_id and organization_id = p_org_id and device_id = dev_clean;

    return jsonb_build_object(
      'allowed', true,
      'reason', 'existing_device',
      'device_kind', kind_clean,
      'max_devices', effective_max,
      'max_per_kind', per_kind_limit,
      'active_devices', active_cnt,
      'active_kind_devices', active_kind_cnt,
      'active_mobile', active_mobile,
      'active_desktop', active_desktop,
      'primary_position', m_row.primary_position,
      'extra_positions', m_row.extra_positions,
      'verification_status', m_row.verification_status,
      'verification_note', m_row.verification_note
    );
  end if;

  if active_cnt >= effective_max or active_kind_cnt >= per_kind_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'device_limit_reached',
      'device_kind', kind_clean,
      'max_devices', effective_max,
      'max_per_kind', per_kind_limit,
      'active_devices', active_cnt,
      'active_kind_devices', active_kind_cnt,
      'active_mobile', active_mobile,
      'active_desktop', active_desktop,
      'verification_status', m_row.verification_status
    );
  end if;

  insert into public.user_device_sessions (
    user_id, organization_id, device_id, device_kind, device_label, is_active, first_seen_at, last_seen_at
  )
  values (
    actor_id, p_org_id, dev_clean, kind_clean, left(btrim(coalesce(p_device_label, '')), 160), true, now(), now()
  )
  on conflict (user_id, organization_id, device_id) do update
    set is_active = true,
        device_kind = excluded.device_kind,
        last_seen_at = now(),
        device_label = left(btrim(coalesce(p_device_label, '')), 160);

  return jsonb_build_object(
    'allowed', true,
    'reason', 'registered',
    'device_kind', kind_clean,
    'max_devices', effective_max,
    'max_per_kind', per_kind_limit,
    'active_devices', active_cnt + 1,
    'active_kind_devices', active_kind_cnt + 1,
    'active_mobile', active_mobile + case when kind_clean = 'mobile' then 1 else 0 end,
    'active_desktop', active_desktop + case when kind_clean = 'desktop' then 1 else 0 end,
    'primary_position', m_row.primary_position,
    'extra_positions', m_row.extra_positions,
    'verification_status', m_row.verification_status,
    'verification_note', m_row.verification_note
  );
end;
$$;

revoke all on function public.claim_device_session(uuid, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.claim_device_session(uuid, text, text, text, text) to authenticated;

