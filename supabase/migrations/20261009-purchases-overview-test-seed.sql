-- Демо-данные для стартового экрана закупок (показ владельцу 2026-10-09).
-- Все строки с is_test=true; фиксированные UUID — повторный прогон идемпотентен.
-- Живое сравнение цен их не показывает (фильтр на фронте).

insert into supplier_offer_quotes (
  id, offer_id, title, price, currency, items, files,
  is_alternative, alternative_note, source_email_id, terms, is_test, created_at
) values
(
  'a1000001-0000-4000-8000-000000000001',
  '2594bac5-1b44-475f-993b-b2990cf68d65',
  '[ТЕСТ] Счёт № Т-1001 — керамогранит Alma',
  842150.00, 'RUB', '[]'::jsonb, '[]'::jsonb,
  false, '', null, null, true, now() - interval '2 hours'
),
(
  'a1000001-0000-4000-8000-000000000002',
  'f8699241-400a-47a7-a8d4-7bd20dbb6ba4',
  '[ТЕСТ] Счёт УО-ТЕСТ-01 — грильято 100×100',
  1189400.00, 'RUB', '[]'::jsonb, '[]'::jsonb,
  false, '', null, null, true, now() - interval '5 hours'
),
(
  'a1000001-0000-4000-8000-000000000003',
  '131780d1-d04c-4cd9-a06c-3b5064da97f4',
  '[ТЕСТ] КП CSVT — светильники в ячейку',
  276800.00, 'RUB', '[]'::jsonb, '[]'::jsonb,
  false, '', null, null, true, now() - interval '1 day'
)
on conflict (id) do update set
  title = excluded.title,
  price = excluded.price,
  is_test = true,
  deleted_at = null,
  created_at = excluded.created_at;

insert into unmatched_incoming_emails (
  id, resend_message_id, from_address, to_address, subject, body, files,
  headers, candidate_offer_ids, resolved_at, resolved_offer_id, resolved_by_name,
  is_test, created_at
) values
(
  'b1000001-0000-4000-8000-000000000001',
  'test-resend-unmatched-001',
  'sales@demo-plintus.example',
  'zakupki@redevelopment.pro',
  '[ТЕСТ] Счёт на плинтус — не привязался к карточке',
  'Добрый день! Во вложении счёт по вашей заявке. Это тестовое письмо для демо стартового экрана закупок.',
  '[]'::jsonb, null,
  array['2594bac5-1b44-475f-993b-b2990cf68d65']::uuid[],
  null, null, null, true, now() - interval '3 hours'
),
(
  'b1000001-0000-4000-8000-000000000002',
  'test-resend-unmatched-002',
  'info@demo-kraska.example',
  'zakupki@redevelopment.pro',
  '[ТЕСТ] Уточнение по срокам поставки краски',
  'Подскажите, нужна ли доставка на объект на следующей неделе? Тестовое письмо.',
  '[]'::jsonb, null,
  array[]::uuid[],
  null, null, null, true, now() - interval '1 day'
)
on conflict (id) do update set
  subject = excluded.subject,
  body = excluded.body,
  is_test = true,
  resolved_at = null,
  created_at = excluded.created_at;

-- Даты: завтра и послезавтра от момента прогона. Привязка к живым заказам
-- ЛЕ МОНЛИД / Банапал (приняты), позиции — реальные id из items заказа.
insert into purchase_deliveries (
  id, order_id, receiver_id, receiver_name, receiver_phone, status,
  planned_date, delivered_at, poa_number, poa_date, poa_file, items,
  comment, created_by, is_test, created_at
) values
(
  'c1000001-0000-4000-8000-000000000001',
  '94b7999b-fb61-4e51-9549-86e725cf137a',
  null, 'Иван (тест)', '+375 29 000-00-01', 'planned',
  (current_date + 1), null, 'Т-ДОХ-001', current_date, null,
  '[{"itemId":"9965b1ca-4b4d-4c9d-aca7-ef61166feb55","quantity":500}]'::jsonb,
  '[ТЕСТ] Демо-поставка керамогранита на завтра',
  'Тест', true, now()
),
(
  'c1000001-0000-4000-8000-000000000002',
  '12cb3e8f-ab56-4bb7-b081-7f121dc8ac36',
  null, 'Сергей (тест)', '+375 29 000-00-02', 'shipped',
  (current_date + 2), null, 'Т-ДОХ-002', current_date, null,
  '[{"itemId":"2b0e8d2b-573d-43c5-822b-fcee85ad99bf","quantity":200}]'::jsonb,
  '[ТЕСТ] Демо-поставка краски послезавтра',
  'Тест', true, now()
)
on conflict (id) do update set
  planned_date = excluded.planned_date,
  status = excluded.status,
  comment = excluded.comment,
  receiver_name = excluded.receiver_name,
  items = excluded.items,
  is_test = true,
  deleted_at = null;

notify pgrst, 'reload schema';
