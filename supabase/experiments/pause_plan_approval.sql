-- OPTIONAL: emergency write pause for the synthetic approval sandbox only.
-- Does not delete or rewrite requests, plans, audit events, or table read policies.
begin;
revoke execute on function public.submit_plan_creation(uuid,text,uuid), public.decide_plan_creation(uuid,uuid,boolean)
  from public, anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;
