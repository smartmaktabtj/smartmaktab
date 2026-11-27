-- Ensure only the 10-arg admin_assign_membership signature exists (max_devices up to 40, default 2)
-- and enrich get_my_workspace_context() with per-kind active device counts.

drop function if exists public.admin_assign_membership(uuid, uuid, text, text, text[], integer, integer, boolean);
drop function if exists public.admin_assign_membership(uuid, uuid, text, text, text[], integer, integer, boolean, boolean, text);

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
    'profile', coalesce(prof, jsonb_build_object('full_name', '', 'preferred_lang', 'tg', 'login_name', '', 'profile_details', '{}'::jsonb)),
    'memberships', roles
  );
end;
$$;
