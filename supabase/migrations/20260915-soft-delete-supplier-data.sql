-- Мягкое удаление карточек поставщиков, писем и КП (шаг 1 плана
-- docs/procurement-product-steps.md, §7 аудита).
--
-- Зачем: до этой миграции кнопка «Удалить поставщика» делала физический
-- DELETE строки supplier_research_offers, а FK ON DELETE CASCADE утаскивал
-- за ней ВСЮ переписку (supplier_offer_emails), все полученные КП
-- (supplier_offer_quotes), заявки (supplier_orders) и позиции рассылки
-- (bulk_send_job_items). Восстановить это было нечем: снимков базы на
-- бесплатном плане Supabase нет, письма выживали только в Resend (и то
-- входящие, см. CLAUDE.md про GET /emails/receiving). Один ошибочный клик
-- стирал месяцы переписки.
--
-- Что делаем: колонка deleted_at на трёх таблицах. Клиентские delete*
-- ставят метку, все выборки фильтруют `deleted_at is null`. Каскады в БД
-- НЕ трогаем — они остаются страховкой на случай настоящего физического
-- удаления (например, разовой чисткой из SQL), но из интерфейса такое
-- удаление больше не вызывается.
--
-- Миграция аддитивная: старый код, который про deleted_at не знает,
-- продолжает работать (он просто видит все строки, включая помеченные) —
-- это важно, потому что миграция применяется раньше, чем код доедет до
-- прода.

alter table supplier_research_offers add column if not exists deleted_at timestamptz;
alter table supplier_offer_emails   add column if not exists deleted_at timestamptz;
alter table supplier_offer_quotes   add column if not exists deleted_at timestamptz;

comment on column supplier_research_offers.deleted_at is
  'Мягкое удаление: карточка скрыта из интерфейса, но строка и вся её переписка живы. NULL = активна.';
comment on column supplier_offer_emails.deleted_at is
  'Мягкое удаление письма. NULL = видно в переписке.';
comment on column supplier_offer_quotes.deleted_at is
  'Мягкое удаление КП. NULL = участвует в сравнении цен.';

-- Частичные индексы: все рабочие выборки ходят именно за живыми строками,
-- а помеченных со временем накопится сколько угодно.
create index if not exists supplier_research_offers_alive_idx
  on supplier_research_offers (created_at) where deleted_at is null;
create index if not exists supplier_offer_emails_alive_idx
  on supplier_offer_emails (offer_id, created_at) where deleted_at is null;
create index if not exists supplier_offer_quotes_alive_idx
  on supplier_offer_quotes (offer_id, created_at) where deleted_at is null;

notify pgrst, 'reload schema';
