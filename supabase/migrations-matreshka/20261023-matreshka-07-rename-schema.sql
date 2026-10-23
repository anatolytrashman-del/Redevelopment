-- Однократное переименование схемы клиентской админки в matreshka
-- (проект hmubcbmutdmowpcdohll, применено 2026-10-23).
-- Исключение для поиска по старому имени: эта миграция по определению
-- ссылается на исходное имя схемы (osnova), иначе её не выполнить.
-- Данные не меняются: только DDL-переименования, пересоздание тел функций
-- и пересоздание трёх storage-политик под новыми именами.
begin;

alter schema osnova rename to matreshka;

-- 1) функции osnova_* -> matreshka_*
do $$
declare f record;
begin
  for f in
    select p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p where p.pronamespace = 'matreshka'::regnamespace and p.proname like 'osnova\_%'
  loop
    execute format('alter function matreshka.%I(%s) rename to %I',
                   f.proname, f.args, 'matreshka_' || substr(f.proname, 8));
  end loop;
end $$;

-- 2) тела функций, тексты ошибок и search_path (CREATE OR REPLACE сохраняет owner и ACL)
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'matreshka'::regnamespace and p.prokind = 'f'
  loop
    def := pg_get_functiondef(f.oid);
    if def ~ 'osnova' then
      execute replace(def, 'osnova', 'matreshka');
    end if;
  end loop;
end $$;

-- 3) триггер approval guard
alter trigger osnova_client_requests_approval_guard on matreshka.client_requests
  rename to matreshka_client_requests_approval_guard;

-- 4) storage.objects: ALTER POLICY RENAME запрещён (владелец supabase_storage_admin),
--    поэтому DROP + CREATE с теми же выражениями (функции уже matreshka.*).
do $$
declare p record; stmt text;
begin
  for p in select * from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'osnova\_%'
  loop
    stmt := format('create policy %I on storage.objects as %s for %s to %s',
                   'matreshka_' || substr(p.policyname, 8), p.permissive, p.cmd,
                   (select string_agg(quote_ident(r), ', ') from unnest(p.roles) r));
    if p.qual is not null then stmt := stmt || ' using (' || p.qual || ')'; end if;
    if p.with_check is not null then stmt := stmt || ' with check (' || p.with_check || ')'; end if;
    execute format('drop policy %I on storage.objects', p.policyname);
    execute stmt;
  end loop;
end $$;

-- 5) проверки внутри транзакции
do $$
declare n int;
begin
  select count(*) into n from pg_proc p
   where p.proname ~* 'osnova' or p.prosrc ~* 'osnova' or coalesce(array_to_string(p.proconfig, ','), '') ~* 'osnova';
  if n > 0 then raise exception 'old name left in pg_proc: %', n; end if;
  select count(*) into n from pg_policies
   where policyname ~* 'osnova' or schemaname ~* 'osnova' or coalesce(qual, '') ~* 'osnova' or coalesce(with_check, '') ~* 'osnova';
  if n > 0 then raise exception 'old name left in pg_policies: %', n; end if;
  select count(*) into n from pg_trigger t where not t.tgisinternal and (t.tgname ~* 'osnova' or pg_get_triggerdef(t.oid) ~* 'osnova');
  if n > 0 then raise exception 'old name left in pg_trigger: %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and policyname like 'matreshka\_client\_files\_%';
  if n <> 3 then raise exception 'storage policies: % <> 3', n; end if;
  select count(*) into n from matreshka.positions;
  if n <> 19 then raise exception 'positions count % <> 19', n; end if;
end $$;

commit;
