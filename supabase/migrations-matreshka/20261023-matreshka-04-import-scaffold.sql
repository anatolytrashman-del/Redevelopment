-- Примечание (2026-10-23): в проекте hmubcbmutdmowpcdohll эта миграция применялась под прежним
-- техническим именем схемы и затем переименована миграцией 07; текст приведён к схеме matreshka
-- для чистой установки (на чистой БД 07 не нужна).
-- 20261023-matreshka-04-import-scaffold.sql
-- ПОРТ для отдельного проекта «matreshka»: все объекты в схеме matreshka (вместо public).
-- Блок 4 (CODE/SCAFFOLDING): import_batches, import_batch_id на client_*,
-- расширенный справочник positions, client_approval_rules, поля согласования
-- в client_requests, inn/settings в clients.
-- Аддитивная, идемпотентная миграция. ТРОГАЕТ ТОЛЬКО matreshka-таблицы из 01/02.
-- НЕ трогает legacy (purchase_*, suppliers, mailbox_* и т.д.).
--
-- Откат (вручную после бэкапа, НЕ в проде без одобрения):
--   drop table if exists matreshka.import_batches;
--   alter table matreshka.client_requests drop column if exists import_batch_id;
--   alter table matreshka.client_request_events drop column if exists import_batch_id;
--   alter table matreshka.client_added_suppliers drop column if exists import_batch_id;
--   alter table matreshka.client_supplier_notes drop column if exists import_batch_id;
--   alter table matreshka.client_supplier_prices drop column if exists import_batch_id;
--   alter table matreshka.client_members drop column if exists import_batch_id;
--   alter table matreshka.positions drop column if exists code;
--   alter table matreshka.positions drop column if exists access_level;
--   alter table matreshka.positions drop column if exists is_external;
--   alter table matreshka.positions drop column if exists sort;
--   delete from matreshka.positions where code in ('zakupshchik','biznes_asistent',...);
--   drop table if exists matreshka.client_approval_rules;
--   alter table matreshka.client_requests drop column if exists supply_kind;
--   alter table matreshka.client_requests drop column if exists approval_status;
--   alter table matreshka.client_requests drop column if exists approved_by;
--   alter table matreshka.client_requests drop column if exists approved_at;
--   alter table matreshka.client_requests drop column if exists approval_method;
--   alter table matreshka.client_requests drop column if exists bitrix_approval_ref;
--   alter table matreshka.client_requests drop column if exists bitrix_approval_note;
--   alter table matreshka.clients drop column if exists inn;
--   alter table matreshka.clients drop column if exists legal_entity_ref;
--   -- settings revert if needed
--   NOTIFY pgrst, 'reload schema';
--
-- Сид правил по умолчанию для matreshka — не требуется (оставить пусто).

create table if not exists matreshka.import_batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references matreshka.clients(id) on delete set null,
  wave text,
  source text,
  status text not null default 'planned' check (status in ('planned','dry_run','applied','rolled_back','failed')),
  stats jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  note text
);
alter table matreshka.import_batches enable row level security;

-- RLS: platform owner only (write+read)
drop policy if exists "import_batches_owner" on matreshka.import_batches;
create policy "import_batches_owner" on matreshka.import_batches
  for all using (matreshka.matreshka_is_platform_owner())
  with check (matreshka.matreshka_is_platform_owner());

-- add import_batch_id to client tables (additive)
alter table matreshka.client_requests add column if not exists import_batch_id uuid references matreshka.import_batches(id);
alter table matreshka.client_request_events add column if not exists import_batch_id uuid references matreshka.import_batches(id);
alter table matreshka.client_added_suppliers add column if not exists import_batch_id uuid references matreshka.import_batches(id);
alter table matreshka.client_supplier_notes add column if not exists import_batch_id uuid references matreshka.import_batches(id);
alter table matreshka.client_supplier_prices add column if not exists import_batch_id uuid references matreshka.import_batches(id);
alter table matreshka.client_members add column if not exists import_batch_id uuid references matreshka.import_batches(id);

-- indexes for each (if not exists)
create index if not exists client_requests_import_batch_id_idx on matreshka.client_requests (import_batch_id);
create index if not exists client_request_events_import_batch_id_idx on matreshka.client_request_events (import_batch_id);
create index if not exists client_added_suppliers_import_batch_id_idx on matreshka.client_added_suppliers (import_batch_id);
create index if not exists client_supplier_notes_import_batch_id_idx on matreshka.client_supplier_notes (import_batch_id);
create index if not exists client_supplier_prices_import_batch_id_idx on matreshka.client_supplier_prices (import_batch_id);
create index if not exists client_members_import_batch_id_idx on matreshka.client_members (import_batch_id);

-- positions: add columns + full dictionary upsert (stable codes, external flagged)
alter table matreshka.positions add column if not exists code text;
alter table matreshka.positions add column if not exists access_level text;
alter table matreshka.positions add column if not exists is_external boolean not null default false;
alter table matreshka.positions add column if not exists sort int;

-- make code unique if not (idempotent via do block if needed, but unique constraint add if not)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'positions_code_key' and conrelid = 'matreshka.positions'::regclass
  ) then
    alter table matreshka.positions add constraint positions_code_key unique (code);
  end if;
end $$;

insert into matreshka.positions (title, code, is_external, sort) values
  ('Закупщик', 'zakupshchik', false, 10),
  ('Бизнес-ассистент', 'biznes_asistent', false, 20),
  ('Руководитель', 'rukovoditel', false, 30),
  ('Владелец', 'vladelets', false, 40),
  ('Директор', 'direktor', false, 50),
  ('Директор по развитию (маркетинг/IT)', 'direktor_po_razvitiyu', false, 60),
  ('Руководитель отдела продаж', 'rukovoditel_otdela_prodazh', false, 70),
  ('Внутренний брокер', 'vnutrenniy_broker', false, 80),
  ('Внешний брокер', 'vneshniy_broker', true, 90),
  ('Бухгалтер — просмотр', 'buhgalter_prosmotr', false, 100),
  ('Бухгалтер — проведение', 'buhgalter_provedenie', false, 110),
  ('Бухгалтер — полный', 'buhgalter_polnyy', false, 120),
  ('Юрист', 'yurist', false, 130),
  ('Отдел эксплуатации', 'otdel_ekspluatatsii', false, 140),
  ('Руководитель отдела строительства', 'rukovoditel_otdela_stroitelstva', false, 150),
  ('Руководитель направления «Фасад»', 'rukovoditel_napravleniya_fasad', false, 160),
  ('Руководитель направления «Кровля»', 'rukovoditel_napravleniya_krovlya', false, 170),
  ('Подрядчик (внешний)', 'podryadchik', true, 180)
on conflict (title) do update set
  code = excluded.code,
  is_external = excluded.is_external,
  sort = excluded.sort,
  access_level = coalesce(matreshka.positions.access_level, null);
 
 -- set code 'administrator' for pre-existing position from 01 (idempotent)
 update matreshka.positions set code = 'administrator' where title = 'Администратор' and code is null;
 
 -- client_approval_rules
create table if not exists matreshka.client_approval_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references matreshka.clients(id) on delete cascade,
  supply_kind text not null,
  approver_user_id uuid null,
  approver_position_id uuid null references matreshka.positions(id),
  priority int not null default 100,
  created_at timestamptz not null default now(),
  constraint one_approver check (approver_user_id is not null or approver_position_id is not null)
);
alter table matreshka.client_approval_rules enable row level security;

-- RLS: members (any) can select; platform_owner + client_admin write (incl delete)
drop policy if exists "client_approval_rules_select" on matreshka.client_approval_rules;
create policy "client_approval_rules_select" on matreshka.client_approval_rules
  for select using (
    matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id)
  );

drop policy if exists "client_approval_rules_write" on matreshka.client_approval_rules;
create policy "client_approval_rules_write" on matreshka.client_approval_rules
  for all using (
    matreshka.matreshka_is_platform_owner()
    or (
      matreshka.matreshka_is_client_member(client_id)
      and matreshka.matreshka_client_role(client_id) = 'client_admin'
    )
  )
  with check (
    matreshka.matreshka_is_platform_owner()
    or (
      matreshka.matreshka_is_client_member(client_id)
      and matreshka.matreshka_client_role(client_id) = 'client_admin'
    )
  );

-- client_requests: add approval + supply_kind fields (additive)
alter table matreshka.client_requests add column if not exists supply_kind text;
alter table matreshka.client_requests add column if not exists approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','rejected'));
alter table matreshka.client_requests add column if not exists approved_by uuid;
alter table matreshka.client_requests add column if not exists approved_at timestamptz;
alter table matreshka.client_requests add column if not exists approval_method text check (approval_method is null or approval_method in ('platform','bitrix24_manual'));
alter table matreshka.client_requests add column if not exists bitrix_approval_ref text;
alter table matreshka.client_requests add column if not exists bitrix_approval_note text;

-- clients: inn, legal_entity_ref, ensure settings not null default
alter table matreshka.clients add column if not exists inn text;
alter table matreshka.clients add column if not exists legal_entity_ref text;
alter table matreshka.clients alter column settings set default '{}'::jsonb;
update matreshka.clients set settings = coalesce(settings, '{}'::jsonb);
alter table matreshka.clients alter column settings set not null;

NOTIFY pgrst, 'reload schema';
