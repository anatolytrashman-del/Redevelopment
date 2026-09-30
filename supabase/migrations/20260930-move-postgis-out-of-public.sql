-- Supabase security advisor, 2026-09-27: rls_disabled_in_public на
-- public.spatial_ref_sys. Это служебная таблица PostGIS (8500 строк —
-- справочник систем координат EPSG), владелец supabase_admin: включить на
-- ней RLS или отозвать права у anon мы не можем («must be owner», REVOKE
-- молча ничего не делает). Через REST её можно было читать, дописывать,
-- править и удалять под публичным ключом; удаление строки 4326 сломало бы
-- любые пространственные функции.
--
-- Лечение, которое рекомендует сам Supabase, — держать PostGIS не в public,
-- а в схеме extensions, которую PostgREST не отдаёт. PostGIS не
-- переносится ALTER EXTENSION ... SET SCHEMA (relocatable = false), поэтому
-- пересоздаём расширение. Геометрия есть только в minsk_microdistricts
-- (37 строк, polygon/centroid, SRID 4326); функции, представления и код
-- сайта на PostGIS не опираются (проверено по pg_proc/pg_views и grep).
-- Геометрию сохраняем как EWKT и восстанавливаем после пересоздания.

begin;

create temp table _mm_geom on commit drop as
  select id, st_asewkt(polygon) as polygon_ewkt, st_asewkt(centroid) as centroid_ewkt
  from public.minsk_microdistricts;

drop extension postgis cascade;  -- уносит и колонки polygon/centroid
create schema if not exists extensions;
create extension postgis with schema extensions;

alter table public.minsk_microdistricts
  add column polygon extensions.geometry(Polygon, 4326),
  add column centroid extensions.geometry(Point, 4326);

update public.minsk_microdistricts m
set polygon  = extensions.st_geomfromewkt(g.polygon_ewkt),
    centroid = case when g.centroid_ewkt is null then null
                    else extensions.st_geomfromewkt(g.centroid_ewkt) end
from _mm_geom g
where g.id = m.id;

alter table public.minsk_microdistricts alter column polygon set not null;

commit;

notify pgrst, 'reload schema';
