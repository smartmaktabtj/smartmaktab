-- Public read-only bootstrap RPC + service_role-only account provisioning RPCs.
-- Keeps direct table privileges strictly revoked from anon and service_role while
-- allowing Edge Functions (register-user, admin-users) and the registration wizard
-- to read reference catalogs and provision accounts atomically via SECURITY DEFINER RPCs.

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
  ) order by o.name), '[]'::jsonb)
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
  ) order by o.region_name, o.district_name), '[]'::jsonb)
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
  ) order by l.region_name, l.district_name), '[]'::jsonb)
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

create or replace function public.service_register_account(
  p_user_id uuid,
  p_org_id uuid default null,
  p_new_school jsonb default null,
  p_primary_position text default null,
  p_extra_positions text[] default array[]::text[],
  p_full_name text default '',
  p_preferred_lang text default 'tg',
  p_login_name text default '',
  p_custom_method_name text default '',
  p_profile_details jsonb default '{}'::jsonb,
  p_position_profiles jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  v_org_id uuid := p_org_id;
  v_school_name text;
  v_region text;
  v_district text;
  v_jamoat text;
  v_village text;
  v_school_code text;
  v_parent_id uuid;
  v_parent_region text;
  v_parent_district text;
  v_target_dist text;
  v_target_reg text;
  v_created_school boolean := false;
  v_school jsonb;
  v_access_role text;
  v_max_devices integer := 1;
  v_trial_expires timestamptz := now() + interval '30 days';
  v_extras text[] := coalesce(p_extra_positions, array[]::text[]);
  v_details jsonb := coalesce(p_profile_details, '{}'::jsonb);
begin
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;
  if p_primary_position is null or length(trim(p_primary_position)) = 0 then
    raise exception 'invalid_primary_position';
  end if;

  select rt.access_role, coalesce(rt.default_max_devices, 1)
  into v_access_role, v_max_devices
  from public.role_tariffs rt
  where rt.position_code = p_primary_position and rt.is_active = true
  limit 1;

  if v_access_role is null then
    raise exception 'position_unavailable';
  end if;

  if v_org_id is not null then
    select jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'region_name', o.region_name,
      'district_name', o.district_name,
      'jamoat_name', o.jamoat_name,
      'village_name', o.village_name,
      'school_code', o.school_code,
      'parent_id', o.parent_id,
      'verification_status', o.verification_status
    )
    into v_school
    from public.organizations o
    where o.id = v_org_id and o.kind = 'school'
    limit 1;

    if v_school is null then
      raise exception 'school_not_found';
    end if;
  else
    if p_new_school is null then
      raise exception 'invalid_school';
    end if;

    v_school_name := left(trim(coalesce(p_new_school->>'name', '')), 160);
    v_region := left(trim(coalesce(p_new_school->>'region_name', '')), 120);
    v_district := left(trim(coalesce(p_new_school->>'district_name', '')), 120);
    v_jamoat := nullif(left(trim(coalesce(p_new_school->>'jamoat_name', '')), 120), '');
    v_village := nullif(left(trim(coalesce(p_new_school->>'village_name', '')), 120), '');
    v_school_code := nullif(left(trim(coalesce(p_new_school->>'school_code', '')), 40), '');

    if length(v_school_name) < 2 then
      raise exception 'school_name_required';
    end if;

    if coalesce(p_new_school->>'parent_id', '') ~ '^[0-9a-fA-F-]{36}$' then
      v_parent_id := (p_new_school->>'parent_id')::uuid;
      select o.region_name, o.district_name
      into v_parent_region, v_parent_district
      from public.organizations o
      where o.id = v_parent_id and o.kind = 'education_authority'
      limit 1;
      if not found then
        raise exception 'invalid_parent_authority';
      end if;
      if v_region = '' and v_parent_region is not null then
        v_region := v_parent_region;
      end if;
      if v_district = '' and v_parent_district is not null then
        v_district := v_parent_district;
      end if;
    elsif v_district <> '' then
      v_target_dist := regexp_replace(regexp_replace(lower(v_district), '^(?:ш\.|н\.|шаҳри|ноҳияи|г\.|р-н)\s+', ''), '\s+', ' ', 'g');
      v_target_reg := case
        when lower(v_region) like '%суғд%' or lower(v_region) like '%сугд%' then 'суғд'
        when lower(v_region) like '%хатлон%' then 'хатлон'
        when lower(v_region) like '%душанбе%' then 'душанбе'
        when lower(v_region) like '%вмкб%' or lower(v_region) like '%бадахшон%' then 'вмкб'
        when lower(v_region) like '%тобе%' or lower(v_region) like '%нтҷ%' or lower(v_region) like '%нтм%' then 'нтҷ'
        else lower(v_region)
      end;

      select o.id, o.region_name
      into v_parent_id, v_parent_region
      from public.organizations o
      where o.kind = 'education_authority'
        and o.authority_tier = 'maorif'
        and (
          regexp_replace(regexp_replace(lower(coalesce(o.district_name, '')), '^(?:ш\.|н\.|шаҳри|ноҳияи|г\.|р-н)\s+', ''), '\s+', ' ', 'g') = v_target_dist
          or (
            length(v_target_dist) >= 3
            and (
              regexp_replace(regexp_replace(lower(coalesce(o.district_name, '')), '^(?:ш\.|н\.|шаҳри|ноҳияи|г\.|р-н)\s+', ''), '\s+', ' ', 'g') like '%' || v_target_dist || '%'
              or v_target_dist like '%' || regexp_replace(regexp_replace(lower(coalesce(o.district_name, '')), '^(?:ш\.|н\.|шаҳри|ноҳияи|г\.|р-н)\s+', ''), '\s+', ' ', 'g') || '%'
            )
          )
        )
        and (
          v_target_reg = ''
          or coalesce(o.region_name, '') = ''
          or (
            case
              when lower(o.region_name) like '%суғд%' or lower(o.region_name) like '%сугд%' then 'суғд'
              when lower(o.region_name) like '%хатлон%' then 'хатлон'
              when lower(o.region_name) like '%душанбе%' then 'душанбе'
              when lower(o.region_name) like '%вмкб%' or lower(o.region_name) like '%бадахшон%' then 'вмкб'
              when lower(o.region_name) like '%тобе%' or lower(o.region_name) like '%нтҷ%' or lower(o.region_name) like '%нтм%' then 'нтҷ'
              else lower(o.region_name)
            end
          ) = v_target_reg
        )
      order by o.name
      limit 1;

      if v_region = '' and v_parent_region is not null then
        v_region := v_parent_region;
      end if;
    end if;

    if v_region = '' or v_district = '' then
      raise exception 'region_and_district_required';
    end if;

    select o.id, jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'region_name', o.region_name,
      'district_name', o.district_name,
      'jamoat_name', o.jamoat_name,
      'village_name', o.village_name,
      'school_code', o.school_code,
      'parent_id', o.parent_id,
      'verification_status', o.verification_status
    )
    into v_org_id, v_school
    from public.organizations o
    where o.kind = 'school'
      and lower(coalesce(o.district_name, '')) = lower(v_district)
      and lower(o.name) = lower(v_school_name)
      and (v_village is null or coalesce(o.village_name, '') = v_village)
    limit 1;

    if v_org_id is null then
      insert into public.organizations (
        kind, name, region_name, district_name, jamoat_name, village_name,
        school_code, parent_id, verification_status
      ) values (
        'school', v_school_name, v_region, v_district, v_jamoat, v_village,
        v_school_code, v_parent_id, 'pending'
      )
      returning id, jsonb_build_object(
        'id', id,
        'name', name,
        'region_name', region_name,
        'district_name', district_name,
        'jamoat_name', jamoat_name,
        'village_name', village_name,
        'school_code', school_code,
        'parent_id', parent_id,
        'verification_status', verification_status
      )
      into v_org_id, v_school;
      v_created_school := true;
    end if;
  end if;

  v_details := v_details || jsonb_build_object('self_registered_school', v_created_school);

  insert into public.user_profiles (
    user_id, full_name, preferred_lang, login_name, profile_details, updated_at
  ) values (
    p_user_id,
    left(trim(coalesce(p_full_name, '')), 120),
    case when p_preferred_lang = 'ru' then 'ru' else 'tg' end,
    left(trim(coalesce(p_login_name, '')), 120),
    v_details,
    now()
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    preferred_lang = excluded.preferred_lang,
    login_name = excluded.login_name,
    profile_details = excluded.profile_details,
    updated_at = now();

  insert into public.school_memberships (
    user_id, organization_id, role, primary_position, extra_positions,
    max_extra_positions, max_devices, account_active, aliya_enabled,
    custom_method_name, position_profiles, verification_status,
    subscription_status, subscription_months, subscription_expires_at
  ) values (
    p_user_id, v_org_id, v_access_role, p_primary_position, v_extras,
    coalesce(array_length(v_extras, 1), 0), greatest(v_max_devices, 1),
    true, false, left(trim(coalesce(p_custom_method_name, '')), 120),
    coalesce(p_position_profiles, '{}'::jsonb), 'unverified',
    'trial', 1, v_trial_expires
  );

  return jsonb_build_object(
    'school', v_school,
    'trial_expires_at', v_trial_expires,
    'created_school', v_created_school
  );
end;
$$;

revoke all on function public.service_register_account(uuid, uuid, jsonb, text, text[], text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.service_register_account(uuid, uuid, jsonb, text, text[], text, text, text, text, jsonb, jsonb) to service_role;

create or replace function public.service_list_user_profiles()
returns table (
  user_id uuid,
  full_name text,
  preferred_lang text,
  login_name text
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select up.user_id, up.full_name, up.preferred_lang, up.login_name
  from public.user_profiles up;
$$;

revoke all on function public.service_list_user_profiles() from public, anon, authenticated;
grant execute on function public.service_list_user_profiles() to service_role;

create or replace function public.service_upsert_user_profile(
  p_user_id uuid,
  p_full_name text default null,
  p_login_name text default null,
  p_preferred_lang text default 'tg'
)
returns void
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  insert into public.user_profiles (user_id, full_name, login_name, preferred_lang, updated_at)
  values (
    p_user_id,
    coalesce(p_full_name, ''),
    coalesce(p_login_name, ''),
    case when p_preferred_lang = 'ru' then 'ru' else 'tg' end,
    now()
  )
  on conflict (user_id) do update set
    full_name = coalesce(nullif(p_full_name, ''), public.user_profiles.full_name),
    login_name = coalesce(nullif(p_login_name, ''), public.user_profiles.login_name),
    preferred_lang = case when p_preferred_lang = 'ru' then 'ru' else 'tg' end,
    updated_at = now();
end;
$$;

revoke all on function public.service_upsert_user_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.service_upsert_user_profile(uuid, text, text, text) to service_role;

create or replace function public.service_lookup_access_role(p_position_code text)
returns text
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  select rt.access_role
  from public.role_tariffs rt
  where rt.position_code = p_position_code
  limit 1;
$$;

revoke all on function public.service_lookup_access_role(text) from public, anon, authenticated;
grant execute on function public.service_lookup_access_role(text) to service_role;
