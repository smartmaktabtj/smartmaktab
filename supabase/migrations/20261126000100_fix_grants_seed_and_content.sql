-- Migration: 20261126000100_fix_grants_seed_and_content.sql
-- 1) Restores missing column-level SELECT grants on organizations (parent_id, parent_kind, created_at)
--    and school_memberships (created_at) so authenticated super_admins and members no longer hit 42501.
-- 2) Adds public.content_pack_revisions + RPCs for multi-admin synchronization, version history, and rollback.

grant select (parent_id, parent_kind, created_at) on public.organizations to authenticated;
grant select (created_at) on public.school_memberships to authenticated;

create table if not exists public.content_pack_revisions (
  id uuid primary key default gen_random_uuid(),
  sequence integer not null unique check (sequence >= 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  comment text not null default '',
  published_tag text,
  published_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text not null default '',
  created_at timestamptz not null default now()
);

alter table public.content_pack_revisions enable row level security;

drop policy if exists content_pack_revisions_read on public.content_pack_revisions;
create policy content_pack_revisions_read on public.content_pack_revisions
  for select to authenticated
  using ((select smartmaktab_private.is_developer()));

revoke all on public.content_pack_revisions from public, anon, authenticated, service_role;
grant select on public.content_pack_revisions to authenticated;

drop trigger if exists audit_content_pack_revisions on public.content_pack_revisions;
create trigger audit_content_pack_revisions
  after insert or update or delete on public.content_pack_revisions
  for each row execute function smartmaktab_private.audit_write();

create or replace function public.admin_list_content_revisions()
returns table (
  id uuid,
  sequence integer,
  payload jsonb,
  comment text,
  published_tag text,
  published_url text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  return query
  select r.id, r.sequence, r.payload, r.comment, r.published_tag, r.published_url, r.created_by, r.created_by_email, r.created_at
  from public.content_pack_revisions r
  order by r.sequence desc
  limit 100;
end;
$$;

create or replace function public.admin_save_content_revision(
  p_payload jsonb,
  p_comment text default '',
  p_expected_seq integer default null,
  p_published_tag text default null,
  p_published_url text default null
)
returns public.content_pack_revisions
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text := '';
  current_seq integer := 0;
  next_seq integer;
  normalized jsonb;
  out_row public.content_pack_revisions%rowtype;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid content payload' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('smartmaktab.content_pack_revisions'));
  select coalesce(max(sequence), 0) into current_seq from public.content_pack_revisions;
  if p_expected_seq is not null and p_expected_seq <> current_seq then
    raise exception 'version conflict: latest sequence is %, expected %', current_seq, p_expected_seq using errcode = '40001';
  end if;
  next_seq := current_seq + 1;

  select coalesce(email, '') into actor_email from auth.users where id = actor_id;
  normalized := jsonb_set(p_payload, '{sequence}', to_jsonb(next_seq), true);

  insert into public.content_pack_revisions (
    sequence, payload, comment, published_tag, published_url, created_by, created_by_email
  ) values (
    next_seq,
    normalized,
    left(btrim(coalesce(p_comment, '')), 400),
    nullif(btrim(coalesce(p_published_tag, '')), ''),
    nullif(btrim(coalesce(p_published_url, '')), ''),
    actor_id,
    coalesce(actor_email, '')
  )
  returning * into out_row;
  return out_row;
end;
$$;

create or replace function public.admin_rollback_content_revision(
  p_revision_id uuid,
  p_comment text default ''
)
returns public.content_pack_revisions
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  target_row public.content_pack_revisions%rowtype;
  note text;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  select * into target_row from public.content_pack_revisions where id = p_revision_id;
  if not found then
    raise exception 'revision not found' using errcode = '55000';
  end if;
  note := coalesce(nullif(btrim(p_comment), ''), 'Rollback to sequence #' || target_row.sequence);
  return public.admin_save_content_revision(target_row.payload, note, null, null, null);
end;
$$;

create or replace function public.admin_mark_content_published(
  p_revision_id uuid,
  p_published_tag text,
  p_published_url text default null
)
returns public.content_pack_revisions
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  out_row public.content_pack_revisions%rowtype;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  update public.content_pack_revisions
  set published_tag = nullif(btrim(coalesce(p_published_tag, '')), ''),
      published_url = nullif(btrim(coalesce(p_published_url, '')), '')
  where id = p_revision_id
  returning * into out_row;
  if not found then
    raise exception 'revision not found' using errcode = '55000';
  end if;
  return out_row;
end;
$$;

revoke all on function
  public.admin_list_content_revisions(),
  public.admin_save_content_revision(jsonb, text, integer, text, text),
  public.admin_rollback_content_revision(uuid, text),
  public.admin_mark_content_published(uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.admin_list_content_revisions(),
  public.admin_save_content_revision(jsonb, text, integer, text, text),
  public.admin_rollback_content_revision(uuid, text),
  public.admin_mark_content_published(uuid, text, text)
  to authenticated;
