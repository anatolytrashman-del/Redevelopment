-- Д1/Д2 плана docs/bc-catalog-redesign-plan.md — структурные колонки БЦ.
--
-- Зачем: каталог /minsk/bcminsk фильтруется только по осям, которые лежат
-- отдельными колонками (класс, район, метро). Всё остальное — планировка,
-- парковка, кондиционирование, потолки, УК/ТС, свободные площади,
-- инфраструктура — хранится строками label/value в technical_params
-- (разбор карточек prometr.by), по ним нельзя ни отфильтровать, ни
-- отсортировать, ни посчитать медиану класса. Здесь разбираем их один раз
-- в колонки; сам jsonb остаётся источником и показывается на карточке БЦ
-- с атрибуцией «по данным prometr.by».
--
-- Разбор делает ТРИГГЕР, а не разовый скрипт: technical_params правятся
-- руками в админке (BusinessCentersAdminTab), и производные колонки должны
-- пересчитываться вместе с ними, иначе фильтр в каталоге начнёт врать
-- молча.
--
-- Оговорки, выведенные по фактическим 143 строкам (2026-09-16):
--  * многокорпусные комплексы (2 БЦ из 143 — Riviera Plaza, Парк Плаза)
--    дают несколько групп params; числовые параметры берём МАКСИМУМ по
--    корпусам (не сумму — на prometr.by площади корпусов местами уже
--    комплексные, сумма дала бы двойной счёт), списки — объединение;
--  * высота потолков приходит и как «2.7», и как «2,7», и как «от 3,5 м»;
--    значения вне 2–6 м считаем ошибкой источника и не записываем (у
--    «Титула» стоит «1.0»);
--  * «Свободные площади» у 113 из 143 — «подлежат уточнению», это не
--    ноль и не диапазон: пишем NULL;
--  * «Система кондиционирования» в данных бывает только «Нет»/«Частично»,
--    вариант «Да» разбираем на будущее.

alter table public.business_centers
  add column if not exists floor_plate_area numeric,
  add column if not exists office_area numeric,
  add column if not exists layout_types text[],
  add column if not exists elevators integer,
  add column if not exists parking_ratio numeric,
  add column if not exists air_conditioning text,
  add column if not exists ceiling_height numeric,
  add column if not exists management_type text,
  add column if not exists metro_distance_bucket text,
  add column if not exists free_space_min numeric,
  add column if not exists free_space_max numeric,
  add column if not exists infra_internal text[],
  add column if not exists infra_nearby text[],
  -- Д2: координаты здания. Источник — business_center_2gis_snapshots.point
  -- (есть у всех 143), но та таблица закрыта для anon, а карта каталога и
  -- «соседи» на карточке БЦ нужны публично.
  add column if not exists lat numeric,
  add column if not exists lng numeric;

create or replace function public.business_centers_derive_tech()
returns trigger
language plpgsql
as $$
declare
  d record;
begin
  select
    max(case when label = 'Площадь типового этажа' then num end) as floor_plate_area,
    max(case when label = 'Площадь офисов' then num end) as office_area,
    max(case when label = 'Количество лифтов' then num end) as elevators,
    max(case when label = 'Обеспеченность парковкой (маш./100 м²)' then num end) as parking_ratio,
    max(case when label = 'Высота потолков типового этажа, м' then num end) as ceiling_height,
    max(case when label = 'Система кондиционирования' then value end) as ac_raw,
    max(case when label = 'Управление БЦ' then value end) as management_raw,
    max(case when label = 'Удалённость от метро' then value end) as metro_raw,
    -- у многокорпусных берём корпус с РЕАЛЬНЫМ диапазоном: «подлежат
    -- уточнению» лексикографически больше любых цифр, и max() по всем
    -- значениям съедал бы диапазон (так терялась Riviera Plaza)
    max(case when label = 'Свободные площади' and value ~ '^[0-9]' then value end) as free_raw,
    string_agg(case when label = 'Тип планировки' then value end, ',') as layout_raw,
    string_agg(case when label = 'Внутренняя инфраструктура' then value end, ',') as infra_internal_raw,
    string_agg(case when label = 'Инфраструктура в шаговой доступности' then value end, ',') as infra_nearby_raw
  into d
  from (
    select
      trim(pp->>'label') as label,
      trim(pp->>'value') as value,
      -- первое число в строке: «600 м²» → 600, «2,7» → 2.7, «от 3,5 м» → 3.5
      nullif(substring(replace(trim(pp->>'value'), ',', '.') from '[0-9]+(?:\.[0-9]+)?'), '')::numeric as num
    from jsonb_array_elements(coalesce(new.technical_params, '[]'::jsonb)) g,
         jsonb_array_elements(coalesce(g->'params', '[]'::jsonb)) pp
  ) s;

  new.floor_plate_area := d.floor_plate_area;
  new.office_area := d.office_area;
  new.elevators := d.elevators::integer;
  new.parking_ratio := d.parking_ratio;
  new.ceiling_height := case when d.ceiling_height between 2 and 6 then d.ceiling_height end;

  new.air_conditioning := case
    when d.ac_raw is null then null
    when lower(d.ac_raw) like 'нет%' then 'none'
    when lower(d.ac_raw) like 'частич%' then 'partial'
    when lower(d.ac_raw) like 'да%' or lower(d.ac_raw) like 'есть%' then 'full'
  end;

  new.management_type := case
    when d.management_raw is null then null
    when lower(d.management_raw) like 'товарищество%' then 'hoa'
    when lower(d.management_raw) like 'единая%' then 'single_uk'
  end;

  -- «до 3х остановок» пишется кириллической «х», «более 3x остановок» —
  -- латинской «x»; сравниваем по началу строки, не по целой фразе.
  new.metro_distance_bucket := case
    when d.metro_raw is null then null
    when lower(d.metro_raw) like 'шагов%' then 'walking'
    when lower(d.metro_raw) like 'до 3%' then 'up_to_3_stops'
    when lower(d.metro_raw) like 'более 3%' then 'over_3_stops'
  end;

  if d.free_raw ~ '^[0-9]' then
    new.free_space_min := replace(substring(d.free_raw from '^([0-9]+(?:[.,][0-9]+)?)'), ',', '.')::numeric;
    new.free_space_max := coalesce(
      replace(substring(d.free_raw from '^[0-9]+(?:[.,][0-9]+)?\s*-\s*([0-9]+(?:[.,][0-9]+)?)'), ',', '.')::numeric,
      new.free_space_min
    );
  else
    new.free_space_min := null;
    new.free_space_max := null;
  end if;

  new.layout_types := case when d.layout_raw is null then null else (
    select array_agg(distinct m order by m)
    from (
      select case
        when lower(trim(t)) like 'open%' then 'open_space'
        when lower(trim(t)) like 'кабинет%' then 'cabinet'
        when lower(trim(t)) like 'блоч%' then 'block'
      end as m
      from unnest(string_to_array(d.layout_raw, ',')) t
    ) q
    where m is not null
  ) end;

  new.infra_internal := case when d.infra_internal_raw is null then null else (
    select array_agg(distinct v order by v)
    from (select trim(t) as v from unnest(string_to_array(d.infra_internal_raw, ',')) t) q
    where v <> ''
  ) end;

  new.infra_nearby := case when d.infra_nearby_raw is null then null else (
    select array_agg(distinct v order by v)
    from (select trim(t) as v from unnest(string_to_array(d.infra_nearby_raw, ',')) t) q
    where v <> ''
  ) end;

  return new;
end;
$$;

drop trigger if exists business_centers_derive_tech_trg on public.business_centers;
create trigger business_centers_derive_tech_trg
  before insert or update on public.business_centers
  for each row execute function public.business_centers_derive_tech();

-- Бэкфилл: холостой UPDATE прогоняет триггер по всем 143 строкам.
update public.business_centers set technical_params = technical_params;

-- Д2: координаты из снимка 2GIS (по одному снимку на слаг, point у всех 143).
update public.business_centers bc
set lat = (s.point->>'lat')::numeric,
    lng = (s.point->>'lon')::numeric
from public.business_center_2gis_snapshots s
where s.business_center_slug = bc.slug
  and s.point is not null;

-- Снимок 2GIS пересобирается синком — держим координаты в БЦ в актуальном
-- состоянии тем же способом, что и разбор техпараметров, а не разовым UPDATE.
create or replace function public.business_centers_sync_point()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.point is not null then
    update public.business_centers
      set lat = (new.point->>'lat')::numeric,
          lng = (new.point->>'lon')::numeric
      where slug = new.business_center_slug;
  end if;
  return new;
end;
$$;

drop trigger if exists business_centers_sync_point_trg on public.business_center_2gis_snapshots;
create trigger business_centers_sync_point_trg
  after insert or update of point on public.business_center_2gis_snapshots
  for each row execute function public.business_centers_sync_point();

notify pgrst, 'reload schema';
