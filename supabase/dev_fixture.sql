-- Optional synthetic fixture. Execute only in the disposable dev project, as trusted owner.
-- First create & confirm FIVE password accounts via Auth > Users. Choose passwords outside this file.
-- This script deliberately fails if an expected test account is missing.
begin;
do $$
begin
  if (select count(distinct email) from auth.users where email in (
    'staff-a@example.test','director-b@example.test','deputy-a@example.test',
    'authority-a@example.test','developer@example.test'
  ) and email_confirmed_at is not null) <> 5 then
    raise exception 'Create and confirm the five synthetic Auth users before provisioning';
  end if;
end;
$$;
insert into public.organizations(id,name,kind,parent_id) values
  ('aa000000-0000-4000-8000-000000000001','DEV · Маориф A','education_authority',null),
  ('aa000000-0000-4000-8000-000000000002','DEV · Маориф B','education_authority',null),
  ('aa000000-0000-4000-8000-000000000003','DEV · Мактаб A','school','aa000000-0000-4000-8000-000000000001'),
  ('aa000000-0000-4000-8000-000000000004','DEV · Мактаб B','school','aa000000-0000-4000-8000-000000000002'),
  ('aa000000-0000-4000-8000-000000000005','DEV · Мактаб A2','school','aa000000-0000-4000-8000-000000000001');
insert into public.school_memberships(user_id, organization_id, role)
  select u.id, x.org::uuid, x.role from (values
    ('staff-a@example.test','aa000000-0000-4000-8000-000000000003','staff'),
    ('director-b@example.test','aa000000-0000-4000-8000-000000000004','director'),
    ('deputy-a@example.test','aa000000-0000-4000-8000-000000000003','deputy'),
    ('authority-a@example.test','aa000000-0000-4000-8000-000000000001','authority_viewer')
  ) x(email,org,role) join auth.users u on x.email = u.email;
insert into smartmaktab_private.platform_developers select id from auth.users where email = 'developer@example.test';
insert into public.school_records(organization_id,record_type,title,deleted_at) values
  ('aa000000-0000-4000-8000-000000000003','plan','Синтетический план A',null),
  ('aa000000-0000-4000-8000-000000000003','plan','Синтетическая запись в корзине A',now()),
  ('aa000000-0000-4000-8000-000000000004','plan','Синтетический план B',null),
  ('aa000000-0000-4000-8000-000000000005','task','Синтетическое поручение A2',null);
commit;
