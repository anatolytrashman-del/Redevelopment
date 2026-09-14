-- Ручная верификация поставщиков по скриншотам каталога + справочник
-- товарных групп в базе. Владелец, 2026-09-14: «у поставщика дофигища
-- категорий и на каждую нужен скрин; грузить их в чат — забивать контекст.
-- Нужно решение, чтобы скрины массово грузить, движок их анализировал,
-- корректировал категории, добавлял новые найденные, и всё это
-- отображалось в общем каталоге поставщиков».
--
-- Схема: скрин → приватно в бакет (публичное чтение, файлы и так с
-- публичных сайтов) → строка здесь со статусом pending → сессия Claude
-- Code выкачивает накопившееся (scripts/supply-categories/screenshots.mjs),
-- субагент расшифровывает картинки в дерево разделов, текст ложится в
-- transcript → дальше обычный конвейер review.mjs (разделы как manual://,
-- категории только с уликами). Сам скрин НИКОГДА не пишет категории
-- напрямую — иначе вернётся галлюцинация, только через картинки.

insert into storage.buckets (id, name, public)
values ('supplier-screenshots', 'supplier-screenshots', true)
on conflict (id) do nothing;

drop policy if exists "authenticated_all_supplier_screenshots" on storage.objects;
create policy "authenticated_all_supplier_screenshots" on storage.objects
  for all to authenticated
  using (bucket_id = 'supplier-screenshots')
  with check (bucket_id = 'supplier-screenshots');

drop policy if exists "public_read_supplier_screenshots" on storage.objects;
create policy "public_read_supplier_screenshots" on storage.objects
  for select to public
  using (bucket_id = 'supplier-screenshots');

create table if not exists supplier_screenshots (
  id uuid primary key default gen_random_uuid(),
  -- Домен, а не карточка-предложение: разделы принадлежат сайту компании,
  -- как и сам снимок (см. supplier_site_snapshots — там тоже строка на хост).
  host text not null,
  storage_path text not null unique,
  public_url text not null,
  uploaded_at timestamptz not null default now(),
  -- pending — ждёт расшифровки; done — разобран, разделы уже в снимке;
  -- skipped — не пригодился (дубль, нечитаемый, не та страница).
  status text not null default 'pending',
  -- Что модель прочитала с картинки. Хранится, чтобы владелец мог
  -- проверить расшифровку глазами, а не доверять ей вслепую.
  transcript text not null default '',
  processed_at timestamptz,
  note text not null default ''
);

create index if not exists supplier_screenshots_status_idx
  on supplier_screenshots (status, host);
create index if not exists supplier_screenshots_host_idx
  on supplier_screenshots (host);

alter table supplier_screenshots enable row level security;
drop policy if exists authenticated_all on supplier_screenshots;
create policy authenticated_all on supplier_screenshots
  for all to authenticated using (true) with check (true);

-- Справочник товарных групп переезжает из кода (src/data/supplyCategories.ts)
-- в базу. Причина: при тысяче поставщиков новые группы находятся постоянно
-- (только 2026-09-14 их нашлось шесть), а каждая новая группа в коде — это
-- коммит и ожидание публикации очереди релиза; до публикации группа видна
-- чипом на карточке, но своей плитки в каталоге не получает.
--
-- Файл в коде остаётся сидом и запасным вариантом: фронт читает базу, а при
-- пустом/недоступном ответе показывает то, что зашито в файле (старый код,
-- доехавший до прода раньше миграции, продолжает работать как и работал —
-- он про эту таблицу просто не знает).
create table if not exists supply_categories (
  name text primary key,
  hint text not null default '',
  -- Имя плитки в SUPPLIER_CATALOG (SupplierCatalogCategory.name), куда
  -- группа попадает в общем каталоге. Пусто — группа есть, но своей плитки
  -- у неё пока нет (видна только чипом на карточке поставщика).
  tile text not null default '',
  sort integer not null default 0,
  -- seed — приехала из файла-справочника; found — найдена при верификации
  -- живого поставщика (по скриншоту каталога или разделам снимка).
  source text not null default 'seed',
  -- Откуда взялась: «77volt.ru, скрин меню 2026-09-14» — чтобы через полгода
  -- было видно, почему группа вообще заведена.
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Политика ровно как у остальных таблиц поставщиков: вход в админку — это
-- настоящий supabase.auth.signInWithPassword (см. PasswordGate.tsx), так что
-- роль authenticated покрывает весь фронт. Анонимного доступа к справочнику
-- не даём: публичные страницы сайта его не читают, лишняя поверхность ни к
-- чему (проверено — аноним получает пустой ответ).
alter table supply_categories enable row level security;
drop policy if exists authenticated_all on supply_categories;
create policy authenticated_all on supply_categories
  for all to authenticated using (true) with check (true);

NOTIFY pgrst, 'reload schema';
