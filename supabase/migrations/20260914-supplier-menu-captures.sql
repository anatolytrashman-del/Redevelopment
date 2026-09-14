-- Снимки меню каталога, снятые закладкой «Снять меню» прямо со страницы
-- поставщика (tools/menu-bookmarklet). Владелец, 2026-09-14: «я не хочу
-- вручную пересылать каждый раз. Надо так: открылась вкладка, Светлана
-- нажала кнопку снимка, система записала в память и, если всё ок, показала
-- уведомление. Светлана вернётся в карточку, заполнит телефон, сохранит».
--
-- Как попадает сюда без всякого сервера-приёмника: вкладку с сайтом
-- поставщика открывает САМА админка (openSupplierSiteTab в
-- SupplierVerificationTab.tsx), поэтому у этой вкладки есть ссылка на
-- открывшую её вкладку админки. Закладка отправляет дерево туда
-- (postMessage), а уже админка — авторизованная, с живой сессией — пишет
-- строку сюда. Ни токенов в закладке, ни всплывающих окон.
--
-- Почему не пишем разделы сразу в supplier_site_snapshots: дерево нужно
-- сначала просмотреть глазами. На первом же живом снимке (msk.avangardrf.ru,
-- 150 разделов) товарная часть вышла идеальной, а в хвосте оказались «Все
-- акции», «Все новости», названия товаров и куски рекламных блоков — такое
-- в улики пускать нельзя. Поэтому статус pending, и разбор идёт из сессии
-- (scripts/supply-categories/captures.mjs).
create table if not exists supplier_menu_captures (
  id uuid primary key default gen_random_uuid(),
  -- Домен, как и у снимков сайта со скриншотами: разделы принадлежат сайту
  -- компании, а не отдельной карточке-предложению.
  host text not null,
  -- Конкретная страница, с которой сняли: у одного сайта меню на странице
  -- каталога и на главной могут отличаться.
  page_url text not null default '',
  -- Дерево разделов текстом, отступ два пробела на уровень — ровно тот
  -- формат, который принимает review.mjs sections.
  tree text not null,
  sections_count integer not null default 0,
  captured_at timestamptz not null default now(),
  -- pending — снято, ждёт разбора; applied — разделы внесены в снимок сайта;
  -- skipped — не пригодилось (дубль, мусор, не та страница).
  status text not null default 'pending',
  applied_at timestamptz,
  note text not null default ''
);

create index if not exists supplier_menu_captures_status_idx
  on supplier_menu_captures (status, host);

alter table supplier_menu_captures enable row level security;
drop policy if exists authenticated_all on supplier_menu_captures;
create policy authenticated_all on supplier_menu_captures
  for all to authenticated using (true) with check (true);

NOTIFY pgrst, 'reload schema';
