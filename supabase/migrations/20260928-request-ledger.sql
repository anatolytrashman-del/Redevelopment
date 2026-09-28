-- Закупка по ведомости (владелец, 2026-09-28: «нужно перепридумать отправку»).
-- Запрос цен рождается из ведомости, а не из категории: строка
-- supplier_research_requests становится «закупкой», и сравнение берёт
-- позиции из её ведомости (могут быть из разных разделов сметы), а не из
-- одного раздела (section_id). null — обычная категория, как раньше.
alter table supplier_research_requests
  add column if not exists ledger_id uuid references material_ledgers(id) on delete set null;

notify pgrst, 'reload schema';
