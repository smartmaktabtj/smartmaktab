-- Stage 0 cleanup: remove test accounts, test schools, and obsolete cabinets/tariffs.
-- Keeps platform_developers, subscription_plans, tajikistan_locations, and official Tajikistan education authorities.

delete from public.account_verification_requests;
delete from public.verification_submissions;
delete from public.quarter_grades;
delete from public.teacher_workloads;
delete from public.accountant_payroll_configs;
delete from public.library_loans;
delete from public.library_books;
delete from public.school_students;
delete from public.school_records;
delete from public.payment_submissions;
delete from public.school_licenses;
delete from public.user_device_sessions;
delete from public.school_memberships;
delete from smartmaktab_private.summary_requests;
delete from smartmaktab_private.summary_scope;
delete from public.school_summary_revisions;
delete from public.content_pack_revisions;

update public.organizations
set parent_id = null
where parent_id in (
  select id from public.organizations where kind = 'school' or name ilike 'DEV%'
);

delete from public.organizations
where kind = 'school' or name ilike 'DEV%';

delete from public.user_profiles
where user_id not in (select user_id from smartmaktab_private.platform_developers);

delete from auth.users
where id not in (select user_id from smartmaktab_private.platform_developers);

delete from public.role_tariffs
where position_code not in (
  'school-director',
  'school-academic-deputy',
  'school-upbringing-deputy',
  'school-primary-deputy',
  'school-military-preparation-deputy',
  'school-sozmon',
  'school-facilities-head',
  'school-library-head',
  'school-canteen-head',
  'school-education-quality',
  'school-psychologist',
  'school-records-clerk',
  'school-accountant',
  'school-class-teacher',
  'school-girls-council-chair',
  'school-upper-class-method-group',
  'school-lower-class-method-group',
  'school-five-method-groups',
  'school-subject-room-head',
  'school-teacher',
  'office-head',
  'office-clerk',
  'raesat-head',
  'raesat-clerk'
);

alter table public.role_tariffs drop constraint if exists role_tariffs_group_code_check;
alter table public.role_tariffs add constraint role_tariffs_group_code_check
  check (group_code in ('school', 'office', 'raesat'));

insert into public.role_tariffs (
  position_code, group_code, access_role, title_tg, title_ru,
  base_price_tjs, extra_price_tjs, duration_days, default_max_devices,
  can_receive_login, is_active, sort_order
) values
  ('school-director', 'school', 'school_admin', 'Директор', 'Директор', 50.00, 50.00, 30, 1, true, true, 1),
  ('school-academic-deputy', 'school', 'deputy', 'Муовини таълимӣ', 'Муовини таълимӣ', 40.00, 40.00, 30, 1, true, true, 2),
  ('school-upbringing-deputy', 'school', 'deputy', 'Муовини тарбиягӣ', 'Муовини тарбиягӣ', 40.00, 40.00, 30, 1, true, true, 3),
  ('school-primary-deputy', 'school', 'deputy', 'Муовини ибтидоӣ', 'Муовини ибтидоӣ', 40.00, 40.00, 30, 1, true, true, 4),
  ('school-military-preparation-deputy', 'school', 'deputy', 'Муовини ҳарбӣ', 'Муовини ҳарбӣ', 40.00, 40.00, 30, 1, true, true, 5),
  ('school-sozmon', 'school', 'staff', 'Созмон', 'Созмон', 40.00, 40.00, 30, 1, true, true, 6),
  ('school-facilities-head', 'school', 'staff', 'Мудири хоҷагӣ', 'Мудири хоҷагӣ', 20.00, 20.00, 30, 1, true, true, 7),
  ('school-library-head', 'school', 'staff', 'Мудири китобхона', 'Мудири китобхона', 40.00, 40.00, 30, 1, true, true, 8),
  ('school-canteen-head', 'school', 'staff', 'Мудири ошхона', 'Мудири ошхона', 20.00, 20.00, 30, 1, true, true, 9),
  ('school-education-quality', 'school', 'staff', 'Сифати таҳсилот', 'Сифати таҳсилот', 60.00, 60.00, 30, 1, true, true, 10),
  ('school-psychologist', 'school', 'staff', 'Равоншинос', 'Равоншинос', 30.00, 30.00, 30, 1, true, true, 11),
  ('school-records-clerk', 'school', 'staff', 'Коргаргузор', 'Коргаргузор', 20.00, 20.00, 30, 1, true, true, 12),
  ('school-accountant', 'school', 'staff', 'Бухгалтер', 'Бухгалтер', 50.00, 50.00, 30, 1, true, true, 13),
  ('school-class-teacher', 'school', 'staff', 'Роҳбари синф', 'Роҳбари синф', 10.00, 10.00, 30, 1, true, true, 14),
  ('school-girls-council-chair', 'school', 'staff', 'Раиси Шӯрои духтарон', 'Раиси Шӯрои духтарон', 30.00, 30.00, 30, 1, true, true, 15),
  ('school-upper-class-method-group', 'school', 'staff', 'Иттиҳодияи методии роҳбарони синфҳои боло', 'Иттиҳодияи методии роҳбарони синфҳои боло', 20.00, 20.00, 30, 1, true, true, 16),
  ('school-lower-class-method-group', 'school', 'staff', 'Иттиҳодияи методии роҳбарони синфҳои поён', 'Иттиҳодияи методии роҳбарони синфҳои поён', 20.00, 20.00, 30, 1, true, true, 17),
  ('school-five-method-groups', 'school', 'staff', 'Иттиҳодияи методӣ', 'Иттиҳодияи методӣ', 20.00, 20.00, 30, 1, true, true, 18),
  ('school-subject-room-head', 'school', 'staff', 'Мудири кабинети фаннӣ', 'Мудири кабинети фаннӣ', 15.00, 15.00, 30, 1, true, true, 19),
  ('school-teacher', 'school', 'teacher', 'Омӯзгор', 'Омӯзгор', 10.00, 10.00, 30, 1, true, true, 20),
  ('office-head', 'office', 'maorif', 'Мудири маориф', 'Мудири маориф', 40.00, 40.00, 30, 1, true, true, 21),
  ('office-clerk', 'office', 'maorif', 'Коргаргузори маориф', 'Коргаргузори маориф', 20.00, 20.00, 30, 1, true, true, 22),
  ('raesat-head', 'raesat', 'authority_viewer', 'Сардори раёсат', 'Сардори раёсат', 50.00, 50.00, 30, 1, true, true, 23),
  ('raesat-clerk', 'raesat', 'authority_viewer', 'Коргаргузори раёсат', 'Коргаргузори раёсат', 20.00, 20.00, 30, 1, true, true, 24)
on conflict (position_code) do update set
  group_code = excluded.group_code,
  access_role = excluded.access_role,
  title_tg = excluded.title_tg,
  title_ru = excluded.title_ru,
  base_price_tjs = excluded.base_price_tjs,
  extra_price_tjs = excluded.extra_price_tjs,
  duration_days = excluded.duration_days,
  default_max_devices = excluded.default_max_devices,
  can_receive_login = excluded.can_receive_login,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

delete from public.audit_events;
