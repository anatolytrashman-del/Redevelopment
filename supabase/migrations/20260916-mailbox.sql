-- Общий почтовый ящик компании a@redevelopment.pro + записная книжка адресов
-- (страница "Почта" в админке, сразу после "Команды").
--
-- Владелец, 2026-09-16: "мне нужен общий блок с email-ящиком в интерфейсе,
-- ставь после блока Команда. Ящик — a@redevelopment.pro. И внутри сделай
-- записную книжку с названием, категорией, именем человека и самим
-- email-адресом".
--
-- Чем отличается от трёх уже существующих переписок (purchase_emails,
-- supplier_offer_emails, work_contractor_emails): там письмо всегда привязано
-- к карточке и уходит с plus-адреса, по которому ответ находит свою ветку.
-- Здесь карточки нет — обычный ящик: один адрес на всю компанию,
-- произвольные собеседники, лента группируется по адресу собеседника
-- (на клиенте, отдельной колонки-треда намеренно нет: почтовые клиенты
-- подставляют то "Имя <адрес>", то голый адрес, и единственный устойчивый
-- ключ — сам адрес).
--
-- Набор колонок писем повторяет work_contractor_emails, включая отметки
-- доставки/отлупа: mailbox_emails добавлена в EMAIL_TABLES в
-- api/_emailEvents.js, то есть события Resend по отправленным письмам
-- проставляются и здесь.
create table if not exists mailbox_emails (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in','out')),
  from_address text not null,
  to_address text not null,
  subject text,
  body text,
  files jsonb not null default '[]'::jsonb,
  resend_message_id text,
  message_id_header text,
  read_at timestamptz,
  sent_by_profile_id uuid,
  sent_by_name text,
  send_status text not null default 'sent',
  send_error text,
  delivered_at timestamptz,
  opened_at timestamptz,
  bounced_at timestamptz,
  bounce_reason text,
  complained_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mailbox_emails_created_at_idx on mailbox_emails (created_at desc);
-- По resend_message_id ищут и отсечка повторной доставки вебхука
-- (emailAlreadyStored), и разбор событий по отправленным письмам.
create index if not exists mailbox_emails_resend_message_id_idx on mailbox_emails (resend_message_id);

alter table mailbox_emails enable row level security;
drop policy if exists authenticated_all on mailbox_emails;
create policy authenticated_all on mailbox_emails for all to authenticated using (true) with check (true);

-- Записная книжка: ровно четыре поля, как просил владелец. Категория —
-- открытый список (AddableSelect на форме), поэтому обычный text, не enum.
create table if not exists mailbox_contacts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  category text not null default '',
  person_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists mailbox_contacts_email_idx on mailbox_contacts (lower(email));

alter table mailbox_contacts enable row level security;
drop policy if exists authenticated_all on mailbox_contacts;
create policy authenticated_all on mailbox_contacts for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
