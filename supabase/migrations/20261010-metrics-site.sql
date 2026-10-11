-- Разнос статистики вебмастеров/GSC по сайтам (platform | malls | offices),
-- как уже сделано для page_views_daily / search_visits_daily.
-- Совместимо со старым кодом только через default 'platform': строки без site
-- остаются за платформой. После READY деплоя синки пишут site явно и
-- upsert'ят по составному ключу.

-- yandex_webmaster_stats
alter table public.yandex_webmaster_stats
  add column if not exists site text not null default 'platform';
alter table public.yandex_webmaster_stats
  drop constraint if exists yandex_webmaster_stats_site_check;
alter table public.yandex_webmaster_stats
  add constraint yandex_webmaster_stats_site_check
  check (site in ('platform', 'malls', 'offices'));
alter table public.yandex_webmaster_stats drop constraint if exists yandex_webmaster_stats_pkey;
alter table public.yandex_webmaster_stats
  add primary key (date, site);

-- yandex_webmaster_queries
alter table public.yandex_webmaster_queries
  add column if not exists site text not null default 'platform';
alter table public.yandex_webmaster_queries
  drop constraint if exists yandex_webmaster_queries_site_check;
alter table public.yandex_webmaster_queries
  add constraint yandex_webmaster_queries_site_check
  check (site in ('platform', 'malls', 'offices'));
alter table public.yandex_webmaster_queries drop constraint if exists yandex_webmaster_queries_pkey;
alter table public.yandex_webmaster_queries
  add primary key (query, site);

-- google_search_console_stats
alter table public.google_search_console_stats
  add column if not exists site text not null default 'platform';
alter table public.google_search_console_stats
  drop constraint if exists google_search_console_stats_site_check;
alter table public.google_search_console_stats
  add constraint google_search_console_stats_site_check
  check (site in ('platform', 'malls', 'offices'));
alter table public.google_search_console_stats drop constraint if exists google_search_console_stats_pkey;
alter table public.google_search_console_stats
  add primary key (date, site);

-- google_search_console_queries
alter table public.google_search_console_queries
  add column if not exists site text not null default 'platform';
alter table public.google_search_console_queries
  drop constraint if exists google_search_console_queries_site_check;
alter table public.google_search_console_queries
  add constraint google_search_console_queries_site_check
  check (site in ('platform', 'malls', 'offices'));
alter table public.google_search_console_queries drop constraint if exists google_search_console_queries_pkey;
alter table public.google_search_console_queries
  add primary key (query, site);

-- google_search_console_pages
alter table public.google_search_console_pages
  add column if not exists site text not null default 'platform';
alter table public.google_search_console_pages
  drop constraint if exists google_search_console_pages_site_check;
alter table public.google_search_console_pages
  add constraint google_search_console_pages_site_check
  check (site in ('platform', 'malls', 'offices'));
alter table public.google_search_console_pages drop constraint if exists google_search_console_pages_pkey;
alter table public.google_search_console_pages
  add primary key (page, site);

-- google_search_console_page_index
alter table public.google_search_console_page_index
  add column if not exists site text not null default 'platform';
alter table public.google_search_console_page_index
  drop constraint if exists google_search_console_page_index_site_check;
alter table public.google_search_console_page_index
  add constraint google_search_console_page_index_site_check
  check (site in ('platform', 'malls', 'offices'));
alter table public.google_search_console_page_index drop constraint if exists google_search_console_page_index_pkey;
alter table public.google_search_console_page_index
  add primary key (path, site);

-- site_backlinks
alter table public.site_backlinks
  add column if not exists site text not null default 'platform';
alter table public.site_backlinks
  drop constraint if exists site_backlinks_site_check;
alter table public.site_backlinks
  add constraint site_backlinks_site_check
  check (site in ('platform', 'malls', 'offices'));
create index if not exists site_backlinks_site_provider_idx
  on public.site_backlinks (site, provider);

notify pgrst, 'reload schema';
