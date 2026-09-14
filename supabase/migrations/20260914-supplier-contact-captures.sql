-- Контакты, снятые кликом прямо на сайте поставщика (закладка «Снять
-- контакт», tools/menu-bookmarklet/contacts.js). Владелец, 2026-09-14:
-- «можно ли сделать так, чтобы Светлана могла кликнуть на сайте телефон,
-- email, мессенджеры, а оно записало бы само в базу. Чтобы вся верификация
-- была на одной вкладке».
--
-- Почему отдельная таблица, а не запись сразу в supplier_research_offers:
-- карточки поставщиков — платный товар с требованием точности 97%, и
-- молча затирать уже проверенный телефон тем, что случайно кликнули в
-- подвале, нельзя. Поэтому снятое всегда падает сюда, а в карточку
-- подставляется только в ПУСТОЕ поле; расхождение показывается на карточке
-- как предложение с кнопкой «Заменить».
--
-- Совместимо со старым кодом: новая таблица, прод про неё просто не знает.
create table if not exists supplier_contact_captures (
  id uuid primary key default gen_random_uuid(),
  host text not null,
  -- phone | email | messenger
  kind text not null,
  -- нормализованное значение: телефон в +7XXXXXXXXXX, почта в нижнем
  -- регистре, мессенджер — ссылка или номер как на сайте
  value text not null,
  -- messenger: Telegram | WhatsApp | Max (SUPPLIER_MESSENGER_TYPES)
  messenger_type text not null default '',
  -- исходный текст элемента, по которому кликнули: единственный способ
  -- потом понять, что именно сняли, если нормализация ошиблась
  raw_text text not null default '',
  page_url text not null default '',
  captured_at timestamptz not null default now(),
  -- pending | applied | skipped
  status text not null default 'pending',
  applied_at timestamptz,
  note text not null default ''
);

create index if not exists supplier_contact_captures_host_idx
  on supplier_contact_captures (host, captured_at desc);

-- Один и тот же контакт, снятый дважды (двойной клик, повторный заход), не
-- должен плодить строки: на карточке это выглядело бы как несколько разных
-- предложений.
create unique index if not exists supplier_contact_captures_uniq
  on supplier_contact_captures (host, kind, messenger_type, value);

alter table supplier_contact_captures enable row level security;

drop policy if exists authenticated_all on supplier_contact_captures;
create policy authenticated_all on supplier_contact_captures
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
