-- Public read-only bootstrap RPC for school registration wizard.
-- Exposes only non-sensitive public reference catalogs (schools, education authorities,
-- active school role tariffs, and Tajikistan territory locations) via PostgREST Data API
-- while keeping direct table access closed to anon.

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
grant execute on function public.get_registration_bootstrap() to anon, authenticated;
