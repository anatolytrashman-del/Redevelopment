-- tenant_count — число организаций в здании отдельной колонкой.
--
-- Зачем: публичные списки БЦ (каталог, хабы, рейтинги, гид, аналитика,
-- избранное) тянули business_centers целиком — 969 КБ сжатых на КАЖДУЮ
-- страницу, и 266 КБ из них приходилось на одну колонку
-- tenant_organizations. Спискам сам список арендаторов не нужен нигде,
-- кроме одного сравнения «компаний-арендаторов в здании против медианы по
-- классу» на карточке БЦ (src/lib/businessCenterMarketPosition.ts) — а для
-- него достаточно числа.
--
-- generated always: базa пересчитывает колонку при каждой записи
-- tenant_organizations, разойтись с ней не может (в отличие от колонки,
-- которую надо помнить обновлять). jsonb_array_length иммутабельна — для
-- generated column годится.
alter table business_centers
  add column if not exists tenant_count integer
  generated always as (coalesce(jsonb_array_length(tenant_organizations), 0)) stored;

notify pgrst, 'reload schema';
