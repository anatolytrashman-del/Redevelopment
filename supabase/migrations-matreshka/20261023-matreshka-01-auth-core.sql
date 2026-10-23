-- Примечание (2026-10-23): в проекте hmubcbmutdmowpcdohll эта миграция применялась под прежним
-- техническим именем схемы и затем переименована миграцией 07; текст приведён к схеме matreshka
-- для чистой установки (на чистой БД 07 не нужна).
-- 20261023-matreshka-01-auth-core.sql
-- ПОРТ для отдельного проекта «matreshka»: все объекты в схеме matreshka (вместо public).
-- Блок 1: ядро авторизации: клиентская админка «Матрешка» и админка платформы Redevelopment.
-- Аддитивная миграция (добавляет только новые таблицы/функции/политики), не затрагивает существующие таблицы.
-- Аддитивно, безопасно для старой платформы. RLS на новых таблицах.
-- Функции SECURITY DEFINER с set search_path = matreshka.
-- Сид: служебная запись платформы redevelopment (НЕ клиент: status disabled, settings.platform_service),
-- клиент matreshka (с хостами клиента).
-- Пользователей не создаём.
--
-- Откат:
--   drop function if exists matreshka.matreshka_client_role(uuid);
--   drop function if exists matreshka.matreshka_is_client_member(uuid);
--   drop function if exists matreshka.matreshka_my_client_ids();
--   drop function if exists matreshka.matreshka_is_platform_owner();
--   drop table if exists matreshka.auth_provider_configs;
--   drop table if exists matreshka.auth_login_attempts;
--   drop table if exists matreshka.security_log;
--   drop table if exists matreshka.client_members;
--   drop table if exists matreshka.positions;
--   drop table if exists matreshka.user_profiles;
--   drop table if exists matreshka.platform_roles;
--   drop table if exists matreshka.clients;
--   NOTIFY pgrst, 'reload schema';

create table if not exists matreshka.clients (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  status text not null default 'active' check (status in ('active','disabled')),
  hosts text[] default '{}',
  settings jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table matreshka.clients enable row level security;

create table if not exists matreshka.platform_roles (
  user_id uuid primary key,
  role text not null default 'owner' check (role = 'owner'),
  created_at timestamptz not null default now()
);
alter table matreshka.platform_roles enable row level security;

create table if not exists matreshka.user_profiles (
  id uuid primary key, -- = auth.users.id
  email text,
  first_name text,
  last_name text,
  middle_name text,
  status text not null default 'active' check (status in ('active','disabled')),
  position text,
  bitrix_user_id text,
  bitrix_portal text,
  bitrix_active boolean,
  avatar_url text,
  phone text,
  department text,
  last_login_at timestamptz,
  profile_synced_at timestamptz,
  created_at timestamptz not null default now()
);
alter table matreshka.user_profiles enable row level security;

create table if not exists matreshka.positions (
  id uuid primary key default gen_random_uuid(),
  title text unique not null,
  created_at timestamptz not null default now()
);
alter table matreshka.positions enable row level security;

create table if not exists matreshka.client_members (
  user_id uuid not null,
  client_id uuid not null references matreshka.clients(id) on delete cascade,
  role text not null check (role in ('client_admin','client_staff')),
  position_id uuid references matreshka.positions(id),
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
alter table matreshka.client_members enable row level security;

create table if not exists matreshka.security_log (
  id bigserial primary key,
  event_type text not null,
  user_id uuid,
  client_id uuid,
  ip text,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table matreshka.security_log enable row level security;

create table if not exists matreshka.auth_login_attempts (
  id bigserial primary key,
  attempt_key text unique not null,
  ip text,
  email text,
  attempts int not null default 0,
  first_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  blocked_until timestamptz
);
alter table matreshka.auth_login_attempts enable row level security;

create table if not exists matreshka.auth_provider_configs (
  client_id uuid not null references matreshka.clients(id) on delete cascade,
  provider text not null,
  enabled boolean not null default false,
  config jsonb default '{}'::jsonb,
  primary key (client_id, provider)
);
alter table matreshka.auth_provider_configs enable row level security;

-- Функции (до политик, которые их используют)
create or replace function matreshka.matreshka_is_platform_owner()
returns boolean
language sql
security definer
set search_path = matreshka, public
stable
as $$
  select exists(select 1 from matreshka.platform_roles where user_id = auth.uid() and role = 'owner');
$$;

revoke all on function matreshka.matreshka_is_platform_owner() from public, anon, authenticated;
grant execute on function matreshka.matreshka_is_platform_owner() to anon, authenticated, service_role;

create or replace function matreshka.matreshka_my_client_ids()
returns setof uuid
language sql
security definer
set search_path = matreshka, public
stable
as $$
  select client_id from matreshka.client_members where user_id = auth.uid();
$$;

revoke all on function matreshka.matreshka_my_client_ids() from public, anon, authenticated;
grant execute on function matreshka.matreshka_my_client_ids() to anon, authenticated, service_role;

create or replace function matreshka.matreshka_is_client_member(p_client uuid)
returns boolean
language sql
security definer
set search_path = matreshka, public
stable
as $$
  select exists(select 1 from matreshka.client_members where user_id=auth.uid() and client_id=p_client);
$$;

revoke all on function matreshka.matreshka_is_client_member(uuid) from public, anon, authenticated;
grant execute on function matreshka.matreshka_is_client_member(uuid) to anon, authenticated, service_role;

create or replace function matreshka.matreshka_client_role(p_client uuid)
returns text
language sql
security definer
set search_path = matreshka, public
stable
as $$
  select role from matreshka.client_members where user_id=auth.uid() and client_id=p_client limit 1;
$$;

revoke all on function matreshka.matreshka_client_role(uuid) from public, anon, authenticated;
grant execute on function matreshka.matreshka_client_role(uuid) to anon, authenticated, service_role;

-- RLS policies (drop if exists перед create для идемпотентности новых таблиц)
drop policy if exists "clients_select" on matreshka.clients;
create policy "clients_select" on matreshka.clients for select
  using ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(id) );

drop policy if exists "clients_platform_write" on matreshka.clients;
create policy "clients_platform_write" on matreshka.clients for all
  using ( matreshka.matreshka_is_platform_owner() ) with check ( matreshka.matreshka_is_platform_owner() );

drop policy if exists "platform_roles_owner" on matreshka.platform_roles;
create policy "platform_roles_owner" on matreshka.platform_roles for select
  using ( matreshka.matreshka_is_platform_owner() or user_id = auth.uid() );

drop policy if exists "user_profiles_own_or_platform" on matreshka.user_profiles;
create policy "user_profiles_own_or_platform" on matreshka.user_profiles for select
  using ( id = auth.uid() or matreshka.matreshka_is_platform_owner() );

drop policy if exists "user_profiles_platform_manage" on matreshka.user_profiles;
create policy "user_profiles_platform_manage" on matreshka.user_profiles for all
  using ( matreshka.matreshka_is_platform_owner() ) with check ( matreshka.matreshka_is_platform_owner() );

drop policy if exists "client_members_member_or_owner" on matreshka.client_members;
create policy "client_members_member_or_owner" on matreshka.client_members for select
  using ( user_id = auth.uid() or matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

drop policy if exists "positions_read" on matreshka.positions;
create policy "positions_read" on matreshka.positions for select using (true);

drop policy if exists "security_log_platform" on matreshka.security_log;
create policy "security_log_platform" on matreshka.security_log for insert
  with check ( matreshka.matreshka_is_platform_owner() );

drop policy if exists "security_log_select_platform" on matreshka.security_log;
create policy "security_log_select_platform" on matreshka.security_log for select
  using ( matreshka.matreshka_is_platform_owner() );

drop policy if exists "auth_attempts_service" on matreshka.auth_login_attempts;
create policy "auth_attempts_service" on matreshka.auth_login_attempts for all
  using ( false ) with check ( false );

drop policy if exists "provider_configs_read" on matreshka.auth_provider_configs;
create policy "provider_configs_read" on matreshka.auth_provider_configs for select
  using ( matreshka.matreshka_is_platform_owner() or matreshka.matreshka_is_client_member(client_id) );

-- Сид клиентов (идемпотентно)
-- Служебная запись платформы (не клиент): в админке платформы не показывается.
insert into matreshka.clients (slug, name, status, hosts, settings)
values ('redevelopment', 'Redevelopment (internal)', 'disabled', '{}',
        '{"platform_service": true, "note": "Служебная запись платформы Redevelopment, не клиент. Не удалять: на неё могут ссылаться данные."}'::jsonb)
on conflict (slug) do update set status='disabled', settings = matreshka.clients.settings || excluded.settings;

insert into matreshka.clients (slug, name, status, hosts)
values ('matreshka', 'ООО «Матрёшка»', 'active', array['xn--80ad6adbq.redevelopment.pro','основа.redevelopment.pro','osnova.redevelopment.pro'])
on conflict (slug) do update set hosts=excluded.hosts, name=excluded.name;

-- Базовые должности
insert into matreshka.positions (title) values ('Закупщик') on conflict do nothing;
insert into matreshka.positions (title) values ('Администратор') on conflict do nothing;

NOTIFY pgrst, 'reload schema';
