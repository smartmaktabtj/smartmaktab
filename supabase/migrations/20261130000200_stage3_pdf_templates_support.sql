-- Stage 3 enhancement: PDF & scanned PDF read-only template support (admin upload -> private bucket -> read & print only)

alter table public.document_templates
  add column if not exists doc_format text not null default 'word' check (doc_format in ('word', 'pdf')),
  add column if not exists pdf_storage_path text not null default '' check (length(pdf_storage_path) <= 400),
  add column if not exists pdf_size_bytes integer not null default 0 check (pdf_size_bytes >= 0);

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    update storage.buckets
    set file_size_limit = 15728640,
        allowed_mime_types = array['application/gzip','application/json','application/octet-stream','application/pdf']
    where id = 'doc-templates-private';
  end if;
exception when insufficient_privilege then
  null;
end $$;

create or replace function public.admin_list_document_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  cats jsonb;
  subs jsonb;
  tpls jsonb;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'position_codes', c.position_codes,
    'title_tg', c.title_tg,
    'title_ru', c.title_ru,
    'icon', c.icon,
    'sort_order', c.sort_order,
    'is_active', c.is_active,
    'updated_at', c.updated_at
  ) order by c.sort_order, c.created_at), '[]'::jsonb)
  into cats from public.document_categories c;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'category_id', s.category_id,
    'title_tg', s.title_tg,
    'title_ru', s.title_ru,
    'sort_order', s.sort_order,
    'is_active', s.is_active,
    'updated_at', s.updated_at
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  into subs from public.document_subcategories s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'category_id', t.category_id,
    'subcategory_id', t.subcategory_id,
    'position_codes', t.position_codes,
    'title_tg', t.title_tg,
    'title_ru', t.title_ru,
    'description_tg', t.description_tg,
    'page_orientation', t.page_orientation,
    'page_margins_mm', t.page_margins_mm,
    'lang', t.lang,
    'school_type_filter', t.school_type_filter,
    'shift_filter', t.shift_filter,
    'edit_mode', t.edit_mode,
    'strict_native_only', t.strict_native_only,
    'status', t.status,
    'version', t.version,
    'doc_format', t.doc_format,
    'storage_path', t.storage_path,
    'pdf_storage_path', t.pdf_storage_path,
    'pdf_size_bytes', t.pdf_size_bytes,
    'content_json', t.content_json,
    'sort_order', t.sort_order,
    'updated_at', t.updated_at
  ) order by t.sort_order, t.created_at), '[]'::jsonb)
  into tpls from public.document_templates t;

  return jsonb_build_object(
    'categories', cats,
    'subcategories', subs,
    'templates', tpls
  );
end;
$$;

drop function if exists public.admin_upsert_document_template(uuid, uuid, uuid, text[], text, text, text, text, jsonb, text, text, text, text, boolean, text, integer, text, jsonb);

create or replace function public.admin_upsert_document_template(
  p_id uuid default null,
  p_category_id uuid default null,
  p_subcategory_id uuid default null,
  p_position_codes text[] default '{}'::text[],
  p_title_tg text default '',
  p_title_ru text default '',
  p_description_tg text default '',
  p_page_orientation text default 'portrait',
  p_page_margins_mm jsonb default '{"top":20,"right":15,"bottom":20,"left":30}'::jsonb,
  p_lang text default 'both',
  p_school_type_filter text default 'all',
  p_shift_filter text default 'all',
  p_edit_mode text default 'full',
  p_strict_native_only boolean default false,
  p_status text default 'published',
  p_sort_order integer default 100,
  p_storage_path text default '',
  p_content_json jsonb default '{}'::jsonb,
  p_doc_format text default 'word',
  p_pdf_storage_path text default '',
  p_pdf_size_bytes integer default 0
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  t_tg text := left(btrim(coalesce(p_title_tg, '')), 180);
  t_ru text := left(btrim(coalesce(p_title_ru, '')), 180);
  desc_tg text := left(btrim(coalesce(p_description_tg, '')), 500);
  orient text := case when p_page_orientation = 'landscape' then 'landscape' else 'portrait' end;
  lng text := case when p_lang in ('tg', 'ru', 'both') then p_lang else 'both' end;
  fmt text := case when lower(coalesce(p_doc_format, 'word')) = 'pdf' then 'pdf' else 'word' end;
  emode text := case when p_edit_mode = 'fields_only' then 'fields_only' else 'full' end;
  st text := case when p_status = 'draft' then 'draft' else 'published' end;
  pos_clean text[] := '{}'::text[];
  cat_id uuid := p_category_id;
  out_id uuid;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if t_tg = '' or p_subcategory_id is null then
    raise exception 'template title and subcategory required' using errcode = '22023';
  end if;

  select s.category_id into cat_id
  from public.document_subcategories s
  where s.id = p_subcategory_id;
  if not found then
    raise exception 'subcategory not found' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct val order by val), '{}'::text[])
  into pos_clean
  from unnest(coalesce(p_position_codes, '{}'::text[])) as val
  where val is not null and btrim(val) <> '';

  if array_length(pos_clean, 1) is null then
    select c.position_codes into pos_clean
    from public.document_categories c where c.id = cat_id;
  end if;

  if p_id is not null and exists (select 1 from public.document_templates where id = p_id) then
    update public.document_templates
    set category_id = cat_id,
        subcategory_id = p_subcategory_id,
        position_codes = coalesce(pos_clean, '{}'::text[]),
        title_tg = t_tg,
        title_ru = t_ru,
        description_tg = desc_tg,
        page_orientation = orient,
        page_margins_mm = coalesce(p_page_margins_mm, '{"top":20,"right":15,"bottom":20,"left":30}'::jsonb),
        lang = lng,
        school_type_filter = coalesce(nullif(btrim(p_school_type_filter), ''), 'all'),
        shift_filter = coalesce(nullif(btrim(p_shift_filter), ''), 'all'),
        edit_mode = emode,
        strict_native_only = coalesce(p_strict_native_only, false),
        status = st,
        version = version + 1,
        doc_format = fmt,
        storage_path = left(coalesce(p_storage_path, ''), 300),
        pdf_storage_path = left(coalesce(p_pdf_storage_path, ''), 400),
        pdf_size_bytes = greatest(0, coalesce(p_pdf_size_bytes, 0)),
        content_json = coalesce(p_content_json, '{}'::jsonb),
        sort_order = coalesce(p_sort_order, 100),
        updated_at = now()
    where id = p_id
    returning id into out_id;
  else
    insert into public.document_templates (
      category_id, subcategory_id, position_codes, title_tg, title_ru, description_tg,
      page_orientation, page_margins_mm, lang, school_type_filter, shift_filter,
      edit_mode, strict_native_only, status, doc_format, storage_path, pdf_storage_path, pdf_size_bytes,
      content_json, sort_order, created_by
    ) values (
      cat_id, p_subcategory_id, coalesce(pos_clean, '{}'::text[]), t_tg, t_ru, desc_tg,
      orient, coalesce(p_page_margins_mm, '{"top":20,"right":15,"bottom":20,"left":30}'::jsonb),
      lng, coalesce(nullif(btrim(p_school_type_filter), ''), 'all'),
      coalesce(nullif(btrim(p_shift_filter), ''), 'all'),
      emode, coalesce(p_strict_native_only, false), st, fmt,
      left(coalesce(p_storage_path, ''), 300),
      left(coalesce(p_pdf_storage_path, ''), 400),
      greatest(0, coalesce(p_pdf_size_bytes, 0)),
      coalesce(p_content_json, '{}'::jsonb),
      coalesce(p_sort_order, 100),
      actor_id
    ) returning id into out_id;
  end if;

  return out_id;
end;
$$;

create or replace function public.get_position_document_library(
  p_position_code text,
  p_org_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  pos_clean text := lower(btrim(coalesce(p_position_code, '')));
  org_row public.organizations%rowtype;
  mem_row public.school_memberships%rowtype;
  prof_row public.user_profiles%rowtype;
  dir_name text := '';
  dir_phone text := '';
  stu_total integer := 0;
  stu_boys integer := 0;
  stu_girls integer := 0;
  stu_sample jsonb := '[]'::jsonb;
  wk_sample jsonb := '[]'::jsonb;
  cats jsonb := '[]'::jsonb;
  subs jsonb := '[]'::jsonb;
  tpls jsonb := '[]'::jsonb;
  folders jsonb := '[]'::jsonb;
  items jsonb := '[]'::jsonb;
  quota jsonb;
  school_type text := 'all';
  school_shifts text := 'all';
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_org_id is not null then
    if not smartmaktab_private.is_developer() and not exists (
      select 1 from public.school_memberships m
      where m.user_id = actor_id and m.organization_id = p_org_id and m.account_active = true
    ) then
      raise exception 'organization access denied' using errcode = '42501';
    end if;
    select * into org_row from public.organizations where id = p_org_id;
    select * into mem_row from public.school_memberships where user_id = actor_id and organization_id = p_org_id;
  end if;

  select * into prof_row from public.user_profiles where user_id = actor_id;

  school_type := coalesce(nullif(prof_row.profile_details ->> 'institutionType', ''), 'all');
  school_shifts := coalesce(nullif(prof_row.profile_details ->> 'institutionShifts', ''), 'all');

  if org_row.id is not null then
    select
      coalesce(nullif(up.full_name, ''), ''),
      coalesce(up.profile_details ->> 'phone', '')
    into dir_name, dir_phone
    from public.school_memberships dm
    left join public.user_profiles up on up.user_id = dm.user_id
    where dm.organization_id = org_row.id
      and dm.account_active = true
      and (dm.primary_position = 'school-director' or 'school-director' = any(dm.extra_positions) or dm.role = 'director')
    order by (dm.verification_status = 'verified') desc, (dm.primary_position = 'school-director') desc, dm.created_at asc
    limit 1;

    select
      count(*)::integer,
      count(*) filter (where s.gender = 'male')::integer,
      count(*) filter (where s.gender = 'female')::integer
    into stu_total, stu_boys, stu_girls
    from public.school_students s
    where s.organization_id = org_row.id and s.deleted_at is null and s.status = 'active';

    select coalesce(jsonb_agg(jsonb_build_object(
      'full_name', s.full_name,
      'class_code', s.class_code,
      'birth_year', s.birth_year,
      'gender', s.gender
    ) order by s.class_code, s.full_name), '[]'::jsonb)
    into stu_sample
    from (
      select full_name, class_code, birth_year, gender
      from public.school_students
      where organization_id = org_row.id and deleted_at is null and status = 'active'
      order by class_code, full_name
      limit 120
    ) s;

    select coalesce(jsonb_agg(jsonb_build_object(
      'teacher_name', w.teacher_name,
      'subject', w.subject,
      'weekly_hours', w.weekly_hours,
      'category', w.category
    ) order by w.teacher_name), '[]'::jsonb)
    into wk_sample
    from (
      select teacher_name, subject, weekly_hours, category
      from public.teacher_workloads
      where organization_id = org_row.id
      order by teacher_name
      limit 80
    ) w;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'position_codes', c.position_codes,
    'title_tg', c.title_tg,
    'title_ru', c.title_ru,
    'icon', c.icon,
    'sort_order', c.sort_order
  ) order by c.sort_order, c.created_at), '[]'::jsonb)
  into cats
  from public.document_categories c
  where c.is_active = true
    and (pos_clean = '' or pos_clean = any(c.position_codes));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'category_id', s.category_id,
    'title_tg', s.title_tg,
    'title_ru', s.title_ru,
    'sort_order', s.sort_order
  ) order by s.sort_order, s.created_at), '[]'::jsonb)
  into subs
  from public.document_subcategories s
  join public.document_categories c on c.id = s.category_id
  where s.is_active = true
    and c.is_active = true
    and (pos_clean = '' or pos_clean = any(c.position_codes));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'category_id', t.category_id,
    'subcategory_id', t.subcategory_id,
    'position_codes', t.position_codes,
    'title_tg', t.title_tg,
    'title_ru', t.title_ru,
    'description_tg', t.description_tg,
    'page_orientation', t.page_orientation,
    'page_margins_mm', t.page_margins_mm,
    'lang', t.lang,
    'school_type_filter', t.school_type_filter,
    'shift_filter', t.shift_filter,
    'edit_mode', t.edit_mode,
    'strict_native_only', t.strict_native_only,
    'version', t.version,
    'doc_format', t.doc_format,
    'storage_path', t.storage_path,
    'pdf_storage_path', t.pdf_storage_path,
    'pdf_size_bytes', t.pdf_size_bytes,
    'content_json', t.content_json,
    'sort_order', t.sort_order
  ) order by t.sort_order, t.created_at), '[]'::jsonb)
  into tpls
  from public.document_templates t
  join public.document_subcategories s on s.id = t.subcategory_id
  join public.document_categories c on c.id = s.category_id
  where t.status = 'published'
    and s.is_active = true
    and c.is_active = true
    and (pos_clean = '' or pos_clean = any(t.position_codes) or pos_clean = any(c.position_codes))
    and (t.school_type_filter = 'all' or school_type = 'all' or lower(t.school_type_filter) = lower(school_type))
    and (t.shift_filter = 'all' or school_shifts = 'all' or t.shift_filter = school_shifts);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'name', f.name,
    'sort_order', f.sort_order,
    'created_at', f.created_at
  ) order by f.sort_order, f.created_at), '[]'::jsonb)
  into folders
  from public.user_document_folders f
  where f.user_id = actor_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'template_id', i.template_id,
    'folder_id', i.folder_id,
    'is_favorite', i.is_favorite,
    'custom_title', i.custom_title,
    'has_draft', i.has_draft,
    'draft_storage_path', i.draft_storage_path,
    'draft_gzip_b64', i.draft_gzip_b64,
    'draft_size_bytes', i.draft_size_bytes,
    'updated_at', i.updated_at
  ) order by i.updated_at desc), '[]'::jsonb)
  into items
  from public.user_document_items i
  where i.user_id = actor_id;

  quota := smartmaktab_private.user_document_quota(actor_id);

  return jsonb_build_object(
    'categories', cats,
    'subcategories', subs,
    'templates', tpls,
    'folders', folders,
    'items', items,
    'quota', quota,
    'autofill', jsonb_build_object(
      'organization', case when org_row.id is null then '{}'::jsonb else jsonb_build_object(
        'id', org_row.id,
        'name', org_row.name,
        'kind', org_row.kind,
        'authority_tier', org_row.authority_tier,
        'region_name', coalesce(org_row.region_name, ''),
        'district_name', coalesce(org_row.district_name, ''),
        'jamoat_name', coalesce(org_row.jamoat_name, ''),
        'village_name', coalesce(org_row.village_name, ''),
        'school_code', coalesce(org_row.school_code, ''),
        'institution_type', school_type,
        'institution_shifts', school_shifts
      ) end,
      'director', jsonb_build_object(
        'full_name', coalesce(dir_name, ''),
        'phone', coalesce(dir_phone, '')
      ),
      'user', jsonb_build_object(
        'full_name', coalesce(prof_row.full_name, ''),
        'position_code', pos_clean,
        'birth_date', coalesce(prof_row.profile_details ->> 'birthDate', ''),
        'phone', coalesce(prof_row.profile_details ->> 'phone', ''),
        'custom_method_name', coalesce(mem_row.custom_method_name, '')
      ),
      'stats', jsonb_build_object(
        'students_total', stu_total,
        'students_boys', stu_boys,
        'students_girls', stu_girls,
        'students', stu_sample,
        'workloads', wk_sample
      )
    )
  );
end;
$$;

create or replace function public.save_user_document_draft(
  p_template_id uuid,
  p_folder_id uuid default null,
  p_custom_title text default '',
  p_draft_storage_path text default '',
  p_draft_gzip_b64 text default '',
  p_size_bytes integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  title_clean text := left(btrim(coalesce(p_custom_title, '')), 180);
  spath text := left(btrim(coalesce(p_draft_storage_path, '')), 300);
  b64 text := coalesce(p_draft_gzip_b64, '');
  tpl_format text;
  existing public.user_document_items%rowtype;
  quota jsonb;
  item_row public.user_document_items%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select doc_format into tpl_format from public.document_templates where id = p_template_id;
  if not found then
    raise exception 'template not found' using errcode = '22023';
  end if;
  if tpl_format = 'pdf' then
    raise exception 'pdf_readonly_cannot_save_draft' using errcode = '22023';
  end if;
  if p_folder_id is not null and not exists (select 1 from public.user_document_folders where id = p_folder_id and user_id = actor_id) then
    raise exception 'folder not found' using errcode = '22023';
  end if;
  if char_length(b64) > 250000 then
    raise exception 'draft payload too large' using errcode = '22023';
  end if;
  if spath <> '' and split_part(spath, '/', 1) <> actor_id::text then
    raise exception 'invalid draft storage path' using errcode = '42501';
  end if;

  select * into existing
  from public.user_document_items
  where user_id = actor_id
    and template_id = p_template_id
    and folder_id is not distinct from p_folder_id;

  if not found or not existing.has_draft then
    quota := smartmaktab_private.user_document_quota(actor_id);
    if (quota ->> 'drafts_used')::integer >= (quota ->> 'drafts_limit')::integer then
      raise exception 'draft_quota_exceeded' using errcode = 'P0001';
    end if;
  end if;

  if found then
    update public.user_document_items
    set custom_title = case when title_clean <> '' then title_clean else custom_title end,
        has_draft = true,
        draft_storage_path = spath,
        draft_gzip_b64 = case when spath <> '' then '' else b64 end,
        draft_size_bytes = greatest(0, coalesce(p_size_bytes, 0)),
        updated_at = now()
    where id = existing.id
    returning * into item_row;
  else
    insert into public.user_document_items (
      user_id, template_id, folder_id, custom_title, has_draft,
      draft_storage_path, draft_gzip_b64, draft_size_bytes
    ) values (
      actor_id, p_template_id, p_folder_id, title_clean, true,
      spath, case when spath <> '' then '' else b64 end, greatest(0, coalesce(p_size_bytes, 0))
    ) returning * into item_row;
  end if;

  return jsonb_build_object(
    'item', jsonb_build_object(
      'id', item_row.id,
      'template_id', item_row.template_id,
      'folder_id', item_row.folder_id,
      'is_favorite', item_row.is_favorite,
      'custom_title', item_row.custom_title,
      'has_draft', item_row.has_draft,
      'draft_storage_path', item_row.draft_storage_path,
      'draft_gzip_b64', item_row.draft_gzip_b64,
      'draft_size_bytes', item_row.draft_size_bytes,
      'updated_at', item_row.updated_at
    ),
    'quota', smartmaktab_private.user_document_quota(actor_id)
  );
end;
$$;

revoke all on function
  public.admin_upsert_document_template(uuid, uuid, uuid, text[], text, text, text, text, jsonb, text, text, text, text, boolean, text, integer, text, jsonb, text, text, integer)
from public, anon, authenticated, service_role;

grant execute on function
  public.admin_upsert_document_template(uuid, uuid, uuid, text[], text, text, text, text, jsonb, text, text, text, text, boolean, text, integer, text, jsonb, text, text, integer)
to authenticated, service_role;
