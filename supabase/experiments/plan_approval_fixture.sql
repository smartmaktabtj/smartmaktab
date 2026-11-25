-- OPTIONAL synthetic fixture for the plan approval sandbox only. Apply after dev_fixture.sql.
-- Create and confirm director-a@example.test (password lives outside SQL).
begin;
do $$
begin
  if not exists (select 1 from auth.users where email='director-a@example.test' and email_confirmed_at is not null)
    or not exists (select 1 from public.organizations where id='aa000000-0000-4000-8000-000000000003' and name='DEV · Мактаб A') then
    raise exception 'Missing the confirmed synthetic director or the base fixture';
  end if;
end;
$$;
insert into public.school_memberships(user_id, organization_id, role)
  select id, 'aa000000-0000-4000-8000-000000000003', 'director'
  from auth.users where email='director-a@example.test' and email_confirmed_at is not null;
commit;
