-- События Resend и матчинг ответов по заголовкам (шаг 9 плана
-- docs/procurement-product-steps.md).
--
-- Зачем. Вебхук api/purchase-email-webhook.js подписан в Resend на ВСЕ типы
-- событий (проверено 2026-09-16 через GET https://api.resend.com/webhooks —
-- endpoint зарегистрирован 2026-08-29 сразу со всем списком), но читал из
-- них только входящие письма: у email.delivered/opened/bounced/complained в
-- поле "to" стоит адрес поставщика, короткий код оттуда не извлекается, и
-- функция молча отвечала {skipped:true}. То есть мы уже полгода получаем
-- ответ почтового сервера «такого ящика нет» и выбрасываем его — письмо в
-- переписке выглядит отправленным, поставщик «молчит», дожим шлёт ему
-- напоминания в никуда.
--
-- Вторая половина — входящее письмо, которое пришло НЕ на plus-адрес
-- (поставщик ответил на голый zakupki@, или его почтовик переписал
-- получателя). Такое письмо не сопоставлялось ни с кем и пропадало
-- бесследно. Теперь у него есть два дополнительных пути (заголовки
-- In-Reply-To/References → наш resend_message_id; адрес отправителя →
-- история переписки) и, если оба не сработали, своя таблица, из которой
-- письмо можно привязать руками.

-- 1. Отметки о судьбе ОТПРАВЛЕННОГО письма.
--
-- Три таблицы переписки устроены одинаково, событие приходит одно и то же —
-- колонки одинаковые во всех трёх, воркер ищет письмо по resend_message_id
-- по очереди (см. api/_emailEvents.js).
alter table public.supplier_offer_emails
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_reason text,
  add column if not exists complained_at timestamptz;

alter table public.purchase_emails
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_reason text,
  add column if not exists complained_at timestamptz;

alter table public.work_contractor_emails
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists bounce_reason text,
  add column if not exists complained_at timestamptz;

-- Настоящий заголовок Message-ID отправленного письма.
--
-- Проверено на живых письмах 2026-09-16: resend_message_id (uuid, который
-- отдаёт POST /emails) НЕ равен заголовку Message-ID, который видит
-- поставщик. Resend отправляет через Amazon SES, и в письмо уходит
-- «<010201a09f7ca7fa-be907951-…-000000@eu-west-1.amazonses.com>» — именно
-- он возвращается к нам в In-Reply-To/References ответа. Сопоставлять ответ
-- с нашим письмом по resend_message_id поэтому нельзя вовсе; настоящий
-- заголовок отдаёт GET /emails/{id} в поле message_id, и мы его сохраняем
-- при первом же событии по письму (api/_emailEvents.js).
alter table public.supplier_offer_emails
  add column if not exists message_id_header text;
alter table public.purchase_emails
  add column if not exists message_id_header text;
alter table public.work_contractor_emails
  add column if not exists message_id_header text;

create index if not exists supplier_offer_emails_message_id_idx
  on public.supplier_offer_emails (message_id_header) where message_id_header is not null;
create index if not exists purchase_emails_message_id_idx
  on public.purchase_emails (message_id_header) where message_id_header is not null;
create index if not exists work_contractor_emails_message_id_idx
  on public.work_contractor_emails (message_id_header) where message_id_header is not null;

-- Каждое событие — это поиск строки по resend_message_id. Без индекса это
-- три последовательных seq scan на каждое доставленное письмо.
create index if not exists supplier_offer_emails_resend_id_idx
  on public.supplier_offer_emails (resend_message_id) where resend_message_id is not null;
create index if not exists purchase_emails_resend_id_idx
  on public.purchase_emails (resend_message_id) where resend_message_id is not null;
create index if not exists work_contractor_emails_resend_id_idx
  on public.work_contractor_emails (resend_message_id) where resend_message_id is not null;

-- 2. Мёртвый адрес.
--
-- Рассылка и дожим берут адрес из карточки категории
-- (supplier_research_offers.email — см. process-bulk-send-jobs), поэтому
-- отметка живёт там же, где адрес: иначе «исключить из рассылки» пришлось
-- бы каждый раз собирать джойном. На контактах компании
-- (supplier_contacts.email) та же отметка дублируется — карточку заводят
-- руками из контакта, и человек должен видеть, что адрес мёртвый, ещё до
-- того как скопирует его в новую категорию.
alter table public.supplier_research_offers
  add column if not exists email_invalid_at timestamptz,
  add column if not exists email_invalid_reason text;

comment on column public.supplier_research_offers.email_invalid_at is
  'Почта вернула постоянную ошибку доставки (Resend email.bounced, type=Permanent). Адрес в рассылку и в дожим не идёт.';

alter table public.supplier_contacts
  add column if not exists email_invalid_at timestamptz;

create index if not exists supplier_research_offers_email_invalid_idx
  on public.supplier_research_offers (email_invalid_at)
  where email_invalid_at is not null and deleted_at is null;

-- 3. Неразобранные входящие.
--
-- Сюда попадает письмо на наш закупочный ящик, которое не удалось привязать
-- ни к одной карточке. Тело и вложения сохраняются сразу — download_url у
-- вложений Resend живёт час, и «разберём завтра» означало бы письмо без
-- файлов. Привязка руками (вкладка «Письма» → «Разобрать вручную»)
-- переносит запись в supplier_offer_emails и проставляет resolved_at.
create table if not exists public.unmatched_incoming_emails (
  id uuid primary key default gen_random_uuid(),
  -- Повторная доставка того же вебхука не должна плодить копии — та же
  -- защита, что и emailAlreadyStored для обычных писем.
  resend_message_id text unique,
  from_address text not null default '',
  to_address text not null default '',
  subject text not null default '',
  body text not null default '',
  files jsonb not null default '[]'::jsonb,
  -- Заголовки письма целиком — по ним разбирают спорные случаи руками
  -- (кому на самом деле отвечал поставщик, какой был Message-ID).
  headers jsonb,
  -- Подсказка интерфейсу: карточки, на которые письмо ПОХОЖЕ похоже (тот же
  -- адрес отправителя встречался в переписке), но однозначно выбрать не
  -- вышло. Пусто — совсем ничего не нашли.
  candidate_offer_ids uuid[] not null default '{}'::uuid[],
  resolved_at timestamptz,
  -- Куда привязали. NULL при заполненном resolved_at — «это не по делу,
  -- скрыть» (спам, реклама).
  resolved_offer_id uuid references public.supplier_research_offers (id) on delete set null,
  resolved_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists unmatched_incoming_emails_open_idx
  on public.unmatched_incoming_emails (created_at desc) where resolved_at is null;

alter table public.unmatched_incoming_emails enable row level security;

drop policy if exists authenticated_all on public.unmatched_incoming_emails;
create policy authenticated_all on public.unmatched_incoming_emails
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
