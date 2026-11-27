-- ---------------------------------------------------------------------------
-- 4. Update service_register_account, submit_payment_receipt, admin_review_payment
--    so max_devices = (1 + extras_count) * 2 (1 mobile + 1 desktop per role)
-- ---------------------------------------------------------------------------
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
  v_default_dev integer := 2;
  v_max_devices integer := 2;
  v_trial_expires timestamptz := now() + interval '30 days';
  v_extras text[] := array[]::text[];
  v_details jsonb := coalesce(p_profile_details, '{}'::jsonb);
begin
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;
  if p_primary_position is null or length(trim(p_primary_position)) = 0 then
    raise exception 'invalid_primary_position';
  end if;

  select rt.access_role, coalesce(rt.default_max_devices, 2)
  into v_access_role, v_default_dev
  from public.role_tariffs rt
  where rt.position_code = p_primary_position and rt.is_active = true
  limit 1;

  if v_access_role is null then
    raise exception 'position_unavailable';
  end if;

  select coalesce(array_agg(distinct val order by val), array[]::text[])
  into v_extras
  from unnest(coalesce(p_extra_positions, array[]::text[])) as val
  where val is not null and btrim(val) <> '' and val <> p_primary_position
    and exists (select 1 from public.role_tariffs rt where rt.position_code = val and rt.is_active = true);

  v_max_devices := least(40, greatest(coalesce(v_default_dev, 2), (1 + coalesce(array_length(v_extras, 1), 0)) * 2));

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
    coalesce(array_length(v_extras, 1), 0), greatest(v_max_devices, 2),
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

-- Update submit_payment_receipt & admin_review_payment so device limit grows as (1 + extras) * 2
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
  required_devices integer := 2;
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
      required_devices := least(40, greatest(coalesce(pos_row.default_max_devices, 2), (1 + coalesce(array_length(extras_clean, 1), 0)) * 2));
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
        max_devices = least(40, greatest(
          max_devices,
          required_devices,
          (1 + (
            select coalesce(count(distinct val)::integer, 0)
            from unnest(coalesce(extra_positions, '{}'::text[]) || extras_clean) as val
            where val <> coalesce(primary_position, pos_clean)
          )) * 2
        )),
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
      greatest(coalesce(cur_lic.default_max_devices, 2), 2)
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
        max_devices = least(40, greatest(
          max_devices,
          (1 + (
            select coalesce(count(distinct val)::integer, 0)
            from unnest(coalesce(extra_positions, '{}'::text[]) || req_extras) as val
            where val <> coalesce(primary_position, req_pos)
          )) * 2
        )),
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

