-- Клики из ИИ-чатов (Метрика, referrer) + AI-охват Google (пока CSV из
-- Generative AI performance report — API searchAnalytics type для AI ещё
-- не отдаёт, проверено 2026-10-07).

create table if not exists public.yandex_metrika_ai_referrers (
  host text primary key,
  label text not null,
  engine text not null,
  visits integer not null default 0,
  users integer not null default 0,
  window_days integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.google_search_console_ai_stats (
  date date primary key,
  impressions integer,
  source text not null default 'csv',
  updated_at timestamptz not null default now()
);

create table if not exists public.google_search_console_ai_pages (
  page text primary key,
  impressions integer,
  date_from date,
  date_to date,
  updated_at timestamptz not null default now()
);

alter table public.yandex_metrika_ai_referrers enable row level security;
alter table public.google_search_console_ai_stats enable row level security;
alter table public.google_search_console_ai_pages enable row level security;

drop policy if exists authenticated_select on public.yandex_metrika_ai_referrers;
create policy authenticated_select on public.yandex_metrika_ai_referrers
  for select to authenticated using (true);

drop policy if exists authenticated_select on public.google_search_console_ai_stats;
create policy authenticated_select on public.google_search_console_ai_stats
  for select to authenticated using (true);

drop policy if exists authenticated_select on public.google_search_console_ai_pages;
create policy authenticated_select on public.google_search_console_ai_pages
  for select to authenticated using (true);

revoke all on table public.yandex_metrika_ai_referrers from anon, authenticated;
revoke all on table public.google_search_console_ai_stats from anon, authenticated;
revoke all on table public.google_search_console_ai_pages from anon, authenticated;

grant select on table public.yandex_metrika_ai_referrers to authenticated;
grant select on table public.google_search_console_ai_stats to authenticated;
grant select on table public.google_search_console_ai_pages to authenticated;

grant all on table public.yandex_metrika_ai_referrers to service_role;
grant all on table public.google_search_console_ai_stats to service_role;
grant all on table public.google_search_console_ai_pages to service_role;

notify pgrst, 'reload schema';
