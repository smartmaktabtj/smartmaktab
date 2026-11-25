-- Migration: 20261125000300_payment_tariffs_tx_unique.sql
-- Adds configurable subscription tariffs (starting with 10 TJS / 30 days via +992 907972295
-- on Amonatbonk & Dushanbe City), transaction-ID uniqueness on payment receipts, and admin RPCs.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[a-z0-9_-]{2,40}$'),
  title_tg text not null check (length(btrim(title_tg)) between 1 and 160),
  title_ru text not null check (length(btrim(title_ru)) between 1 and 160),
  price_tjs numeric(12,2) not null check (price_tjs >= 0),
  duration_days integer not null check (duration_days between 1 and 3650),
  recipient_phone text not null check (length(btrim(recipient_phone)) between 9 and 32),
  recipient_account text not null check (recipient_account ~ '^[0-9]{9,15}$'),
  supported_providers text[] not null default array['amonat','dcity'],
  is_active boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.subscription_plans (
  code, title_tg, title_ru, price_tjs, duration_days, recipient_phone, recipient_account, supported_providers, is_active
) values (
  'trial_10',
  'Обунаи озмоишӣ (30 рӯз · 10 сомонӣ)',
  'Пробный тариф (30 дней · 10 TJS)',
  10.00,
  30,
  '+992 907972295',
  '992907972295',
  array['amonat','dcity'],
  true
)
on conflict (code) do update
  set title_tg = excluded.title_tg,
      title_ru = excluded.title_ru,
      price_tjs = excluded.price_tjs,
      duration_days = excluded.duration_days,
      recipient_phone = excluded.recipient_phone,
      recipient_account = excluded.recipient_account,
      supported_providers = excluded.supported_providers,
      is_active = excluded.is_active;

alter table public.subscription_plans enable row level security;

drop policy if exists subscription_plans_read on public.subscription_plans;
create policy subscription_plans_read on public.subscription_plans
  for select to authenticated
  using (is_active = true or (select smartmaktab_private.is_developer()));

revoke all on public.subscription_plans from public, anon, authenticated, service_role;
grant select on public.subscription_plans to authenticated;

drop trigger if exists audit_subscription_plans on public.subscription_plans;
create trigger audit_subscription_plans
  after insert or update or delete on public.subscription_plans
  for each row execute function smartmaktab_private.audit_write();

alter table public.payment_submissions
  add column if not exists transaction_id text,
  add column if not exists recipient_account text,
  add column if not exists status_confirmed boolean not null default false,
  add column if not exists plan_code text not null default 'trial_10';

create unique index if not exists payment_submissions_provider_tx_uidx
  on public.payment_submissions (provider_code, transaction_id)
  where transaction_id is not null and btrim(transaction_id) <> '';

create unique index if not exists payment_submissions_tx_recipient_uidx
  on public.payment_submissions (transaction_id, recipient_account)
  where transaction_id is not null and btrim(transaction_id) <> ''
    and recipient_account is not null and btrim(recipient_account) <> '';

drop function if exists public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb);

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
  p_plan_code text default 'trial_10'
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
  chosen_plan text := coalesce(nullif(btrim(p_plan_code), ''), 'trial_10');
  ocr_source text := coalesce(p_ocr_payload ->> 'source', '');
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

  if found
     and ocr_source = 'ocr_space'
     and p_status_confirmed = true
     and tx_clean is not null
     and recip_clean = plan_row.recipient_account
     and coalesce(p_amount_declared, 0) >= plan_row.price_tjs then
    auto_verified := true;
  end if;

  insert into public.payment_submissions (
    organization_id, submitted_by, provider_code, receipt_hash, amount_declared, currency,
    ocr_text, ocr_confidence, ocr_payload, transaction_id, recipient_account, status_confirmed, plan_code,
    status, review_note, reviewed_by, reviewed_at
  ) values (
    p_org_id, actor_id, prov_clean, hash_clean, p_amount_declared,
    coalesce(nullif(btrim(p_currency), ''), 'TJS'),
    left(coalesce(p_ocr_text, ''), 8000), p_ocr_confidence,
    coalesce(p_ocr_payload, '{}'::jsonb), tx_clean, recip_clean, coalesce(p_status_confirmed, false),
    coalesce(plan_row.code, chosen_plan),
    case when auto_verified then 'verified' else 'pending' end,
    case when auto_verified then 'Auto-verified via server OCR' else '' end,
    case when auto_verified then actor_id else null end,
    case when auto_verified then now() else null end
  ) returning id into output;

  if auto_verified then
    select expires_at into existing_exp from public.school_licenses where organization_id = p_org_id;
    base_ts := greatest(now(), coalesce(existing_exp, now()));
    insert into public.school_licenses (
      organization_id, status, plan_code, expires_at, grace_days, notes, updated_by, updated_at
    ) values (
      p_org_id, 'active', plan_row.code, base_ts + make_interval(days => plan_row.duration_days), 30,
      'Auto-verified payment ' || tx_clean, actor_id, now()
    )
    on conflict (organization_id) do update
      set status = 'active',
          plan_code = excluded.plan_code,
          expires_at = excluded.expires_at,
          grace_days = 30,
          notes = excluded.notes,
          updated_by = actor_id,
          offline_token_version = public.school_licenses.offline_token_version + 1,
          updated_at = now();
  end if;

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
  if not smartmaktab_private.is_developer() then
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

revoke all on function public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text),
  public.admin_upsert_subscription_plan(text, text, text, numeric, integer, text, text[], boolean)
  from public, anon, authenticated, service_role;

grant execute on function public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text),
  public.admin_upsert_subscription_plan(text, text, text, numeric, integer, text, text[], boolean)
  to authenticated;
