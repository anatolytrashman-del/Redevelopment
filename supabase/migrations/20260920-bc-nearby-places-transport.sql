-- Инфраструктура рядом: расширяем снимок с «500 метров вокруг» до
-- транспорта на реальном расстоянии пешей доступности.
--
-- Почему проверка 0..500 больше не годится: метро и остановки владелец
-- попросил сделать обязательной частью блока, а станция метро в 500 м от
-- здания в Минске скорее исключение (медиана по каталогу — около километра).
-- Со старым ограничением строка метро просто не записывалась бы, и блок
-- молча остался бы без главного пункта. Радиусы по категориям задаёт
-- scripts/sync-bc-nearby-places.mjs (метро 2000 м, остановки 800 м,
-- магазины и сервисы 500 м), в схеме — только верхняя граница здравого
-- смысла, чтобы в таблицу не попали точки из другого города.
alter table public.business_center_nearby_places
  drop constraint if exists business_center_nearby_places_distance_meters_check;

alter table public.business_center_nearby_places
  add constraint business_center_nearby_places_distance_meters_check
  check (distance_meters between 0 and 3000);

comment on column public.business_center_nearby_places.distance_meters is
  'Расстояние по прямой от здания, метры. Радиус зависит от категории: метро до 2000, остановки до 800, остальное до 500';

comment on column public.business_center_nearby_places.source is
  'Источник точки: yandex_maps (Places API / геокодер) или 2gis (пилот 2026-09-18)';

notify pgrst, 'reload schema';
