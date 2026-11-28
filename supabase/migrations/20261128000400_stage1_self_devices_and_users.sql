-- ---------------------------------------------------------------------------
-- 5. Self-service device listing & unlink RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_my_device_sessions(p_org_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ds.id,
    'organization_id', ds.organization_id,
    'organization_name', o.name,
    'device_id', ds.device_id,
    'device_kind', ds.device_kind,
    'device_label', ds.device_label,
    'first_seen_at', ds.first_seen_at,
    'last_seen_at', ds.last_seen_at,
    'max_devices', m.max_devices,
    'max_per_kind', greatest(1, ceil(greatest(1, coalesce(m.max_devices, 2)) / 2.0)::integer)
  ) order by ds.last_seen_at desc), '[]'::jsonb)
  into v_rows
  from public.user_device_sessions ds
  join public.organizations o on o.id = ds.organization_id
  join public.school_memberships m on m.user_id = ds.user_id and m.organization_id = ds.organization_id
  where ds.user_id = actor_id
    and ds.is_active = true
    and (p_org_id is null or ds.organization_id = p_org_id);

  return v_rows;
end;
$$;

create or replace function public.revoke_my_device_session(
  p_org_id uuid,
  p_device_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  dev_clean text := btrim(coalesce(p_device_id, ''));
  removed_cnt integer := 0;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_org_id is null or dev_clean = '' then
    raise exception 'invalid device parameters' using errcode = '22023';
  end if;

  delete from public.user_device_sessions
  where user_id = actor_id
    and organization_id = p_org_id
    and device_id = dev_clean;

  get diagnostics removed_cnt = row_count;
  return removed_cnt;
end;
$$;

revoke all on function public.get_my_device_sessions(uuid), public.revoke_my_device_session(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.get_my_device_sessions(uuid), public.revoke_my_device_session(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Leadership 'Корбарон' hierarchy checks & management RPCs
-- ---------------------------------------------------------------------------
create or replace function smartmaktab_private.can_manage_membership(
  p_actor_id uuid,
  p_target_mem_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  t_mem public.school_memberships%rowtype;
  t_org public.organizations%rowtype;
  is_t_dev boolean := false;
  is_t_director boolean := false;
  is_t_office_head boolean := false;
  is_t_raesat_head boolean := false;
begin
  if p_actor_id is null or p_target_mem_id is null then
    return false;
  end if;

  select * into t_mem from public.school_memberships where id = p_target_mem_id;
  if not found then
    return false;
  end if;

  if t_mem.user_id = p_actor_id then
    return false;
  end if;

  select exists (
    select 1 from smartmaktab_private.platform_developers d where d.user_id = t_mem.user_id
  ) into is_t_dev;
  if is_t_dev then
    return false;
  end if;

  if exists (select 1 from smartmaktab_private.platform_developers d where d.user_id = p_actor_id) then
    return true;
  end if;

  select * into t_org from public.organizations where id = t_mem.organization_id;
  if not found then
    return false;
  end if;

  if t_org.kind = 'school' then
    is_t_director := coalesce(t_mem.primary_position, '') = 'school-director'
      or t_mem.role in ('director', 'school_admin')
      or 'school-director' = any(coalesce(t_mem.extra_positions, '{}'::text[]));

    -- School director manages all school members
    if exists (
      select 1 from public.school_memberships m
      where m.user_id = p_actor_id
        and m.organization_id = t_org.id
        and m.account_active = true
        and m.verification_status = 'verified'
        and (
          m.role in ('director', 'school_admin')
          or m.primary_position = 'school-director'
          or 'school-director' = any(coalesce(m.extra_positions, '{}'::text[]))
        )
    ) then
      return true;
    end if;

    -- Academic deputy / upbringing deputy / records clerk manage non-director school staff
    if not is_t_director and exists (
      select 1 from public.school_memberships m
      where m.user_id = p_actor_id
        and m.organization_id = t_org.id
        and m.account_active = true
        and m.verification_status = 'verified'
        and (
          m.primary_position in ('school-academic-deputy', 'school-upbringing-deputy', 'school-records-clerk')
          or coalesce(m.extra_positions, '{}'::text[]) && array['school-academic-deputy', 'school-upbringing-deputy', 'school-records-clerk']::text[]
        )
    ) then
      return true;
    end if;

    -- Maorif / Raesat in parent hierarchy manage schools in their jurisdiction
    if exists (
      select 1 from public.school_memberships m
      where m.user_id = p_actor_id
        and m.account_active = true
        and m.verification_status = 'verified'
        and m.role in ('authority_viewer', 'maorif')
        and (
          t_org.parent_id = m.organization_id
          or exists (
            select 1 from public.organizations mid
            where mid.id = t_org.parent_id
              and mid.kind = 'education_authority'
              and mid.parent_id = m.organization_id
          )
          or exists (
            select 1 from smartmaktab_private.summary_scope sc
            where sc.school_id = t_org.id and sc.authority_id = m.organization_id
          )
        )
    ) then
      return true;
    end if;

    return false;
  end if;

  if t_org.kind = 'education_authority' and t_org.authority_tier = 'maorif' then
    is_t_office_head := coalesce(t_mem.primary_position, '') = 'office-head'
      or 'office-head' = any(coalesce(t_mem.extra_positions, '{}'::text[]));

    -- Office head manages office clerks in the same Maorif
    if not is_t_office_head and exists (
      select 1 from public.school_memberships m
      where m.user_id = p_actor_id
        and m.organization_id = t_org.id
        and m.account_active = true
        and m.verification_status = 'verified'
        and (
          m.primary_position = 'office-head'
          or 'office-head' = any(coalesce(m.extra_positions, '{}'::text[]))
        )
    ) then
      return true;
    end if;

    -- Raesat manages Maorif accounts in its region
    if exists (
      select 1 from public.school_memberships m
      join public.organizations a_org on a_org.id = m.organization_id
      where m.user_id = p_actor_id
        and m.account_active = true
        and m.verification_status = 'verified'
        and a_org.kind = 'education_authority'
        and a_org.authority_tier = 'raesat'
        and (
          t_org.parent_id = a_org.id
          or (a_org.region_name is not null and a_org.region_name = t_org.region_name)
        )
    ) then
      return true;
    end if;

    return false;
  end if;

  if t_org.kind = 'education_authority' and t_org.authority_tier = 'raesat' then
    is_t_raesat_head := coalesce(t_mem.primary_position, '') = 'raesat-head'
      or 'raesat-head' = any(coalesce(t_mem.extra_positions, '{}'::text[]));

    if not is_t_raesat_head and exists (
      select 1 from public.school_memberships m
      where m.user_id = p_actor_id
        and m.organization_id = t_org.id
        and m.account_active = true
        and m.verification_status = 'verified'
        and (
          m.primary_position = 'raesat-head'
          or 'raesat-head' = any(coalesce(m.extra_positions, '{}'::text[]))
        )
    ) then
      return true;
    end if;

    return false;
  end if;

  return false;
end;
$$;

revoke all on function smartmaktab_private.can_manage_membership(uuid, uuid) from public, anon, authenticated;
grant execute on function smartmaktab_private.can_manage_membership(uuid, uuid) to authenticated, service_role;

create or replace function public.get_managed_users(p_org_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', m.id,
    'user_id', m.user_id,
    'organization_id', o.id,
    'organization_name', o.name,
    'organization_kind', o.kind,
    'authority_tier', o.authority_tier,
    'region_name', o.region_name,
    'district_name', o.district_name,
    'full_name', coalesce(r.full_name, up.full_name, ''),
    'login_name', coalesce(up.login_name, ''),
    'phone', coalesce(r.phone, up.profile_details ->> 'phone', ''),
    'birth_date', coalesce(r.birth_date, up.profile_details ->> 'birthDate', ''),
    'passport_number', coalesce(r.passport_number, ''),
    'role', m.role,
    'primary_position', m.primary_position,
    'extra_positions', m.extra_positions,
    'custom_method_name', coalesce(m.custom_method_name, ''),
    'verification_status', m.verification_status,
    'verification_note', coalesce(m.verification_note, ''),
    'account_active', m.account_active,
    'max_devices', m.max_devices,
    'subscription_status', m.subscription_status,
    'subscription_expires_at', m.subscription_expires_at,
    'requested_at', coalesce(r.created_at, m.requested_at),
    'verified_at', m.verified_at,
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'device_id', ds.device_id,
        'device_kind', ds.device_kind,
        'device_label', ds.device_label,
        'last_seen_at', ds.last_seen_at
      ) order by ds.last_seen_at desc)
      from public.user_device_sessions ds
      where ds.user_id = m.user_id and ds.organization_id = m.organization_id and ds.is_active = true
    ), '[]'::jsonb)
  ) order by
    case m.verification_status when 'pending' then 0 when 'unverified' then 1 when 'rejected' then 2 else 3 end,
    o.name,
    coalesce(up.full_name, up.login_name, '')
  ), '[]'::jsonb)
  into v_rows
  from public.school_memberships m
  join public.organizations o on o.id = m.organization_id
  left join public.user_profiles up on up.user_id = m.user_id
  left join public.account_verification_requests r on r.membership_id = m.id
  where (p_org_id is null or m.organization_id = p_org_id)
    and smartmaktab_private.can_manage_membership(actor_id, m.id);

  return v_rows;
end;
$$;

create or replace function public.manage_reset_user_devices(
  p_membership_id uuid,
  p_device_id text default null
) returns integer
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  t_mem public.school_memberships%rowtype;
  dev_clean text := nullif(btrim(coalesce(p_device_id, '')), '');
  removed_cnt integer := 0;
begin
  if actor_id is null or p_membership_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not smartmaktab_private.can_manage_membership(actor_id, p_membership_id) then
    raise exception 'user management permission denied' using errcode = '42501';
  end if;

  select * into t_mem from public.school_memberships where id = p_membership_id;
  if not found then
    raise exception 'membership not found' using errcode = '55000';
  end if;

  if dev_clean is not null then
    delete from public.user_device_sessions
    where user_id = t_mem.user_id and organization_id = t_mem.organization_id and device_id = dev_clean;
  else
    delete from public.user_device_sessions
    where user_id = t_mem.user_id and organization_id = t_mem.organization_id;
  end if;

  get diagnostics removed_cnt = row_count;
  return removed_cnt;
end;
$$;

create or replace function public.manage_set_user_active(
  p_membership_id uuid,
  p_active boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  t_mem public.school_memberships%rowtype;
begin
  if actor_id is null or p_membership_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not smartmaktab_private.can_manage_membership(actor_id, p_membership_id) then
    raise exception 'user management permission denied' using errcode = '42501';
  end if;

  update public.school_memberships
  set account_active = coalesce(p_active, true)
  where id = p_membership_id
  returning * into t_mem;

  if not found then
    raise exception 'membership not found' using errcode = '55000';
  end if;

  return jsonb_build_object(
    'membership_id', t_mem.id,
    'user_id', t_mem.user_id,
    'organization_id', t_mem.organization_id,
    'account_active', t_mem.account_active
  );
end;
$$;

create or replace function public.service_check_manage_permission(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_org_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  t_mem public.school_memberships%rowtype;
  v_allowed boolean := false;
begin
  if p_actor_id is null or p_target_user_id is null or p_org_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_params');
  end if;

  select * into t_mem
  from public.school_memberships
  where user_id = p_target_user_id and organization_id = p_org_id
  limit 1;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'membership_not_found');
  end if;

  v_allowed := smartmaktab_private.can_manage_membership(p_actor_id, t_mem.id);
  return jsonb_build_object(
    'allowed', v_allowed,
    'membership_id', t_mem.id,
    'user_id', t_mem.user_id,
    'organization_id', t_mem.organization_id
  );
end;
$$;

create or replace function public.service_delete_managed_membership(
  p_target_user_id uuid,
  p_org_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  remaining_cnt integer := 0;
  is_dev boolean := false;
begin
  if p_target_user_id is null or p_org_id is null then
    raise exception 'invalid_params';
  end if;

  select exists (
    select 1 from smartmaktab_private.platform_developers d where d.user_id = p_target_user_id
  ) into is_dev;
  if is_dev then
    raise exception 'cannot_delete_developer';
  end if;

  delete from public.account_verification_requests
  where user_id = p_target_user_id and organization_id = p_org_id;

  delete from public.user_device_sessions
  where user_id = p_target_user_id and organization_id = p_org_id;

  delete from public.school_memberships
  where user_id = p_target_user_id and organization_id = p_org_id;

  select count(*)::integer into remaining_cnt
  from public.school_memberships
  where user_id = p_target_user_id;

  if remaining_cnt = 0 then
    delete from public.user_profiles where user_id = p_target_user_id;
  end if;

  return jsonb_build_object(
    'deleted_user_id', p_target_user_id,
    'organization_id', p_org_id,
    'remaining_memberships', remaining_cnt,
    'should_delete_auth_user', (remaining_cnt = 0 and not is_dev)
  );
end;
$$;

revoke all on function
  public.get_managed_users(uuid),
  public.manage_reset_user_devices(uuid, text),
  public.manage_set_user_active(uuid, boolean)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_managed_users(uuid),
  public.manage_reset_user_devices(uuid, text),
  public.manage_set_user_active(uuid, boolean)
  to authenticated;

revoke all on function
  public.service_check_manage_permission(uuid, uuid, uuid),
  public.service_delete_managed_membership(uuid, uuid)
  from public, anon, authenticated;

grant execute on function
  public.service_check_manage_permission(uuid, uuid, uuid),
  public.service_delete_managed_membership(uuid, uuid)
  to service_role;
