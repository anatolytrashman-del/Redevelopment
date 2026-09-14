-- Метрики: верификации, поставленные роботом съёма 2026-09-14, — на баланс
-- ИИ-закупщика. Владелец (вечер 2026-09-14): «все верифицированные сегодня
-- автоматическим образом поставщики на странице метрики идут на баланс
-- ИИ-закупщика».
--
-- Что было: за день scripts/harvest.mjs, verify-harvested.mjs и
-- verify-recognized.mjs проставили verified = true примерно 900 карточкам
-- supplier_research_offers напрямую, в activity_log ни одна из них не
-- попала (логировала только ручная верификация из интерфейса), поэтому на
-- /admin/metrics у ИИ-закупщика лежали только 14 ручных верификаций,
-- переписанных на него утренней миграцией
-- 20260914-ai-buyer-verifications-attribution.sql.
--
-- Точного списка карточек, которые тронул робот, нет (у
-- supplier_research_offers нет updated_at), поэтому число берётся по
-- балансу на момент написания миграции:
--   1074  карточек с verified = true сейчас
--  - 164  supplier_offer_verified в activity_log до 2026-09-14 по Москве
--         (ручная работа прошлых дней, чьи карточки робот не трогал:
--         все три скрипта отмечают только `not verified`)
--  -  14  supplier_offer_verified за 2026-09-14 (ручные, уже за ИИ-закупщиком)
--  = 896  строк.
-- Время — 2026-09-14 12:00:48 UTC (15:00 по Москве), коммит, с которого
-- harvest.mjs начал ставить отметку сам; фактически отметки ставились с этого
-- момента до ~17:00 по Москве, для дневной/недельной/месячной разбивки
-- страницы это одно и то же. Одно и то же время у всех строк — и признак
-- бэкфилла для повторного запуска (см. guard ниже).
--
-- Только INSERT данных, схема не меняется; старый код на проде продолжает
-- работать. Дальше такие строки пишут сами скрипты робота (см.
-- LOG_VERIFIED_SQL / AI_BUYER_NAME в scripts/supply-categories/lib.mjs и
-- harvest.mjs), повторный бэкфилл не понадобится.

insert into public.activity_log (profile_id, profile_name, action, created_at)
select null, 'ИИ-закупщик', 'supplier_offer_verified', timestamptz '2026-09-14 12:00:48+00'
  from generate_series(1, 896)
 where not exists (
   select 1 from public.activity_log
    where profile_name = 'ИИ-закупщик'
      and action = 'supplier_offer_verified'
      and created_at = timestamptz '2026-09-14 12:00:48+00'
 );
