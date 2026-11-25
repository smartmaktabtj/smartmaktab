-- Stage 4: School -> Maorif -> Raesat summary workflow (promoted from isolated experiment).
create table if not exists smartmaktab_private.summary_scope (
  school_id uuid not null,
  authority_id uuid not null,
  level text not null check (level in ('maorif','raesat')),
  school_kind text generated always as ('school'::text) stored,
  authority_kind text generated always as ('education_authority'::text) stored,
  primary key (school_id, level),
  unique (authority_id, school_id, level),
  foreign key (school_id, school_kind) references public.organizations (id, kind),
  foreign key (authority_id, authority_kind) references public.organizations (id, kind),
  check (school_id <> authority_id)
);
create index if not exists summary_scope_authority_idx on smartmaktab_private.summary_scope (authority_id, level);
alter table smartmaktab_private.summary_scope enable row level security;
revoke all on smartmaktab_private.summary_scope from public, anon, authenticated, service_role;

create table if not exists public.school_summary_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  school_kind text generated always as ('school'::text) stored,
  foreign key (organization_id, school_kind) references public.organizations (id, kind),
  year_start integer not null check (year_start between 2000 and 2099),
  period text not null check (period in ('q1','q2','h1','q3','q4','h2','year')),
  version integer not null check (version between 1 and 100),
  unique (organization_id, year_start, period, version),
  status text not null default 'draft' check (status in ('draft','submitted','changes','approved')),
  enrolled integer not null check (enrolled between 1 and 99999),
  assessed integer not null check (assessed between 0 and enrolled),
  passed integer not null check (passed between 0 and assessed),
  quality integer not null check (quality between 0 and passed),
  reason text check (reason in ('verify_totals','missing_period','confirm_scope','other_requires_contact')),
  check ((status = 'changes') = (reason is not null)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists smartmaktab_private.summary_requests (
  actor uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  args jsonb not null,
  revision_id uuid not null references public.school_summary_revisions (id),
  primary key (actor, request_id)
);
alter table smartmaktab_private.summary_requests enable row level security;
revoke all on smartmaktab_private.summary_requests from public, anon, authenticated, service_role;

create or replace function smartmaktab_private.summary_allowed(target uuid, access text) returns boolean
language sql stable security definer set search_path = '' set row_security = off as $$
  select case access
    when 'director' then exists (
      select 1 from public.school_memberships m
      where m.user_id = (select auth.uid()) and m.organization_id = target and m.role = 'director'
    )
    when 'maorif' then exists (
      select 1 from public.school_memberships m
      join smartmaktab_private.summary_scope s on s.authority_id = m.organization_id
      where m.user_id = (select auth.uid()) and m.role = 'authority_viewer' and s.school_id = target and s.level = 'maorif'
    )
    else false
  end;
$$;
revoke all on function smartmaktab_private.summary_allowed(uuid, text) from public, anon, authenticated, service_role;
grant execute on function smartmaktab_private.summary_allowed(uuid, text) to authenticated;

alter table public.school_summary_revisions enable row level security;
drop policy if exists read_summary on public.school_summary_revisions;
create policy read_summary on public.school_summary_revisions for select to authenticated
  using (
    smartmaktab_private.summary_allowed(organization_id, 'director')
    or (status <> 'draft' and smartmaktab_private.summary_allowed(organization_id, 'maorif'))
  );
revoke all on public.school_summary_revisions from public, anon, authenticated, service_role;
grant select on public.school_summary_revisions to authenticated;

drop trigger if exists audit_summary on public.school_summary_revisions;
create trigger audit_summary after insert or update or delete on public.school_summary_revisions
  for each row execute function smartmaktab_private.audit_write();

create or replace function public.update_school_summary(
  p_request uuid,
  p_school uuid,
  p_year integer,
  p_period text,
  p_action text,
  p_revision uuid default null,
  p_enrolled integer default null,
  p_assessed integer default null,
  p_passed integer default null,
  p_quality integer default null,
  p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  required_access text;
  request_args jsonb;
  previous smartmaktab_private.summary_requests%rowtype;
  current_revision public.school_summary_revisions%rowtype;
  output uuid;
begin
  if actor_id is null or p_request is null or p_school is null or p_action is null or p_action not in ('draft','submit','approve','return') then
    raise exception 'invalid summary request' using errcode = '22023';
  end if;
  required_access := case when p_action in ('draft','submit') then 'director' else 'maorif' end;
  if not smartmaktab_private.summary_allowed(p_school, required_access) then
    raise exception 'summary access denied' using errcode = '42501';
  end if;
  if p_year is null or p_year not between 2000 and 2099 or p_period is null or p_period not in ('q1','q2','h1','q3','q4','h2','year') then
    raise exception 'invalid period' using errcode = '22023';
  end if;
  request_args := jsonb_build_array(p_school, p_year, p_period, p_action, p_revision, p_enrolled, p_assessed, p_passed, p_quality, p_reason);
  perform pg_advisory_xact_lock(hashtextextended('sm-summary-request:' || actor_id::text || ':' || p_request::text, 0));
  select * into previous from smartmaktab_private.summary_requests x where x.actor = actor_id and x.request_id = p_request;
  if found then
    if previous.args <> request_args then
      raise exception 'request ID already used with different arguments' using errcode = '22023';
    end if;
    return previous.revision_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('sm-summary-series:' || p_school::text || ':' || p_year::text || ':' || p_period, 0));
  if not smartmaktab_private.summary_allowed(p_school, required_access) then
    raise exception 'summary access denied' using errcode = '42501';
  end if;
  select * into current_revision
  from public.school_summary_revisions x
  where x.organization_id = p_school and x.year_start = p_year and x.period = p_period
  order by x.version desc limit 1 for update;
  if p_action = 'draft' then
    if p_reason is not null or p_enrolled is null or p_assessed is null or p_passed is null or p_quality is null then
      raise exception 'aggregate counts required' using errcode = '22023';
    end if;
    if p_revision is distinct from current_revision.id or current_revision.status in ('submitted','approved') then
      raise exception 'report changed or closed' using errcode = '55000';
    end if;
    if current_revision.status = 'draft' then
      update public.school_summary_revisions
      set enrolled = p_enrolled, assessed = p_assessed, passed = p_passed, quality = p_quality, updated_at = now()
      where id = current_revision.id returning id into output;
    else
      insert into public.school_summary_revisions(organization_id, year_start, period, version, enrolled, assessed, passed, quality)
      values (p_school, p_year, p_period, coalesce(current_revision.version, 0) + 1, p_enrolled, p_assessed, p_passed, p_quality)
      returning id into output;
    end if;
  else
    if p_revision is null or p_revision is distinct from current_revision.id or p_enrolled is not null or p_assessed is not null or p_passed is not null or p_quality is not null then
      raise exception 'invalid or stale revision' using errcode = '55000';
    end if;
    if (p_action = 'submit' and current_revision.status <> 'draft') or (p_action in ('approve','return') and current_revision.status <> 'submitted') then
      raise exception 'invalid transition' using errcode = '55000';
    end if;
    if (p_action = 'return' and (p_reason is null or p_reason not in ('verify_totals','missing_period','confirm_scope','other_requires_contact'))) or (p_action <> 'return' and p_reason is not null) then
      raise exception 'invalid review reason' using errcode = '22023';
    end if;
    update public.school_summary_revisions
    set status = case p_action when 'submit' then 'submitted' when 'approve' then 'approved' else 'changes' end,
        reason = p_reason, updated_at = now()
    where id = p_revision returning id into output;
  end if;
  insert into smartmaktab_private.summary_requests(actor, request_id, args, revision_id) values (actor_id, p_request, request_args, output);
  return output;
end;
$$;
revoke all on function public.update_school_summary(uuid, uuid, integer, text, text, uuid, integer, integer, integer, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.update_school_summary(uuid, uuid, integer, text, text, uuid, integer, integer, integer, integer, text) to authenticated;

create or replace function public.territory_summary(p_authority uuid, p_year integer, p_period text)
returns table(schools bigint, enrolled bigint, assessed bigint, passed bigint, quality bigint)
language plpgsql stable security definer set search_path = '' set row_security = off as $$
begin
  if auth.uid() is null
     or not exists (
       select 1 from public.school_memberships m
       where m.organization_id = p_authority and m.role = 'authority_viewer' and m.user_id = (select auth.uid())
     )
     or not exists (
       select 1 from smartmaktab_private.summary_scope s
       where s.authority_id = p_authority and s.level = 'raesat'
     ) then
    raise exception 'territory access denied' using errcode = '42501';
  end if;
  return query
  select count(*), sum(t.enrolled), sum(t.assessed), sum(t.passed), sum(t.quality)
  from public.school_summary_revisions t
  join smartmaktab_private.summary_scope s on s.school_id = t.organization_id and s.level = 'raesat'
  where s.authority_id = p_authority and t.year_start = p_year and t.period = p_period and t.status = 'approved';
end;
$$;
revoke all on function public.territory_summary(uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.territory_summary(uuid, integer, text) to authenticated;
