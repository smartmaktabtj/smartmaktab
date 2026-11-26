-- Updated 20 school role tariffs (full price per extra position), +30 TJS Aliya add-on,
-- clean single role titles, Maorif/Raesat sub-role login restriction, and per-position user profiles.

-- 1. Update role_tariffs with clean single titles, full prices, and login restrictions for 33 sub-advisers
update public.role_tariffs as rt
set
  base_price_tjs = v.base_price,
  extra_price_tjs = v.base_price,
  title_tg = v.title_tg,
  title_ru = v.title_ru,
  can_receive_login = v.can_login,
  updated_at = now()
from (values
  ('school-director', 50.00, 'Директор', 'Директор', true),
  ('school-academic-deputy', 40.00, 'Муовини таълимӣ', 'Зам. по учебной работе', true),
  ('school-upbringing-deputy', 40.00, 'Муовини тарбиягӣ', 'Зам. по воспитательной работе', true),
  ('school-primary-deputy', 40.00, 'Муовини ибтидоӣ', 'Зам. по начальным классам', true),
  ('school-military-preparation-deputy', 40.00, 'Муовини ҳарбӣ', 'Зам. по военной подготовке', true),
  ('school-sozmon', 40.00, 'Созмон', 'Созмон', true),
  ('school-facilities-head', 20.00, 'Мудири хоҷагӣ', 'Заведующий хозяйством', true),
  ('school-library-head', 40.00, 'Мудири китобхона', 'Заведующий библиотекой', true),
  ('school-canteen-head', 20.00, 'Мудири ошхона', 'Заведующий столовой', true),
  ('school-education-quality', 60.00, 'Сифати таҳсилот', 'Качество образования', true),
  ('school-psychologist', 30.00, 'Равоншинос', 'Психолог', true),
  ('school-records-clerk', 20.00, 'Коргаргузор', 'Делопроизводитель', true),
  ('school-accountant', 50.00, 'Бухгалтер', 'Бухгалтер', true),
  ('school-class-teacher', 10.00, 'Роҳбари синф', 'Классный руководитель', true),
  ('school-girls-council-chair', 30.00, 'Раиси Шӯрои духтарон', 'Председатель Совета девушек', true),
  ('school-upper-class-method-group', 20.00, 'Иттиҳодияи методии роҳбарони синфҳои боло', 'МО классных руководителей старших классов', true),
  ('school-lower-class-method-group', 20.00, 'Иттиҳодияи методии роҳбарони синфҳои поён', 'МО классных руководителей младших классов', true),
  ('school-five-method-groups', 20.00, 'Иттиҳодияи методӣ', 'Методическое объединение', true),
  ('school-subject-room-head', 15.00, 'Мудири кабинети фаннӣ', 'Заведующий предметным кабинетом', true),
  ('school-teacher', 10.00, 'Омӯзгор', 'Учитель', true),
  ('office-head', 40.00, 'Мудири маориф', 'Заведующий маорифом', true),
  ('raesat-head', 50.00, 'Сардори раёсат', 'Начальник управления', true),
  ('office-accounting', 30.00, 'Муҳосиботи маориф', 'Бухгалтерия маорифа', false)
) as v(code, base_price, title_tg, title_ru, can_login)
where rt.position_code = v.code;

update public.role_tariffs
set can_receive_login = false, updated_at = now()
where group_code in ('advisers', 'subjects');

-- 2. Extend user_profiles and school_memberships for per-user login display, rich анкета, Aliya add-on, and per-extra-position profiles
alter table public.user_profiles
  add column if not exists login_name text not null default '',
  add column if not exists profile_details jsonb not null default '{}'::jsonb;

grant select (login_name, profile_details) on public.user_profiles to authenticated;

alter table public.school_memberships
  add column if not exists aliya_enabled boolean not null default false,
  add column if not exists aliya_expires_at timestamptz,
  add column if not exists custom_method_name text not null default '',
  add column if not exists position_profiles jsonb not null default '{}'::jsonb;

grant select (aliya_enabled, aliya_expires_at, custom_method_name, position_profiles)
  on public.school_memberships to authenticated;

alter table public.payment_submissions
  add column if not exists include_aliya boolean not null default false;

-- 3. Update admin_assign_membership preserving 8-arg compatibility + optional Aliya/custom_method_name
drop function if exists public.admin_assign_membership(uuid, uuid, text, text, text[], integer, integer, boolean);
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
    max_extra_positions, max_devices, account_active, aliya_enabled, custom_method_name
  ) values (
    p_user_id, p_org_id, resolved_role, pos_clean, extras_clean,
    max_ext, max_dev, coalesce(p_account_active, true),
    coalesce(p_aliya_enabled, false),
    left(btrim(coalesce(p_custom_method_name, '')), 120)
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
        end
  returning id into output;
  return output;
end;
$$;

-- 4. Update get_my_workspace_context to return login_name, profile_details, aliya_enabled, custom_method_name, position_profiles
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

-- 5. Allow signed-in member to save their own profile_details and per-additional-position profiles
create or replace function public.upsert_my_position_profiles(
  p_org_id uuid,
  p_full_name text default null,
  p_profile_details jsonb default '{}'::jsonb,
  p_position_profiles jsonb default '{}'::jsonb,
  p_custom_method_name text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  cleaned_name text := left(btrim(coalesce(p_full_name, '')), 120);
  cleaned_method text := left(btrim(coalesce(p_custom_method_name, '')), 120);
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  update public.user_profiles
  set full_name = case when cleaned_name <> '' then cleaned_name else full_name end,
      profile_details = coalesce(p_profile_details, '{}'::jsonb)
  where user_id = actor_id;

  if p_org_id is not null then
    update public.school_memberships
    set position_profiles = coalesce(p_position_profiles, '{}'::jsonb),
        custom_method_name = case when cleaned_method <> '' then cleaned_method else custom_method_name end
    where user_id = actor_id and organization_id = p_org_id;
  end if;

  return jsonb_build_object('saved', true);
end;
$$;

-- 6. Position + Aliya (+30 TJS) aware payment receipt submission and review
drop function if exists public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[]);
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
  p_include_aliya boolean default false
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
  aliya_flag boolean := coalesce(p_include_aliya, false);
  aliya_fee numeric := case when aliya_flag then 30.00 else 0.00 end;
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

      required_amount := pos_row.base_price_tjs + extra_sum + aliya_fee;
      required_days := pos_row.duration_days;
      required_devices := pos_row.default_max_devices;
      chosen_plan := 'pos:' || pos_clean || case when aliya_flag then '+aliya' else '' end;
    else
      pos_clean := null;
    end if;
  end if;

  if pos_clean is null and plan_row.code is not null then
    required_amount := plan_row.price_tjs + aliya_fee;
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
    'include_aliya', aliya_flag,
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

    if pos_clean is not null or aliya_flag then
      update public.school_memberships
      set primary_position = coalesce(primary_position, pos_clean),
          extra_positions = case
            when pos_clean is null and coalesce(primary_position, '') = '' then extra_positions
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
          end
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
  req_aliya boolean;
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
    req_aliya := coalesce(sub_row.include_aliya, (sub_row.ocr_payload ->> 'include_aliya')::boolean, false);
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

    if (req_pos is not null and exists (select 1 from public.role_tariffs rt where rt.position_code = req_pos)) or req_aliya then
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
            when req_aliya then greatest(coalesce(aliya_expires_at, now()), now()) + make_interval(days => p_extend_days)
            else aliya_expires_at
          end
      where user_id = sub_row.submitted_by and organization_id = sub_row.organization_id;
    end if;
  end if;
  return sub_row.id;
end;
$$;

revoke all on function
  public.admin_assign_membership(uuid, uuid, text, text, text[], integer, integer, boolean, boolean, text),
  public.upsert_my_position_profiles(uuid, text, jsonb, jsonb, text),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[], boolean)
  from public, anon, authenticated, service_role;

grant execute on function
  public.admin_assign_membership(uuid, uuid, text, text, text[], integer, integer, boolean, boolean, text),
  public.upsert_my_position_profiles(uuid, text, jsonb, jsonb, text),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[], boolean)
  to authenticated;
