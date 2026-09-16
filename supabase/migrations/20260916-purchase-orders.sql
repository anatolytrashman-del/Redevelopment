-- Заказы поставщикам (шаг 11a плана docs/procurement-product-steps.md, §4.1
-- аудита).
--
-- Зачем. Сегодня цикл закупки обрывается на «Утверждено»: руководитель
-- согласовал лист отбора — и дальше ничего нет. Что именно у кого заказали,
-- по какой цене, на какой объём, оплачено ли и приехало ли — живёт в голове
-- закупщика и в переписке. Мёртвая сущность Purchase (таблицы purchases /
-- purchase_emails, страница Purchases.tsx) эту роль не исполняет: она из
-- первого прототипа, заводится руками и с отбором в «Сравнении цен» никак
-- не связана.
--
-- Что здесь. Две таблицы: сам заказ (снимок того, что заказали у одного
-- поставщика) и журнал его событий. Заказ создаётся из УТВЕРЖДЁННОГО листа
-- сравнения — по одному на поставщика; позиции кладутся снимком (jsonb), как
-- у Purchase.items и MaterialLedger.items: смету потом правят, а заказ должен
-- показывать ровно то, что ушло поставщику.
--
-- Статус заказа создаётся 'draft', а не 'ordered' (в плане было «появляются
-- заказы со статусом ordered»): письмо-заказ поставщику — шаг 12, и до него
-- поставщик о заказе ещё не знает. Ставить 'ordered' в момент нажатия кнопки
-- значило бы, что статус врёт ровно в том месте, ради которого заводится
-- таблица. Перевод в 'ordered' делает отправка письма (шаг 12) либо человек
-- руками, если договорился по телефону.

-- Номер заказа: сквозная нумерация по годам, «З-2026-0001». Нужен раньше
-- таблицы — он стоит в default её колонки. Отдельная функция, а не выражение
-- в default, чтобы формат менялся в одном месте.
create sequence if not exists purchase_order_number_seq;

create or replace function next_purchase_order_number() returns text
language sql volatile as $$
  select 'З-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('purchase_order_number_seq')::text, 4, '0')
$$;

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  -- Откуда заказ родился: категория закупки и карточка поставщика в ней.
  -- set null, а не cascade: удалённая категория не должна уносить историю
  -- того, что мы реально заказали и оплатили (то же правило, что у переписки
  -- в шаге 1).
  request_id uuid references supplier_research_requests (id) on delete set null,
  offer_id uuid references supplier_research_offers (id) on delete set null,
  supplier_id uuid references suppliers (id) on delete set null,
  legal_entity_id uuid references legal_entities (id) on delete set null,
  -- Человекочитаемый номер: им заказ называют в письме поставщику (шаг 12),
  -- в счёте и в разговоре. Генерится последовательностью ниже.
  number text not null default next_purchase_order_number(),
  -- Имя поставщика на момент заказа — как и позиции, снимок: карточку могут
  -- переименовать или удалить, а заказ обязан оставаться читаемым.
  supplier_name text not null default '',
  status text not null default 'draft',
  -- Позиции: массив PurchaseItem (src/data/purchases.ts) — name, unit,
  -- quantity, price (цена за единицу ВЕДОМОСТИ, с НДС), sourceMaterialId,
  -- matchKind/matchNote/productUrl.
  items jsonb not null default '[]'::jsonb,
  -- Доставка отдельной строкой: в счетах она идёт отдельно и в позиции
  -- ведомости не ложится (см. PurchaseItemMatchKind = 'delivery').
  delivery numeric,
  total numeric not null default 0,
  currency text not null default 'RUB',
  delivery_address text not null default '',
  delivery_due date,
  comment text not null default '',
  created_by text not null default '',
  -- Кто последним менял статус: триггер ниже переносит это в журнал.
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  -- Мягкое удаление, как у остальных данных закупок (20260915-soft-delete-…).
  deleted_at timestamptz,
  constraint purchase_orders_status_check check (status in (
    'draft', 'ordered', 'invoiced', 'paid', 'shipped', 'delivered',
    'accepted', 'closed', 'cancelled', 'claim'
  )),
  constraint purchase_orders_currency_check check (currency in ('RUB', 'USD', 'EUR', 'BYN'))
);

comment on table purchase_orders is
  'Заказ поставщику: снимок того, что заказали у одной компании по одной категории. Создаётся из утверждённого листа «Сравнения цен».';

create index if not exists purchase_orders_request_idx
  on purchase_orders (request_id, created_at desc) where deleted_at is null;
create index if not exists purchase_orders_supplier_idx
  on purchase_orders (supplier_id, created_at desc) where deleted_at is null;
create index if not exists purchase_orders_offer_idx
  on purchase_orders (offer_id, created_at desc) where deleted_at is null;
create index if not exists purchase_orders_status_idx
  on purchase_orders (status) where deleted_at is null;

-- Журнал заказа: статусы, письма, счета, платежи. Заводится триггером на
-- каждое изменение статуса — чтобы история не зависела от того, откуда
-- пришла правка (интерфейс, Edge Function, ручной SQL).
create table if not exists purchase_order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references purchase_orders (id) on delete cascade,
  -- 'status' — смена статуса (включая создание), 'note' — заметка человека,
  -- дальше по мере шагов 12+: 'email', 'invoice', 'payment'.
  kind text not null default 'status',
  from_status text,
  to_status text,
  note text not null default '',
  actor text not null default '',
  created_at timestamptz not null default now()
);

comment on table purchase_order_events is
  'Журнал заказа поставщику: смены статуса (пишет триггер), заметки, письма, счета, платежи.';

create index if not exists purchase_order_events_order_idx
  on purchase_order_events (order_id, created_at);

alter table purchase_orders enable row level security;
drop policy if exists authenticated_all on purchase_orders;
create policy authenticated_all on purchase_orders
  for all to authenticated using (true) with check (true);

alter table purchase_order_events enable row level security;
drop policy if exists authenticated_all on purchase_order_events;
create policy authenticated_all on purchase_order_events
  for all to authenticated using (true) with check (true);

-- Не security definer: триггер и так исполняется от того, кто правит заказ, а
-- политика authenticated_all на журнале разрешает ему запись. Лишний definer
-- здесь был бы дырой без нужды (см. CLAUDE.md про грант PUBLIC).
create or replace function purchase_order_log_status() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    insert into purchase_order_events (order_id, kind, from_status, to_status, note, actor)
    values (new.id, 'status', null, new.status, 'Заказ создан', coalesce(nullif(new.created_by, ''), ''));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into purchase_order_events (order_id, kind, from_status, to_status, note, actor)
    values (new.id, 'status', old.status, new.status, '', coalesce(nullif(new.updated_by, ''), new.created_by));
  end if;
  return new;
end $$;

drop trigger if exists purchase_order_log_status_trg on purchase_orders;
create trigger purchase_order_log_status_trg
  after insert or update on purchase_orders
  for each row execute function purchase_order_log_status();

-- Права: PUBLIC получает EXECUTE на функцию автоматически, и revoke только у
-- anon/authenticated его не снимает (см. CLAUDE.md). Номер заказа дёргает
-- default при вставке, то есть функция нужна тому, кто заводит заказ.
revoke all on function next_purchase_order_number() from public, anon;
grant execute on function next_purchase_order_number() to authenticated, service_role;
revoke all on function purchase_order_log_status() from public, anon, authenticated;

notify pgrst, 'reload schema';
