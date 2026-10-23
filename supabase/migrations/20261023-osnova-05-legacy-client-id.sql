-- TOUCHES EXISTING TABLES — NEEDS SEPARATE APPROVAL, DO NOT APPLY
-- 20261023-osnova-05-legacy-client-id.sql
-- План wave 3.1: tagging legacy purchase_*/mailbox_* с client_id для миграции закупок Матрёшки.
-- ЭТОТ ФАЙЛ ТОЛЬКО ОПИСАТЕЛЬНЫЙ + СКЕЛЕТ; НЕ ПРИМЕНЯТЬ БЕЗ ОТДЕЛЬНОГО ОДОБРЕНИЯ.
-- Отдельная миграция, потому что затрагивает СУЩЕСТВУЮЩИЕ таблицы и RLS старой платформы.
--
-- См. scripts/osnova/import/plan-wave-3-1.md
--
-- Откат: (не применимо до одобрения)
-- NOTIFY pgrst, 'reload schema';

-- guarded adds with if exists table checks
do $$
begin
  if to_regclass('public.purchase_orders') is not null then
    alter table public.purchase_orders add column if not exists client_id uuid null;
    alter table public.purchase_orders add column if not exists import_batch_id uuid null;
    create index if not exists purchase_orders_client_id_idx on public.purchase_orders (client_id);
    create index if not exists purchase_orders_import_batch_id_idx on public.purchase_orders (import_batch_id);
  end if;
  if to_regclass('public.purchase_order_events') is not null then
    alter table public.purchase_order_events add column if not exists client_id uuid null;
    alter table public.purchase_order_events add column if not exists import_batch_id uuid null;
    create index if not exists purchase_order_events_client_id_idx on public.purchase_order_events (client_id);
    create index if not exists purchase_order_events_import_batch_id_idx on public.purchase_order_events (import_batch_id);
  end if;
  if to_regclass('public.purchase_documents') is not null then
    alter table public.purchase_documents add column if not exists client_id uuid null;
    alter table public.purchase_documents add column if not exists import_batch_id uuid null;
    create index if not exists purchase_documents_client_id_idx on public.purchase_documents (client_id);
    create index if not exists purchase_documents_import_batch_id_idx on public.purchase_documents (import_batch_id);
  end if;
  if to_regclass('public.purchase_deliveries') is not null then
    alter table public.purchase_deliveries add column if not exists client_id uuid null;
    alter table public.purchase_deliveries add column if not exists import_batch_id uuid null;
    create index if not exists purchase_deliveries_client_id_idx on public.purchase_deliveries (client_id);
    create index if not exists purchase_deliveries_import_batch_id_idx on public.purchase_deliveries (import_batch_id);
  end if;
  if to_regclass('public.mailbox_emails') is not null then
    alter table public.mailbox_emails add column if not exists client_id uuid null;
    alter table public.mailbox_emails add column if not exists import_batch_id uuid null;
    create index if not exists mailbox_emails_client_id_idx on public.mailbox_emails (client_id);
    create index if not exists mailbox_emails_import_batch_id_idx on public.mailbox_emails (import_batch_id);
  end if;
  if to_regclass('public.mailbox_contacts') is not null then
    alter table public.mailbox_contacts add column if not exists client_id uuid null;
    alter table public.mailbox_contacts add column if not exists import_batch_id uuid null;
    create index if not exists mailbox_contacts_client_id_idx on public.mailbox_contacts (client_id);
    create index if not exists mailbox_contacts_import_batch_id_idx on public.mailbox_contacts (import_batch_id);
  end if;
  if to_regclass('public.outgoing_email_jobs') is not null then
    alter table public.outgoing_email_jobs add column if not exists client_id uuid null;
    alter table public.outgoing_email_jobs add column if not exists import_batch_id uuid null;
    create index if not exists outgoing_email_jobs_client_id_idx on public.outgoing_email_jobs (client_id);
    create index if not exists outgoing_email_jobs_import_batch_id_idx on public.outgoing_email_jobs (import_batch_id);
  end if;
end $$;

-- NOTE: no RLS changes here (RLS on legacy controlled by 03-legacy-guard and separate step).
-- nullable, no defaults, no data backfill in this skeleton.

NOTIFY pgrst, 'reload schema';
