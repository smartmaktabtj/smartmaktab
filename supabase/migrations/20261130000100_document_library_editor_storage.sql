-- Stage 3: Document Categories, Subcategories, Templates, Word Editor,
-- User Folders/Favorites/Drafts (20 folders + 50 drafts free, +20/+50 per +10 TJS/mo pack)
-- & Private Storage Buckets

-- 1. Storage pack columns on memberships & payment submissions
alter table public.school_memberships
  add column if not exists storage_pack_count integer not null default 0 check (storage_pack_count >= 0 and storage_pack_count <= 20),
  add column if not exists storage_pack_expires_at timestamptz;

alter table public.payment_submissions
  add column if not exists storage_pack_count integer not null default 0 check (storage_pack_count >= 0 and storage_pack_count <= 20);

-- 2. Quota calculator helper (20 folders + 50 saved drafts free, +20/+50 per active 10 TJS pack)
create or replace function smartmaktab_private.user_document_quota(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  active_packs integer := 0;
  latest_exp timestamptz;
  f_used integer := 0;
  d_used integer := 0;
  f_limit integer := 20;
  d_limit integer := 50;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'storage_pack_count', 0,
      'storage_pack_expires_at', null,
      'folders_used', 0,
      'folders_limit', 20,
      'drafts_used', 0,
      'drafts_limit', 50
    );
  end if;

  select
    coalesce(max(case
      when m.storage_pack_expires_at is null or m.storage_pack_expires_at > now()
      then m.storage_pack_count
      else 0
    end), 0),
    max(case
      when m.storage_pack_count > 0 and (m.storage_pack_expires_at is null or m.storage_pack_expires_at > now())
      then m.storage_pack_expires_at
      else null
    end)
  into active_packs, latest_exp
  from public.school_memberships m
  where m.user_id = p_user_id
    and m.account_active = true;

  f_limit := 20 + active_packs * 20;
  d_limit := 50 + active_packs * 50;

  select count(*)::integer into f_used
  from public.user_document_folders f
  where f.user_id = p_user_id;

  select count(*)::integer into d_used
  from public.user_document_items i
  where i.user_id = p_user_id and i.has_draft = true;

  return jsonb_build_object(
    'storage_pack_count', active_packs,
    'storage_pack_expires_at', latest_exp,
    'folders_used', f_used,
    'folders_limit', f_limit,
    'drafts_used', d_used,
    'drafts_limit', d_limit
  );
end;
$$;

-- 3. Document library tables
create table if not exists public.document_categories (
  id uuid primary key default gen_random_uuid(),
  position_codes text[] not null default '{}'::text[],
  title_tg text not null check (char_length(btrim(title_tg)) between 1 and 140),
  title_ru text not null default '',
  icon text not null default '📁',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doc_categories_positions
  on public.document_categories using gin (position_codes);

create table if not exists public.document_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.document_categories(id) on delete cascade,
  title_tg text not null check (char_length(btrim(title_tg)) between 1 and 140),
  title_ru text not null default '',
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doc_subcategories_cat
  on public.document_subcategories (category_id, sort_order);

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.document_categories(id) on delete cascade,
  subcategory_id uuid not null references public.document_subcategories(id) on delete cascade,
  position_codes text[] not null default '{}'::text[],
  title_tg text not null check (char_length(btrim(title_tg)) between 1 and 180),
  title_ru text not null default '',
  description_tg text not null default '',
  page_orientation text not null default 'portrait' check (page_orientation in ('portrait', 'landscape')),
  page_margins_mm jsonb not null default '{"top":20,"right":15,"bottom":20,"left":30}'::jsonb,
  lang text not null default 'both' check (lang in ('tg', 'ru', 'both')),
  school_type_filter text not null default 'all',
  shift_filter text not null default 'all',
  edit_mode text not null default 'full' check (edit_mode in ('full', 'fields_only')),
  strict_native_only boolean not null default false,
  status text not null default 'published' check (status in ('draft', 'published')),
  version integer not null default 1,
  storage_path text not null default '',
  content_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doc_templates_subcat
  on public.document_templates (subcategory_id, sort_order);
create index if not exists idx_doc_templates_positions
  on public.document_templates using gin (position_codes);

create table if not exists public.user_document_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_doc_folders_user
  on public.user_document_folders (user_id, sort_order, created_at);

create table if not exists public.user_document_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.document_templates(id) on delete cascade,
  folder_id uuid references public.user_document_folders(id) on delete cascade,
  is_favorite boolean not null default false,
  custom_title text not null default '',
  has_draft boolean not null default false,
  draft_storage_path text not null default '',
  draft_gzip_b64 text not null default '',
  draft_size_bytes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_user_doc_item_slot
  on public.user_document_items (
    user_id,
    template_id,
    coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_user_doc_items_user
  on public.user_document_items (user_id, updated_at desc);

create table if not exists public.document_print_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  template_id uuid references public.document_templates(id) on delete set null,
  folder_item_id uuid references public.user_document_items(id) on delete set null,
  title text not null default '',
  client_platform text not null default 'web',
  printed_at timestamptz not null default now()
);

create index if not exists idx_doc_print_audit_user
  on public.document_print_audit (user_id, printed_at desc);

-- RLS & direct privilege lockdown (all mutations happen via SECURITY DEFINER RPCs)
alter table public.document_categories enable row level security;
alter table public.document_subcategories enable row level security;
alter table public.document_templates enable row level security;
alter table public.user_document_folders enable row level security;
alter table public.user_document_items enable row level security;
alter table public.document_print_audit enable row level security;

revoke all on public.document_categories, public.document_subcategories, public.document_templates,
  public.user_document_folders, public.user_document_items, public.document_print_audit
  from public, anon, authenticated;

grant select on public.document_categories, public.document_subcategories, public.document_templates,
  public.user_document_folders, public.user_document_items, public.document_print_audit
  to authenticated;

grant all on public.document_categories, public.document_subcategories, public.document_templates,
  public.user_document_folders, public.user_document_items, public.document_print_audit
  to service_role;

drop policy if exists doc_cat_read_auth on public.document_categories;
create policy doc_cat_read_auth on public.document_categories for select to authenticated
  using (smartmaktab_private.is_developer() or is_active = true);

drop policy if exists doc_sub_read_auth on public.document_subcategories;
create policy doc_sub_read_auth on public.document_subcategories for select to authenticated
  using (smartmaktab_private.is_developer() or is_active = true);

drop policy if exists doc_tpl_read_auth on public.document_templates;
create policy doc_tpl_read_auth on public.document_templates for select to authenticated
  using (smartmaktab_private.is_developer() or status = 'published');

drop policy if exists user_doc_folders_own on public.user_document_folders;
create policy user_doc_folders_own on public.user_document_folders for select to authenticated
  using (user_id = auth.uid() or smartmaktab_private.is_developer());

drop policy if exists user_doc_items_own on public.user_document_items;
create policy user_doc_items_own on public.user_document_items for select to authenticated
  using (user_id = auth.uid() or smartmaktab_private.is_developer());

drop policy if exists doc_print_audit_own on public.document_print_audit;
create policy doc_print_audit_own on public.document_print_audit for select to authenticated
  using (user_id = auth.uid() or smartmaktab_private.is_developer());

-- 4. Private Storage buckets (guarded so PGlite unit tests execute cleanly without storage schema)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'doc-templates-private',
      'doc-templates-private',
      false,
      5242880,
      array['application/json', 'application/gzip', 'text/plain', 'application/octet-stream']
    )
    on conflict (id) do update set
      public = false,
      file_size_limit = 5242880;

    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'doc-drafts-private',
      'doc-drafts-private',
      false,
      524288,
      array['application/json', 'application/gzip', 'application/octet-stream']
    )
    on conflict (id) do update set
      public = false,
      file_size_limit = 524288;
  end if;

  if to_regclass('storage.objects') is not null then
    begin
      drop policy if exists sm_doc_templates_read on storage.objects;
      create policy sm_doc_templates_read on storage.objects
        for select to authenticated
        using (bucket_id = 'doc-templates-private');

      drop policy if exists sm_doc_templates_dev_write on storage.objects;
      create policy sm_doc_templates_dev_write on storage.objects
        for all to authenticated
        using (bucket_id = 'doc-templates-private' and smartmaktab_private.is_developer())
        with check (bucket_id = 'doc-templates-private' and smartmaktab_private.is_developer());

      drop policy if exists sm_doc_drafts_user_all on storage.objects;
      create policy sm_doc_drafts_user_all on storage.objects
        for all to authenticated
        using (
          bucket_id = 'doc-drafts-private'
          and split_part(name, '/', 1) = auth.uid()::text
        )
        with check (
          bucket_id = 'doc-drafts-private'
          and split_part(name, '/', 1) = auth.uid()::text
        );
    exception when insufficient_privilege then
      null;
    end;
  end if;
end $$;

-- 5. Admin RPCs for managing Document Categories, Subcategories & Templates
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
    'storage_path', t.storage_path,
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

create or replace function public.admin_upsert_document_category(
  p_id uuid default null,
  p_position_codes text[] default '{}'::text[],
  p_title_tg text default '',
  p_title_ru text default '',
  p_icon text default '📁',
  p_sort_order integer default 100,
  p_is_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  t_tg text := left(btrim(coalesce(p_title_tg, '')), 140);
  t_ru text := left(btrim(coalesce(p_title_ru, '')), 140);
  ico text := left(coalesce(nullif(btrim(p_icon), ''), '📁'), 12);
  pos_clean text[] := '{}'::text[];
  out_id uuid;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if t_tg = '' then
    raise exception 'category title required' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct val order by val), '{}'::text[])
  into pos_clean
  from unnest(coalesce(p_position_codes, '{}'::text[])) as val
  where val is not null and btrim(val) <> '';

  if array_length(pos_clean, 1) is null then
    raise exception 'at least one position required' using errcode = '22023';
  end if;

  if p_id is not null and exists (select 1 from public.document_categories where id = p_id) then
    update public.document_categories
    set position_codes = pos_clean,
        title_tg = t_tg,
        title_ru = t_ru,
        icon = ico,
        sort_order = coalesce(p_sort_order, 100),
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    where id = p_id
    returning id into out_id;
  else
    insert into public.document_categories (
      position_codes, title_tg, title_ru, icon, sort_order, is_active, created_by
    ) values (
      pos_clean, t_tg, t_ru, ico, coalesce(p_sort_order, 100), coalesce(p_is_active, true), actor_id
    ) returning id into out_id;
  end if;

  return out_id;
end;
$$;

create or replace function public.admin_delete_document_category(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  cnt integer := 0;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  delete from public.document_categories where id = p_id;
  get diagnostics cnt = row_count;
  return cnt > 0;
end;
$$;

create or replace function public.admin_upsert_document_subcategory(
  p_id uuid default null,
  p_category_id uuid default null,
  p_title_tg text default '',
  p_title_ru text default '',
  p_sort_order integer default 100,
  p_is_active boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  t_tg text := left(btrim(coalesce(p_title_tg, '')), 140);
  t_ru text := left(btrim(coalesce(p_title_ru, '')), 140);
  out_id uuid;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  if t_tg = '' or p_category_id is null or not exists (select 1 from public.document_categories where id = p_category_id) then
    raise exception 'valid category and title required' using errcode = '22023';
  end if;

  if p_id is not null and exists (select 1 from public.document_subcategories where id = p_id) then
    update public.document_subcategories
    set category_id = p_category_id,
        title_tg = t_tg,
        title_ru = t_ru,
        sort_order = coalesce(p_sort_order, 100),
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    where id = p_id
    returning id into out_id;
  else
    insert into public.document_subcategories (
      category_id, title_tg, title_ru, sort_order, is_active, created_by
    ) values (
      p_category_id, t_tg, t_ru, coalesce(p_sort_order, 100), coalesce(p_is_active, true), actor_id
    ) returning id into out_id;
  end if;

  return out_id;
end;
$$;

create or replace function public.admin_delete_document_subcategory(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  cnt integer := 0;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  delete from public.document_subcategories where id = p_id;
  get diagnostics cnt = row_count;
  return cnt > 0;
end;
$$;

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
  p_content_json jsonb default '{}'::jsonb
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
        storage_path = left(coalesce(p_storage_path, ''), 300),
        content_json = coalesce(p_content_json, '{}'::jsonb),
        sort_order = coalesce(p_sort_order, 100),
        updated_at = now()
    where id = p_id
    returning id into out_id;
  else
    insert into public.document_templates (
      category_id, subcategory_id, position_codes, title_tg, title_ru, description_tg,
      page_orientation, page_margins_mm, lang, school_type_filter, shift_filter,
      edit_mode, strict_native_only, status, storage_path, content_json, sort_order, created_by
    ) values (
      cat_id, p_subcategory_id, coalesce(pos_clean, '{}'::text[]), t_tg, t_ru, desc_tg,
      orient, coalesce(p_page_margins_mm, '{"top":20,"right":15,"bottom":20,"left":30}'::jsonb),
      lng, coalesce(nullif(btrim(p_school_type_filter), ''), 'all'),
      coalesce(nullif(btrim(p_shift_filter), ''), 'all'),
      emode, coalesce(p_strict_native_only, false), st,
      left(coalesce(p_storage_path, ''), 300),
      coalesce(p_content_json, '{}'::jsonb),
      coalesce(p_sort_order, 100),
      actor_id
    ) returning id into out_id;
  end if;

  return out_id;
end;
$$;

create or replace function public.admin_delete_document_template(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  cnt integer := 0;
begin
  if not smartmaktab_private.is_developer() then
    raise exception 'super_admin required' using errcode = '42501';
  end if;
  delete from public.document_templates where id = p_id;
  get diagnostics cnt = row_count;
  return cnt > 0;
end;
$$;

-- 6. User RPCs: library tree, folders, favorites, drafts & print audit
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
    'storage_path', t.storage_path,
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

create or replace function public.create_user_document_folder(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  name_clean text := left(btrim(coalesce(p_name, '')), 80);
  quota jsonb;
  out_row public.user_document_folders%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if name_clean = '' then
    raise exception 'folder name required' using errcode = '22023';
  end if;

  quota := smartmaktab_private.user_document_quota(actor_id);
  if (quota ->> 'folders_used')::integer >= (quota ->> 'folders_limit')::integer then
    raise exception 'folder_quota_exceeded' using errcode = 'P0001';
  end if;

  insert into public.user_document_folders (user_id, name)
  values (actor_id, name_clean)
  returning * into out_row;

  return jsonb_build_object(
    'folder', jsonb_build_object('id', out_row.id, 'name', out_row.name, 'sort_order', out_row.sort_order, 'created_at', out_row.created_at),
    'quota', smartmaktab_private.user_document_quota(actor_id)
  );
end;
$$;

create or replace function public.rename_user_document_folder(p_id uuid, p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  name_clean text := left(btrim(coalesce(p_name, '')), 80);
  cnt integer := 0;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if name_clean = '' then
    raise exception 'folder name required' using errcode = '22023';
  end if;
  update public.user_document_folders
  set name = name_clean, updated_at = now()
  where id = p_id and user_id = actor_id;
  get diagnostics cnt = row_count;
  return cnt > 0;
end;
$$;

create or replace function public.delete_user_document_folder(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  cnt integer := 0;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  delete from public.user_document_folders where id = p_id and user_id = actor_id;
  get diagnostics cnt = row_count;
  return cnt > 0;
end;
$$;

create or replace function public.toggle_user_document_favorite(
  p_template_id uuid,
  p_favorite boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  zero_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  item_row public.user_document_items%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_template_id is null or not exists (select 1 from public.document_templates where id = p_template_id) then
    raise exception 'template not found' using errcode = '22023';
  end if;

  select * into item_row
  from public.user_document_items
  where user_id = actor_id and template_id = p_template_id and folder_id is null;

  if not found then
    if coalesce(p_favorite, true) then
      insert into public.user_document_items (user_id, template_id, folder_id, is_favorite)
      values (actor_id, p_template_id, null, true)
      returning * into item_row;
    else
      return jsonb_build_object('removed', true, 'quota', smartmaktab_private.user_document_quota(actor_id));
    end if;
  else
    if not coalesce(p_favorite, true) and not item_row.has_draft then
      delete from public.user_document_items where id = item_row.id;
      return jsonb_build_object('removed', true, 'quota', smartmaktab_private.user_document_quota(actor_id));
    end if;
    update public.user_document_items
    set is_favorite = coalesce(p_favorite, true), updated_at = now()
    where id = item_row.id
    returning * into item_row;
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
      'draft_size_bytes', item_row.draft_size_bytes
    ),
    'quota', smartmaktab_private.user_document_quota(actor_id)
  );
end;
$$;

create or replace function public.copy_template_to_user_folder(
  p_template_id uuid,
  p_folder_id uuid,
  p_custom_title text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  title_clean text := left(btrim(coalesce(p_custom_title, '')), 180);
  item_row public.user_document_items%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_template_id is null or not exists (select 1 from public.document_templates where id = p_template_id) then
    raise exception 'template not found' using errcode = '22023';
  end if;
  if p_folder_id is null or not exists (select 1 from public.user_document_folders where id = p_folder_id and user_id = actor_id) then
    raise exception 'folder not found' using errcode = '22023';
  end if;

  insert into public.user_document_items (user_id, template_id, folder_id, custom_title, has_draft)
  values (actor_id, p_template_id, p_folder_id, title_clean, false)
  on conflict (user_id, template_id, coalesce(folder_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set
    custom_title = case when title_clean <> '' then title_clean else public.user_document_items.custom_title end,
    updated_at = now()
  returning * into item_row;

  return jsonb_build_object(
    'item', jsonb_build_object(
      'id', item_row.id,
      'template_id', item_row.template_id,
      'folder_id', item_row.folder_id,
      'is_favorite', item_row.is_favorite,
      'custom_title', item_row.custom_title,
      'has_draft', item_row.has_draft,
      'draft_storage_path', item_row.draft_storage_path,
      'draft_size_bytes', item_row.draft_size_bytes
    ),
    'quota', smartmaktab_private.user_document_quota(actor_id)
  );
end;
$$;

create or replace function public.remove_user_document_item(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  delete from public.user_document_items where id = p_item_id and user_id = actor_id;
  return jsonb_build_object('quota', smartmaktab_private.user_document_quota(actor_id));
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
  existing public.user_document_items%rowtype;
  quota jsonb;
  item_row public.user_document_items%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_template_id is null or not exists (select 1 from public.document_templates where id = p_template_id) then
    raise exception 'template not found' using errcode = '22023';
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

create or replace function public.reset_user_document_draft(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  item_row public.user_document_items%rowtype;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into item_row
  from public.user_document_items
  where id = p_item_id and user_id = actor_id;
  if not found then
    return jsonb_build_object('removed', true, 'quota', smartmaktab_private.user_document_quota(actor_id));
  end if;

  if item_row.folder_id is null and not item_row.is_favorite then
    delete from public.user_document_items where id = item_row.id;
    return jsonb_build_object('removed', true, 'quota', smartmaktab_private.user_document_quota(actor_id));
  end if;

  update public.user_document_items
  set has_draft = false,
      draft_storage_path = '',
      draft_gzip_b64 = '',
      draft_size_bytes = 0,
      updated_at = now()
  where id = item_row.id
  returning * into item_row;

  return jsonb_build_object(
    'item', jsonb_build_object(
      'id', item_row.id,
      'template_id', item_row.template_id,
      'folder_id', item_row.folder_id,
      'is_favorite', item_row.is_favorite,
      'custom_title', item_row.custom_title,
      'has_draft', false,
      'draft_storage_path', '',
      'draft_gzip_b64', '',
      'draft_size_bytes', 0
    ),
    'quota', smartmaktab_private.user_document_quota(actor_id)
  );
end;
$$;

create or replace function public.log_document_print(
  p_template_id uuid default null,
  p_org_id uuid default null,
  p_folder_item_id uuid default null,
  p_title text default '',
  p_platform text default 'web'
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  out_id uuid;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  insert into public.document_print_audit (
    user_id, organization_id, template_id, folder_item_id, title, client_platform
  ) values (
    actor_id,
    p_org_id,
    p_template_id,
    p_folder_item_id,
    left(btrim(coalesce(p_title, '')), 180),
    left(btrim(coalesce(p_platform, 'web')), 30)
  ) returning id into out_id;
  return out_id;
end;
$$;

-- 7. Update submit_payment_receipt, admin_review_payment & get_my_workspace_context
--    to include Pro Storage Pack (+10 TJS/mo => +20 folders & +50 saved drafts per pack)
drop function if exists public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[], boolean, integer);

create or replace function public.submit_payment_receipt(
  p_org_id uuid,
  p_receipt_hash text,
  p_provider_code text default 'manual',
  p_amount_declared numeric default null,
  p_currency text default 'TJS',
  p_ocr_text text default '',
  p_ocr_confidence numeric default null,
  p_ocr_payload jsonb default '{}'::jsonb,
  p_transaction_id text default null,
  p_recipient_account text default null,
  p_status_confirmed boolean default false,
  p_plan_code text default 'trial_10',
  p_primary_position text default null,
  p_extra_positions text[] default '{}'::text[],
  p_include_aliya boolean default false,
  p_months integer default 1,
  p_storage_pack_count integer default 0
) returns uuid
language plpgsql
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  hash_clean text := lower(btrim(coalesce(p_receipt_hash, '')));
  prov_clean text := lower(coalesce(nullif(btrim(p_provider_code), ''), 'manual'));
  tx_clean text := nullif(regexp_replace(upper(btrim(coalesce(p_transaction_id, ''))), '[^A-Z0-9-]', '', 'g'), '');
  digits text := regexp_replace(coalesce(p_recipient_account, ''), '\D', '', 'g');
  recip_clean text := case
    when length(digits) = 9 then '992' || digits
    when length(digits) >= 10 then digits
    else null
  end;
  months_clean integer := case
    when coalesce(p_months, 1) in (1, 3, 6, 9, 12) then coalesce(p_months, 1)
    else 1
  end;
  discount_pct numeric := case months_clean
    when 3 then 3
    when 6 then 5
    when 9 then 10
    when 12 then 15
    else 0
  end;
  plan_row public.subscription_plans%rowtype;
  pos_clean text := nullif(lower(btrim(coalesce(p_primary_position, ''))), '');
  pos_row public.role_tariffs%rowtype;
  extras_clean text[] := '{}'::text[];
  extra_sum numeric := 0;
  aliya_flag boolean := coalesce(p_include_aliya, false);
  aliya_fee numeric := case when aliya_flag then 30.00 else 0.00 end;
  pack_clean integer := greatest(0, least(20, coalesce(p_storage_pack_count, 0)));
  pack_fee numeric := pack_clean * 10.00;
  monthly_amount numeric := 0;
  required_amount numeric := 0;
  required_days integer := case months_clean when 12 then 365 else months_clean * 30 end;
  required_devices integer := 2;
  chosen_plan text := coalesce(nullif(btrim(p_plan_code), ''), 'trial_10');
  ocr_source text := coalesce(p_ocr_payload ->> 'source', '');
  enriched_payload jsonb;
  auto_verified boolean := false;
  existing_exp timestamptz;
  base_ts timestamptz;
  mem_exp timestamptz;
  mem_base timestamptz;
  output uuid;
begin
  if actor_id is null or p_org_id is null
     or (
       not smartmaktab_private.can_write_school(p_org_id)
       and not exists (
         select 1 from public.school_memberships m
         where m.user_id = actor_id and m.organization_id = p_org_id and m.account_active = true
       )
     ) then
    raise exception 'payment submission denied' using errcode = '42501';
  end if;
  if hash_clean !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid receipt hash' using errcode = '22023';
  end if;

  select * into plan_row from public.subscription_plans where code = chosen_plan and is_active = true;
  if not found then
    select * into plan_row from public.subscription_plans where is_active = true order by updated_at desc limit 1;
  end if;

  if pos_clean is not null then
    select * into pos_row from public.role_tariffs where position_code = pos_clean and is_active = true;
    if found then
      select coalesce(array_agg(distinct val order by val), '{}'::text[])
      into extras_clean
      from unnest(coalesce(p_extra_positions, '{}'::text[])) as val
      where val is not null and btrim(val) <> '' and val <> pos_clean
        and exists (select 1 from public.role_tariffs rt where rt.position_code = val and rt.is_active = true);

      select coalesce(sum(rt.extra_price_tjs), 0)
      into extra_sum
      from public.role_tariffs rt
      where rt.position_code = any(extras_clean);

      monthly_amount := pos_row.base_price_tjs + extra_sum + aliya_fee + pack_fee;
      required_amount := round(monthly_amount * months_clean * (1 - discount_pct / 100.0), 2);
      required_devices := least(40, greatest(coalesce(pos_row.default_max_devices, 2), (1 + coalesce(array_length(extras_clean, 1), 0)) * 2));
      chosen_plan := 'pos:' || pos_clean || ':' || months_clean::text || 'm'
        || case when aliya_flag then '+aliya' else '' end
        || case when pack_clean > 0 then '+pack' || pack_clean::text else '' end;
    else
      pos_clean := null;
    end if;
  end if;

  if pos_clean is null and plan_row.code is not null then
    monthly_amount := plan_row.price_tjs + aliya_fee + pack_fee;
    required_amount := round(monthly_amount * months_clean * (1 - discount_pct / 100.0), 2);
    chosen_plan := plan_row.code || ':' || months_clean::text || 'm'
      || case when pack_clean > 0 then '+pack' || pack_clean::text else '' end;
  end if;

  if plan_row.recipient_account is not null
     and ocr_source = 'ocr_space'
     and p_status_confirmed = true
     and tx_clean is not null
     and recip_clean = plan_row.recipient_account
     and coalesce(p_amount_declared, 0) >= required_amount then
    auto_verified := true;
  end if;

  enriched_payload := coalesce(p_ocr_payload, '{}'::jsonb) || jsonb_build_object(
    'primary_position', pos_clean,
    'extra_positions', to_jsonb(extras_clean),
    'include_aliya', aliya_flag,
    'storage_pack_count', pack_clean,
    'months', months_clean,
    'discount_pct', discount_pct,
    'expected_amount_tjs', required_amount,
    'expected_days', required_days
  );

  insert into public.payment_submissions (
    organization_id, submitted_by, provider_code, receipt_hash, amount_declared, currency,
    ocr_text, ocr_confidence, ocr_payload, transaction_id, recipient_account, status_confirmed, plan_code,
    include_aliya, storage_pack_count, status, review_note, reviewed_by, reviewed_at
  ) values (
    p_org_id, actor_id, prov_clean, hash_clean, p_amount_declared, upper(coalesce(nullif(btrim(p_currency), ''), 'TJS')),
    left(coalesce(p_ocr_text, ''), 12000), p_ocr_confidence, enriched_payload,
    tx_clean, recip_clean, coalesce(p_status_confirmed, false), chosen_plan,
    aliya_flag, pack_clean,
    case when auto_verified then 'verified' else 'pending' end,
    case when auto_verified then 'auto_verified_ocr' else '' end,
    case when auto_verified then actor_id else null end,
    case when auto_verified then now() else null end
  ) returning id into output;

  if auto_verified then
    select expires_at into existing_exp from public.school_licenses where organization_id = p_org_id;
    base_ts := greatest(now(), coalesce(existing_exp, now()));
    perform public.admin_set_license(
      p_org_id, 'active', chosen_plan, base_ts + make_interval(days => required_days), 30, 'auto_verified_ocr',
      1, greatest(1, 1 + coalesce(array_length(extras_clean, 1), 0)), required_devices
    );

    select subscription_expires_at into mem_exp
    from public.school_memberships where user_id = actor_id and organization_id = p_org_id;
    mem_base := greatest(now(), coalesce(mem_exp, now()));

    update public.school_memberships
    set primary_position = coalesce(primary_position, pos_clean),
        extra_positions = case
          when coalesce(primary_position, pos_clean) is null then extra_positions
          else (
            select coalesce(array_agg(distinct val order by val), '{}'::text[])
            from unnest(coalesce(extra_positions, '{}'::text[]) || extras_clean) as val
            where val <> coalesce(primary_position, pos_clean)
          )
        end,
        max_extra_positions = greatest(
          max_extra_positions,
          (
            select coalesce(count(distinct val)::integer, 0)
            from unnest(coalesce(extra_positions, '{}'::text[]) || extras_clean) as val
            where val <> coalesce(primary_position, pos_clean)
          )
        ),
        max_devices = least(40, greatest(
          max_devices,
          required_devices,
          (1 + (
            select coalesce(count(distinct val)::integer, 0)
            from unnest(coalesce(extra_positions, '{}'::text[]) || extras_clean) as val
            where val <> coalesce(primary_position, pos_clean)
          )) * 2
        )),
        aliya_enabled = aliya_enabled or aliya_flag,
        aliya_expires_at = case
          when aliya_flag then greatest(coalesce(aliya_expires_at, now()), now()) + make_interval(days => required_days)
          else aliya_expires_at
        end,
        storage_pack_count = greatest(storage_pack_count, pack_clean),
        storage_pack_expires_at = case
          when pack_clean > 0 then greatest(coalesce(storage_pack_expires_at, now()), now()) + make_interval(days => required_days)
          else storage_pack_expires_at
        end,
        subscription_status = 'active',
        subscription_months = months_clean,
        subscription_expires_at = mem_base + make_interval(days => required_days)
    where user_id = actor_id and organization_id = p_org_id;
  end if;

  return output;
end;
$$;

create or replace function public.admin_review_payment(
  p_payment_id uuid,
  p_decision text,
  p_review_note text default '',
  p_extend_days integer default 30,
  p_plan_code text default 'standard'
) returns uuid language plpgsql security definer set search_path = '' set row_security = off as $$
declare
  actor_id uuid := auth.uid();
  sub_row public.payment_submissions%rowtype;
  base_ts timestamptz;
  existing_exp timestamptz;
  mem_exp timestamptz;
  mem_base timestamptz;
  req_pos text;
  req_extras text[];
  req_aliya boolean;
  req_packs integer;
  req_days integer;
  req_months integer;
  cur_lic public.school_licenses%rowtype;
begin
  if not smartmaktab_private.is_developer() then raise exception 'super_admin required' using errcode = '42501'; end if;
  if p_decision not in ('verified','rejected') or p_extend_days < 0 or p_extend_days > 3650 then
    raise exception 'invalid payment decision' using errcode = '22023';
  end if;
  select * into sub_row from public.payment_submissions where id = p_payment_id for update;
  if not found then raise exception 'payment not found' using errcode = '55000'; end if;
  if sub_row.status <> 'pending' then raise exception 'payment already reviewed' using errcode = '55000'; end if;
  update public.payment_submissions
  set status = p_decision, review_note = left(coalesce(p_review_note, ''), 400), reviewed_by = actor_id, reviewed_at = now()
  where id = sub_row.id;

  req_days := case
    when p_extend_days <= 0 then 0
    when p_extend_days <> 30 then p_extend_days
    else coalesce(nullif((sub_row.ocr_payload ->> 'expected_days')::integer, 0), p_extend_days)
  end;
  req_months := case
    when p_extend_days <> 30 and p_extend_days > 0 then
      case
        when p_extend_days >= 360 then 12
        when p_extend_days >= 260 then 9
        when p_extend_days >= 175 then 6
        when p_extend_days >= 85 then 3
        else greatest(1, round(p_extend_days / 30.0)::integer)
      end
    else coalesce(nullif((sub_row.ocr_payload ->> 'months')::integer, 0), greatest(1, round(req_days / 30.0)::integer))
  end;

  if p_decision = 'verified' and req_days > 0 then
    select * into cur_lic from public.school_licenses where organization_id = sub_row.organization_id;
    existing_exp := cur_lic.expires_at;
    base_ts := greatest(now(), coalesce(existing_exp, now()));
    req_pos := nullif(btrim(coalesce(sub_row.ocr_payload ->> 'primary_position', '')), '');
    req_aliya := coalesce(sub_row.include_aliya, (sub_row.ocr_payload ->> 'include_aliya')::boolean, false);
    req_packs := greatest(0, coalesce(sub_row.storage_pack_count, (sub_row.ocr_payload ->> 'storage_pack_count')::integer, 0));
    select coalesce(array_agg(x), '{}'::text[])
    into req_extras
    from jsonb_array_elements_text(coalesce(sub_row.ocr_payload -> 'extra_positions', '[]'::jsonb)) as x
    where exists (select 1 from public.role_tariffs rt where rt.position_code = x);

    perform public.admin_set_license(
      sub_row.organization_id,
      'active',
      coalesce(nullif(btrim(sub_row.plan_code), ''), nullif(btrim(p_plan_code), ''), 'standard'),
      base_ts + make_interval(days => req_days),
      30,
      p_review_note,
      greatest(coalesce(cur_lic.max_accounts, 1), 1),
      greatest(coalesce(cur_lic.max_positions_per_account, 1), 1 + coalesce(array_length(req_extras, 1), 0)),
      greatest(coalesce(cur_lic.default_max_devices, 2), 2)
    );

    select subscription_expires_at into mem_exp
    from public.school_memberships
    where user_id = sub_row.submitted_by and organization_id = sub_row.organization_id;
    mem_base := greatest(now(), coalesce(mem_exp, now()));

    update public.school_memberships
    set primary_position = coalesce(primary_position, req_pos),
        extra_positions = case
          when coalesce(primary_position, req_pos) is null then extra_positions
          else (
            select coalesce(array_agg(distinct val order by val), '{}'::text[])
            from unnest(coalesce(extra_positions, '{}'::text[]) || req_extras) as val
            where val <> coalesce(primary_position, req_pos)
          )
        end,
        max_extra_positions = greatest(
          max_extra_positions,
          (
            select coalesce(count(distinct val)::integer, 0)
            from unnest(coalesce(extra_positions, '{}'::text[]) || req_extras) as val
            where val <> coalesce(primary_position, req_pos)
          )
        ),
        max_devices = least(40, greatest(
          max_devices,
          (1 + (
            select coalesce(count(distinct val)::integer, 0)
            from unnest(coalesce(extra_positions, '{}'::text[]) || req_extras) as val
            where val <> coalesce(primary_position, req_pos)
          )) * 2
        )),
        aliya_enabled = aliya_enabled or req_aliya,
        aliya_expires_at = case
          when req_aliya then greatest(coalesce(aliya_expires_at, now()), now()) + make_interval(days => req_days)
          else aliya_expires_at
        end,
        storage_pack_count = greatest(storage_pack_count, req_packs),
        storage_pack_expires_at = case
          when req_packs > 0 then greatest(coalesce(storage_pack_expires_at, now()), now()) + make_interval(days => req_days)
          else storage_pack_expires_at
        end,
        subscription_status = 'active',
        subscription_months = req_months,
        subscription_expires_at = mem_base + make_interval(days => req_days)
    where user_id = sub_row.submitted_by and organization_id = sub_row.organization_id;
  end if;
  return sub_row.id;
end;
$$;

create or replace function public.get_my_workspace_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set row_security = off
as $$
declare
  actor_id uuid := auth.uid();
  prof jsonb;
  roles jsonb;
  doc_quota jsonb;
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'full_name', coalesce(full_name, ''),
    'preferred_lang', coalesce(preferred_lang, 'tg'),
    'login_name', coalesce(login_name, ''),
    'profile_details', coalesce(profile_details, '{}'::jsonb)
  ) into prof from public.user_profiles where user_id = actor_id;

  doc_quota := smartmaktab_private.user_document_quota(actor_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'membership_id', m.id,
    'organization_id', m.organization_id,
    'organization_name', o.name,
    'organization_verification_status', o.verification_status,
    'kind', o.kind,
    'authority_tier', o.authority_tier,
    'region_name', o.region_name,
    'district_name', o.district_name,
    'jamoat_name', o.jamoat_name,
    'village_name', o.village_name,
    'school_code', o.school_code,
    'role', m.role,
    'primary_position', m.primary_position,
    'extra_positions', m.extra_positions,
    'max_extra_positions', m.max_extra_positions,
    'max_devices', m.max_devices,
    'account_active', m.account_active,
    'verification_status', m.verification_status,
    'verification_note', m.verification_note,
    'verified_at', m.verified_at,
    'requested_at', m.requested_at,
    'subscription_status', case
      when m.subscription_expires_at is not null and m.subscription_expires_at < now() then 'expired'
      else m.subscription_status
    end,
    'subscription_months', m.subscription_months,
    'subscription_expires_at', m.subscription_expires_at,
    'subscription_days_left', case
      when m.subscription_expires_at is null then null
      else greatest(0, ceil(extract(epoch from (m.subscription_expires_at - now())) / 86400.0)::integer)
    end,
    'aliya_enabled', m.aliya_enabled,
    'aliya_expires_at', m.aliya_expires_at,
    'storage_pack_count', m.storage_pack_count,
    'storage_pack_expires_at', m.storage_pack_expires_at,
    'custom_method_name', m.custom_method_name,
    'position_profiles', m.position_profiles,
    'active_devices_count', (
      select count(*)::integer from public.user_device_sessions ds
      where ds.user_id = m.user_id and ds.organization_id = m.organization_id and ds.is_active = true
    ),
    'active_mobile_count', (
      select count(*)::integer from public.user_device_sessions ds
      where ds.user_id = m.user_id and ds.organization_id = m.organization_id and ds.is_active = true and ds.device_kind = 'mobile'
    ),
    'active_desktop_count', (
      select count(*)::integer from public.user_device_sessions ds
      where ds.user_id = m.user_id and ds.organization_id = m.organization_id and ds.is_active = true and ds.device_kind = 'desktop'
    )
  ) order by o.name, o.id), '[]'::jsonb)
  into roles
  from public.school_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = actor_id;

  return jsonb_build_object(
    'user_id', actor_id,
    'is_super_admin', smartmaktab_private.is_developer(),
    'profile', coalesce(prof, jsonb_build_object('full_name', '', 'preferred_lang', 'tg', 'login_name', '', 'profile_details', '{}'::jsonb)),
    'document_quota', doc_quota,
    'memberships', roles
  );
end;
$$;

-- 8. Grants
revoke all on function
  smartmaktab_private.user_document_quota(uuid),
  public.admin_list_document_catalog(),
  public.admin_upsert_document_category(uuid, text[], text, text, text, integer, boolean),
  public.admin_delete_document_category(uuid),
  public.admin_upsert_document_subcategory(uuid, uuid, text, text, integer, boolean),
  public.admin_delete_document_subcategory(uuid),
  public.admin_upsert_document_template(uuid, uuid, uuid, text[], text, text, text, text, jsonb, text, text, text, text, boolean, text, integer, text, jsonb),
  public.admin_delete_document_template(uuid),
  public.get_position_document_library(text, uuid),
  public.create_user_document_folder(text),
  public.rename_user_document_folder(uuid, text),
  public.delete_user_document_folder(uuid),
  public.toggle_user_document_favorite(uuid, boolean),
  public.copy_template_to_user_folder(uuid, uuid, text),
  public.remove_user_document_item(uuid),
  public.save_user_document_draft(uuid, uuid, text, text, text, integer),
  public.reset_user_document_draft(uuid),
  public.log_document_print(uuid, uuid, uuid, text, text),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[], boolean, integer, integer)
from public, anon, authenticated, service_role;

grant execute on function
  public.admin_list_document_catalog(),
  public.admin_upsert_document_category(uuid, text[], text, text, text, integer, boolean),
  public.admin_delete_document_category(uuid),
  public.admin_upsert_document_subcategory(uuid, uuid, text, text, integer, boolean),
  public.admin_delete_document_subcategory(uuid),
  public.admin_upsert_document_template(uuid, uuid, uuid, text[], text, text, text, text, jsonb, text, text, text, text, boolean, text, integer, text, jsonb),
  public.admin_delete_document_template(uuid),
  public.get_position_document_library(text, uuid),
  public.create_user_document_folder(text),
  public.rename_user_document_folder(uuid, text),
  public.delete_user_document_folder(uuid),
  public.toggle_user_document_favorite(uuid, boolean),
  public.copy_template_to_user_folder(uuid, uuid, text),
  public.remove_user_document_item(uuid),
  public.save_user_document_draft(uuid, uuid, text, text, text, integer),
  public.reset_user_document_draft(uuid),
  public.log_document_print(uuid, uuid, uuid, text, text),
  public.submit_payment_receipt(uuid, text, text, numeric, text, text, numeric, jsonb, text, text, boolean, text, text, text[], boolean, integer, integer)
to authenticated, service_role;
