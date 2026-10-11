-- Разбивка показов/кликов Google по СТРАНИЦАМ (2026-09-29). В отличие от
-- разбивки по запросам, Google не прячет здесь «анонимизированные» строки:
-- по запросам видно 6 кликов из 49, по страницам — почти все. Снимок за
-- окно целиком, как google_search_console_queries; пишет
-- scripts/sync-google-search-console-stats.mjs.
create table if not exists public.google_search_console_pages (
  page text primary key,
  impressions integer,
  clicks integer,
  ctr numeric,
  avg_position numeric,
  date_from date,
  date_to date,
  updated_at timestamptz not null default now()
);

alter table public.google_search_console_pages enable row level security;

drop policy if exists authenticated_select on public.google_search_console_pages;
create policy authenticated_select on public.google_search_console_pages
  for select to authenticated using (true);

notify pgrst, 'reload schema';
