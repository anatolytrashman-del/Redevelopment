-- 20261023-osnova-02-client-workspace.sql
-- Блок 2: клиентское рабочее пространство (заявки, поставщики клиента, пометки, цены, модерация добавленных).
-- Аддитивная, идемпотентная миграция. Создаёт ТОЛЬКО новые таблицы/функции/политики.
-- НЕ модифицирует и НЕ вставляет в legacy-таблицы (suppliers, purchases, access_profiles, clients и т.д.).
-- RLS на всех новых таблицах. Функции SECURITY DEFINER, set search_path=public.
--
-- Откат (вручную, после бэкапа):
--   drop policy if exists "osnova_client_files_select" on storage.objects;
--   drop policy if exists "osnova_client_files_insert" on storage.objects;
--   drop policy if exists "osnova_client_files_owner_all" on storage.objects;
--   delete from storage.buckets where id = 'client-files';
--   drop function if exists public.osnova_client_suppliers(uuid, text, int, int);
--   drop function if exists public.osnova_client_member_list(uuid);
--   drop policy if exists ... on client_supplier_prices, client_supplier_notes, client_added_suppliers, client_request_events, client_requests;
--   drop table if exists public.client_supplier_prices;
--   drop table if exists public.client_supplier_notes;
--   drop table if exists public.client_added_suppliers;
--   drop table if exists public.client_request_events;
--   drop table if exists public.client_requests;
--   NOTIFY pgrst, 'reload schema';
--
-- Таблицы и политики строго по ТЗ блока 2. Нет DELETE-политик для client_* (клиенты не удаляют).

create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
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
alter table public.client_requests enable row level security;

create table if not exists public.client_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.client_requests(id) on delete cascade,
  client_id uuid,
  actor_id uuid,
  kind text,
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table public.client_request_events enable row level security;

create table if not exists public.client_added_suppliers (
  id uuid primary key default gen_random_uuid(),
  created_by_client_id uuid not null references public.clients(id) on delete cascade,
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
alter table public.client_added_suppliers enable row level security;

create table if not exists public.client_supplier_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  supplier_ref text not null, -- 'catalog:<uuid>' or 'added:<uuid>'
  body text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.client_supplier_notes enable row level security;

create table if not exists public.client_supplier_prices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  supplier_ref text not null,
  item text,
  price numeric,
  currency text default 'BYN',
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.client_supplier_prices enable row level security;

-- RLS policies: drop if exists + create (идемпотентно)
-- client_requests
drop policy if exists "client_requests_member" on public.client_requests;
create policy "client_requests_member" on public.client_requests
  for select using ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) );

drop policy if exists "client_requests_insert" on public.client_requests;
create policy "client_requests_insert" on public.client_requests
  for insert with check ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) );

drop policy if exists "client_requests_update" on public.client_requests;
create policy "client_requests_update" on public.client_requests
  for update using ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) )
  with check ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) );

-- client_request_events (следуем client_id)
drop policy if exists "client_request_events_member" on public.client_request_events;
create policy "client_request_events_member" on public.client_request_events
  for select using ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) );

drop policy if exists "client_request_events_insert" on public.client_request_events;
create policy "client_request_events_insert" on public.client_request_events
  for insert with check ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) );

-- client_added_suppliers (особые правила)
drop policy if exists "client_added_suppliers_member_or_approved" on public.client_added_suppliers;
create policy "client_added_suppliers_member_or_approved" on public.client_added_suppliers
  for select using (
    public.osnova_is_platform_owner()
    or public.osnova_is_client_member(created_by_client_id)
    or (moderation_status = 'approved' and exists (
      select 1 from public.client_members m
      join public.clients c on c.id = m.client_id
      where m.user_id = auth.uid() and c.status = 'active'
    ))
  );

drop policy if exists "client_added_suppliers_insert" on public.client_added_suppliers;
create policy "client_added_suppliers_insert" on public.client_added_suppliers
  for insert with check ( public.osnova_is_platform_owner() or public.osnova_is_client_member(created_by_client_id) );

drop policy if exists "client_added_suppliers_update" on public.client_added_suppliers;
drop policy if exists "client_added_suppliers_member_update" on public.client_added_suppliers;
create policy "client_added_suppliers_update" on public.client_added_suppliers
  for update using ( public.osnova_is_platform_owner() )
  with check ( public.osnova_is_platform_owner() );

-- client_supplier_notes
drop policy if exists "client_supplier_notes_member" on public.client_supplier_notes;
create policy "client_supplier_notes_member" on public.client_supplier_notes
  for select using ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) );

drop policy if exists "client_supplier_notes_insert" on public.client_supplier_notes;
create policy "client_supplier_notes_insert" on public.client_supplier_notes
  for insert with check ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) );

-- client_supplier_prices
drop policy if exists "client_supplier_prices_member" on public.client_supplier_prices;
create policy "client_supplier_prices_member" on public.client_supplier_prices
  for select using ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) );

drop policy if exists "client_supplier_prices_insert" on public.client_supplier_prices;
create policy "client_supplier_prices_insert" on public.client_supplier_prices
  for insert with check ( public.osnova_is_platform_owner() or public.osnova_is_client_member(client_id) );

-- Нет политик на DELETE для клиентских таблиц.

-- SECURITY DEFINER функция osnova_client_suppliers (строго по ТЗ)
create or replace function public.osnova_client_suppliers(
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
  moderation_status text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  is_member boolean;
  is_owner boolean;
begin
  is_owner := public.osnova_is_platform_owner();
  is_member := public.osnova_is_client_member(p_client);
  if not (is_member or is_owner) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    -- legacy catalog suppliers (только approved общие, без deleted/blocked)
    select
      'catalog:' || s.id::text as ref,
      s.id,
      s.name,
      s.inn,
      s.website_url,
      s.city,
      s.phone,
      s.email,
      'catalog' as source,
      null::text as moderation_status
    from public.suppliers s
    where s.deleted_at is null
      and s.blocked_at is null
      and (p_search is null or s.name ilike '%'||p_search||'%' or s.inn ilike '%'||p_search||'%')
    union all
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
      'added' as source,
      a.moderation_status
    from public.client_added_suppliers a
    where (a.moderation_status = 'approved' or a.created_by_client_id = p_client)
      and (p_search is null or a.name ilike '%'||p_search||'%' or a.inn ilike '%'||p_search||'%')
    order by name
    limit p_limit offset p_offset;
end;
$$;

revoke all on function public.osnova_client_suppliers(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.osnova_client_suppliers(uuid, text, int, int) to authenticated;

-- SECURITY DEFINER function osnova_client_member_list (for client.members.list, since no FK client_members->user_profiles)
create or replace function public.osnova_client_member_list(p_client uuid)
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
set search_path = public
stable
as $$
begin
  if not (public.osnova_is_client_member(p_client) or public.osnova_is_platform_owner()) then
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
    from public.client_members m
    join public.user_profiles u on u.id = m.user_id
    left join public.positions p on p.id = m.position_id
    where m.client_id = p_client
    order by u.last_name nulls last, u.first_name nulls last;
end;
$$;

revoke all on function public.osnova_client_member_list(uuid) from public, anon, authenticated;
grant execute on function public.osnova_client_member_list(uuid) to authenticated;

-- Storage bucket 'client-files' private
insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', false)
on conflict (id) do nothing;

-- Storage policies with prefix osnova_client_files_ , only for bucket client-files, path clients/<client_id>/
drop policy if exists "osnova_client_files_select" on storage.objects;
create policy "osnova_client_files_select" on storage.objects
  for select using (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = 'clients'
    and ((storage.foldername(name))[2])::uuid in (select public.osnova_my_client_ids())
  );

drop policy if exists "osnova_client_files_insert" on storage.objects;
create policy "osnova_client_files_insert" on storage.objects
  for insert with check (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = 'clients'
    and ((storage.foldername(name))[2])::uuid in (select public.osnova_my_client_ids())
  );

drop policy if exists "osnova_client_files_owner_all" on storage.objects;
create policy "osnova_client_files_owner_all" on storage.objects
  for all using (
    bucket_id = 'client-files'
    and public.osnova_is_platform_owner()
  ) with check (
    bucket_id = 'client-files'
    and public.osnova_is_platform_owner()
  );

NOTIFY pgrst, 'reload schema';
