-- ИИ-чаты как источники визитов в собственном счётчике (без cookie).
-- Раньше track_search_visit принимал только поисковики — переходы из
-- ChatGPT/Gemini/Алисы считались обычным entry без source.

alter table public.search_visits_daily
  drop constraint if exists search_visits_daily_source_check;

alter table public.search_visits_daily
  add constraint search_visits_daily_source_check
  check (source in (
    'yandex', 'google', 'bing', 'duckduckgo', 'yahoo', 'baidu', 'ecosia', 'brave',
    'chatgpt', 'gemini', 'alice', 'copilot', 'perplexity', 'claude', 'grok', 'you'
  ));

create or replace function public.track_search_visit(p_source text)
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

  insert into public.search_visits_daily as t (day, source, visits)
  values ((now() at time zone 'Europe/Minsk')::date, p_source, 1)
  on conflict (day, source) do update
    set visits = t.visits + 1;
end;
$$;

revoke all on function public.track_search_visit(text) from public, anon, authenticated;
grant execute on function public.track_search_visit(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
