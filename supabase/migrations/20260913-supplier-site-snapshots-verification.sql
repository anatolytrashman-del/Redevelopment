-- Ручная верификация категорий поставщика (страница Закупки → вкладка
-- "Верификация"): человек открывает сайт поставщика, сверяет
-- автоматически расставленные категории (supplier_site_snapshots.categories)
-- и подтверждает их. Одобрение — на весь снимок сайта целиком (один хост =
-- одна компания = один набор категорий), поэтому отдельной таблицы по
-- категориям не нужно — колонка ровно того же смысла, что и MarketOffer.reviewed.
--
-- СУПЕРСЕДЕНО тем же днём: владелец попросил другую механику вкладки — без
-- ручной правки списка категорий, «Верифицировать» вместо этого переиспользует
-- уже существующее supplier_research_offers.verified (см.
-- src/components/suppliers/SupplierVerificationTab.tsx). Код эти две колонки
-- больше не читает и не пишет; сами колонки оставлены как есть (DROP COLUMN
-- сразу после уже опубликованного кода рискует окном рассинхронизации между
-- миграцией и ещё не доехавшим до прода деплоем) — см. комментарий в
-- src/data/supplierSiteSnapshots.ts.
ALTER TABLE supplier_site_snapshots ADD COLUMN IF NOT EXISTS categories_verified boolean NOT NULL DEFAULT false;
ALTER TABLE supplier_site_snapshots ADD COLUMN IF NOT EXISTS categories_verified_at timestamptz;

NOTIFY pgrst, 'reload schema';
