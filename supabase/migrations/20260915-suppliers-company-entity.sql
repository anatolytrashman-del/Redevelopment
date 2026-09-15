-- Компания как отдельная сущность (шаг 2 плана docs/procurement-product-steps.md,
-- §5.2 аудита).
--
-- Зачем. Сейчас «поставщик» в базе — это строка supplier_research_offers,
-- то есть УЧАСТИЕ компании в одной категории закупки. Одна и та же фирма,
-- которой писали по краске и по плитке, существует в базе дважды, и ничего,
-- кроме подсказки isSameSupplier в интерфейсе, эти две строки не связывает:
-- у каждой свои контакты, своя переписка, своя верификация. Карточку
-- поставщика (шаги 3–4) на таких данных не построить — ей нужен один объект
-- «компания», к которому относятся все категории, письма и КП.
--
-- Что делаем здесь (без единого изменения в интерфейсе):
--   1. Таблица suppliers — одна строка на компанию.
--   2. Колонка supplier_research_offers.supplier_id, пока nullable.
--   3. Бэкфилл: одна компания на уникальный домен сайта.
--   4. Триггер: новая карточка сама находит или заводит компанию.
-- Старый код колонки не знает и продолжает работать как раньше — это
-- обязательное условие, миграция применяется до выкатки кода.

-- ── 1. Нормализация домена, ровно как supplierWebsiteHost в
-- src/data/supplierResearch.ts: снять протокол, снять www, отрезать путь.
-- Порядок именно последовательный: один regexp_replace с двумя ветками и
-- флагом 'g' не снимет www после протокола (якорь ^ уже не совпадёт) —
-- на живой базе это давало разные хосты у bafus.ru и www.bafus.ru.
create or replace function supplier_website_host(url text)
returns text language sql immutable as $$
  select nullif(
    split_part(
      regexp_replace(regexp_replace(lower(trim(coalesce(url, ''))), '^https?://', ''), '^www\.', ''),
      '/', 1
    ),
    ''
  );
$$;

-- Название компании для сравнения — аналог normalizeSupplierName в том же
-- файле: регистр, ё/е, кавычки, точки и организационно-правовая форма долой.
create or replace function supplier_normalized_name(name text)
returns text language sql immutable as $$
  select btrim(regexp_replace(
    regexp_replace(
      regexp_replace(translate(lower(coalesce(name, '')), 'ё«»"''`.,', 'е       '),
        '\m(ооо|оао|зао|пао|ао|ип|одо|уп|чуп|тоо|iooo|llc)\M', ' ', 'g'),
      '\s+', ' ', 'g'),
    '^\s+|\s+$', '', 'g'));
$$;

-- ── 2. Сама компания.
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Домен сайта — основной ключ отождествления. Совпал домен (не
  -- маркетплейс) — это одна компания; так же считает isSameSupplier.
  website_host text,
  website_url text not null default '',
  inn text,
  country text not null default '',
  city text not null default '',
  email text not null default '',
  -- Телефон отдельным полем: в карточке он живёт в contact при
  -- contact_method = 'Телефон', и вытащить его оттуда можно только здесь.
  phone text not null default '',
  messengers jsonb not null default '[]'::jsonb,
  terms_note text not null default '',
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table suppliers is
  'Компания-поставщик. Одна строка на фирму; её участия в конкретных категориях закупки — это строки supplier_research_offers со ссылкой supplier_id.';

-- Одна живая компания на домен. Индекс частичный: у мягко удалённых
-- компаний домен не занимает место, и карточки без сайта (website_host is
-- null) не конфликтуют между собой.
create unique index if not exists suppliers_website_host_key
  on suppliers (website_host) where deleted_at is null and website_host is not null;
create index if not exists suppliers_inn_idx on suppliers (inn) where deleted_at is null and inn is not null;
create index if not exists suppliers_name_idx on suppliers (supplier_normalized_name(name)) where deleted_at is null;

alter table suppliers enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'suppliers' and policyname = 'authenticated_all') then
    create policy authenticated_all on suppliers for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── 3. Ссылка с карточки на компанию. Nullable намеренно: пока код не
-- умеет её заполнять сам, вставка без supplier_id должна проходить (её
-- подставит триггер ниже, но страховка на случай отключённого триггера
-- нужна). ON DELETE SET NULL, а не CASCADE: удаление компании не должно
-- уносить карточки с перепиской — это ровно та ошибка, которую закрыл шаг 1.
alter table supplier_research_offers
  add column if not exists supplier_id uuid references suppliers (id) on delete set null;
create index if not exists supplier_research_offers_supplier_id_idx
  on supplier_research_offers (supplier_id);

-- ── 4. Бэкфилл. Группируем живые карточки по домену и на каждую группу
-- заводим компанию. Правило конфликта полей — то же, что в
-- buildMergedOfferPayload (src/lib/supplierMergeApi.ts): побеждает первое
-- НЕПУСТОЕ значение, а порядок карточек внутри группы — сначала
-- верифицированные (их данные смотрел человек), потом те, где есть почта,
-- потом более ранние.
with ranked as (
  select
    o.*,
    supplier_website_host(o.website_url) as host,
    row_number() over (
      partition by supplier_website_host(o.website_url)
      order by o.verified desc, (coalesce(trim(o.email), '') <> '') desc, o.created_at
    ) as rn
  from supplier_research_offers o
  where o.deleted_at is null and supplier_website_host(o.website_url) is not null
),
grouped as (
  select
    host,
    (array_agg(name order by rn))[1] as name,
    (array_remove(array_agg(nullif(trim(website_url), '') order by rn), null))[1] as website_url,
    (array_remove(array_agg(nullif(trim(inn), '') order by rn), null))[1] as inn,
    (array_remove(array_agg(nullif(trim(country), '') order by rn), null))[1] as country,
    (array_remove(array_agg(nullif(trim(city), '') order by rn), null))[1] as city,
    (array_remove(array_agg(nullif(trim(email), '') order by rn), null))[1] as email,
    -- Телефон есть только там, где способ связи — телефон.
    (array_remove(array_agg(
      case when contact_method = 'Телефон' then nullif(trim(contact), '') end order by rn), null))[1] as phone,
    (array_remove(array_agg(
      case when jsonb_typeof(messengers) = 'array' and jsonb_array_length(messengers) > 0 then messengers end
      order by rn), null))[1] as messengers,
    (array_remove(array_agg(nullif(trim(terms_note), '') order by rn), null))[1] as terms_note,
    bool_or(verified) as verified,
    min(created_at) as created_at
  from ranked
  group by host
)
insert into suppliers (name, website_host, website_url, inn, country, city, email, phone, messengers, terms_note, verified, created_at)
select
  name, host, coalesce(website_url, ''), inn, coalesce(country, ''), coalesce(city, ''),
  coalesce(email, ''), coalesce(phone, ''), coalesce(messengers, '[]'::jsonb),
  coalesce(terms_note, ''), verified, created_at
from grouped
on conflict do nothing;

update supplier_research_offers o
   set supplier_id = s.id
  from suppliers s
 where o.supplier_id is null
   and s.deleted_at is null
   and s.website_host = supplier_website_host(o.website_url);

-- ── 5. Новая карточка сама находит или заводит компанию. Порядок поиска —
-- как в isSameSupplier: домен, затем ИНН, затем нормализованное название при
-- совпадающей (или пустой) стране. Триггер BEFORE INSERT, поэтому карточка
-- получает supplier_id ещё до записи, и старому коду для этого ничего знать
-- не нужно.
create or replace function supplier_offer_attach_company()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_host text;
  v_id uuid;
begin
  if new.supplier_id is not null then
    return new;
  end if;

  v_host := supplier_website_host(new.website_url);

  if v_host is not null then
    select id into v_id from suppliers where deleted_at is null and website_host = v_host limit 1;
  end if;

  if v_id is null and nullif(trim(coalesce(new.inn, '')), '') is not null then
    select id into v_id from suppliers
     where deleted_at is null and trim(coalesce(inn, '')) = trim(new.inn) limit 1;
  end if;

  if v_id is null and supplier_normalized_name(new.name) <> '' then
    select id into v_id from suppliers
     where deleted_at is null
       and supplier_normalized_name(name) = supplier_normalized_name(new.name)
       -- Разные страны при одинаковом названии — разные компании
       -- («ТЕХНОстрой» .by и «ТехноСтрой» .ru, разбор живой базы 2026-09-12).
       and (coalesce(trim(country), '') = '' or coalesce(trim(new.country), '') = ''
            or trim(country) = trim(new.country))
     limit 1;
  end if;

  if v_id is null then
    insert into suppliers (name, website_host, website_url, inn, country, city, email, phone, messengers, terms_note, verified)
    values (
      new.name, v_host, coalesce(new.website_url, ''), nullif(trim(coalesce(new.inn, '')), ''),
      coalesce(new.country, ''), coalesce(new.city, ''), coalesce(new.email, ''),
      case when new.contact_method = 'Телефон' then coalesce(new.contact, '') else '' end,
      coalesce(new.messengers, '[]'::jsonb), coalesce(new.terms_note, ''), coalesce(new.verified, false)
    )
    -- Гонка двух вставок одного домена: уникальный индекс по website_host
    -- отдаёт конфликт, и мы просто берём уже созданную компанию.
    on conflict (website_host) where (deleted_at is null and website_host is not null)
    do update set name = suppliers.name
    returning id into v_id;
  end if;

  new.supplier_id := v_id;
  return new;
end $$;

drop trigger if exists supplier_offer_attach_company_trg on supplier_research_offers;
create trigger supplier_offer_attach_company_trg
  before insert on supplier_research_offers
  for each row execute function supplier_offer_attach_company();

notify pgrst, 'reload schema';
