-- Ответственный за приёмку, доверенность и документы — на самом ЗАКАЗЕ
-- (владелец, 2026-09-16, глядя на живую карточку заказа: «Ответственного за
-- приемку выводи на эту же страницу», «Сюда же форму загрузки доверенности»,
-- «появляются доп. документы по поставке, надо интерфейс для их загрузки и
-- истории», «Вытащи адрес доставки из шаблона при отправке поставщику, там он
-- указан и сохрани как шаблон»).
--
-- Что не так было. В 11c приёмщик и доверенность жили ТОЛЬКО внутри формы
-- поставки. Но заказ оплачен и ждёт машину задолго до первой поставки, и
-- ответственный с доверенностью известны уже тогда: чтобы их записать,
-- приходилось заводить пустую поставку. Адрес доставки был голым текстовым
-- полем — владелец набрал в него «Зеленый», хотя полный адрес объекта уже
-- лежит в `legal_entities.delivery_info` и уходит поставщику вложением.
--
-- Что здесь.
--  1. На заказе: ответственный за приёмку и доверенность (номер, дата, файл).
--     Поставка наследует их как значения по умолчанию — и может переопределить
--     (другая машина, другой человек, своя доверенность).
--  2. purchase_documents — все документы заказа с историей: кто и когда
--     загрузил. Привязка к поставке необязательная: накладная относится к
--     конкретному привозу, договор — ко всему заказу.
--  3. purchase_delivery_addresses — адреса доставки шаблонами, чтобы не
--     набирать их руками в каждом заказе.

-- 1. Приёмка на заказе ------------------------------------------------------

alter table purchase_orders add column if not exists receiver_id uuid references purchase_receivers (id) on delete set null;
alter table purchase_orders add column if not exists poa_number text not null default '';
alter table purchase_orders add column if not exists poa_date date;
alter table purchase_orders add column if not exists poa_file jsonb;

comment on column purchase_orders.receiver_id is
  'Ответственный за приёмку по заказу. Поставка берёт его по умолчанию и может переопределить.';
comment on column purchase_orders.poa_file is
  'Доверенность на получение ТМЦ файлом {url, fileName}. Грузится готовым документом, из шаблона не генерируется.';

create index if not exists purchase_orders_receiver_idx
  on purchase_orders (receiver_id) where deleted_at is null;

-- 2. Документы --------------------------------------------------------------

create table if not exists purchase_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references purchase_orders (id) on delete cascade,
  -- Поставка, к которой относится документ. null — документ по заказу в
  -- целом. on delete set null: удалили поставку — накладная остаётся, она
  -- всё ещё документ этого заказа.
  delivery_id uuid references purchase_deliveries (id) on delete set null,
  -- Тип документа. Открытый список строк, не enum в базе: виды документов
  -- дописываются жизнью (УПД, ТТН, акт, сертификат, рекламация), и каждая
  -- новая бумага не должна требовать миграции.
  kind text not null default 'other',
  title text not null default '',
  -- Сам файл {url, fileName}. not null: строка документа без файла
  -- бессмысленна.
  file jsonb not null,
  -- История: кто загрузил и когда. Отдельного журнала под документы нет —
  -- список, отсортированный по дате, и есть история.
  uploaded_by text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table purchase_documents is
  'Документы заказа поставщику: счета, платёжки, доверенности, накладные, акты. Кто и когда загрузил — тут же, отдельного журнала нет.';

create index if not exists purchase_documents_order_idx
  on purchase_documents (order_id, created_at desc) where deleted_at is null;
create index if not exists purchase_documents_delivery_idx
  on purchase_documents (delivery_id) where deleted_at is null;

-- 3. Адреса доставки шаблонами ---------------------------------------------

create table if not exists purchase_delivery_addresses (
  id uuid primary key default gen_random_uuid(),
  -- Юрлицо, к объекту которого этот адрес. null — общий адрес.
  legal_entity_id uuid references legal_entities (id) on delete set null,
  address text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table purchase_delivery_addresses is
  'Адреса доставки шаблонами: объекты, склады, точки выгрузки. Первый адрес подтягивается из legal_entities.delivery_info («Адрес объекта: …»).';

create index if not exists purchase_delivery_addresses_entity_idx
  on purchase_delivery_addresses (legal_entity_id) where deleted_at is null;

-- 4. Доступ -----------------------------------------------------------------

alter table purchase_documents enable row level security;
drop policy if exists authenticated_all on purchase_documents;
create policy authenticated_all on purchase_documents
  for all to authenticated using (true) with check (true);

alter table purchase_delivery_addresses enable row level security;
drop policy if exists authenticated_all on purchase_delivery_addresses;
create policy authenticated_all on purchase_delivery_addresses
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
