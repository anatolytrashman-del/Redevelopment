-- Свой счётчик посещаемости по сайтам (платформа / malllist / offiselist).
-- Нужен, чтобы хиты malllist.pro не смешивались с redevelopment.pro, а позже
-- сводить все проекты в один дашборд по колонке site.
-- Совместимо со старым фронтом: p_site по умолчанию 'platform'.

alter table public.page_views_daily
  add column if not exists site text not null default 'platform';

alter table public.page_views_daily
  drop constraint if exists page_views_daily_site_check;

alter table public.page_views_daily
  add constraint page_views_daily_site_check
  check (site in ('platform', 'malls', 'offices'));

alter table public.page_views_daily drop constraint if exists page_views_daily_pkey;
alter table public.page_views_daily
  add primary key (day, path, site);

alter table public.search_visits_daily
  add column if not exists site text not null default 'platform';

alter table public.search_visits_daily
  drop constraint if exists search_visits_daily_site_check;

alter table public.search_visits_daily
  add constraint search_visits_daily_site_check
  check (site in ('platform', 'malls', 'offices'));

alter table public.search_visits_daily drop constraint if exists search_visits_daily_pkey;
alter table public.search_visits_daily
  add primary key (day, source, site);

-- Старая сигнатура (2 аргумента) — отдельная функция; убираем, иначе
-- PostgREST/вызовы могут попасть в «function is not unique».
drop function if exists public.track_page_view(text, boolean);

create or replace function public.track_page_view(
  p_path text,
  p_entry boolean default false,
  p_site text default 'platform'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_path is null or length(p_path) > 300 or left(p_path, 1) <> '/' or p_path like '/admin%' then
    return;
  end if;
  if p_site is null or p_site not in ('platform', 'malls', 'offices') then
    return;
  end if;
  insert into public.page_views_daily as t (day, path, site, views, entries)
    values (
      (now() at time zone 'Europe/Minsk')::date,
      p_path,
      p_site,
      1,
      case when p_entry then 1 else 0 end
    )
  on conflict (day, path, site) do update
    set views = t.views + 1,
        entries = t.entries + excluded.entries;
end;
$$;

revoke all on function public.track_page_view(text, boolean, text) from public, anon, authenticated;
grant execute on function public.track_page_view(text, boolean, text) to anon, authenticated, service_role;

drop function if exists public.track_search_visit(text);

create or replace function public.track_search_visit(
  p_source text,
  p_site text default 'platform'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source not in (
    'yandex', 'google', 'bing', 'duckduckgo', 'yahoo', 'baidu', 'ecosia', 'brave',
    'chatgpt', 'gemini', 'alice', 'copilot', 'perplexity', 'claude', 'grok', 'you'
  ) then
    return;
  end if;
  if p_site is null or p_site not in ('platform', 'malls', 'offices') then
    return;
  end if;

  insert into public.search_visits_daily as t (day, source, site, visits)
  values ((now() at time zone 'Europe/Minsk')::date, p_source, p_site, 1)
  on conflict (day, source, site) do update
    set visits = t.visits + 1;
end;
$$;

revoke all on function public.track_search_visit(text, text) from public, anon, authenticated;
grant execute on function public.track_search_visit(text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
