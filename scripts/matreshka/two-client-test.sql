-- scripts/matreshka/two-client-test.sql
-- Тест «два клиента» для ЛОКАЛЬНОЙ / не-прод Postgres (НИКОГДА не запускать на проде: создаёт тестовые строки).
-- Требует: Supabase-подобную заглушку (роли anon/authenticated/service_role, auth.uid() из request.jwt.claim.sub,
-- схема storage со storage.foldername) и применённые миграции supabase/migrations-matreshka 01, 02 (схема matreshka).
-- Проверки legacy guard (функция старого проекта) пропускаются, если её нет.
-- Запуск: psql -v ON_ERROR_STOP=1 -d <test_db> -f scripts/matreshka/two-client-test.sql
-- Любое нарушение изоляции -> RAISE EXCEPTION (код возврата psql != 0).
\set ON_ERROR_STOP 1
reset role;

create or replace function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;

-- Сиды (суперпользователь)
insert into matreshka.clients(id, slug, name, status, hosts) values
  ('11111111-1111-1111-1111-111111111111','test-client-a','Test A','active','{}'),
  ('22222222-2222-2222-2222-222222222222','test-client-b','Test B','active','{}')
on conflict (id) do nothing;
insert into auth.users(id) values
  ('a0000000-0000-0000-0000-0000000000a0'),  -- владелец платформы
  ('a0000000-0000-0000-0000-0000000000a1'),  -- сотрудник A
  ('b0000000-0000-0000-0000-0000000000b1'),  -- сотрудник B
  ('c0000000-0000-0000-0000-0000000000c0')   -- старый пользователь без членства
on conflict do nothing;
insert into matreshka.platform_roles(user_id) values ('a0000000-0000-0000-0000-0000000000a0') on conflict do nothing;
insert into matreshka.user_profiles(id, email, first_name, status) values
  ('a0000000-0000-0000-0000-0000000000a0','owner@test','Owner','active'),
  ('a0000000-0000-0000-0000-0000000000a1','a@test','StaffA','active'),
  ('b0000000-0000-0000-0000-0000000000b1','b@test','StaffB','active')
on conflict do nothing;
insert into matreshka.client_members(user_id, client_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','client_staff'),
  ('a0000000-0000-0000-0000-0000000000a0','11111111-1111-1111-1111-111111111111','client_staff'),
  ('b0000000-0000-0000-0000-0000000000b1','22222222-2222-2222-2222-222222222222','client_staff')
on conflict do nothing;

-- ===== Сотрудник A =====
set role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-0000000000a1', false);
insert into matreshka.client_requests(client_id, title) values ('11111111-1111-1111-1111-111111111111','TEST req A');
insert into matreshka.client_supplier_notes(client_id, supplier_ref, body) values ('11111111-1111-1111-1111-111111111111','catalog:test','TEST note A');
insert into matreshka.client_supplier_prices(client_id, supplier_ref, item, price) values ('11111111-1111-1111-1111-111111111111','catalog:test','TEST item', 1);
insert into matreshka.client_added_suppliers(created_by_client_id, name) values ('11111111-1111-1111-1111-111111111111','TEST pending A');
select pg_temp.check(not matreshka.matreshka_is_platform_owner(), 'A не владелец платформы');
select pg_temp.check((select count(*) from matreshka.client_added_suppliers where name='TEST pending A') = 1, 'A видит своего поставщика на модерации');
with u as (update matreshka.client_added_suppliers set moderation_status='approved' where name='TEST pending A' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'A не может сам одобрить поставщика');
do $$ begin
  perform matreshka.matreshka_client_member_list('22222222-2222-2222-2222-222222222222');
  raise exception 'FAIL: A получил список сотрудников B';
exception when insufficient_privilege then raise notice 'ok: A не видит сотрудников B'; end $$;

-- ===== Сотрудник B =====
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-0000000000b1', false);
select pg_temp.check((select count(*) from matreshka.client_requests where client_id='11111111-1111-1111-1111-111111111111') = 0, 'B не видит заявки A');
select pg_temp.check((select count(*) from matreshka.client_supplier_notes where client_id='11111111-1111-1111-1111-111111111111') = 0, 'B не видит пометки A');
select pg_temp.check((select count(*) from matreshka.client_supplier_prices where client_id='11111111-1111-1111-1111-111111111111') = 0, 'B не видит цены A');
select pg_temp.check((select count(*) from matreshka.client_added_suppliers where name='TEST pending A') = 0, 'B не видит поставщика A до модерации');
select pg_temp.check((select count(*) from matreshka.user_profiles) = 1, 'B видит только свой профиль');
do $$ begin
  insert into matreshka.client_requests(client_id, title) values ('11111111-1111-1111-1111-111111111111','evil');
  raise exception 'FAIL: B вставил заявку в A';
exception when insufficient_privilege then raise notice 'ok: B не может писать в A'; end $$;
do $$ begin
  insert into matreshka.client_supplier_notes(client_id, supplier_ref, body) values ('11111111-1111-1111-1111-111111111111','catalog:test','evil');
  raise exception 'FAIL: B вставил пометку в A';
exception when insufficient_privilege then raise notice 'ok: B не может писать пометки в A'; end $$;

-- ===== Владелец платформы =====
select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-0000000000a0', false);
select pg_temp.check(matreshka.matreshka_is_platform_owner(), 'владелец распознан');
select pg_temp.check((select count(*) from matreshka.clients where slug like 'test-client-%') = 2, 'владелец видит обоих клиентов');
update matreshka.client_added_suppliers set moderation_status='approved' where name='TEST pending A';
select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-0000000000b1', false);
select pg_temp.check((select count(*) from matreshka.client_added_suppliers where name='TEST pending A') = 1, 'после модерации B видит поставщика');

-- ===== Legacy guard (только если применена миграция 03) =====
do $$
declare has_guard boolean := to_regprocedure('matreshka.matreshka_is_legacy_allowed()') is not null;
begin
  if not has_guard then raise notice 'skip: миграция 03 не применена'; return; end if;
  perform set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-0000000000b1', false);
  if matreshka.matreshka_is_legacy_allowed() then raise exception 'FAIL: клиентский пользователь допущен к старым данным'; end if;
  perform set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000c0', false);
  if not matreshka.matreshka_is_legacy_allowed() then raise exception 'FAIL: старый пользователь потерял доступ'; end if;
  perform set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-0000000000a0', false);
  if not matreshka.matreshka_is_legacy_allowed() then raise exception 'FAIL: владелец потерял доступ'; end if;
  raise notice 'ok: legacy guard функция';
end $$;
do $$
declare n int;
begin
  if to_regprocedure('matreshka.matreshka_is_legacy_allowed()') is null or to_regclass('public.suppliers') is null then return; end if;
  perform set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-0000000000b1', false);
  select count(*) into n from public.suppliers;
  if n <> 0 then raise exception 'FAIL: клиентский пользователь видит legacy suppliers (%)', n; end if;
  perform set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-0000000000c0', false);
  select count(*) into n from public.suppliers;
  raise notice 'ok: старый пользователь видит suppliers: % строк', n;
end $$;

-- ===== anon =====
select set_config('request.jwt.claim.sub','', false);
set role anon;
select pg_temp.check((select count(*) from matreshka.clients) = 0, 'anon не видит клиентов');
select pg_temp.check((select count(*) from matreshka.client_requests) = 0, 'anon не видит заявки');
reset role;

-- Уборка тестовых строк (тестовая БД)
delete from matreshka.client_supplier_prices where client_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from matreshka.client_supplier_notes where client_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from matreshka.client_request_events where client_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from matreshka.client_requests where client_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
delete from matreshka.client_added_suppliers where created_by_client_id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
\echo 'TWO-CLIENT TEST PASSED'
