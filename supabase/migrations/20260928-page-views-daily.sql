-- Собственный счётчик посещаемости без cookie (владелец, 2026-09-28).
-- Хранит только агрегаты «день + путь»: ни IP, ни user-agent, ни
-- идентификатора посетителя. Поэтому работает без согласия на cookie и
-- считает всех, в отличие от Метрики. Читает страница «Показатели».
create table if not exists public.page_views_daily (
  day date not null,
  path text not null,
  views integer not null default 0,
  entries integer not null default 0,
  primary key (day, path)
);

alter table public.page_views_daily enable row level security;

drop policy if exists page_views_daily_read on public.page_views_daily;
create policy page_views_daily_read on public.page_views_daily for select using (true);

-- Пишет только функция: прямой insert/update анонимам закрыт.
create or replace function public.track_page_view(p_path text, p_entry boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_path is null or length(p_path) > 300 or left(p_path, 1) <> '/' or p_path like '/admin%' then
    return;
  end if;
  insert into public.page_views_daily as t (day, path, views, entries)
  values ((now() at time zone 'Europe/Minsk')::date, p_path, 1, case when p_entry then 1 else 0 end)
  on conflict (day, path) do update
    set views = t.views + 1,
        entries = t.entries + excluded.entries;
end;
$$;

revoke all on function public.track_page_view(text, boolean) from public, anon, authenticated;
grant execute on function public.track_page_view(text, boolean) to anon, authenticated, service_role;
grant select on public.page_views_daily to anon, authenticated;

NOTIFY pgrst, 'reload schema';
