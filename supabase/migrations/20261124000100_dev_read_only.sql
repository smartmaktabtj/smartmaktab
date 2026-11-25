-- First migration for an EMPTY, synthetic-only Supabase dev project.
-- Do not run the historical schema.sql before or after it.
begin;
create schema smartmaktab_private;
revoke all on schema smartmaktab_private from public, anon, authenticated, service_role;
grant usage on schema smartmaktab_private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  kind text not null check (kind in ('school', 'education_authority')),
  parent_id uuid,
  parent_kind text generated always as ('education_authority'::text) stored,
  created_at timestamptz not null default now(),
  unique (id, kind),
  check (kind = 'school' or parent_id is null),
  foreign key (parent_id, parent_kind) references public.organizations (id, kind)
);
create index organizations_parent_idx on public.organizations (parent_id);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  organization_id uuid not null,
  role text not null check (role in ('school_admin','director','deputy','staff','authority_viewer')),
  organization_kind text generated always as (case when role = 'authority_viewer' then 'education_authority' else 'school' end) stored,
  created_at timestamptz not null default now(),
  unique (user_id, organization_id),
  foreign key (organization_id, organization_kind) references public.organizations (id, kind)
);
create index school_memberships_org_idx on public.school_memberships (organization_id);

-- Platform privileges come from this private table, never from client metadata or JWT role claims.
create table smartmaktab_private.platform_developers (
  user_id uuid primary key references auth.users (id) on delete cascade
);
revoke all on smartmaktab_private.platform_developers from public, anon, authenticated, service_role;
alter table smartmaktab_private.platform_developers enable row level security;

create table public.school_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_kind text generated always as ('school'::text) stored,
  record_type text not null check (record_type in ('staff','document','plan','task','meeting','source','other')),
  title text not null check (length(btrim(title)) between 1 and 240),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, organization_kind) references public.organizations (id, kind)
);
create index school_records_org_idx on public.school_records (organization_id, id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid, -- historical reference; retained even if the organization is removed
  actor_id uuid,
  db_role text not null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name text not null,
  record_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;
alter table public.school_memberships enable row level security;
alter table public.school_records enable row level security;
alter table public.audit_events enable row level security;

-- Pin the path and require the trusted owner to be able to check authorization without recursion.
create function smartmaktab_private.is_developer() returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (select 1 from smartmaktab_private.platform_developers d where d.user_id = (select auth.uid()));
$$;
create function smartmaktab_private.can_read_org(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select exists (
    select 1 from public.school_memberships m
    where m.user_id = (select auth.uid())
      and (m.organization_id = target or (m.role = 'authority_viewer' and exists (
        select 1 from public.organizations child
        where child.id = target and child.kind = 'school' and child.parent_id = m.organization_id
      )))
  );
$$;
revoke all on function smartmaktab_private.is_developer(), smartmaktab_private.can_read_org(uuid) from public, anon, authenticated, service_role;
grant execute on function smartmaktab_private.is_developer(), smartmaktab_private.can_read_org(uuid) to authenticated;

create policy organizations_read on public.organizations for select to authenticated
  using ((select smartmaktab_private.is_developer()) or smartmaktab_private.can_read_org(id));
create policy memberships_read on public.school_memberships for select to authenticated
  using ((select smartmaktab_private.is_developer()) or user_id = (select auth.uid()));
create policy records_read on public.school_records for select to authenticated
  using ((select smartmaktab_private.is_developer()) or (deleted_at is null and smartmaktab_private.can_read_org(organization_id)));
create policy audit_read on public.audit_events for select to authenticated using ((select smartmaktab_private.is_developer()));

-- Reset broad default grants on Supabase. Even the platform developer is read-only via the API.
revoke all on public.organizations, public.school_memberships, public.school_records, public.audit_events
  from public, anon, authenticated, service_role;
revoke all on sequence public.audit_events_id_seq from public, anon, authenticated, service_role;
grant select (id, name, kind) on public.organizations to authenticated;
grant select (id, user_id, organization_id, role) on public.school_memberships to authenticated;
grant select (id, organization_id, record_type, title, deleted_at) on public.school_records to authenticated;
grant select on public.audit_events to authenticated;

-- Trusted writes only. Keep snapshots, payloads and passwords out of the audit log.
create function smartmaktab_private.audit_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_data jsonb;
begin
  if tg_op = 'DELETE' then row_data := to_jsonb(old); else row_data := to_jsonb(new); end if;
  insert into public.audit_events (organization_id, actor_id, db_role, action, table_name, record_id)
  values (case tg_table_name when 'organizations' then (row_data->>'id')::uuid
            else (row_data->>'organization_id')::uuid end,
          auth.uid(), coalesce(nullif(current_setting('role', true), 'none'), session_user),
          tg_op, tg_table_schema || '.' || tg_table_name,
          coalesce((row_data->>'id')::uuid, (row_data->>'user_id')::uuid));
  return null;
end;
$$;
revoke all on function smartmaktab_private.audit_write() from public, anon, authenticated, service_role;
create trigger audit_organizations after insert or update or delete on public.organizations
  for each row execute function smartmaktab_private.audit_write();
create trigger audit_memberships after insert or update or delete on public.school_memberships
  for each row execute function smartmaktab_private.audit_write();
create trigger audit_records after insert or update or delete on public.school_records
  for each row execute function smartmaktab_private.audit_write();
create trigger audit_developers after insert or update or delete on smartmaktab_private.platform_developers
  for each row execute function smartmaktab_private.audit_write();
commit;
