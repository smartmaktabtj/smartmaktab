-- Stage 2.5 DB cleanup:
-- Remove invalid synthetic 'Маркази ш. Душанбе' territory rows and its unused authority organization,
-- keeping the 4 official Dushanbe districts ('Исмоили Сомонӣ', 'Сино', 'Фирдавсӣ', 'Шоҳмансур').

delete from public.tajikistan_locations
where btrim(district_name) = 'Маркази ш. Душанбе'
   or lower(btrim(district_name)) = lower('Маркази ш. Душанбе');

delete from public.organizations o
where o.kind = 'education_authority'
  and (
    btrim(coalesce(o.district_name, '')) = 'Маркази ш. Душанбе'
    or o.id = '8f0f0e50-44e1-4a9d-b4c6-d28affe06cdf'::uuid
  )
  and not exists (
    select 1 from public.organizations c where c.parent_id = o.id
  )
  and not exists (
    select 1 from public.school_memberships m where m.organization_id = o.id
  );
