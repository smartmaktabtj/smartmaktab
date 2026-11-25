-- OPTIONAL: isolated synthetic-only approval sandbox with the 0.3 read-only baseline applied.
-- Not a default migration. Do not apply to the primary dev project or to any real data.
begin;

alter table public.school_records add constraint school_records_org_id_key unique (organization_id, id);

create table public.plan_creation_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  organization_kind text generated always as ('school'::text) stored,
  -- Keep actor identifiers as historical references; removing an Auth account does not rewrite history.
  requested_by uuid not null,
  client_request_id uuid not null,
  title text not null check (char_length(title) between 1 and 240 and title = btrim(title) and title !~ '[[:cntrl:]]'),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  record_id uuid unique,
  created_at timestamptz not null default now(),
  unique (requested_by, client_request_id),
  foreign key (organization_id, organization_kind) references public.organizations(id, kind),
  foreign key (organization_id, record_id) references public.school_records(organization_id, id),
  check (case status
    when 'pending' then decided_by is null and decided_at is null and record_id is null
    when 'approved' then decided_by is not null and decided_at is not null and record_id is not null
    when 'rejected' then decided_by is not null and decided_at is not null and record_id is null
  end),
  check (decided_by is null or decided_by <> requested_by)
);
create index plan_requests_org_status_idx on public.plan_creation_requests(organization_id, status, created_at desc);
alter table public.plan_creation_requests enable row level security;
revoke all on public.plan_creation_requests from public, anon, authenticated, service_role;
grant select (id, organization_id, requested_by, title, status, decided_by, decided_at, record_id, created_at)
  on public.plan_creation_requests to authenticated;

-- school_memberships already has RLS allowing the caller's own rows. Check direct active
-- membership, not zone access or platform privileges, for this specific queue.
create policy plan_requests_read on public.plan_creation_requests for select to authenticated using (
  exists (select 1 from public.school_memberships m where m.organization_id = plan_creation_requests.organization_id
    and m.user_id = (select auth.uid())
    and (m.role = 'director' or (m.role in ('staff','deputy') and plan_creation_requests.requested_by = m.user_id)))
);

create trigger audit_plan_creation_requests after insert or update or delete on public.plan_creation_requests
  for each row execute function smartmaktab_private.audit_write();

create function public.submit_plan_creation(p_school_id uuid, p_title text, p_client_request_id uuid) returns uuid
language plpgsql volatile security definer set search_path = '' set row_security = off as $$
declare
  v_actor uuid := auth.uid();
  v_title text := btrim(p_title);
  v_req public.plan_creation_requests;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'not permitted'; end if;
  -- Lock the membership until commit so a trusted role change cannot race this authorization check.
  perform 1 from public.school_memberships m where m.user_id = v_actor and m.organization_id = p_school_id
    and m.role in ('staff','deputy') for share;
  if not found then raise exception using errcode = '42501', message = 'not permitted'; end if;
  if p_client_request_id is null or v_title is null or char_length(v_title) not between 1 and 240
    or v_title ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023', message = 'invalid title or request key';
  end if;
  insert into public.plan_creation_requests(organization_id, requested_by, client_request_id, title)
    values (p_school_id, v_actor, p_client_request_id, v_title)
    on conflict (requested_by, client_request_id) do nothing returning * into v_req;
  if not found then
    select * into strict v_req from public.plan_creation_requests r
      where r.requested_by = v_actor and r.client_request_id = p_client_request_id;
    if v_req.organization_id <> p_school_id or v_req.title <> v_title then
      raise exception using errcode = '23505', message = 'request key already used with different input';
    end if;
  end if;
  return v_req.id;
end;
$$;

create function public.decide_plan_creation(p_school_id uuid, p_request_id uuid, p_approve boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' set row_security = off as $$
declare
  v_actor uuid := auth.uid();
  v_req public.plan_creation_requests;
  v_record uuid;
  v_result text;
begin
  if v_actor is null then raise exception using errcode = '42501', message = 'not permitted'; end if;
  perform 1 from public.school_memberships m where m.user_id = v_actor and m.organization_id = p_school_id
    and m.role = 'director' for share;
  if not found then raise exception using errcode = '42501', message = 'not permitted'; end if;
  if p_approve is null then raise exception using errcode = '22023', message = 'invalid decision'; end if;
  select * into v_req from public.plan_creation_requests r
    where r.id = p_request_id and r.organization_id = p_school_id for update;
  if not found or v_req.requested_by = v_actor then
    raise exception using errcode = '42501', message = 'not permitted';
  end if;
  v_result := case when p_approve then 'approved' else 'rejected' end;
  if v_req.status <> 'pending' then
    if v_req.status <> v_result or v_req.decided_by <> v_actor then
      raise exception using errcode = '23505', message = 'request already decided';
    end if;
    -- A same-actor retry of the same decision returns the original outcome and does not write.
    return jsonb_build_object('request_id', v_req.id, 'status', v_req.status, 'record_id', v_req.record_id);
  end if;
  if p_approve then
    perform 1 from public.school_memberships m where m.user_id = v_req.requested_by and m.organization_id = p_school_id
      and m.role in ('staff','deputy') for share;
    if not found then raise exception using errcode = '42501', message = 'requester no longer eligible'; end if;
    insert into public.school_records(organization_id, record_type, title)
      values (v_req.organization_id, 'plan', v_req.title) returning id into v_record;
  end if;
  update public.plan_creation_requests set status = v_result, decided_at = now(), decided_by = v_actor, record_id = v_record
    where id = v_req.id;
  return jsonb_build_object('request_id', v_req.id, 'status', v_result, 'record_id', v_record);
end;
$$;

revoke all on function public.submit_plan_creation(uuid,text,uuid), public.decide_plan_creation(uuid,uuid,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_plan_creation(uuid,text,uuid), public.decide_plan_creation(uuid,uuid,boolean)
  to authenticated;
notify pgrst, 'reload schema';
commit;
