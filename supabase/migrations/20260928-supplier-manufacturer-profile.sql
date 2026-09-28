-- Профиль поставщика для прямых запросов на завод (тред «Закупки», 2026-09-28).
-- supplier_kind: manufacturer — делает сам; brand_owner — владелец/эксклюзивный
-- дистрибьютор марки (СТМ); dealer — дилер/перепродавец; retail — магазин.
-- own_brands — свои марки, линейки и коллекции; article_prefixes — приставки
-- артикулов (SMG, SKT…); product_kinds — что производит; resold_brands — чужие
-- марки, которые компания только продаёт (к ней как к заводу не вести).
alter table suppliers
  add column if not exists supplier_kind text
    check (supplier_kind in ('manufacturer', 'brand_owner', 'dealer', 'retail')),
  add column if not exists own_brands text[] not null default '{}',
  add column if not exists article_prefixes text[] not null default '{}',
  add column if not exists product_kinds text[] not null default '{}',
  add column if not exists resold_brands text[] not null default '{}',
  add column if not exists profile_note text,
  add column if not exists profiled_at timestamptz;

notify pgrst, 'reload schema';
