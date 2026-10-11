-- Стартовый экран закупок: пометка тестовых строк (КП, неразобранные
-- письма, поставки), чтобы на демо не путать их с живыми данными.
-- Аддитивно: default false, старый код колонку не читает.

alter table supplier_offer_quotes
  add column if not exists is_test boolean not null default false;

alter table unmatched_incoming_emails
  add column if not exists is_test boolean not null default false;

alter table purchase_deliveries
  add column if not exists is_test boolean not null default false;

comment on column supplier_offer_quotes.is_test is
  'Тестовое КП для демо стартового экрана закупок; в сравнении цен не участвует.';
comment on column unmatched_incoming_emails.is_test is
  'Тестовое неразобранное письмо для демо стартового экрана закупок.';
comment on column purchase_deliveries.is_test is
  'Тестовая поставка для демо стартового экрана закупок.';

notify pgrst, 'reload schema';
