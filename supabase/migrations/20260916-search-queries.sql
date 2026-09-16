-- Разбивка показов/кликов из поиска ПО ЗАПРОСАМ — для блоков «Индексация и
-- поисковые запросы» на странице «Показатели» (владелец, 2026-09-16: «очень
-- интересно, по каким запросам идут показы и клики»). До этого обе таблицы
-- со статистикой хранили только суммы за день, самих запросов не было нигде.
--
-- Обе таблицы — СНИМОК за окно (как yandex_metrika_top_pages), а не история
-- по дням: и Вебмастер (search-queries/popular), и Search Console
-- (searchAnalytics с dimensions=['query']) агрегируют запросы за период
-- целиком, суточной разбивки по каждому запросу не отдают. Снимок
-- перезаписывается синком целиком; date_from/date_to — период, который
-- реально вернул сервис (у Вебмастера он обрезан его собственной глубиной
-- истории, у Google — лагом в 2-3 дня), поэтому подписываем на странице
-- фактические даты, а не «за 90 дней».

create table if not exists public.yandex_webmaster_queries (
  query text primary key,
  impressions integer,
  clicks integer,
  avg_position numeric,
  avg_click_position numeric,
  date_from date,
  date_to date,
  updated_at timestamptz not null default now()
);

alter table public.yandex_webmaster_queries enable row level security;

drop policy if exists authenticated_select on public.yandex_webmaster_queries;
create policy authenticated_select on public.yandex_webmaster_queries
  for select to authenticated using (true);

create table if not exists public.google_search_console_queries (
  query text primary key,
  impressions integer,
  clicks integer,
  ctr numeric,
  avg_position numeric,
  date_from date,
  date_to date,
  updated_at timestamptz not null default now()
);

alter table public.google_search_console_queries enable row level security;

drop policy if exists authenticated_select on public.google_search_console_queries;
create policy authenticated_select on public.google_search_console_queries
  for select to authenticated using (true);

notify pgrst, 'reload schema';
