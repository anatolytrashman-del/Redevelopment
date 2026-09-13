-- Ручная верификация категорий поставщика (страница Закупки → вкладка
-- "Верификация"): человек открывает сайт поставщика, сверяет
-- автоматически расставленные категории (supplier_site_snapshots.categories)
-- и подтверждает их. Одобрение — на весь снимок сайта целиком (один хост =
-- одна компания = один набор категорий), поэтому отдельной таблицы по
-- категориям не нужно — колонка ровно того же смысла, что и MarketOffer.reviewed.
ALTER TABLE supplier_site_snapshots ADD COLUMN IF NOT EXISTS categories_verified boolean NOT NULL DEFAULT false;
ALTER TABLE supplier_site_snapshots ADD COLUMN IF NOT EXISTS categories_verified_at timestamptz;

NOTIFY pgrst, 'reload schema';
