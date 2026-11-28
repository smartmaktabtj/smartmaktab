-- Stage 4:
-- 1. Granular Admin Managers (sub-admins created by super_admin with per-module permissions & optional region scope)
-- 2. Full student birth_date (DD.MM.YYYY / YYYY-MM-DD) & Student Update Requests workflow with bell notification
-- 3. School Colleagues Directory RPC for "Корбарон" across all 24 positions
-- 4. 10-point Tajik "Таҳлил" extended grade fields (current_grades, control_grades, period_start, period_end)

-- ============================================================================
-- 1. ADMIN MANAGERS & PERMISSION HELPERS
-- ============================================================================
create table if not exists public.admin_managers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 160),
  login_name text not null default '' check (length(login_name) <= 160),
  permissions text[] not null default '{}'::text[],
  region_scope text check (region_scope is null or length(btrim(region_scope)) <= 120),
  is_active boolean not null default true,
  notes text not null default '' check (length(notes) <= 400),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_managers enable row level security;
drop policy if exists admin_managers_read on public.admin_managers;
create policy admin_managers_read on public.admin_managers
  for select to authenticated
  using ((select smartmaktab_private.is_developer()) or user_id = (select auth.uid()));

revoke all on public.admin_managers from public, anon, authenticated, service_role;
grant select on public.admin_managers to authenticated;

drop trigger if exists audit_admin_managers on public.admin_managers;
create trigger audit_admin_managers
  after insert or update or delete on public.admin_managers
  for each row execute function smartmaktab_private.audit_write();

create or replace function smartmaktab_private.is_active_admin_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (
    select 1 from public.admin_managers m
    where m.user_id = (select auth.uid())
      and m.is_active = true
  );
$$;

create or replace function smartmaktab_private.has_admin_permission(
  p_perm text,
  p_region text default null
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  mgr public.admin_managers%rowtype;
  req_reg text := lower(btrim(coalesce(p_region, '')));
  mgr_reg text;
begin
  if actor_id is null then return false; end if;
  if smartmaktab_private.is_developer() then return true; end if;

  select * into mgr
  from public.admin_managers
  where user_id = actor_id and is_active = true;

  if not found then return false; end if;
  if not (lower(btrim(coalesce(p_perm, ''))) = any(coalesce(mgr.permissions, '{}'::text[]))) then
    return false;
  end if;

  mgr_reg := lower(btrim(coalesce(mgr.region_scope, '')));
  if mgr_reg <> '' and req_reg <> '' and mgr_reg <> req_reg then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function smartmaktab_private.is_active_admin_manager(), smartmaktab_private.has_admin_permission(text, text)
  from public, anon, authenticated, service_role;
grant execute on function smartmaktab_private.is_active_admin_manager(), smartmaktab_private.has_admin_permission(text, text)
  to authenticated, service_role;

-- Update RLS read policies so admin managers can view the slices they are permitted to manage
drop policy if exists organizations_read on public.organizations;
create policy organizations_read on public.organizations for select to authenticated
  using (
    (select smartmaktab_private.is_developer())
    or smartmaktab_private.can_read_org(id)
    or (
      smartmaktab_private.is_active_admin_manager()
      and (
        smartmaktab_private.has_admin_permission('orgs', region_name)
        or smartmaktab_private.has_admin_permission('roles', region_name)
        or smartmaktab_private.has_admin_permission('licenses', region_name)
        or smartmaktab_private.has_admin_permission('payments', region_name)
        or smartmaktab_private.has_admin_permission('verifications', region_name)
      )
    )
  );

drop policy if exists memberships_read on public.school_memberships;
create policy memberships_read on public.school_memberships for select to authenticated
  using (
    (select smartmaktab_private.is_developer())
    or user_id = (select auth.uid())
    or smartmaktab_private.has_admin_permission('roles')
    or smartmaktab_private.has_admin_permission('verifications')
  );

drop policy if exists user_profiles_read on public.user_profiles;
create policy user_profiles_read on public.user_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select smartmaktab_private.is_developer())
    or smartmaktab_private.has_admin_permission('roles')
    or smartmaktab_private.has_admin_permission('verifications')
  );

drop policy if exists user_device_sessions_read on public.user_device_sessions;
create policy user_device_sessions_read on public.user_device_sessions for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select smartmaktab_private.is_developer())
    or smartmaktab_private.has_admin_permission('roles')
  );

drop policy if exists school_licenses_read on public.school_licenses;
create policy school_licenses_read on public.school_licenses for select to authenticated
  using (
    (select smartmaktab_private.is_developer())
    or smartmaktab_private.can_read_org(organization_id)
    or smartmaktab_private.has_admin_permission('licenses')
    or smartmaktab_private.has_admin_permission('orgs')
    or smartmaktab_private.has_admin_permission('payments')
  );

drop policy if exists payment_submissions_read on public.payment_submissions;
create policy payment_submissions_read on public.payment_submissions for select to authenticated
  using (
    (select smartmaktab_private.is_developer())
    or smartmaktab_private.can_write_school(organization_id)
    or smartmaktab_private.has_admin_permission('payments')
  );

drop policy if exists doc_cat_read_auth on public.document_categories;
create policy doc_cat_read_auth on public.document_categories for select to authenticated
  using (smartmaktab_private.is_developer() or smartmaktab_private.has_admin_permission('documents') or is_active = true);

drop policy if exists doc_sub_read_auth on public.document_subcategories;
create policy doc_sub_read_auth on public.document_subcategories for select to authenticated
  using (smartmaktab_private.is_developer() or smartmaktab_private.has_admin_permission('documents') or is_active = true);

drop policy if exists doc_tpl_read_auth on public.document_templates;
create policy doc_tpl_read_auth on public.document_templates for select to authenticated
  using (smartmaktab_private.is_developer() or smartmaktab_private.has_admin_permission('documents') or status = 'published');

-- Super-admin-only RPCs to manage Admin Managers
create or replace function public.admin_list_admin_managers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'full_name', coalesce(nullif(m.full_name, ''), up.full_name, ''),
    'login_name', coalesce(nullif(m.login_name, ''), up.login_name, ''),
    'permissions', m.permissions,
    'region_scope', coalesce(m.region_scope, ''),
    'is_active', m.is_active,
    'notes', m.notes,
    'created_at', m.created_at,
    'updated_at', m.updated_at
  ) order by m.created_at desc), '[]'::jsonb)
  into v_rows
  from public.admin_managers m
  left join public.user_profiles up on up.user_id = m.user_id;

  return v_rows;
end;
$$;

create or replace function public.admin_upsert_admin_manager(
  p_user_id uuid,
  p_full_name text default '',
  p_login_name text default '',
  p_permissions text[] default '{}'::text[],
  p_region_scope text default null,
  p_is_active boolean default true,
  p_notes text default ''
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  perms_clean text[] := '{}'::text[];
  reg_clean text := nullif(btrim(coalesce(p_region_scope, '')), '');
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'user_id required' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct lower(btrim(x)) order by lower(btrim(x))), '{}'::text[])
  into perms_clean
  from unnest(coalesce(p_permissions, '{}'::text[])) as x
  where lower(btrim(x)) in ('orgs','verifications','roles','licenses','plans','payments','documents');

  insert into public.admin_managers (
    user_id, full_name, login_name, permissions, region_scope, is_active, notes, created_by, created_at, updated_at
  ) values (
    p_user_id,
    left(btrim(coalesce(p_full_name, '')), 160),
    left(btrim(coalesce(p_login_name, '')), 160),
    perms_clean,
    reg_clean,
    coalesce(p_is_active, true),
    left(btrim(coalesce(p_notes, '')), 400),
    actor_id,
    now(),
    now()
  )
  on conflict (user_id) do update
    set full_name = case when excluded.full_name <> '' then excluded.full_name else public.admin_managers.full_name end,
        login_name = case when excluded.login_name <> '' then excluded.login_name else public.admin_managers.login_name end,
        permissions = excluded.permissions,
        region_scope = excluded.region_scope,
        is_active = excluded.is_active,
        notes = excluded.notes,
        updated_at = now();

  return p_user_id;
end;
$$;

create or replace function public.admin_delete_admin_manager(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  cnt integer := 0;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  delete from public.admin_managers where user_id = p_user_id;
  get diagnostics cnt = row_count;
  return cnt > 0;
end;
$$;

create or replace function public.service_is_privileged_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select exists (select 1 from smartmaktab_private.platform_developers d where d.user_id = p_user_id)
      or exists (select 1 from public.admin_managers m where m.user_id = p_user_id);
$$;

revoke all on function public.service_is_privileged_admin(uuid) from public, anon, authenticated;
grant execute on function public.service_is_privileged_admin(uuid) to service_role;

-- Update existing admin RPCs to accept permitted admin managers (preserving exact signatures)
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
  old_reg text := null;
  output uuid;
begin
  if p_org_id is not null then
    select o.region_name into old_reg from public.organizations o where o.id = p_org_id;
  end if;
  if not smartmaktab_private.has_admin_permission('orgs', coalesce(reg_clean, old_reg)) then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
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
  if p_org_id is null then
    raise exception 'organization ID required' using errcode = '22023';
  end if;
  select * into org_row from public.organizations where id = p_org_id;
  if not found then
    raise exception 'organization not found' using errcode = '55000';
  end if;
  if not smartmaktab_private.has_admin_permission('orgs', org_row.region_name) then
    raise exception 'super_admin required' using errcode = '42501';
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

create or replace function public.admin_assign_membership(
  p_user_id uuid,
  p_org_id uuid,
  p_role text,
  p_primary_position text default null,
  p_extra_positions text[] default '{}'::text[],
  p_max_extra_positions integer default 0,
  p_max_devices integer default 2,
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
  max_dev integer := coalesce(p_max_devices, 2);
  resolved_role text := p_role;
  org_reg text := null;
  output uuid;
begin
  select o.region_name into org_reg from public.organizations o where o.id = p_org_id;
  if not smartmaktab_private.has_admin_permission('roles', org_reg) then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  -- Managers cannot modify super_admins or other admin managers
  if not smartmaktab_private.is_developer() and (
    exists (select 1 from smartmaktab_private.platform_developers d where d.user_id = p_user_id)
    or exists (select 1 from public.admin_managers am where am.user_id = p_user_id)
  ) then
    raise exception 'cannot_modify_privileged_account' using errcode = '42501';
  end if;
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

create or replace function public.admin_remove_membership(p_membership_id uuid)
returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  mem_row public.school_memberships%rowtype;
  org_reg text := null;
  output uuid;
begin
  select * into mem_row from public.school_memberships where id = p_membership_id;
  if not found then raise exception 'membership not found' using errcode = '55000'; end if;
  select o.region_name into org_reg from public.organizations o where o.id = mem_row.organization_id;
  if not smartmaktab_private.has_admin_permission('roles', org_reg) then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  delete from public.school_memberships where id = p_membership_id returning id into output;
  return output;
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
  org_reg text := null;
  removed_count integer := 0;
begin
  select o.region_name into org_reg from public.organizations o where o.id = p_org_id;
  if not smartmaktab_private.has_admin_permission('roles', org_reg) then
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
  org_reg text := null;
  output uuid;
begin
  select o.region_name into org_reg from public.organizations o where o.id = p_org_id;
  if not (smartmaktab_private.has_admin_permission('licenses', org_reg) or smartmaktab_private.has_admin_permission('payments', org_reg)) then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
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

create or replace function public.admin_upsert_subscription_plan(
  p_code text,
  p_title_tg text,
  p_title_ru text,
  p_price_tjs numeric,
  p_duration_days integer,
  p_recipient_phone text,
  p_supported_providers text[] default array['amonat','dcity'],
  p_is_active boolean default true
) returns text
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  code_clean text := lower(btrim(coalesce(p_code, '')));
  digits text := regexp_replace(coalesce(p_recipient_phone, ''), '\D', '', 'g');
  acct_clean text := case
    when length(digits) = 9 then '992' || digits
    else digits
  end;
begin
  if not smartmaktab_private.has_admin_permission('plans') then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if code_clean !~ '^[a-z0-9_-]{2,40}$' or p_price_tjs < 0 or p_duration_days < 1 or p_duration_days > 3650 or acct_clean !~ '^[0-9]{9,15}$' then
    raise exception 'invalid subscription plan' using errcode = '22023';
  end if;
  insert into public.subscription_plans (
    code, title_tg, title_ru, price_tjs, duration_days, recipient_phone, recipient_account, supported_providers, is_active, updated_by, updated_at
  ) values (
    code_clean, btrim(p_title_tg), btrim(p_title_ru), p_price_tjs, p_duration_days,
    btrim(p_recipient_phone), acct_clean, coalesce(p_supported_providers, array['amonat','dcity']), coalesce(p_is_active, true),
    auth.uid(), now()
  )
  on conflict (code) do update
    set title_tg = excluded.title_tg,
        title_ru = excluded.title_ru,
        price_tjs = excluded.price_tjs,
        duration_days = excluded.duration_days,
        recipient_phone = excluded.recipient_phone,
        recipient_account = excluded.recipient_account,
        supported_providers = excluded.supported_providers,
        is_active = excluded.is_active,
        updated_by = auth.uid(),
        updated_at = now();
  return code_clean;
end;
$$;

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
  if not smartmaktab_private.has_admin_permission('plans') then
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
  org_reg text := null;
  base_ts timestamptz;
  existing_exp timestamptz;
  mem_exp timestamptz;
  mem_base timestamptz;
  req_pos text;
  req_extras text[];
  req_aliya boolean;
  req_packs integer;
  req_days integer;
  req_months integer;
  cur_lic public.school_licenses%rowtype;
begin
  if p_decision not in ('verified','rejected') or p_extend_days < 0 or p_extend_days > 3650 then
    raise exception 'invalid payment decision' using errcode = '22023';
  end if;
  select * into sub_row from public.payment_submissions where id = p_payment_id for update;
  if not found then raise exception 'payment not found' using errcode = '55000'; end if;
  select o.region_name into org_reg from public.organizations o where o.id = sub_row.organization_id;
  if not smartmaktab_private.has_admin_permission('payments', org_reg) then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
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
    req_packs := greatest(0, coalesce(sub_row.storage_pack_count, (sub_row.ocr_payload ->> 'storage_pack_count')::integer, 0));
    select coalesce(array_agg(x), '{}'::text[])
    into req_extras
    from jsonb_array_elements_text(coalesce(sub_row.ocr_payload -> 'extra_positions', '[]'::jsonb)) as x
    where exists (select 1 from public.role_tariffs rt where rt.position_code = x);

    perform public.admin_set_license(
      sub_row.organization_id,
      'active',
      coalesce(nullif(btrim(sub_row.plan_code), ''), nullif(btrim(p_plan_code), ''), 'standard'),
      base_ts + make_interval(days => req_days),
      coalesce(cur_lic.grace_days, 30),
      'payment_verified',
      greatest(coalesce(cur_lic.max_accounts, 1), 1),
      greatest(coalesce(cur_lic.max_positions_per_account, 1), 1 + coalesce(array_length(req_extras, 1), 0)),
      greatest(coalesce(cur_lic.default_max_devices, 2), least(40, (1 + coalesce(array_length(req_extras, 1), 0)) * 2))
    );

    if sub_row.submitted_by is not null then
      select subscription_expires_at into mem_exp
      from public.school_memberships
      where user_id = sub_row.submitted_by and organization_id = sub_row.organization_id;
      mem_base := greatest(now(), coalesce(mem_exp, now()));

      update public.school_memberships
      set primary_position = coalesce(req_pos, primary_position),
          extra_positions = case
            when coalesce(array_length(req_extras, 1), 0) > 0 then req_extras
            else extra_positions
          end,
          max_extra_positions = greatest(max_extra_positions, coalesce(array_length(req_extras, 1), 0)),
          max_devices = greatest(max_devices, least(40, (1 + coalesce(array_length(req_extras, 1), 0)) * 2)),
          aliya_enabled = aliya_enabled or req_aliya,
          aliya_expires_at = case
            when req_aliya then greatest(now(), coalesce(aliya_expires_at, now())) + make_interval(days => req_days)
            else aliya_expires_at
          end,
          storage_pack_count = greatest(storage_pack_count, req_packs),
          storage_pack_expires_at = case
            when req_packs > 0 then greatest(now(), coalesce(storage_pack_expires_at, now())) + make_interval(days => req_days)
            else storage_pack_expires_at
          end,
          subscription_status = 'active',
          subscription_months = req_months,
          subscription_expires_at = mem_base + make_interval(days => req_days)
      where user_id = sub_row.submitted_by
        and organization_id = sub_row.organization_id;
    end if;
  end if;
  return sub_row.id;
end;
$$;

-- Document catalog RPCs: allow permitted 'documents' manager
create or replace function public.admin_list_document_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  cats jsonb;
  subs jsonb;
  tpls jsonb;
begin
  if not smartmaktab_private.has_admin_permission('documents') then
    raise exception 'super_admin required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'position_codes', c.position_codes,
    'title_tg', c.title_tg,
    'title_ru', c.title_ru,
    'icon', c.icon,
    'sort_order', c.sort_order,
    'is_active', c.is_active,
    'updated_at', c.updated_at
  ) order by c.sort_order, c.created_at), '[]'::jsonb)
  into cats from public.document_categories c;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'category_id', s.category_id,
    'title_tg', s.title_tg,
    'title_ru', s.title_ru,
    'sort_order', s.sort_order,
    'is_active', s.is_active,
    'updated_at', s.updated_at
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  into subs from public.document_subcategories s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'category_id', t.category_id,
    'subcategory_id', t.subcategory_id,
    'position_codes', t.position_codes,
    'title_tg', t.title_tg,
    'title_ru', t.title_ru,
    'description_tg', t.description_tg,
    'page_orientation', t.page_orientation,
    'page_margins_mm', t.page_margins_mm,
    'lang', t.lang,
    'school_type_filter', t.school_type_filter,
    'shift_filter', t.shift_filter,
    'edit_mode', t.edit_mode,
    'strict_native_only', t.strict_native_only,
    'status', t.status,
    'version', t.version,
    'doc_format', t.doc_format,
    'storage_path', t.storage_path,
    'pdf_storage_path', t.pdf_storage_path,
    'pdf_size_bytes', t.pdf_size_bytes,
    'content_json', t.content_json,
    'sort_order', t.sort_order,
    'updated_at', t.updated_at
  ) order by t.sort_order, t.created_at), '[]'::jsonb)
  into tpls from public.document_templates t;

  return jsonb_build_object(
    'categories', cats,
    'subcategories', subs,
    'templates', tpls
  );
end;
$$;

create or replace function public.admin_upsert_document_category(
  p_id uuid default null,
  p_position_codes text[] default '{}'::text[],
  p_title_tg text default '',
  p_title_ru text default '',
  p_icon text default '📁',
  p_sort_order integer default 100,
  p_is_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  t_tg text := left(btrim(coalesce(p_title_tg, '')), 140);
  t_ru text := left(btrim(coalesce(p_title_ru, '')), 140);
  ico text := left(coalesce(nullif(btrim(p_icon), ''), '📁'), 12);
  pos_clean text[] := '{}'::text[];
  out_id uuid;
begin
  if not smartmaktab_private.has_admin_permission('documents') then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if t_tg = '' then
    raise exception 'category title required' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct val order by val), '{}'::text[])
  into pos_clean
  from unnest(coalesce(p_position_codes, '{}'::text[])) as val
  where val is not null and btrim(val) <> '';

  if array_length(pos_clean, 1) is null then
    raise exception 'at least one position required' using errcode = '22023';
  end if;

  if p_id is not null and exists (select 1 from public.document_categories where id = p_id) then
    update public.document_categories
    set position_codes = pos_clean,
        title_tg = t_tg,
        title_ru = t_ru,
        icon = ico,
        sort_order = coalesce(p_sort_order, 100),
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    where id = p_id
    returning id into out_id;
  else
    insert into public.document_categories (
      position_codes, title_tg, title_ru, icon, sort_order, is_active, created_by
    ) values (
      pos_clean, t_tg, t_ru, ico, coalesce(p_sort_order, 100), coalesce(p_is_active, true), actor_id
    ) returning id into out_id;
  end if;

  return out_id;
end;
$$;

create or replace function public.admin_delete_document_category(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  cnt integer := 0;
begin
  if not smartmaktab_private.has_admin_permission('documents') then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  delete from public.document_categories where id = p_id;
  get diagnostics cnt = row_count;
  return cnt > 0;
end;
$$;

create or replace function public.admin_upsert_document_subcategory(
  p_id uuid default null,
  p_category_id uuid default null,
  p_title_tg text default '',
  p_title_ru text default '',
  p_sort_order integer default 100,
  p_is_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  t_tg text := left(btrim(coalesce(p_title_tg, '')), 140);
  t_ru text := left(btrim(coalesce(p_title_ru, '')), 140);
  out_id uuid;
begin
  if not smartmaktab_private.has_admin_permission('documents') then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if t_tg = '' or p_category_id is null or not exists (select 1 from public.document_categories where id = p_category_id) then
    raise exception 'valid category and title required' using errcode = '22023';
  end if;

  if p_id is not null and exists (select 1 from public.document_subcategories where id = p_id) then
    update public.document_subcategories
    set category_id = p_category_id,
        title_tg = t_tg,
        title_ru = t_ru,
        sort_order = coalesce(p_sort_order, 100),
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    where id = p_id
    returning id into out_id;
  else
    insert into public.document_subcategories (
      category_id, title_tg, title_ru, sort_order, is_active, created_by
    ) values (
      p_category_id, t_tg, t_ru, coalesce(p_sort_order, 100), coalesce(p_is_active, true), actor_id
    ) returning id into out_id;
  end if;

  return out_id;
end;
$$;

create or replace function public.admin_delete_document_subcategory(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  cnt integer := 0;
begin
  if not smartmaktab_private.has_admin_permission('documents') then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  delete from public.document_subcategories where id = p_id;
  get diagnostics cnt = row_count;
  return cnt > 0;
end;
$$;

create or replace function public.admin_upsert_document_template(
  p_id uuid default null,
  p_category_id uuid default null,
  p_subcategory_id uuid default null,
  p_position_codes text[] default '{}'::text[],
  p_title_tg text default '',
  p_title_ru text default '',
  p_description_tg text default '',
  p_page_orientation text default 'portrait',
  p_page_margins_mm jsonb default '{"top":20,"right":15,"bottom":20,"left":30}'::jsonb,
  p_lang text default 'both',
  p_school_type_filter text default 'all',
  p_shift_filter text default 'all',
  p_edit_mode text default 'full',
  p_strict_native_only boolean default false,
  p_status text default 'published',
  p_sort_order integer default 100,
  p_storage_path text default '',
  p_content_json jsonb default '{}'::jsonb,
  p_doc_format text default 'word',
  p_pdf_storage_path text default '',
  p_pdf_size_bytes integer default 0
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  t_tg text := left(btrim(coalesce(p_title_tg, '')), 180);
  t_ru text := left(btrim(coalesce(p_title_ru, '')), 180);
  desc_tg text := left(btrim(coalesce(p_description_tg, '')), 500);
  orient text := case when p_page_orientation = 'landscape' then 'landscape' else 'portrait' end;
  lng text := case when p_lang in ('tg', 'ru', 'both') then p_lang else 'both' end;
  fmt text := case when lower(coalesce(p_doc_format, 'word')) = 'pdf' then 'pdf' else 'word' end;
  emode text := case when p_edit_mode = 'fields_only' then 'fields_only' else 'full' end;
  st text := case when p_status = 'draft' then 'draft' else 'published' end;
  pos_clean text[] := '{}'::text[];
  cat_id uuid := p_category_id;
  out_id uuid;
begin
  if not smartmaktab_private.has_admin_permission('documents') then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if t_tg = '' or p_subcategory_id is null then
    raise exception 'template title and subcategory required' using errcode = '22023';
  end if;

  select s.category_id into cat_id
  from public.document_subcategories s
  where s.id = p_subcategory_id;
  if not found then
    raise exception 'subcategory not found' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct val order by val), '{}'::text[])
  into pos_clean
  from unnest(coalesce(p_position_codes, '{}'::text[])) as val
  where val is not null and btrim(val) <> '';

  if array_length(pos_clean, 1) is null then
    select c.position_codes into pos_clean
    from public.document_categories c where c.id = cat_id;
  end if;

  if p_id is not null and exists (select 1 from public.document_templates where id = p_id) then
    update public.document_templates
    set category_id = cat_id,
        subcategory_id = p_subcategory_id,
        position_codes = coalesce(pos_clean, '{}'::text[]),
        title_tg = t_tg,
        title_ru = t_ru,
        description_tg = desc_tg,
        page_orientation = orient,
        page_margins_mm = coalesce(p_page_margins_mm, '{"top":20,"right":15,"bottom":20,"left":30}'::jsonb),
        lang = lng,
        school_type_filter = coalesce(nullif(btrim(p_school_type_filter), ''), 'all'),
        shift_filter = coalesce(nullif(btrim(p_shift_filter), ''), 'all'),
        edit_mode = case when fmt = 'pdf' then 'fields_only' else emode end,
        strict_native_only = coalesce(p_strict_native_only, false),
        status = st,
        version = version + 1,
        doc_format = fmt,
        storage_path = case when fmt = 'pdf' then '' else left(coalesce(p_storage_path, ''), 300) end,
        pdf_storage_path = case
          when fmt = 'pdf' then coalesce(nullif(left(btrim(coalesce(p_pdf_storage_path, '')), 400), ''), pdf_storage_path)
          else ''
        end,
        pdf_size_bytes = case
          when fmt = 'pdf' then greatest(0, coalesce(nullif(p_pdf_size_bytes, 0), pdf_size_bytes))
          else 0
        end,
        content_json = case when fmt = 'pdf' then '{}'::jsonb else coalesce(p_content_json, '{}'::jsonb) end,
        sort_order = coalesce(p_sort_order, 100),
        updated_at = now()
    where id = p_id
    returning id into out_id;
  else
    insert into public.document_templates (
      category_id, subcategory_id, position_codes, title_tg, title_ru, description_tg,
      page_orientation, page_margins_mm, lang, school_type_filter, shift_filter,
      edit_mode, strict_native_only, status, doc_format, storage_path,
      pdf_storage_path, pdf_size_bytes, content_json, sort_order, created_by
    ) values (
      cat_id, p_subcategory_id, coalesce(pos_clean, '{}'::text[]), t_tg, t_ru, desc_tg,
      orient, coalesce(p_page_margins_mm, '{"top":20,"right":15,"bottom":20,"left":30}'::jsonb),
      lng, coalesce(nullif(btrim(p_school_type_filter), ''), 'all'),
      coalesce(nullif(btrim(p_shift_filter), ''), 'all'),
      case when fmt = 'pdf' then 'fields_only' else emode end,
      coalesce(p_strict_native_only, false), st, fmt,
      case when fmt = 'pdf' then '' else left(coalesce(p_storage_path, ''), 300) end,
      case when fmt = 'pdf' then left(btrim(coalesce(p_pdf_storage_path, '')), 400) else '' end,
      case when fmt = 'pdf' then greatest(0, coalesce(p_pdf_size_bytes, 0)) else 0 end,
      case when fmt = 'pdf' then '{}'::jsonb else coalesce(p_content_json, '{}'::jsonb) end,
      coalesce(p_sort_order, 100),
      actor_id
    ) returning id into out_id;
  end if;

  return out_id;
end;
$$;

create or replace function public.admin_delete_document_template(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  cnt integer := 0;
begin
  if not smartmaktab_private.has_admin_permission('documents') then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  delete from public.document_templates where id = p_id;
  get diagnostics cnt = row_count;
  return cnt > 0;
end;
$$;

-- Account verifications also accessible to permitted 'verifications' manager
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
  has_mgr boolean := smartmaktab_private.has_admin_permission('verifications');
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

  if not is_dev and not has_mgr and not has_auth and not has_verifier then
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
      or (has_mgr and smartmaktab_private.has_admin_permission('verifications', o.region_name))
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
  is_mgr boolean := false;
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

  is_mgr := smartmaktab_private.has_admin_permission('verifications', target_org.region_name);
  is_auth := target_org.kind = 'school' and smartmaktab_private.can_review_school_as_authority(target_mem.organization_id);
  is_verifier := target_org.kind = 'school' and smartmaktab_private.is_school_account_verifier(target_mem.organization_id);
  is_target_director := coalesce(target_mem.primary_position, '') = 'school-director'
    or target_mem.role in ('director','school_admin')
    or 'school-director' = any(coalesce(target_mem.extra_positions, '{}'::text[]));

  if not is_dev and not is_mgr then
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

  delete from public.account_verification_requests where membership_id = target_mem.id;

  update public.school_memberships
  set verification_status = dec_clean,
      account_active = true,
      verification_note = final_note,
      verified_by = case when dec_clean = 'verified' then actor_id else null end,
      verified_at = case when dec_clean = 'verified' then now() else null end
  where id = target_mem.id;

  if dec_clean = 'verified' and coalesce(p_verify_org, true) and (is_dev or is_mgr or is_auth) and target_org.verification_status <> 'verified' then
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

-- Enrich get_my_workspace_context() with admin manager metadata
create or replace function public.get_my_workspace_context()
returns jsonb language plpgsql stable security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  prof jsonb;
  roles jsonb;
  doc_quota jsonb;
  mgr_row public.admin_managers%rowtype;
begin
  if actor_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'full_name', p.full_name,
    'preferred_lang', p.preferred_lang,
    'login_name', p.login_name,
    'profile_details', p.profile_details
  )
  into prof from public.user_profiles p where p.user_id = actor_id;

  doc_quota := smartmaktab_private.user_document_quota(actor_id);

  select * into mgr_row
  from public.admin_managers m
  where m.user_id = actor_id and m.is_active = true;

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
    'storage_pack_count', m.storage_pack_count,
    'storage_pack_expires_at', m.storage_pack_expires_at,
    'custom_method_name', m.custom_method_name,
    'position_profiles', m.position_profiles,
    'active_devices_count', (
      select count(*)::integer from public.user_device_sessions ds
      where ds.user_id = m.user_id and ds.organization_id = m.organization_id and ds.is_active = true
    ),
    'active_mobile_count', (
      select count(*)::integer from public.user_device_sessions ds
      where ds.user_id = m.user_id and ds.organization_id = m.organization_id and ds.is_active = true and ds.device_kind = 'mobile'
    ),
    'active_desktop_count', (
      select count(*)::integer from public.user_device_sessions ds
      where ds.user_id = m.user_id and ds.organization_id = m.organization_id and ds.is_active = true and ds.device_kind = 'desktop'
    )
  ) order by o.name, o.id), '[]'::jsonb)
  into roles
  from public.school_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = actor_id;

  return jsonb_build_object(
    'user_id', actor_id,
    'is_super_admin', smartmaktab_private.is_developer(),
    'is_admin_manager', (mgr_row.user_id is not null),
    'admin_permissions', case
      when smartmaktab_private.is_developer() then '["orgs","verifications","roles","licenses","plans","payments","documents","managers"]'::jsonb
      when mgr_row.user_id is not null then to_jsonb(coalesce(mgr_row.permissions, '{}'::text[]))
      else '[]'::jsonb
    end,
    'admin_region_scope', coalesce(mgr_row.region_scope, ''),
    'profile', coalesce(prof, jsonb_build_object('full_name', '', 'preferred_lang', 'tg', 'login_name', '', 'profile_details', '{}'::jsonb)),
    'document_quota', doc_quota,
    'memberships', roles
  );
end;
$$;

-- ============================================================================
-- 2. SCHOOL STUDENTS FULL BIRTH_DATE & STUDENT UPDATE REQUESTS WORKFLOW
-- ============================================================================
alter table public.school_students
  add column if not exists birth_date date;

grant select (birth_date) on public.school_students to authenticated;

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
  v_bdate date;
  v_bdate_raw text;
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

    v_bdate := null;
    v_bdate_raw := btrim(coalesce(rec ->> 'birth_date', ''));
    if v_bdate_raw ~ '^\d{4}-\d{2}-\d{2}$' then
      begin
        v_bdate := v_bdate_raw::date;
      exception when others then v_bdate := null;
      end;
    elsif v_bdate_raw ~ '^\d{2}\.\d{2}\.\d{4}$' then
      begin
        v_bdate := to_date(v_bdate_raw, 'DD.MM.YYYY');
      exception when others then v_bdate := null;
      end;
    end if;

    v_birth := case when coalesce(rec ->> 'birth_year', '') ~ '^\d{4}$' then (rec ->> 'birth_year')::integer else null end;
    if v_birth is null and v_bdate is not null then
      v_birth := extract(year from v_bdate)::integer;
    end if;
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
          birth_date = coalesce(v_bdate, birth_date),
          birth_year = coalesce(v_birth, birth_year),
          gender = case when v_gender <> '' then v_gender else gender end,
          guardian_name = case when v_guard <> '' then v_guard else guardian_name end,
          guardian_phone = case when v_phone <> '' then v_phone else guardian_phone end,
          student_code = case when v_code <> '' then v_code else student_code end,
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
      organization_id, class_code, full_name, birth_date, birth_year, gender, guardian_name, guardian_phone, student_code, status, created_by, updated_by
    ) values (
      p_org_id, v_cls, v_name, v_bdate, v_birth, v_gender, v_guard, v_phone, v_code, v_status, actor_id, actor_id
    );
    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object('inserted', inserted_count, 'updated', updated_count);
end;
$$;

create or replace function smartmaktab_private.can_approve_student_updates(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select smartmaktab_private.is_developer() or exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and m.organization_id = p_org_id
      and m.account_active = true
      and m.verification_status = 'verified'
      and (
        m.role in ('school_admin','director','deputy')
        or m.primary_position in ('school-director','school-records-clerk','school-academic-deputy','school-upbringing-deputy','school-primary-deputy','school-class-teacher')
        or coalesce(m.extra_positions, '{}'::text[]) && array['school-director','school-records-clerk','school-academic-deputy','school-upbringing-deputy','school-primary-deputy','school-class-teacher']::text[]
      )
  );
$$;

revoke all on function smartmaktab_private.can_approve_student_updates(uuid) from public, anon, authenticated, service_role;
grant execute on function smartmaktab_private.can_approve_student_updates(uuid) to authenticated, service_role;

create table if not exists public.student_update_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_kind text generated always as ('school'::text) stored,
  class_code text not null default '' check (length(class_code) <= 24),
  action_type text not null default 'import' check (action_type in ('import','add','update','delete')),
  replace_class boolean not null default false,
  rows_payload jsonb not null default '[]'::jsonb check (jsonb_typeof(rows_payload) = 'array'),
  summary_text text not null default '' check (length(summary_text) <= 400),
  requested_by uuid references auth.users (id) on delete set null,
  requested_by_name text not null default '' check (length(requested_by_name) <= 160),
  requested_by_position text not null default '' check (length(requested_by_position) <= 120),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_by_name text not null default '' check (length(reviewed_by_name) <= 160),
  review_note text not null default '' check (length(review_note) <= 400),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  foreign key (organization_id, organization_kind) references public.organizations (id, kind)
);

create index if not exists student_update_requests_org_idx
  on public.student_update_requests (organization_id, status, created_at desc);

alter table public.student_update_requests enable row level security;
drop policy if exists student_update_requests_read on public.student_update_requests;
create policy student_update_requests_read on public.student_update_requests
  for select to authenticated
  using ((select smartmaktab_private.is_developer()) or smartmaktab_private.can_read_org(organization_id));

revoke all on public.student_update_requests from public, anon, authenticated, service_role;
grant select on public.student_update_requests to authenticated;

drop trigger if exists audit_student_update_requests on public.student_update_requests;
create trigger audit_student_update_requests
  after insert or update or delete on public.student_update_requests
  for each row execute function smartmaktab_private.audit_write();

create or replace function public.submit_student_update_request(
  p_org_id uuid,
  p_class_code text,
  p_action_type text default 'import',
  p_replace_class boolean default false,
  p_rows_payload jsonb default '[]'::jsonb,
  p_summary_text text default '',
  p_requested_by_name text default '',
  p_requested_by_position text default ''
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  act_clean text := case when lower(btrim(coalesce(p_action_type, ''))) in ('import','add','update','delete') then lower(btrim(p_action_type)) else 'import' end;
  cls_clean text := upper(left(btrim(coalesce(p_class_code, '')), 24));
  prof_name text := '';
  pos_name text := '';
  out_id uuid;
begin
  if actor_id is null or p_org_id is null or not smartmaktab_private.can_write_school(p_org_id) then
    raise exception 'student request denied' using errcode = '42501';
  end if;
  if p_rows_payload is null or jsonb_typeof(p_rows_payload) <> 'array' or jsonb_array_length(p_rows_payload) = 0 then
    raise exception 'rows payload required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows_payload) > 1500 then
    raise exception 'too many rows in request' using errcode = '22023';
  end if;

  select coalesce(up.full_name, up.login_name, '') into prof_name from public.user_profiles up where up.user_id = actor_id;
  select coalesce(rt.title_tg, m.primary_position, '') into pos_name
  from public.school_memberships m
  left join public.role_tariffs rt on rt.position_code = m.primary_position
  where m.user_id = actor_id and m.organization_id = p_org_id
  limit 1;

  insert into public.student_update_requests (
    organization_id, class_code, action_type, replace_class, rows_payload, summary_text,
    requested_by, requested_by_name, requested_by_position, status
  ) values (
    p_org_id,
    cls_clean,
    act_clean,
    coalesce(p_replace_class, false),
    p_rows_payload,
    left(btrim(coalesce(p_summary_text, '')), 400),
    actor_id,
    left(coalesce(nullif(btrim(coalesce(p_requested_by_name, '')), ''), nullif(btrim(coalesce(prof_name, '')), ''), 'Корманд'), 160),
    left(coalesce(nullif(btrim(coalesce(p_requested_by_position, '')), ''), pos_name, ''), 120),
    'pending'
  ) returning id into out_id;

  return out_id;
end;
$$;

create or replace function public.review_student_update_request(
  p_request_id uuid,
  p_decision text,
  p_note text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  dec_clean text := lower(btrim(coalesce(p_decision, '')));
  req_row public.student_update_requests%rowtype;
  rev_name text := '';
  rec jsonb;
  apply_res jsonb := '{}'::jsonb;
  del_id uuid;
begin
  if actor_id is null or p_request_id is null or dec_clean not in ('approved','rejected') then
    raise exception 'invalid review decision' using errcode = '22023';
  end if;

  select * into req_row from public.student_update_requests where id = p_request_id for update;
  if not found then raise exception 'student update request not found' using errcode = '55000'; end if;
  if req_row.status <> 'pending' then raise exception 'request already reviewed' using errcode = '55000'; end if;

  if not smartmaktab_private.can_approve_student_updates(req_row.organization_id) then
    raise exception 'student approval denied' using errcode = '42501';
  end if;

  select coalesce(up.full_name, up.login_name, '') into rev_name from public.user_profiles up where up.user_id = actor_id;

  if dec_clean = 'approved' then
    if req_row.action_type = 'delete' then
      for rec in select * from jsonb_array_elements(req_row.rows_payload) loop
        if coalesce(rec ->> 'id', '') ~ '^[0-9a-f-]{36}$' then
          del_id := (rec ->> 'id')::uuid;
          update public.school_students
          set deleted_at = now(), updated_by = actor_id, updated_at = now()
          where id = del_id and organization_id = req_row.organization_id and deleted_at is null;
        end if;
      end loop;
      apply_res := jsonb_build_object('deleted', jsonb_array_length(req_row.rows_payload));
    else
      apply_res := public.upsert_school_students(
        req_row.organization_id,
        req_row.rows_payload,
        case when req_row.replace_class then nullif(req_row.class_code, '') else null end
      );
    end if;
  end if;

  update public.student_update_requests
  set status = dec_clean,
      reviewed_by = actor_id,
      reviewed_by_name = left(coalesce(rev_name, ''), 160),
      review_note = left(btrim(coalesce(p_note, '')), 400),
      reviewed_at = now()
  where id = req_row.id;

  return jsonb_build_object(
    'request_id', req_row.id,
    'status', dec_clean,
    'applied', apply_res
  );
end;
$$;

-- ============================================================================
-- 3. SCHOOL COLLEAGUES DIRECTORY (READ-ONLY FOR ALL VERIFIED STAFF)
-- ============================================================================
create or replace function public.get_school_colleagues_directory(p_org_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  target_org uuid := p_org_id;
  v_rows jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if target_org is null then
    select m.organization_id into target_org
    from public.school_memberships m
    where m.user_id = actor_id and m.account_active = true
    order by m.created_at asc
    limit 1;
  end if;

  if target_org is null then
    return '[]'::jsonb;
  end if;

  if not smartmaktab_private.is_developer() and not smartmaktab_private.can_read_org(target_org) then
    raise exception 'directory access denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', m.id,
    'user_id', m.user_id,
    'organization_id', o.id,
    'organization_name', o.name,
    'full_name', coalesce(up.full_name, up.login_name, ''),
    'primary_position', m.primary_position,
    'extra_positions', m.extra_positions,
    'custom_method_name', coalesce(m.custom_method_name, ''),
    'verification_status', m.verification_status,
    'account_active', m.account_active
  ) order by coalesce(up.full_name, up.login_name, '')), '[]'::jsonb)
  into v_rows
  from public.school_memberships m
  join public.organizations o on o.id = m.organization_id
  left join public.user_profiles up on up.user_id = m.user_id
  where m.organization_id = target_org
    and m.verification_status <> 'rejected';

  return v_rows;
end;
$$;

-- ============================================================================
-- 4. EXTENDED "ТАҲЛИЛ" GRADE FIELDS (10-POINT CURRENT + CONTROL + DATES)
-- ============================================================================
alter table public.quarter_grades
  add column if not exists current_grades jsonb not null default '[]'::jsonb,
  add column if not exists control_grades jsonb not null default '[]'::jsonb,
  add column if not exists period_start date,
  add column if not exists period_end date;

grant select (current_grades, control_grades, period_start, period_end) on public.quarter_grades to authenticated;

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
  cur_arr jsonb;
  ctrl_arr jsonb;
  p_start date;
  p_end date;
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
    cur_arr := case when rec ? 'current_grades' and jsonb_typeof(rec -> 'current_grades') = 'array' then rec -> 'current_grades' else '[]'::jsonb end;
    ctrl_arr := case when rec ? 'control_grades' and jsonb_typeof(rec -> 'control_grades') = 'array' then rec -> 'control_grades' else '[]'::jsonb end;

    p_start := null;
    if coalesce(rec ->> 'period_start', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      begin p_start := (rec ->> 'period_start')::date; exception when others then p_start := null; end;
    end if;
    p_end := null;
    if coalesce(rec ->> 'period_end', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      begin p_end := (rec ->> 'period_end')::date; exception when others then p_end := null; end;
    end if;

    insert into public.quarter_grades (
      organization_id, year_start, period, class_code, subject, student_id, student_name,
      grade, absent_hours, current_grades, control_grades, period_start, period_end, updated_by, updated_at
    ) values (
      p_org_id, p_year_start, p_period, cls_clean, subj_clean, s_id, s_name,
      g_val, abs_val, cur_arr, ctrl_arr, p_start, p_end, actor_id, now()
    )
    on conflict (organization_id, year_start, period, class_code, subject, student_name) do update
      set student_id = coalesce(excluded.student_id, public.quarter_grades.student_id),
          grade = excluded.grade,
          absent_hours = excluded.absent_hours,
          current_grades = case when jsonb_array_length(excluded.current_grades) > 0 then excluded.current_grades else public.quarter_grades.current_grades end,
          control_grades = case when jsonb_array_length(excluded.control_grades) > 0 then excluded.control_grades else public.quarter_grades.control_grades end,
          period_start = coalesce(excluded.period_start, public.quarter_grades.period_start),
          period_end = coalesce(excluded.period_end, public.quarter_grades.period_end),
          updated_by = actor_id,
          updated_at = now();
    saved_cnt := saved_cnt + 1;
  end loop;

  return jsonb_build_object('saved', saved_cnt);
end;
$$;

-- Grants for new RPCs
revoke all on function
  public.admin_list_admin_managers(),
  public.admin_upsert_admin_manager(uuid, text, text, text[], text, boolean, text),
  public.admin_delete_admin_manager(uuid),
  public.submit_student_update_request(uuid, text, text, boolean, jsonb, text, text, text),
  public.review_student_update_request(uuid, text, text),
  public.get_school_colleagues_directory(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.admin_list_admin_managers(),
  public.admin_upsert_admin_manager(uuid, text, text, text[], text, boolean, text),
  public.admin_delete_admin_manager(uuid),
  public.submit_student_update_request(uuid, text, text, boolean, jsonb, text, text, text),
  public.review_student_update_request(uuid, text, text),
  public.get_school_colleagues_directory(uuid)
to authenticated;
