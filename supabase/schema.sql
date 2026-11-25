-- HISTORICAL PROTOTYPE ONLY — DO NOT APPLY. Use the migration and SUPABASE_DEV.md.
-- SmartMaktab multi-school starter schema for Supabase/Postgres.
-- Apply only to a NEW Supabase project after review. Never expose service_role keys in the client.
create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'school' check (kind in ('school','education_authority')),
  parent_id uuid references public.organizations(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('school_admin','director','deputy','staff','authority_viewer')),
  created_at timestamptz not null default now(),
  unique(user_id, organization_id)
);
create table if not exists public.school_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  record_type text not null check (record_type in ('staff','document','plan','task','meeting','source','student_stub','other')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists school_records_org_type_idx on public.school_records(organization_id, record_type) where deleted_at is null;
create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  record_id uuid references public.school_records(id) on delete set null,
  requested_by uuid not null references auth.users(id),
  approver_role text not null,
  operation text not null check(operation in ('create','update','delete')),
  proposed_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  decided_by uuid references auth.users(id),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_kind text not null default 'user',
  action text not null,
  table_name text,
  record_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.is_platform_developer() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt()->'app_metadata'->>'platform_role') = 'developer', false)
$$;
create or replace function private.can_access_org(target uuid) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select private.is_platform_developer()
  or exists(select 1 from public.school_memberships m where m.user_id=auth.uid() and m.organization_id=target)
  or exists(select 1 from public.school_memberships m join public.organizations child on child.parent_id=m.organization_id where m.user_id=auth.uid() and m.role='authority_viewer' and child.id=target)
$$;
create or replace function private.has_org_role(target uuid, allowed text[]) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select private.is_platform_developer() or exists(select 1 from public.school_memberships m where m.user_id=auth.uid() and m.organization_id=target and m.role=any(allowed))
$$;

alter table public.organizations enable row level security;
alter table public.school_memberships enable row level security;
alter table public.school_records enable row level security;
alter table public.approval_requests enable row level security;
alter table public.audit_events enable row level security;

create policy org_select on public.organizations for select to authenticated using (private.is_platform_developer() or private.can_access_org(id));
create policy org_manage_developer on public.organizations for all to authenticated using (private.is_platform_developer()) with check (private.is_platform_developer());
create policy memberships_select on public.school_memberships for select to authenticated using (private.is_platform_developer() or user_id=auth.uid() or private.can_access_org(organization_id));
create policy memberships_manage_admin on public.school_memberships for all to authenticated using (private.has_org_role(organization_id, array['school_admin','director'])) with check (private.has_org_role(organization_id, array['school_admin','director']));
create policy records_select on public.school_records for select to authenticated using (private.can_access_org(organization_id));
create policy records_insert on public.school_records for insert to authenticated with check (private.can_access_org(organization_id));
create policy records_update on public.school_records for update to authenticated using (private.can_access_org(organization_id)) with check (private.can_access_org(organization_id));
create policy records_delete on public.school_records for delete to authenticated using (private.has_org_role(organization_id, array['school_admin','director']));
create policy approvals_select on public.approval_requests for select to authenticated using (private.can_access_org(organization_id));
create policy approvals_insert on public.approval_requests for insert to authenticated with check (private.can_access_org(organization_id) and requested_by=auth.uid());
create policy approvals_update on public.approval_requests for update to authenticated using (private.has_org_role(organization_id, array['school_admin','director','deputy'])) with check (private.can_access_org(organization_id));
create policy audit_read_developer on public.audit_events for select to authenticated using (private.is_platform_developer() or private.can_access_org(organization_id));
create policy audit_insert_self on public.audit_events for insert to authenticated with check (private.is_platform_developer() or actor_id=auth.uid());

-- Production TODOs: map approval roles to actual approvers; immutable audit via triggers;
-- rate limits; backups; retention; encrypted export; audit any developer reads/changes.
-- This starter is not a complete compliance/security review. Use server-side trusted
-- functions for privileged actions and never grant clients service_role credentials.
