-- История объявлений по зданиям: снимки business_center_offers во времени.
--
-- Зачем (владелец, 2026-09-21, при разборе блока «Что сейчас сдают и продают»):
-- синк полностью заменяет содержимое business_center_offers, и на 2026-09-21
-- у ВСЕХ 1 544 строк один и тот же updated_at — динамику цен по зданию
-- построить нельзя в принципе. Упущенное время не догнать задним числом:
-- «цены в этом здании за полгода» появятся только через полгода после того,
-- как начнём копить, поэтому копим с сегодняшнего дня, ещё до того, как
-- график будет нарисован.
--
-- Почему снимок СЫРЫХ строк, а не дневной агрегат: схлопывание одного лота,
-- выложенного на четырёх площадках, живёт в TypeScript (src/lib/
-- businessCenterOfferDuplicates.ts) и применяется на фронте. Агрегат на
-- стороне базы потребовал бы второй копии этого правила на SQL, и она
-- разошлась бы с первой — тогда график показывал бы одно число лотов, а
-- карточка под ним другое. Со снимком сырых строк логика остаётся одна:
-- тот же dedupeOffers применяется к любому историческому срезу.
create table if not exists business_center_offer_snapshots (
  captured_on date not null default current_date,
  business_center_slug text not null,
  source text not null,
  ad_id text not null,
  deal_type text not null,
  property_type text,
  size numeric not null,
  price_per_sqm numeric not null,
  floor integer,
  primary key (captured_on, business_center_slug, source, ad_id)
);

create index if not exists business_center_offer_snapshots_slug_idx
  on business_center_offer_snapshots (business_center_slug, captured_on);

alter table business_center_offer_snapshots enable row level security;

-- Читать историю будет публичная страница здания — те же данные, что уже
-- открыты в business_center_offers. Запись — только service_role.
drop policy if exists "public read offer snapshots" on business_center_offer_snapshots;
create policy "public read offer snapshots" on business_center_offer_snapshots for select using (true);

grant select on business_center_offer_snapshots to anon, authenticated;
grant all on business_center_offer_snapshots to service_role;

-- Снимок пишется, ТОЛЬКО когда набор объявлений реально изменился: синк
-- ходит раз в месяц, а задание — ежедневно, и без этой проверки в таблице
-- копились бы тридцать одинаковых срезов на каждое изменение.
create or replace function capture_business_center_offer_snapshot()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  last_day date;
  current_fingerprint text;
  last_fingerprint text;
  inserted integer;
begin
  select md5(string_agg(row_key, '|' order by row_key))
  into current_fingerprint
  from (
    select business_center_slug || ';' || source || ';' || ad_id || ';' || deal_type || ';' ||
           coalesce(property_type, '') || ';' || size::text || ';' || price_per_sqm::text || ';' ||
           coalesce(floor::text, '') as row_key
    from business_center_offers
  ) s;

  if current_fingerprint is null then
    return 'skipped: business_center_offers пуста';
  end if;

  select max(captured_on) into last_day from business_center_offer_snapshots;
  if last_day is not null then
    select md5(string_agg(row_key, '|' order by row_key))
    into last_fingerprint
    from (
      select business_center_slug || ';' || source || ';' || ad_id || ';' || deal_type || ';' ||
             coalesce(property_type, '') || ';' || size::text || ';' || price_per_sqm::text || ';' ||
             coalesce(floor::text, '') as row_key
      from business_center_offer_snapshots
      where captured_on = last_day
    ) s;
  end if;

  if current_fingerprint is not distinct from last_fingerprint then
    return 'unchanged';
  end if;

  insert into business_center_offer_snapshots
    (captured_on, business_center_slug, source, ad_id, deal_type, property_type, size, price_per_sqm, floor)
  select current_date, business_center_slug, source, ad_id, deal_type, property_type, size, price_per_sqm, floor
  from business_center_offers
  on conflict (captured_on, business_center_slug, source, ad_id) do update
    set deal_type = excluded.deal_type,
        property_type = excluded.property_type,
        size = excluded.size,
        price_per_sqm = excluded.price_per_sqm,
        floor = excluded.floor;

  get diagnostics inserted = row_count;
  return format('captured %s строк', inserted);
end;
$$;

-- Postgres выдаёт EXECUTE роли PUBLIC при создании функции, а anon и
-- authenticated наследуют его — отзыв персонально у них ничего не закрывает
-- (см. CLAUDE.md про auto_reply_apply).
revoke all on function capture_business_center_offer_snapshot() from public, anon, authenticated;
grant execute on function capture_business_center_offer_snapshot() to service_role;

-- Ежедневно в 05:20 UTC — после ночных синков, до того как кто-то откроет
-- сайт утром. Новую периодику заводим в pg_cron, а не в GitHub Actions
-- (CLAUDE.md, разбор троттлинга 2026-09-11).
select cron.unschedule('capture-bc-offer-snapshot')
where exists (select 1 from cron.job where jobname = 'capture-bc-offer-snapshot');

select cron.schedule('capture-bc-offer-snapshot', '20 5 * * *', $cron$select capture_business_center_offer_snapshot()$cron$);

NOTIFY pgrst, 'reload schema';
