-- Account & school verification workflow (Director -> Maorif, Staff -> Director/Deputies/Clerk),
-- Tajikistan territory directory (Region -> District -> Jamoat -> Village),
-- automatic 30-day free trial on registration, and 1/3/6/9/12-month subscription packages with 0/3/5/10/15% discounts.

-- 1. Extend organizations with jamoat/village and verification_status
alter table public.organizations
  add column if not exists jamoat_name text check (jamoat_name is null or length(btrim(jamoat_name)) between 1 and 120),
  add column if not exists village_name text check (village_name is null or length(btrim(village_name)) between 1 and 120),
  add column if not exists verification_status text not null default 'verified'
    check (verification_status in ('pending','verified','rejected'));

grant select (jamoat_name, village_name, verification_status) on public.organizations to authenticated;

drop function if exists public.admin_upsert_organization(text, text, uuid, text, text, text, text, uuid);
create or replace function public.admin_upsert_organization(
  p_name text,
  p_kind text,
  p_parent_id uuid default null,
  p_authority_tier text default null,
  p_region_name text default null,
  p_district_name text default null,
  p_school_code text default null,
  p_org_id uuid default null,
  p_jamoat_name text default null,
  p_village_name text default null
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  cleaned text := btrim(coalesce(p_name, ''));
  reg_clean text := nullif(btrim(coalesce(p_region_name, '')), '');
  dist_clean text := nullif(btrim(coalesce(p_district_name, '')), '');
  jam_clean text := nullif(btrim(coalesce(p_jamoat_name, '')), '');
  vil_clean text := nullif(btrim(coalesce(p_village_name, '')), '');
  code_clean text := nullif(btrim(coalesce(p_school_code, '')), '');
  tier_clean text := case when p_kind = 'education_authority' then nullif(btrim(coalesce(p_authority_tier, '')), '') else null end;
  output uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if length(cleaned) < 1 or length(cleaned) > 160 or p_kind not in ('school','education_authority') then
    raise exception 'invalid organization' using errcode = '22023';
  end if;
  if p_org_id is not null then
    update public.organizations
    set name = cleaned,
        parent_id = p_parent_id,
        authority_tier = tier_clean,
        region_name = reg_clean,
        district_name = dist_clean,
        jamoat_name = jam_clean,
        village_name = vil_clean,
        school_code = code_clean
    where id = p_org_id and kind = p_kind
    returning id into output;
    if not found then raise exception 'organization not found' using errcode = '55000'; end if;
  else
    insert into public.organizations (
      name, kind, parent_id, authority_tier, region_name, district_name, jamoat_name, village_name, school_code, verification_status
    ) values (
      cleaned, p_kind, p_parent_id,
      tier_clean, reg_clean, dist_clean, jam_clean, vil_clean, code_clean, 'verified'
    )
    returning id into output;
  end if;
  return output;
end;
$$;

-- 2. Tajikistan Territory Directory (Region -> District -> Jamoat -> Village)
create table if not exists public.tajikistan_locations (
  id uuid primary key default gen_random_uuid(),
  region_name text not null check (length(btrim(region_name)) between 1 and 120),
  district_name text not null check (length(btrim(district_name)) between 1 and 120),
  jamoat_name text not null default '' check (length(jamoat_name) <= 120),
  village_name text not null default '' check (length(village_name) <= 120),
  created_at timestamptz not null default now()
);

create unique index if not exists tajikistan_locations_unique_idx
  on public.tajikistan_locations (lower(region_name), lower(district_name), lower(jamoat_name), lower(village_name));

alter table public.tajikistan_locations enable row level security;
drop policy if exists tajikistan_locations_read on public.tajikistan_locations;
create policy tajikistan_locations_read on public.tajikistan_locations
  for select to authenticated
  using (true);

revoke all on public.tajikistan_locations from public, anon, authenticated, service_role;
grant select on public.tajikistan_locations to authenticated;

create or replace function public.admin_upsert_location(
  p_region_name text,
  p_district_name text,
  p_jamoat_name text default '',
  p_village_name text default '',
  p_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  reg_c text := btrim(coalesce(p_region_name, ''));
  dist_c text := btrim(coalesce(p_district_name, ''));
  jam_c text := btrim(coalesce(p_jamoat_name, ''));
  vil_c text := btrim(coalesce(p_village_name, ''));
  out_id uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if length(reg_c) < 2 or length(dist_c) < 2 then raise exception 'region and district required' using errcode = '22023'; end if;
  if p_id is not null then
    update public.tajikistan_locations
    set region_name = reg_c, district_name = dist_c, jamoat_name = jam_c, village_name = vil_c
    where id = p_id
    returning id into out_id;
    if not found then raise exception 'location not found' using errcode = '55000'; end if;
  else
    insert into public.tajikistan_locations (region_name, district_name, jamoat_name, village_name)
    values (reg_c, dist_c, jam_c, vil_c)
    on conflict (lower(region_name), lower(district_name), lower(jamoat_name), lower(village_name))
    do update set region_name = excluded.region_name
    returning id into out_id;
  end if;
  return out_id;
end;
$$;

create or replace function public.admin_delete_location(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare out_id uuid;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  delete from public.tajikistan_locations where id = p_id returning id into out_id;
  if not found then raise exception 'location not found' using errcode = '55000'; end if;
  return out_id;
end;
$$;

-- 3. Extend school_memberships for verification & individual trial/subscription tracking
alter table public.school_memberships
  add column if not exists verification_status text not null default 'verified'
    check (verification_status in ('unverified','pending','verified','rejected')),
  add column if not exists verification_note text not null default ''
    check (length(verification_note) <= 500),
  add column if not exists verified_by uuid references auth.users (id) on delete set null,
  add column if not exists verified_at timestamptz,
  add column if not exists requested_at timestamptz,
  add column if not exists subscription_status text not null default 'active'
    check (subscription_status in ('trial','active','expired','suspended')),
  add column if not exists subscription_months integer not null default 1
    check (subscription_months between 1 and 24),
  add column if not exists subscription_expires_at timestamptz;

create index if not exists school_memberships_verification_idx
  on public.school_memberships (organization_id, verification_status, requested_at desc);

grant select (
  verification_status, verification_note, verified_by, verified_at, requested_at,
  subscription_status, subscription_months, subscription_expires_at
) on public.school_memberships to authenticated;

-- 4. Ephemeral verification queue table (deleted immediately upon decision so rejected requests leave zero clutter in DB)
create table if not exists public.account_verification_requests (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null unique references public.school_memberships (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  primary_position text,
  full_name text not null check (length(btrim(full_name)) between 3 and 160),
  birth_date text not null check (birth_date ~ '^\d{2}\.\d{2}\.\d{4}$'),
  phone text not null check (length(btrim(phone)) between 7 and 32),
  passport_number text not null check (length(btrim(passport_number)) between 4 and 40),
  created_at timestamptz not null default now()
);

create index if not exists account_verification_requests_org_idx
  on public.account_verification_requests (organization_id, created_at desc);

alter table public.account_verification_requests enable row level security;
revoke all on public.account_verification_requests from public, anon, authenticated, service_role;

-- 5. Enforce account_active = true AND verification_status = 'verified' across all DB access helpers
create or replace function smartmaktab_private.can_read_org(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.account_active = true
      and m.verification_status = 'verified'
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

create or replace function smartmaktab_private.can_write_school(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = target
      and m.account_active = true
      and m.verification_status = 'verified'
      and m.role in ('school_admin','director','deputy','staff','teacher')
  );
$$;

create or replace function smartmaktab_private.summary_allowed(target uuid, access text) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select case access
    when 'director' then exists (
      select 1 from public.school_memberships m
      where m.user_id = (select auth.uid())
        and m.organization_id = target
        and m.account_active = true
        and m.verification_status = 'verified'
        and m.role in ('director','school_admin')
    )
    when 'maorif' then exists (
      select 1 from public.school_memberships m
      join smartmaktab_private.summary_scope s on s.authority_id = m.organization_id
      where m.user_id = (select auth.uid())
        and m.account_active = true
        and m.verification_status = 'verified'
        and m.role in ('authority_viewer','maorif')
        and s.school_id = target
        and s.level = 'maorif'
    )
    else false
  end;
$$;

create or replace function smartmaktab_private.can_review_school_as_authority(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    join public.organizations s on s.id = target and s.kind = 'school'
    where m.user_id = (select auth.uid())
      and m.account_active = true
      and m.verification_status = 'verified'
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

create or replace function smartmaktab_private.is_school_director(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = target
      and m.account_active = true
      and m.verification_status = 'verified'
      and (
        m.role in ('director','school_admin')
        or m.primary_position = 'school-director'
        or 'school-director' = any(coalesce(m.extra_positions, '{}'::text[]))
      )
  );
$$;

-- Verified school staff allowed to approve/reject subordinates:
-- Director, Academic Deputy (Муовини таълим), Upbringing Deputy (Муовини тарбия), Clerk (Коргузор)
create or replace function smartmaktab_private.is_school_account_verifier(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = target
      and m.account_active = true
      and m.verification_status = 'verified'
      and (
        m.role in ('director','school_admin')
        or m.primary_position in ('school-director','school-academic-deputy','school-upbringing-deputy','school-records-clerk')
        or coalesce(m.extra_positions, '{}'::text[]) && array['school-director','school-academic-deputy','school-upbringing-deputy','school-records-clerk']::text[]
      )
  );
$$;

revoke all on function smartmaktab_private.is_school_account_verifier(uuid) from public, anon, authenticated, service_role;
grant execute on function smartmaktab_private.is_school_account_verifier(uuid) to authenticated;

create or replace function public.territory_summary(p_authority uuid, p_year integer, p_period text)
returns table(schools bigint, enrolled bigint, assessed bigint, passed bigint, quality bigint)
language plpgsql stable security definer set search_path = '' set row_security = off as $$
begin
  if auth.uid() is null
     or not exists (
       select 1 from public.school_memberships m
       where m.organization_id = p_authority
         and m.account_active = true
         and m.verification_status = 'verified'
         and m.role in ('authority_viewer','maorif')
         and m.user_id = (select auth.uid())
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

-- 6. Update admin_assign_membership so admin-assigned accounts are verified
create or replace function public.admin_assign_membership(
  p_user_id uuid,
  p_org_id uuid,
  p_role text,
  p_primary_position text default null,
  p_extra_positions text[] default '{}'::text[],
  p_max_extra_positions integer default 0,
  p_max_devices integer default 1,
  p_account_active boolean default true,
  p_aliya_enabled boolean default false,
  p_custom_method_name text default ''
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
    user_id, organization_id, role, primary_position, extra_positions,
    max_extra_positions, max_devices, account_active, aliya_enabled, custom_method_name,
    verification_status, verified_by, verified_at, subscription_status
  ) values (
    p_user_id, p_org_id, resolved_role, pos_clean, extras_clean,
    max_ext, max_dev, coalesce(p_account_active, true),
    coalesce(p_aliya_enabled, false),
    left(btrim(coalesce(p_custom_method_name, '')), 120),
    'verified', auth.uid(), now(), 'active'
  )
  on conflict (user_id, organization_id) do update
    set role = excluded.role,
        primary_position = excluded.primary_position,
        extra_positions = excluded.extra_positions,
        max_extra_positions = excluded.max_extra_positions,
        max_devices = excluded.max_devices,
        account_active = excluded.account_active,
        aliya_enabled = excluded.aliya_enabled,
        custom_method_name = case
          when excluded.custom_method_name <> '' then excluded.custom_method_name
          else public.school_memberships.custom_method_name
        end,
        verification_status = 'verified',
        verified_by = auth.uid(),
        verified_at = now()
  returning id into output;
  return output;
end;
$$;

-- 7. Update get_my_workspace_context to return verification & personal subscription metadata
create or replace function public.get_my_workspace_context()
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  prof jsonb;
  roles jsonb;
begin
  if actor_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'full_name', p.full_name,
    'preferred_lang', p.preferred_lang,
    'login_name', p.login_name,
    'profile_details', p.profile_details
  )
  into prof from public.user_profiles p where p.user_id = actor_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', m.id,
    'organization_id', o.id,
    'organization_name', o.name,
    'organization_verification_status', o.verification_status,
    'kind', o.kind,
    'authority_tier', o.authority_tier,
    'region_name', o.region_name,
    'district_name', o.district_name,
    'jamoat_name', o.jamoat_name,
    'village_name', o.village_name,
    'school_code', o.school_code,
    'role', m.role,
    'primary_position', m.primary_position,
    'extra_positions', m.extra_positions,
    'max_extra_positions', m.max_extra_positions,
    'max_devices', m.max_devices,
    'account_active', m.account_active,
    'verification_status', m.verification_status,
    'verification_note', m.verification_note,
    'verified_at', m.verified_at,
    'requested_at', m.requested_at,
    'subscription_status', case
      when m.subscription_expires_at is not null and m.subscription_expires_at < now() then 'expired'
      else m.subscription_status
    end,
    'subscription_months', m.subscription_months,
    'subscription_expires_at', m.subscription_expires_at,
    'subscription_days_left', case
      when m.subscription_expires_at is null then null
      else greatest(0, ceil(extract(epoch from (m.subscription_expires_at - now())) / 86400.0)::integer)
    end,
    'aliya_enabled', m.aliya_enabled,
    'aliya_expires_at', m.aliya_expires_at,
    'custom_method_name', m.custom_method_name,
    'position_profiles', m.position_profiles,
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
    'profile', coalesce(prof, jsonb_build_object('full_name', '', 'preferred_lang', 'tg', 'login_name', '', 'profile_details', '{}'::jsonb)),
    'memberships', roles
  );
end;
$$;

-- 8. get_license_status: supports school-wide license AND personal 30-day free trial / subscription
create or replace function public.get_license_status(p_org_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  lic public.school_licenses%rowtype;
  mem public.school_memberships%rowtype;
  now_ts timestamptz := now();
  grace_end timestamptz;
  eff_status text;
  allowed boolean;
  days_left integer;
  grace_left integer;
begin
  if actor_id is null or p_org_id is null
     or (
       not smartmaktab_private.is_developer()
       and not smartmaktab_private.can_read_org(p_org_id)
       and not exists (
         select 1 from public.school_memberships m
         where m.user_id = actor_id and m.organization_id = p_org_id and m.account_active = true
       )
     ) then
    raise exception 'license read denied' using errcode = '42501';
  end if;

  select * into lic from public.school_licenses where organization_id = p_org_id;
  select * into mem from public.school_memberships where user_id = actor_id and organization_id = p_org_id;

  -- If no organization-wide license override exists, check personal trial/subscription schedule
  if lic.organization_id is null then
    if mem.id is not null and mem.subscription_expires_at is not null then
      if mem.subscription_status = 'suspended' then
        eff_status := 'suspended';
        allowed := false;
        days_left := 0;
      elsif now_ts <= mem.subscription_expires_at and mem.subscription_status in ('trial','active') then
        eff_status := mem.subscription_status;
        allowed := true;
        days_left := greatest(0, ceil(extract(epoch from (mem.subscription_expires_at - now_ts)) / 86400.0)::integer);
      else
        eff_status := 'expired';
        allowed := false;
        days_left := 0;
      end if;
      return jsonb_build_object(
        'configured', true,
        'organization_id', p_org_id,
        'status', mem.subscription_status,
        'effective_status', eff_status,
        'plan_code', 'personal_' || coalesce(mem.subscription_months, 1)::text || 'm',
        'starts_at', mem.created_at,
        'expires_at', mem.subscription_expires_at,
        'grace_days', 0,
        'grace_until', mem.subscription_expires_at,
        'offline_token_version', 1,
        'access_allowed', allowed,
        'days_left', days_left,
        'grace_days_left', 0,
        'subscription_months', mem.subscription_months,
        'verification_status', mem.verification_status,
        'server_now', now_ts
      );
    end if;

    return jsonb_build_object(
      'configured', false, 'organization_id', p_org_id, 'status', 'none', 'effective_status', 'none',
      'plan_code', null, 'expires_at', null, 'grace_days', 30, 'grace_until', null,
      'access_allowed', false, 'days_left', 0, 'grace_days_left', 0, 'server_now', now_ts
    );
  end if;

  -- Combine school-level license with personal subscription when school-level license is active
  if mem.id is not null and mem.subscription_expires_at is not null and lic.status <> 'suspended' then
    if mem.subscription_status in ('trial','active') and mem.subscription_expires_at > now_ts and lic.expires_at < mem.subscription_expires_at then
      days_left := greatest(0, ceil(extract(epoch from (mem.subscription_expires_at - now_ts)) / 86400.0)::integer);
      return jsonb_build_object(
        'configured', true,
        'organization_id', p_org_id,
        'status', mem.subscription_status,
        'effective_status', mem.subscription_status,
        'plan_code', 'personal_' || coalesce(mem.subscription_months, 1)::text || 'm',
        'starts_at', mem.created_at,
        'expires_at', mem.subscription_expires_at,
        'grace_days', 0,
        'grace_until', mem.subscription_expires_at,
        'offline_token_version', lic.offline_token_version,
        'access_allowed', true,
        'days_left', days_left,
        'grace_days_left', 0,
        'subscription_months', mem.subscription_months,
        'verification_status', mem.verification_status,
        'server_now', now_ts
      );
    end if;
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
  elsif lic.grace_days > 0 and now_ts <= grace_end and lic.status <> 'expired' then
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
    'verification_status', mem.verification_status,
    'server_now', now_ts
  );
end;
$$;

-- 9. claim_device_session allows entering local cabinet while reporting verification_status
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
      'active_devices', 0,
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
      'extra_positions', m_row.extra_positions,
      'verification_status', m_row.verification_status,
      'verification_note', m_row.verification_note
    );
  end if;

  if active_cnt >= m_row.max_devices then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'device_limit_reached',
      'max_devices', m_row.max_devices,
      'active_devices', active_cnt,
      'verification_status', m_row.verification_status
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
    'extra_positions', m_row.extra_positions,
    'verification_status', m_row.verification_status,
    'verification_note', m_row.verification_note
  );
end;
$$;

-- 10. Account Verification RPCs
-- 10a. User submits FIO, birth date (DD.MM.YYYY), phone, passport number
create or replace function public.submit_account_verification(
  p_org_id uuid,
  p_full_name text,
  p_birth_date text,
  p_phone text,
  p_passport_number text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  mem_row public.school_memberships%rowtype;
  name_c text := btrim(coalesce(p_full_name, ''));
  birth_c text := btrim(coalesce(p_birth_date, ''));
  phone_c text := btrim(coalesce(p_phone, ''));
  pass_c text := upper(btrim(coalesce(p_passport_number, '')));
  dd integer;
  mm integer;
  yyyy integer;
  req_id uuid;
begin
  if actor_id is null or p_org_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if length(name_c) < 3 or length(name_c) > 160 then
    raise exception 'invalid_full_name' using errcode = '22023';
  end if;
  if birth_c !~ '^\d{2}\.\d{2}\.\d{4}$' then
    raise exception 'invalid_birth_date_format' using errcode = '22023';
  end if;
  dd := substring(birth_c from 1 for 2)::integer;
  mm := substring(birth_c from 4 for 2)::integer;
  yyyy := substring(birth_c from 7 for 4)::integer;
  if dd < 1 or dd > 31 or mm < 1 or mm > 12 or yyyy < 1935 or yyyy > 2015 then
    raise exception 'invalid_birth_date_range' using errcode = '22023';
  end if;
  if length(regexp_replace(phone_c, '\D', '', 'g')) < 7 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if length(pass_c) < 4 or length(pass_c) > 40 then
    raise exception 'invalid_passport_number' using errcode = '22023';
  end if;

  select * into mem_row
  from public.school_memberships
  where user_id = actor_id and organization_id = p_org_id and account_active = true
  for update;

  if not found then
    raise exception 'membership_not_found' using errcode = '42501';
  end if;

  insert into public.account_verification_requests (
    membership_id, user_id, organization_id, primary_position,
    full_name, birth_date, phone, passport_number
  ) values (
    mem_row.id, actor_id, p_org_id, mem_row.primary_position,
    name_c, birth_c, left(phone_c, 32), pass_c
  )
  on conflict (membership_id) do update
    set full_name = excluded.full_name,
        birth_date = excluded.birth_date,
        phone = excluded.phone,
        passport_number = excluded.passport_number,
        primary_position = excluded.primary_position,
        created_at = now()
  returning id into req_id;

  update public.school_memberships
  set verification_status = 'pending',
      verification_note = '',
      requested_at = now()
  where id = mem_row.id;

  return jsonb_build_object(
    'request_id', req_id,
    'membership_id', mem_row.id,
    'verification_status', 'pending'
  );
end;
$$;

-- 10b. Verified authorities & school verifiers fetch pending verification requests
create or replace function public.get_pending_account_verifications(p_org_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  is_dev boolean := smartmaktab_private.is_developer();
  has_auth boolean := false;
  has_verifier boolean := false;
  rows jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.school_memberships m
    where m.user_id = actor_id
      and m.account_active = true
      and m.verification_status = 'verified'
      and m.role in ('authority_viewer','maorif')
  ) into has_auth;

  if p_org_id is not null then
    has_verifier := smartmaktab_private.is_school_account_verifier(p_org_id);
  else
    select exists (
      select 1 from public.school_memberships m
      where m.user_id = actor_id
        and m.account_active = true
        and m.verification_status = 'verified'
        and (
          m.role in ('director','school_admin')
          or m.primary_position in ('school-director','school-academic-deputy','school-upbringing-deputy','school-records-clerk')
          or coalesce(m.extra_positions, '{}'::text[]) && array['school-director','school-academic-deputy','school-upbringing-deputy','school-records-clerk']::text[]
        )
    ) into has_verifier;
  end if;

  if not is_dev and not has_auth and not has_verifier then
    raise exception 'verification queue access denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id', r.id,
    'membership_id', r.membership_id,
    'user_id', r.user_id,
    'organization_id', r.organization_id,
    'organization_name', o.name,
    'organization_kind', o.kind,
    'organization_verification_status', o.verification_status,
    'region_name', o.region_name,
    'district_name', o.district_name,
    'jamoat_name', o.jamoat_name,
    'village_name', o.village_name,
    'school_code', o.school_code,
    'full_name', r.full_name,
    'birth_date', r.birth_date,
    'phone', r.phone,
    'passport_number', r.passport_number,
    'login_name', coalesce(p.login_name, ''),
    'role', m.role,
    'primary_position', m.primary_position,
    'extra_positions', m.extra_positions,
    'aliya_enabled', m.aliya_enabled,
    'custom_method_name', m.custom_method_name,
    'verification_status', m.verification_status,
    'requested_at', r.created_at
  ) order by r.created_at desc), '[]'::jsonb)
  into rows
  from public.account_verification_requests r
  join public.school_memberships m on m.id = r.membership_id
  join public.organizations o on o.id = r.organization_id
  left join public.user_profiles p on p.user_id = r.user_id
  where (p_org_id is null or r.organization_id = p_org_id)
    and r.user_id <> actor_id
    and (
      is_dev
      or (o.kind = 'school' and smartmaktab_private.can_review_school_as_authority(o.id))
      or (
        o.kind = 'school'
        and smartmaktab_private.is_school_account_verifier(o.id)
        and coalesce(m.primary_position, '') <> 'school-director'
        and m.role not in ('director','school_admin')
        and not ('school-director' = any(coalesce(m.extra_positions, '{}'::text[])))
      )
    );

  return rows;
end;
$$;

-- 10c. Review verification request:
-- On approve: verifies membership (and school if reviewer is Maorif/Admin) & clears request row.
-- On reject: DELETES request completely from DB so it takes zero space, sets status = 'rejected' + instructions to call Maorif/Director.
create or replace function public.review_account_verification(
  p_membership_id uuid,
  p_decision text,
  p_note text default '',
  p_verify_org boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  is_dev boolean := smartmaktab_private.is_developer();
  dec_clean text := case
    when lower(btrim(coalesce(p_decision, ''))) = 'approved' then 'verified'
    else lower(btrim(coalesce(p_decision, '')))
  end;
  note_clean text := left(btrim(coalesce(p_note, '')), 500);
  target_mem public.school_memberships%rowtype;
  target_org public.organizations%rowtype;
  is_auth boolean := false;
  is_verifier boolean := false;
  is_target_director boolean := false;
  final_note text;
begin
  if actor_id is null or p_membership_id is null then
    raise exception 'invalid verification request' using errcode = '22023';
  end if;
  if dec_clean not in ('verified','rejected') then
    raise exception 'invalid verification decision' using errcode = '22023';
  end if;

  select * into target_mem from public.school_memberships where id = p_membership_id for update;
  if not found then
    raise exception 'membership not found' using errcode = '55000';
  end if;

  select * into target_org from public.organizations where id = target_mem.organization_id;

  if target_mem.user_id = actor_id and not is_dev then
    raise exception 'self_verification_forbidden' using errcode = '42501';
  end if;

  is_auth := target_org.kind = 'school' and smartmaktab_private.can_review_school_as_authority(target_mem.organization_id);
  is_verifier := target_org.kind = 'school' and smartmaktab_private.is_school_account_verifier(target_mem.organization_id);
  is_target_director := coalesce(target_mem.primary_position, '') = 'school-director'
    or target_mem.role in ('director','school_admin')
    or 'school-director' = any(coalesce(target_mem.extra_positions, '{}'::text[]));

  if not is_dev then
    if is_auth then
      null;
    elsif is_verifier then
      if is_target_director then
        raise exception 'authority_or_admin_required_for_director' using errcode = '42501';
      end if;
    else
      raise exception 'account verification review denied' using errcode = '42501';
    end if;
  end if;

  if dec_clean = 'rejected' and note_clean = '' then
    if is_target_director then
      final_note := 'Дархости тасдиқ рад карда шуд. Ба шуъбаи Маориф занг занед ё барои ҳалли масъала муроҷиат намоед.';
    else
      final_note := 'Дархости тасдиқ рад карда шуд. Ба директор ё маъмурияти мактаб занг занед ё муроҷиат намоед.';
    end if;
  else
    final_note := note_clean;
  end if;

  -- Completely delete request row from account_verification_requests so rejected/processed rows never bloat DB
  delete from public.account_verification_requests where membership_id = target_mem.id;

  update public.school_memberships
  set verification_status = dec_clean,
      account_active = true,
      verification_note = final_note,
      verified_by = case when dec_clean = 'verified' then actor_id else null end,
      verified_at = case when dec_clean = 'verified' then now() else null end
  where id = target_mem.id;

  if dec_clean = 'verified' and coalesce(p_verify_org, true) and (is_dev or is_auth) and target_org.verification_status <> 'verified' then
    update public.organizations
    set verification_status = 'verified'
    where id = target_org.id;
  end if;

  return jsonb_build_object(
    'membership_id', target_mem.id,
    'organization_id', target_mem.organization_id,
    'verification_status', dec_clean,
    'request_deleted', true,
    'verification_note', final_note
  );
end;
$$;

-- 11. Subscription package discount support (1/3/6/9/12 months -> 0/3/5/10/15% discount)
drop function if exists public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[], boolean);
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
  p_extra_positions text[] default '{}'::text[],
  p_include_aliya boolean default false,
  p_months integer default 1
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
  months_clean integer := case
    when coalesce(p_months, 1) in (1, 3, 6, 9, 12) then coalesce(p_months, 1)
    else 1
  end;
  discount_pct numeric := case months_clean
    when 3 then 3
    when 6 then 5
    when 9 then 10
    when 12 then 15
    else 0
  end;
  plan_row public.subscription_plans%rowtype;
  pos_clean text := nullif(lower(btrim(coalesce(p_primary_position, ''))), '');
  pos_row public.role_tariffs%rowtype;
  extras_clean text[] := '{}'::text[];
  extra_sum numeric := 0;
  aliya_flag boolean := coalesce(p_include_aliya, false);
  aliya_fee numeric := case when aliya_flag then 30.00 else 0.00 end;
  monthly_amount numeric := 0;
  required_amount numeric := 0;
  required_days integer := case months_clean when 12 then 365 else months_clean * 30 end;
  required_devices integer := 1;
  chosen_plan text := coalesce(nullif(btrim(p_plan_code), ''), 'trial_10');
  ocr_source text := coalesce(p_ocr_payload ->> 'source', '');
  enriched_payload jsonb;
  auto_verified boolean := false;
  existing_exp timestamptz;
  base_ts timestamptz;
  mem_exp timestamptz;
  mem_base timestamptz;
  output uuid;
begin
  if actor_id is null or p_org_id is null
     or (
       not smartmaktab_private.can_write_school(p_org_id)
       and not exists (
         select 1 from public.school_memberships m
         where m.user_id = actor_id and m.organization_id = p_org_id and m.account_active = true
       )
     ) then
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

      monthly_amount := pos_row.base_price_tjs + extra_sum + aliya_fee;
      required_amount := round(monthly_amount * months_clean * (1 - discount_pct / 100.0), 2);
      required_devices := pos_row.default_max_devices;
      chosen_plan := 'pos:' || pos_clean || ':' || months_clean::text || 'm' || case when aliya_flag then '+aliya' else '' end;
    else
      pos_clean := null;
    end if;
  end if;

  if pos_clean is null and plan_row.code is not null then
    monthly_amount := plan_row.price_tjs + aliya_fee;
    required_amount := round(monthly_amount * months_clean * (1 - discount_pct / 100.0), 2);
    chosen_plan := plan_row.code || ':' || months_clean::text || 'm';
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
    'include_aliya', aliya_flag,
    'months', months_clean,
    'discount_pct', discount_pct,
    'expected_amount_tjs', required_amount,
    'expected_days', required_days
  );

  insert into public.payment_submissions (
    organization_id, submitted_by, provider_code, receipt_hash, amount_declared, currency,
    ocr_text, ocr_confidence, ocr_payload, transaction_id, recipient_account, status_confirmed, plan_code,
    include_aliya, status, review_note, reviewed_by, reviewed_at
  ) values (
    p_org_id, actor_id, prov_clean, hash_clean, p_amount_declared,
    coalesce(nullif(btrim(p_currency), ''), 'TJS'),
    left(coalesce(p_ocr_text, ''), 8000), p_ocr_confidence,
    enriched_payload, tx_clean, recip_clean, coalesce(p_status_confirmed, false),
    chosen_plan, aliya_flag,
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

    select subscription_expires_at into mem_exp
    from public.school_memberships
    where user_id = actor_id and organization_id = p_org_id;
    mem_base := greatest(now(), coalesce(mem_exp, now()));

    update public.school_memberships
    set primary_position = coalesce(primary_position, pos_clean),
        extra_positions = case
          when coalesce(primary_position, pos_clean) is null then extra_positions
          else (
            select coalesce(array_agg(distinct val order by val), '{}'::text[])
            from unnest(coalesce(extra_positions, '{}'::text[]) || extras_clean) as val
            where val <> coalesce(primary_position, pos_clean)
          )
        end,
        max_extra_positions = greatest(
          max_extra_positions,
          (
            select coalesce(count(distinct val)::integer, 0)
            from unnest(coalesce(extra_positions, '{}'::text[]) || extras_clean) as val
            where val <> coalesce(primary_position, pos_clean)
          )
        ),
        max_devices = least(max_devices, required_devices),
        aliya_enabled = aliya_enabled or aliya_flag,
        aliya_expires_at = case
          when aliya_flag then greatest(coalesce(aliya_expires_at, now()), now()) + make_interval(days => required_days)
          else aliya_expires_at
        end,
        subscription_status = 'active',
        subscription_months = months_clean,
        subscription_expires_at = mem_base + make_interval(days => required_days)
    where user_id = actor_id and organization_id = p_org_id;
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
  mem_exp timestamptz;
  mem_base timestamptz;
  req_pos text;
  req_extras text[];
  req_aliya boolean;
  req_days integer;
  req_months integer;
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

  req_days := case
    when p_extend_days <= 0 then 0
    when p_extend_days <> 30 then p_extend_days
    else coalesce(nullif((sub_row.ocr_payload ->> 'expected_days')::integer, 0), p_extend_days)
  end;
  req_months := case
    when p_extend_days <> 30 and p_extend_days > 0 then
      case
        when p_extend_days >= 360 then 12
        when p_extend_days >= 260 then 9
        when p_extend_days >= 175 then 6
        when p_extend_days >= 85 then 3
        else greatest(1, round(p_extend_days / 30.0)::integer)
      end
    else coalesce(nullif((sub_row.ocr_payload ->> 'months')::integer, 0), greatest(1, round(req_days / 30.0)::integer))
  end;

  if p_decision = 'verified' and req_days > 0 then
    select * into cur_lic from public.school_licenses where organization_id = sub_row.organization_id;
    existing_exp := cur_lic.expires_at;
    base_ts := greatest(now(), coalesce(existing_exp, now()));
    req_pos := nullif(btrim(coalesce(sub_row.ocr_payload ->> 'primary_position', '')), '');
    req_aliya := coalesce(sub_row.include_aliya, (sub_row.ocr_payload ->> 'include_aliya')::boolean, false);
    select coalesce(array_agg(x), '{}'::text[])
    into req_extras
    from jsonb_array_elements_text(coalesce(sub_row.ocr_payload -> 'extra_positions', '[]'::jsonb)) as x
    where exists (select 1 from public.role_tariffs rt where rt.position_code = x);

    perform public.admin_set_license(
      sub_row.organization_id,
      'active',
      coalesce(nullif(btrim(sub_row.plan_code), ''), nullif(btrim(p_plan_code), ''), 'standard'),
      base_ts + make_interval(days => req_days),
      30,
      p_review_note,
      greatest(coalesce(cur_lic.max_accounts, 1), 1),
      greatest(coalesce(cur_lic.max_positions_per_account, 1), 1 + coalesce(array_length(req_extras, 1), 0)),
      greatest(coalesce(cur_lic.default_max_devices, 1), 1)
    );

    select subscription_expires_at into mem_exp
    from public.school_memberships
    where user_id = sub_row.submitted_by and organization_id = sub_row.organization_id;
    mem_base := greatest(now(), coalesce(mem_exp, now()));

    update public.school_memberships
    set primary_position = coalesce(primary_position, req_pos),
        extra_positions = case
          when coalesce(primary_position, req_pos) is null then extra_positions
          else (
            select coalesce(array_agg(distinct val order by val), '{}'::text[])
            from unnest(coalesce(extra_positions, '{}'::text[]) || req_extras) as val
            where val <> coalesce(primary_position, req_pos)
          )
        end,
        max_extra_positions = greatest(
          max_extra_positions,
          (
            select coalesce(count(distinct val)::integer, 0)
            from unnest(coalesce(extra_positions, '{}'::text[]) || req_extras) as val
            where val <> coalesce(primary_position, req_pos)
          )
        ),
        aliya_enabled = aliya_enabled or req_aliya,
        aliya_expires_at = case
          when req_aliya then greatest(coalesce(aliya_expires_at, now()), now()) + make_interval(days => req_days)
          else aliya_expires_at
        end,
        subscription_status = 'active',
        subscription_months = req_months,
        subscription_expires_at = mem_base + make_interval(days => req_days)
    where user_id = sub_row.submitted_by and organization_id = sub_row.organization_id;
  end if;
  return sub_row.id;
end;
$$;

revoke all on function
  public.admin_upsert_organization(text, text, uuid, text, text, text, text, uuid, text, text),
  public.admin_upsert_location(text, text, text, text, uuid),
  public.admin_delete_location(uuid),
  public.submit_account_verification(uuid, text, text, text, text),
  public.get_pending_account_verifications(uuid),
  public.review_account_verification(uuid, text, text, boolean),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[], boolean, integer)
  from public, anon, authenticated, service_role;

grant execute on function
  public.admin_upsert_organization(text, text, uuid, text, text, text, text, uuid, text, text),
  public.admin_upsert_location(text, text, text, text, uuid),
  public.admin_delete_location(uuid),
  public.submit_account_verification(uuid, text, text, text, text),
  public.get_pending_account_verifications(uuid),
  public.review_account_verification(uuid, text, text, boolean),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[], boolean, integer)
  to authenticated;
