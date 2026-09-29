-- Массовая рассылка подрядчикам: несколько вложений в одном письме.
-- Владелец, 2026-09-29, рассылка по ВРУ/ЩЭ/стоякам: четыре PDF (схемы,
-- спецификация) плюс карточка юрлица. Старое поле attachment (один файл)
-- остаётся для заданий, поставленных раньше; воркер берёт attachments,
-- если список не пуст. У элементов списка может появиться storedUrl —
-- ссылка на копию в Storage, которую воркер делает один раз на задание.
alter table work_contractor_bulk_send_jobs
  add column if not exists attachments jsonb not null default '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
