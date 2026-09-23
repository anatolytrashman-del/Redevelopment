-- Каталог торговых центров Минска живёт в той же таблице, что и каталог БЦ
-- (2026-09-23): те же поля, те же спутниковые таблицы по slug (отзывы,
-- инфраструктура, арендаторы 2GIS/Яндекса, объявления) и те же скрипты
-- сбора. Отличает их только kind: 'bc' — бизнес-центр, 'tc' — торговый центр.
--
-- Все публичные выборки каталога БЦ фильтруют kind = 'bc' (API, генератор
-- данных сборки, sitemap, пререндер, офисная аналитика). Поэтому ТЦ можно
-- заводить в базу, только когда этот фильтр уже выехал на прод, — иначе
-- торговый центр попадёт в рейтинги и хабы бизнес-центров.
--
-- retail_format — формат торгового объекта (ТРЦ, ТЦ, универмаг, рынок…),
-- у ТЦ он играет роль делового класса БЦ. У бизнес-центров пустой.

alter table public.business_centers
  add column if not exists kind text not null default 'bc';

alter table public.business_centers
  drop constraint if exists business_centers_kind_check;
alter table public.business_centers
  add constraint business_centers_kind_check check (kind in ('bc', 'tc'));

alter table public.business_centers
  add column if not exists retail_format text;

create index if not exists business_centers_kind_idx on public.business_centers (kind);

notify pgrst, 'reload schema';
