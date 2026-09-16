-- Б9 из docs/bc-catalog-redesign-plan.md: организации 2GIS внутри здания БЦ и
-- городской профиль отраслей для сравнения на карточке.
--
-- Сами организации лежат в уже существующих колонках
-- business_center_2gis_snapshots.tenant_organizations/_total/_fetched;
-- добавляется только дата сбора (у снепшота есть общий fetched_at, но он про
-- карточку организации-БЦ, а не про список арендаторов — собираются они
-- разными прогонами и расходятся по времени).

alter table public.business_center_2gis_snapshots
  add column if not exists tenant_organizations_fetched_at timestamptz;

grant select (tenant_organizations_fetched_at) on public.business_center_2gis_snapshots to anon;
grant select (tenant_organizations_fetched_at), insert (tenant_organizations_fetched_at),
      update (tenant_organizations_fetched_at) on public.business_center_2gis_snapshots to authenticated;

-- Городской профиль — одна строка на весь город: сколько организаций каждой
-- отрасли сидит в наших БЦ (для сравнения "в этом здании юристов вдвое
-- больше, чем в среднем по БЦ Минска").
--
-- Отрасль НЕ вычисляется эвристикой по названию рубрики: у 2GIS есть свои
-- 28 "общих рубрик" (general_rubric, /2.0/catalog/rubric/list), и у каждой
-- рубрики организации parent_id указывает ровно на одну из них — проверено
-- на живой выдаче, исключений нет. Поэтому и здесь, и на фронте отрасль —
-- это id общей рубрики 2GIS, который скрипт кладёт в поле industry каждой
-- организации; в базе только счёт, никакой классификации (см. CLAUDE.md про
-- файлы-близнецы: делить правило между SQL и TS было бы нечем).
create table if not exists public.business_center_tenant_city_profile (
  id boolean primary key default true check (id),
  industries jsonb not null default '[]'::jsonb,
  org_total integer not null default 0,
  building_total integer not null default 0,
  computed_at timestamptz not null default now()
);

alter table public.business_center_tenant_city_profile enable row level security;

drop policy if exists anon_select on public.business_center_tenant_city_profile;
create policy anon_select on public.business_center_tenant_city_profile for select to anon using (true);

drop policy if exists authenticated_all on public.business_center_tenant_city_profile;
create policy authenticated_all on public.business_center_tenant_city_profile for all to authenticated using (true) with check (true);

grant select on public.business_center_tenant_city_profile to anon;
grant select, insert, update, delete on public.business_center_tenant_city_profile to authenticated;

-- Пересчёт профиля после сбора организаций (scripts/sync-2gis-tenants.mjs).
create or replace function public.refresh_bc_tenant_city_profile()
returns void
language sql
security definer
set search_path = public
as $fn$
  with orgs as (
    select s.business_center_slug as slug,
           coalesce(nullif(org->>'industry', ''), 'other') as industry
    from business_center_2gis_snapshots s
    cross join lateral jsonb_array_elements(s.tenant_organizations) org
    where jsonb_typeof(s.tenant_organizations) = 'array'
  ),
  by_industry as (
    select industry, count(*)::int as org_count, count(distinct slug)::int as building_count
    from orgs
    group by industry
  )
  insert into business_center_tenant_city_profile as p (id, industries, org_total, building_total, computed_at)
  select
    true,
    coalesce(
      (select jsonb_agg(jsonb_build_object('industry', industry, 'orgCount', org_count, 'buildingCount', building_count)
                        order by org_count desc, industry)
       from by_industry),
      '[]'::jsonb),
    (select count(*) from orgs)::int,
    (select count(distinct slug) from orgs)::int,
    now()
  on conflict (id) do update
    set industries = excluded.industries,
        org_total = excluded.org_total,
        building_total = excluded.building_total,
        computed_at = excluded.computed_at;
$fn$;

-- EXECUTE на функции Postgres выдаёт роли PUBLIC при создании, а anon/
-- authenticated его наследуют — отзывать нужно именно у public (см. CLAUDE.md).
revoke all on function public.refresh_bc_tenant_city_profile() from public, anon, authenticated;
grant execute on function public.refresh_bc_tenant_city_profile() to service_role;

notify pgrst, 'reload schema';
