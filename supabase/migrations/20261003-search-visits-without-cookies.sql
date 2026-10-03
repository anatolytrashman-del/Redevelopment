-- Агрегированная атрибуция поисковых визитов без cookie.
-- Сохраняем только день, распознанный поисковик и число визитов; исходный URL,
-- IP, User-Agent и идентификатор посетителя не записываются.
create table if not exists public.search_visits_daily (
  day date not null,
  source text not null,
  visits integer not null default 0,
  primary key (day, source),
  constraint search_visits_daily_source_check
    check (source in ('yandex', 'google', 'bing', 'duckduckgo', 'yahoo', 'baidu', 'ecosia', 'brave')),
  constraint search_visits_daily_visits_check check (visits >= 0)
);

alter table public.search_visits_daily enable row level security;

drop policy if exists search_visits_daily_read on public.search_visits_daily;
create policy search_visits_daily_read on public.search_visits_daily
  for select using (true);

create or replace function public.track_search_visit(p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source not in ('yandex', 'google', 'bing', 'duckduckgo', 'yahoo', 'baidu', 'ecosia', 'brave') then
    return;
  end if;

  insert into public.search_visits_daily as t (day, source, visits)
  values ((now() at time zone 'Europe/Minsk')::date, p_source, 1)
  on conflict (day, source) do update
    set visits = t.visits + 1;
end;
$$;

revoke all on function public.track_search_visit(text) from public, anon, authenticated;
grant execute on function public.track_search_visit(text) to anon, authenticated, service_role;
grant select on public.search_visits_daily to anon, authenticated;

NOTIFY pgrst, 'reload schema';
