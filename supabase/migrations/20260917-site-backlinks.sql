-- Снимок внешних ссылок на публичные страницы redevelopment.pro для блока
-- «Обратные ссылки» на /admin/site-metrics. Яндекс.Вебмастер отдаёт список
-- через официальный API и суточный sync-yandex-webmaster переписывает здесь
-- его актуальное состояние.
--
-- Google Search Console намеренно предусмотрен как provider, но его отчёт
-- Links не входит в официальный Search Console API (там доступны только
-- Search Analytics, Sitemaps, Sites и URL Inspection). Поэтому код не
-- имитирует Google-данные и не обращается к недокументированным ручкам.

create table if not exists public.site_backlinks (
  link_key text primary key,
  provider text not null check (provider in ('yandex_webmaster', 'google_search_console')),
  source_url text not null,
  destination_url text not null,
  discovery_date date,
  source_last_access_date date,
  updated_at timestamptz not null default now()
);

create index if not exists site_backlinks_provider_discovery_idx
  on public.site_backlinks (provider, discovery_date desc);

create index if not exists site_backlinks_destination_idx
  on public.site_backlinks (destination_url);

alter table public.site_backlinks enable row level security;

drop policy if exists authenticated_select on public.site_backlinks;
create policy authenticated_select on public.site_backlinks
  for select to authenticated using (true);

notify pgrst, 'reload schema';
