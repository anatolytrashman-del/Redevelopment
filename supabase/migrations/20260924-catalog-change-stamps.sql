-- Отметки изменений для таблиц, из которых сборка собирает данные раздела БЦ
-- (scripts/generate-catalog-data.mjs), 2026-09-24. Большинство прод-сборок —
-- мержи кода, а не правки данных, и каждая заново качала из базы весь каталог
-- (~12 МБ). Теперь сборка сравнивает эти отметки с теми, что лежат на проде
-- (/data/catalog-stamps.json), и при совпадении копирует данные с прода.
-- Механика та же, что в 20260924-table-change-stamps.sql; anon читает только
-- отметки этих таблиц — сборка ходит с публичным ключом.
do $$
declare
  t text;
begin
  foreach t in array array[
    'business_centers', 'business_center_offers', 'business_center_review_snapshots',
    'business_center_nearby_places', 'business_center_2gis_snapshots',
    'business_center_tenant_source_snapshots', 'business_center_tenant_city_categories',
    'market_snapshots', 'external_metrics'
  ]
  loop
    execute format('drop trigger if exists trg_table_change_stamp on public.%I', t);
    execute format(
      'create trigger trg_table_change_stamp after insert or update or delete on public.%I
         for each statement execute function public.touch_table_change_stamp()', t);
    insert into public.table_change_stamps (table_name) values (t) on conflict do nothing;
  end loop;
end;
$$;

drop policy if exists anon_read_catalog on public.table_change_stamps;
create policy anon_read_catalog on public.table_change_stamps for select to anon
  using (table_name in (
    'business_centers', 'business_center_offers', 'business_center_review_snapshots',
    'business_center_nearby_places', 'business_center_2gis_snapshots',
    'business_center_tenant_source_snapshots', 'business_center_tenant_city_categories',
    'market_snapshots', 'external_metrics'
  ));
grant select on public.table_change_stamps to anon;

NOTIFY pgrst, 'reload schema';
