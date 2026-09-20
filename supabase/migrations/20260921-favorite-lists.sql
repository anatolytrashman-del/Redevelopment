-- Избранное на публичном каталоге БЦ без регистрации (владелец, 2026-09-21):
-- список slug'ов БЦ по короткому id в самом URL (/favorites/<id>), а не в
-- localStorage — открывается на любом устройстве по той же ссылке. Пишет и
-- читает анонимный anon-ключ напрямую с фронта: данные не персональные (те
-- же slug'и, что в каталоге), серверная логика (email/PDF) не нужна — как и
-- у остальных публичных таблиц без RLS-запрета на анонимную запись.
create table if not exists public.favorite_lists (
  id text primary key default substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8),
  slugs text[] not null default '{}' check (array_length(slugs, 1) is null or array_length(slugs, 1) <= 50),
  created_at timestamptz not null default now()
);

alter table public.favorite_lists enable row level security;

drop policy if exists anon_select on public.favorite_lists;
create policy anon_select on public.favorite_lists for select to anon using (true);

drop policy if exists anon_insert on public.favorite_lists;
create policy anon_insert on public.favorite_lists for insert to anon with check (true);

drop policy if exists anon_update on public.favorite_lists;
create policy anon_update on public.favorite_lists for update to anon using (true) with check (true);

drop policy if exists authenticated_all on public.favorite_lists;
create policy authenticated_all on public.favorite_lists for all to authenticated using (true) with check (true);

-- Supabase выдаёт новым таблицам в public полный набор прав anon/authenticated
-- через default privileges (см. 20260920-bc-reviews-anon-revoke.sql) — держать
-- у anon только то, что реально нужно: select/insert/update, без delete/truncate.
grant select, insert, update on public.favorite_lists to anon;
grant select, insert, update, delete on public.favorite_lists to authenticated;
revoke delete, truncate, references, trigger on public.favorite_lists from anon;

comment on table public.favorite_lists is
  'Публичное избранное без регистрации: список slug''ов БЦ по короткому id в URL (/favorites/<id>), пишется и читается анонимно';

notify pgrst, 'reload schema';
