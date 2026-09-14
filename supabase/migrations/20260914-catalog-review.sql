-- Переосмысление каталога товарных групп. Владелец, 2026-09-14: «у нас
-- впереди сотни поставщиков, категории могут называться по-разному, могут
-- появляться новые сегменты. Я хочу, чтобы все категории записывались в базу,
-- а скрипт время от времени проходился по всему каталогу и упорядочивал их.
-- Если надо, создавал новые категории. Разбивал одну на несколько, или
-- укрупнял, на выбор модели».
--
-- Две таблицы:
--
-- supply_terms — словарь СЫРЫХ названий разделов, снятых с сайтов, и то, в
-- какие наши группы они отображаются. Это и есть материал для переосмысления:
-- без него модель рассуждала бы вслепую, по одним только именам групп. Плюс
-- он превращает присвоение категорий поставщику в обычный поиск по словарю:
-- дерево разделов → термины → группы, без обращения к модели на каждого
-- поставщика.
--
-- supply_catalog_reviews — журнал проходов: когда был, сколько поставщиков
-- было на тот момент, что изменилось. Ритм задал владелец: первый проход
-- через 50 новых поставщиков, дальше через каждые 100.
create table if not exists supply_terms (
  -- нормализованный термин (нижний регистр, без счётчиков и лишних пробелов)
  term text primary key,
  -- как он выглядел на сайте в первый раз — для чтения человеком
  sample text not null default '',
  -- у скольких доменов встречается: частота решает, стоит ли ради термина
  -- заводить отдельную группу
  hosts int not null default 0,
  -- группы справочника, в которые он отображается (пусто = не товарный
  -- раздел либо ещё не разобран)
  categories text[] not null default '{}',
  -- служебный/мусорный термин: «Все акции», «Личный кабинет». Помечается
  -- один раз и больше не занимает внимание в следующих проходах.
  ignored boolean not null default false,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supply_terms_hosts_idx on supply_terms (hosts desc);

create table if not exists supply_catalog_reviews (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  -- чем думали: 'claude-fable-5-1', 'сессия' и т.п.
  model text not null default '',
  suppliers_at_review int not null default 0,
  terms_total int not null default 0,
  terms_mapped int not null default 0,
  categories_after int not null default 0,
  summary text not null default ''
);

alter table supply_terms enable row level security;
alter table supply_catalog_reviews enable row level security;

drop policy if exists authenticated_all on supply_terms;
create policy authenticated_all on supply_terms
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_all on supply_catalog_reviews;
create policy authenticated_all on supply_catalog_reviews
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
