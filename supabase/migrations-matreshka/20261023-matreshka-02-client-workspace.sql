-- Примечание (2026-10-23): в проекте hmubcbmutdmowpcdohll эта миграция применялась под прежним
-- техническим именем схемы и затем переименована миграцией 07; текст приведён к схеме matreshka
-- для чистой установки (на чистой БД 07 не нужна).
-- 20261023-matreshka-02-client-workspace.sql
-- ПОРТ для отдельного проекта «matreshka»: схема matreshka вместо public; без зависимости от public.suppliers.
-- Блок 2: клиентское рабочее пространство (заявки, поставщики клиента, пометки, цены, модерация добавленных).
-- Аддитивная, идемпотентная миграция. Создаёт ТОЛЬКО новые таблицы/функции/политики.
-- НЕ модифицирует и НЕ вставляет в legacy-таблицы (suppliers, purchases, access_profiles, clients и т.д.).
-- RLS на всех новых таблицах. Функции SECURITY DEFINER, set search_path=matreshka.
--
-- Откат (вручную, после бэкапа):
--   drop policy if exists "matreshka_client_files_select" on storage.objects;
--   drop policy if exists "matreshka_client_files_insert" on storage.objects;
--   drop policy if exists "matreshka_client_files_owner_all" on storage.objects;
--   delete from storage.buckets where id = 'client-files';
--   drop function if exists matreshka.matreshka_client_suppliers(uuid, text, int, int);
--   drop function if exists matreshka.matreshka_client_member_list(uuid);
--   drop policy if exists ... on client_supplier_prices, client_supplier_notes, client_added_suppliers, client_request_events, client_requests;
--   drop table if exists matreshka.client_supplier_prices;
--   drop table if exists matreshka.client_supplier_notes;
--   drop table if exists matreshka.client_added_suppliers;
--   drop table if exists matreshka.client_request_events;
--   drop table if exists matreshka.client_requests;
--   NOTIFY pgrst, 'reload schema';
--
-- Таблицы и политики строго по ТЗ блока 2. Нет DELETE-политик для client_* (клиенты не удаляют).

create table if not exists matreshka.client_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references matreshka.clients(id) on delete cascade,
  number bigint generated always as identity,
  title text not null,
  description text,
  status text not null default 'new' check (status in ('new','in_progress','waiting','done','cancelled')),
  priority text default 'normal',
  due_date date,
  created_by uuid,
  assignee_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table matreshka.client_requests enable row level security;

create table if not exists matreshka.client_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references matreshka.client_requests(id) on delete cascade,
  client_id uuid,
  actor_id uuid,
  kind text,
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table matreshka.client_request_events enable row level security;

create table if not exists matreshka.client_added_suppliers (
  id uuid primary key default gen_random_uuid(),
  created_by_client_id uuid not null references matreshka.clients(id) on delete cascade,
  created_by uuid,
  name text not null,
  inn text,
  website_url text,
  phone text,
  email text,
  city text,
  note text,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  linked_supplier_id uuid null, -- no FK to legacy suppliers
  moderated_by uuid,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);
alter table matreshka.client_added_suppliers enable row level security;

create table if not exists matreshka.client_supplier_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references matreshka.clients(id) on delete cascade,
  supplier_ref text not null, -- 'catalog:<uuid>' or 'added:<uuid>'
  body text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table matreshka.client_supplier_notes enable row level security;

create table if not exists matreshka.client_supplier_prices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references matreshka.clients(id) on delete cascade,
  supplier_ref text not null,
  item text,
  price numeric,
  currency text default 'BYN',
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table matreshka.client_supplier_prices enable row level security;

-- RLS policies: drop if exists + create (идемпотентно)
-- client_requests
drop policy if exists "client_requests_member" on matreshka.client_requests;
create policy "client_requests_member" on matreshka.client_requests
  for select using ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

drop policy if exists "client_requests_insert" on matreshka.client_requests;
create policy "client_requests_insert" on matreshka.client_requests
  for insert with check ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

drop policy if exists "client_requests_update" on matreshka.client_requests;
create policy "client_requests_update" on matreshka.client_requests
  for update using ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) )
  with check ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

-- client_request_events (следуем client_id)
drop policy if exists "client_request_events_member" on matreshka.client_request_events;
create policy "client_request_events_member" on matreshka.client_request_events
  for select using ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

drop policy if exists "client_request_events_insert" on matreshka.client_request_events;
create policy "client_request_events_insert" on matreshka.client_request_events
  for insert with check ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

-- client_added_suppliers (особые правила)
drop policy if exists "client_added_suppliers_member_or_approved" on matreshka.client_added_suppliers;
create policy "client_added_suppliers_member_or_approved" on matreshka.client_added_suppliers
  for select using (
    matreshka.matreshka_is_platform_owner()
    or matreshka.matreshka_is_client_member(created_by_client_id)
    or (moderation_status = 'approved' and exists (
      select 1 from matreshka.client_members m
      join matreshka.clients c on c.id = m.client_id
      where m.user_id = auth.uid() and c.status = 'active'
    ))
  );

drop policy if exists "client_added_suppliers_insert" on matreshka.client_added_suppliers;
create policy "client_added_suppliers_insert" on matreshka.client_added_suppliers
  for insert with check ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(created_by_client_id) );

drop policy if exists "client_added_suppliers_update" on matreshka.client_added_suppliers;
drop policy if exists "client_added_suppliers_member_update" on matreshka.client_added_suppliers;
create policy "client_added_suppliers_update" on matreshka.client_added_suppliers
  for update using ( matreshka.matreshka_is_platform_owner() )
  with check ( matreshka.matreshka_is_platform_owner() );

-- client_supplier_notes
drop policy if exists "client_supplier_notes_member" on matreshka.client_supplier_notes;
create policy "client_supplier_notes_member" on matreshka.client_supplier_notes
  for select using ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

drop policy if exists "client_supplier_notes_insert" on matreshka.client_supplier_notes;
create policy "client_supplier_notes_insert" on matreshka.client_supplier_notes
  for insert with check ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

-- client_supplier_prices
drop policy if exists "client_supplier_prices_member" on matreshka.client_supplier_prices;
create policy "client_supplier_prices_member" on matreshka.client_supplier_prices
  for select using ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

drop policy if exists "client_supplier_prices_insert" on matreshka.client_supplier_prices;
create policy "client_supplier_prices_insert" on matreshka.client_supplier_prices
  for insert with check ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

-- Нет политик на DELETE для клиентских таблиц.

-- SECURITY DEFINER функция matreshka_client_suppliers (порт для отдельного проекта «matreshka»)
-- ВАЖНО: в этом проекте НЕТ таблицы suppliers. Функция возвращает только собственные данные
-- клиента: client_added_suppliers (свои + одобренные общие), а также его пометки (notes)
-- и цены (prices) по supplier_ref. Для ссылок вида 'catalog:<uuid>', у которых у клиента есть
-- пометки/цены, возвращается строка source='catalog' без реквизитов (name и т.п. = null).
-- Legacy-справочник поставщиков (suppliers) подмешивается на сервере (server-side merge)
-- из старого проекта Redevelopment platform (iohcdylttyuhwovztrbk) по ref 'catalog:<uuid>'.
-- Внешних ключей на suppliers нет.
create or replace function matreshka.matreshka_client_suppliers(
  p_client uuid,
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  ref text,
  id uuid,
  name text,
  inn text,
  website_url text,
  city text,
  phone text,
  email text,
  source text,
  moderation_status text,
  notes jsonb,
  prices jsonb
)
language plpgsql
security definer
set search_path = matreshka, public
stable
as $$
declare
  is_member boolean;
  is_owner boolean;
begin
  is_owner := matreshka.matreshka_is_platform_owner();
  is_member := matreshka.matreshka_is_client_member(p_client);
  if not (is_member or is_owner) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    with added as (
      -- client added, approved or own pending
      select
        'added:' || a.id::text as ref,
        a.id,
        a.name,
        a.inn,
        a.website_url,
        a.city,
        a.phone,
        a.email,
        'added'::text as source,
        a.moderation_status
      from matreshka.client_added_suppliers a
      where (a.moderation_status = 'approved' or a.created_by_client_id = p_client)
        and (p_search is null or a.name ilike '%'||p_search||'%' or a.inn ilike '%'||p_search||'%')
    ),
    catalog_refs as (
      -- legacy catalog refs, for which the client has its own notes/prices (details merged server-side)
      select distinct x.supplier_ref as ref
      from (
        select n.supplier_ref from matreshka.client_supplier_notes n where n.client_id = p_client
        union
        select pr.supplier_ref from matreshka.client_supplier_prices pr where pr.client_id = p_client
      ) x
      where x.supplier_ref like 'catalog:%'
        and p_search is null
    ),
    rows_ as (
      select * from added
      union all
      select
        c.ref,
        case when substr(c.ref, 9) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then substr(c.ref, 9)::uuid end as id,
        null::text, null::text, null::text, null::text, null::text, null::text,
        'catalog'::text as source,
        null::text as moderation_status
      from catalog_refs c
    )
    select
      r.ref, r.id, r.name, r.inn, r.website_url, r.city, r.phone, r.email, r.source, r.moderation_status,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'created_by', n.created_by, 'created_at', n.created_at) order by n.created_at desc)
        from matreshka.client_supplier_notes n
        where n.client_id = p_client and n.supplier_ref = r.ref
      ), '[]'::jsonb) as notes,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', pr.id, 'item', pr.item, 'price', pr.price, 'currency', pr.currency, 'note', pr.note, 'created_by', pr.created_by, 'created_at', pr.created_at) order by pr.created_at desc)
        from matreshka.client_supplier_prices pr
        where pr.client_id = p_client and pr.supplier_ref = r.ref
      ), '[]'::jsonb) as prices
    from rows_ r
    order by r.name nulls last, r.ref
    limit p_limit offset p_offset;
end;
$$;

revoke all on function matreshka.matreshka_client_suppliers(uuid, text, int, int) from public, anon, authenticated;
grant execute on function matreshka.matreshka_client_suppliers(uuid, text, int, int) to authenticated;

-- SECURITY DEFINER function matreshka_client_member_list (for client.members.list, since no FK client_members->user_profiles)
create or replace function matreshka.matreshka_client_member_list(p_client uuid)
returns table(
  user_id uuid,
  role text,
  "position" text,
  first_name text,
  last_name text,
  middle_name text,
  status text,
  last_login_at timestamptz
)
language plpgsql
security definer
set search_path = matreshka, public
stable
as $$
begin
  if not (matreshka.matreshka_is_client_member(p_client) or matreshka.matreshka_is_platform_owner()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select
      m.user_id,
      m.role,
      p.title as position,
      u.first_name,
      u.last_name,
      u.middle_name,
      u.status,
      u.last_login_at
    from matreshka.client_members m
    join matreshka.user_profiles u on u.id = m.user_id
    left join matreshka.positions p on p.id = m.position_id
    where m.client_id = p_client
    order by u.last_name nulls last, u.first_name nulls last;
end;
$$;

revoke all on function matreshka.matreshka_client_member_list(uuid) from public, anon, authenticated;
grant execute on function matreshka.matreshka_client_member_list(uuid) to authenticated;

-- Indexes on client_id / created_by_client_id (idempotent; required for audit-isolation)
create index if not exists client_requests_client_id_idx on matreshka.client_requests (client_id);
create index if not exists client_request_events_client_id_idx on matreshka.client_request_events (client_id);
create index if not exists client_added_suppliers_created_by_client_id_idx on matreshka.client_added_suppliers (created_by_client_id);
create index if not exists client_supplier_notes_client_id_idx on matreshka.client_supplier_notes (client_id);
create index if not exists client_supplier_prices_client_id_idx on matreshka.client_supplier_prices (client_id);

-- Storage bucket 'client-files' private
insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', false)
on conflict (id) do nothing;

-- Storage policies with prefix matreshka_client_files_ , only for bucket client-files, path clients/<client_id>/
-- NB: compare as text (no ::uuid cast) so evaluation on objects of OTHER buckets can never raise a cast error.
drop policy if exists "matreshka_client_files_select" on storage.objects;
create policy "matreshka_client_files_select" on storage.objects
  for select using (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = 'clients'
    and (storage.foldername(name))[2] in (select id::text from matreshka.matreshka_my_client_ids() as id)
  );

drop policy if exists "matreshka_client_files_insert" on storage.objects;
create policy "matreshka_client_files_insert" on storage.objects
  for insert with check (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = 'clients'
    and (storage.foldername(name))[2] in (select id::text from matreshka.matreshka_my_client_ids() as id)
  );

drop policy if exists "matreshka_client_files_owner_all" on storage.objects;
create policy "matreshka_client_files_owner_all" on storage.objects
  for all using (
    bucket_id = 'client-files'
    and matreshka.matreshka_is_platform_owner()
  ) with check (
    bucket_id = 'client-files'
    and matreshka.matreshka_is_platform_owner()
  );

NOTIFY pgrst, 'reload schema';
