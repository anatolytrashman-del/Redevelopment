-- Владелец, 2026-09-20: блок «Информация о здании» на карточке БЦ почти
-- целиком собран из одного источника (technical_params — прямой парсинг
-- prometr.by), это риск выглядеть как копирование одного сайта. Просьба:
-- "сделай единую базу данных о здании, а мы в неё соберём инфу о здании из
-- разных источников" (Kufar, Realt.by, пресса и т.п.).
--
-- В отличие от technical_params (одна карточка prometr.by = один источник,
-- группами по корпусу, см. 20260916-bc-structured-tech-params.sql) —
-- building_facts плоский список ОТДЕЛЬНЫХ фактов, у каждого свой источник и
-- ссылка (BuildingFact в src/data/businessCenters.ts). Пилот — «Centropol».

alter table public.business_centers
  add column if not exists building_facts jsonb;

comment on column public.business_centers.building_facts is
  'Техфакты о здании из источников, отличных от prometr.by (Kufar, Realt.by, пресса и т.п.) — плоский список, у каждого факта свой источник/ссылка. Не путать с technical_params (парсинг prometr.by).';

notify pgrst, 'reload schema';
