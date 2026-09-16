-- Поставка по заказу, принимающее лицо и оплата заказа (владелец,
-- 2026-09-16: «Перед тем, как автоматизировать, давай построим процесс
-- вручную»). Продолжение шага 11 (20260916-purchase-orders.sql), часть
-- шага 12 плана docs/procurement-product-steps.md.
--
-- Что было. Заказ (purchase_orders) знал, ЧТО у кого купили и по какой цене,
-- и один статус на всю жизнь. Ни счёта, ни платёжки, ни того, кто и по какой
-- доверенности принимает товар, ни частичных поставок в нём не было — всё
-- это владелец держал в голове и в переписке.
--
-- Что здесь.
--  1. purchase_receivers — принимающие лица шаблонами: они повторяются от
--     поставки к поставке, набивать ФИО и телефон каждый раз незачем.
--  2. purchase_deliveries — сама поставка: дата, статус, приёмщик,
--     доверенность файлом, СКОЛЬКО по каждой позиции реально приехало.
--     Отдельная таблица, а не поля на заказе, именно ради частичной
--     поставки: из одного заказа товар едет несколькими машинами, у каждой
--     своя дата, свой приёмщик и своя доверенность.
--  3. Колонки счёта и платёжки на самом заказе: счёт и оплата относятся к
--     заказу целиком, дробить их по поставкам не нужно.
--
-- Плановый платёж в transactions СОЗНАТЕЛЬНО не заводится (владелец,
-- 2026-09-16: «В транзакции пока не вноси»). Доверенность не генерируется из
-- шаблона, а грузится готовым файлом («Доверенность подгружу сам
-- документом»).

-- 1. Принимающие лица ------------------------------------------------------

create table if not exists purchase_receivers (
  id uuid primary key default gen_random_uuid(),
  -- Юрлицо, от которого человек принимает товар. null — лицо общее для всех
  -- юрлиц; на выбор в интерфейсе не влияет, нужно для подстановки реквизитов
  -- в доверенность, когда её начнём генерировать.
  legal_entity_id uuid references legal_entities (id) on delete set null,
  name text not null default '',
  -- Телефон нужен поставщику: водитель звонит приёмщику, а не закупщику.
  phone text not null default '',
  position text not null default '',
  -- Паспортные данные одной строкой: в доверенность на получение ТМЦ они
  -- идут сплошным текстом («паспорт MP1234567, выдан ...»), разбирать их на
  -- поля незачем — мы их не валидируем и не ищем по ним.
  passport text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  -- Мягкое удаление: человек уволился, но поставки, которые он принял,
  -- обязаны остаться читаемыми.
  deleted_at timestamptz
);

comment on table purchase_receivers is
  'Принимающие лица (шаблоны): кто принимает товар по заказам, ФИО/телефон/паспорт для доверенности.';

create index if not exists purchase_receivers_name_idx
  on purchase_receivers (name) where deleted_at is null;

-- 2. Поставки --------------------------------------------------------------

create table if not exists purchase_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references purchase_orders (id) on delete cascade,
  -- Приёмщик ссылкой — чтобы в его карточке было видно все поставки, и
  -- снимком (receiver_name/phone) — чтобы поставка осталась читаемой, если
  -- лицо удалят или переименуют. То же правило, что у supplier_name заказа.
  receiver_id uuid references purchase_receivers (id) on delete set null,
  receiver_name text not null default '',
  receiver_phone text not null default '',
  status text not null default 'planned',
  -- Плановая дата — когда обещали, фактическая — когда реально приняли.
  -- Две разные даты, а не одна: расхождение между ними и есть просрочка
  -- поставщика, по одной колонке её не увидеть.
  planned_date date,
  delivered_at date,
  -- Доверенность: номер, дата и сам файл {url, fileName}. Владелец грузит
  -- готовый документ, генерации из шаблона здесь нет.
  poa_number text not null default '',
  poa_date date,
  poa_file jsonb,
  -- Что именно приехало этой машиной: [{ itemId, quantity }] — itemId это
  -- id позиции из purchase_orders.items. Частичная поставка = сумма
  -- quantity по всем поставкам меньше количества в заказе.
  items jsonb not null default '[]'::jsonb,
  -- Документы поставки (накладная, УПД, акт) — [{url, fileName}].
  -- Закрывающие документы владелец обещал позже; место под них есть сразу,
  -- отдельная таблица под пару файлов не нужна.
  files jsonb not null default '[]'::jsonb,
  comment text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint purchase_deliveries_status_check check (status in (
    'planned', 'shipped', 'delivered', 'accepted', 'claim', 'cancelled'
  ))
);

comment on table purchase_deliveries is
  'Поставка по заказу: дата, статус, принимающее лицо, доверенность, сколько по каждой позиции приехало. Поставок у заказа может быть несколько — частичная поставка.';

create index if not exists purchase_deliveries_order_idx
  on purchase_deliveries (order_id, created_at desc) where deleted_at is null;
create index if not exists purchase_deliveries_receiver_idx
  on purchase_deliveries (receiver_id) where deleted_at is null;

-- 3. Счёт и оплата на заказе ----------------------------------------------

alter table purchase_orders add column if not exists invoice_number text not null default '';
alter table purchase_orders add column if not exists invoice_date date;
alter table purchase_orders add column if not exists invoice_file jsonb;
alter table purchase_orders add column if not exists payment_number text not null default '';
alter table purchase_orders add column if not exists payment_date date;
alter table purchase_orders add column if not exists payment_amount numeric;
alter table purchase_orders add column if not exists payment_file jsonb;

comment on column purchase_orders.invoice_file is
  'Счёт поставщика файлом {url, fileName}. Связь с распознанным КП (supplier_quotes) — шаг 12, сверка позиций.';
comment on column purchase_orders.payment_file is
  'Платёжка (подтверждение оплаты) файлом {url, fileName}. В transactions плановый платёж не заводится — решение владельца 2026-09-16.';

-- 4. Доступ ----------------------------------------------------------------
-- Ровно как у purchase_orders: читать и писать может только authenticated,
-- анонимному ключу фронта эти таблицы не видны.

alter table purchase_receivers enable row level security;
drop policy if exists authenticated_all on purchase_receivers;
create policy authenticated_all on purchase_receivers
  for all to authenticated using (true) with check (true);

alter table purchase_deliveries enable row level security;
drop policy if exists authenticated_all on purchase_deliveries;
create policy authenticated_all on purchase_deliveries
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
