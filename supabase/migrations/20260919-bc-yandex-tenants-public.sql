-- Публичный доступ к яндексовскому срезу арендаторов: ровно те колонки,
-- которые рисует карточка БЦ. id и address_query (поисковая строка, по
-- которой снимали срез) остаются внутренними, как и у 2GIS-снапшота.
grant select (business_center_slug, source, source_url, organizations, organization_count, captured_at)
  on public.business_center_tenant_source_snapshots to anon;

drop policy if exists anon_select on public.business_center_tenant_source_snapshots;
create policy anon_select on public.business_center_tenant_source_snapshots
  for select to anon using (true);

-- Городской срез по рубрикам Яндекса. Сознательно НЕ по отраслям: карта
-- "рубрика -> отрасль" живёт в src/lib/tenantCategories.ts, и вторая её
-- копия в SQL — ровно тот файл-близнец, от которого предостерегает
-- CLAUDE.md. SQL считает сырые рубрики как есть (чистка рубрики
-- детерминирована от строки, поэтому свернуть их в отрасли на клиенте —
-- то же самое, что свернуть до агрегации).
create table if not exists public.business_center_tenant_city_categories (
  id boolean primary key default true check (id),
  categories jsonb not null default '[]'::jsonb,
  org_total integer not null default 0,
  building_total integer not null default 0,
  computed_at timestamptz
);

alter table public.business_center_tenant_city_categories enable row level security;
drop policy if exists anon_select on public.business_center_tenant_city_categories;
create policy anon_select on public.business_center_tenant_city_categories
  for select to anon using (true);
grant select on public.business_center_tenant_city_categories to anon;

create or replace function public.refresh_bc_tenant_city_categories() returns void
language sql
security definer
set search_path to 'public'
as $function$
  with orgs as (
    select s.business_center_slug as slug,
           coalesce(org->>'category', '') as category
    from business_center_tenant_source_snapshots s
    cross join lateral jsonb_array_elements(s.organizations) org
    where s.source = 'yandex_maps' and jsonb_typeof(s.organizations) = 'array'
  ),
  by_category as (
    select category, count(*)::int as org_count, count(distinct slug)::int as building_count
    from orgs
    group by category
  )
  insert into business_center_tenant_city_categories as p (id, categories, org_total, building_total, computed_at)
  select
    true,
    -- Компактные тройки [рубрика, организаций, зданий] вместо объектов с
    -- ключами: строка отдаётся целиком на каждую карточку БЦ, а рубрик
    -- полторы тысячи — на ключах "category"/"orgCount"/"buildingCount"
    -- ответ вырастает почти вдвое на ровном месте.
    coalesce(
      (select jsonb_agg(jsonb_build_array(category, org_count, building_count)
                        order by org_count desc, category)
       from by_category),
      '[]'::jsonb),
    (select count(*) from orgs)::int,
    (select count(distinct slug) from orgs)::int,
    now()
  on conflict (id) do update
    set categories = excluded.categories,
        org_total = excluded.org_total,
        building_total = excluded.building_total,
        computed_at = excluded.computed_at;
$function$;

revoke all on function public.refresh_bc_tenant_city_categories() from public, anon, authenticated;
grant execute on function public.refresh_bc_tenant_city_categories() to service_role;

select public.refresh_bc_tenant_city_categories();

NOTIFY pgrst, 'reload schema';

-- Supabase раздаёт новым таблицам в public полный набор прав для anon и
-- authenticated через default privileges — у business_center_tenant_city_categories
-- он оказался ALL, несмотря на явный grant select в миграции. Записи и так не
-- проходят (RLS пускает только select), но держать выданный INSERT/UPDATE/
-- DELETE рядом с единственной политикой на чтение — ровно та же ловушка, что
-- была с revoke ... from anon вместо public у auto_reply_apply: права есть,
-- и защищает только одна строчка политики. Отзываем всё лишнее явно.
revoke insert, update, delete, truncate, references, trigger
  on public.business_center_tenant_city_categories from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.business_center_tenant_source_snapshots from anon, authenticated;

NOTIFY pgrst, 'reload schema';
