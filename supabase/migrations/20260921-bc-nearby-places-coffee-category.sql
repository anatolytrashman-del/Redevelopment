-- Кафе и рестораны сведены в одну категорию 'cafe' (владелец, 2026-09-21:
-- «кафе и рестораны делай в одну категорию»), кофейни выделены из общего
-- 'cafe' в свою 'coffee' («давай соберем кофейни отдельно»). Разбор повода —
-- жалоба на карточку «Проспекта»: на живой карте видно кучу кафе/ресторанов,
-- а в блоке «Инфраструктура рядом» — единицы (см. docs/session-journal.md,
-- 2026-09-21). Парсер сам оказался не виноват (см. другую правку того же
-- дня — радиус по умолчанию поднят с 500 до 850 м), но заодно объединили
-- категории по просьбе владельца.

alter table public.business_center_nearby_places
  drop constraint if exists business_center_nearby_places_category_check;

alter table public.business_center_nearby_places
  add constraint business_center_nearby_places_category_check
  check (category in (
    'metro', 'transport_stop', 'coffee', 'cafe', 'restaurant', 'grocery', 'shop',
    'pharmacy', 'bank', 'atm', 'fitness', 'other'
  ));
-- 'restaurant' оставлен в списке допустимых значений, чтобы не падать на
-- строках, которые следующая ниже команда почему-то не заденет (гонка с
-- параллельной записью) — приложение всё равно нормализует 'restaurant' в
-- 'cafe' на границе с базой (fromRow в businessCenterNearbyPlacesApi.ts).

-- Кофейни, которых можно распознать по уже сохранённой рубрике источника
-- (subcategory), — сразу в свою категорию, без пересбора.
update public.business_center_nearby_places
  set category = 'coffee'
  where category in ('cafe', 'restaurant') and subcategory ilike '%кофейн%';

-- Остальные рестораны — в общую категорию с кафе.
update public.business_center_nearby_places
  set category = 'cafe'
  where category = 'restaurant';

notify pgrst, 'reload schema';
