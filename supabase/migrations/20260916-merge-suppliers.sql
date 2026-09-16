-- Объединение компаний-дублей (шаг 4c плана docs/procurement-product-steps.md).
--
-- Почему не переиспользован mergeSupplierOffers: тот сливает КАРТОЧКИ одной
-- категории закупки (это делалось вручную ещё до появления компаний). Здесь
-- задача другая — две записи о ФИРМЕ, у каждой свои карточки, контакты и
-- проверки. В живой базе таких дублей немного и все содержательные: один
-- поставщик под двумя доменами (arlight.ru и arlight.moscow), фирма и её
-- региональный поддомен (avangardrf.ru и msk.avangardrf.ru), шесть пар с
-- одинаковой почтой. Рядом лежит контрпример: «ТЕХНОстрой» (.by) и
-- «ТехноСтрой» (.ru) — РАЗНЫЕ компании с одним названием, поэтому слияние
-- остаётся ручным действием человека, а база только предлагает кандидатов.
--
-- Всё слияние — одной функцией в базе, а не серией запросов с клиента:
-- оборвись оно посередине, часть карточек уже смотрела бы на одну компанию,
-- часть на другую, а дубль остался бы живым.

-- Кандидаты на объединение: те же признаки, что в isSameSupplier
-- (src/data/supplierResearch.ts) — ИНН, почта, домен, название при
-- совпадающей или пустой стране. Домен среди живых компаний уникален, но
-- пригодится после мягкого удаления.
create or replace function supplier_merge_candidates(p_supplier uuid)
returns setof suppliers language sql stable security invoker set search_path = public as $$
  select c.*
    from suppliers s
    join suppliers c
      on c.id <> s.id
     and c.deleted_at is null
     and (
       (coalesce(trim(s.inn), '') <> '' and trim(c.inn) = trim(s.inn))
       or (coalesce(trim(s.email), '') <> '' and lower(trim(c.email)) = lower(trim(s.email)))
       or (s.website_host is not null and c.website_host = s.website_host)
       or (
         supplier_normalized_name(s.name) <> ''
         and supplier_normalized_name(c.name) = supplier_normalized_name(s.name)
         and (coalesce(trim(s.country), '') = '' or coalesce(trim(c.country), '') = '' or trim(c.country) = trim(s.country))
       )
     )
   where s.id = p_supplier and s.deleted_at is null
   order by c.name;
$$;

-- Слияние: всё, что висит на дубле, переезжает на основную компанию, пустые
-- поля основной дополняются данными дубля (правило «первое непустое», как в
-- buildMergedOfferPayload), дубль мягко удаляется.
create or replace function merge_suppliers(p_target uuid, p_source uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_target suppliers%rowtype;
  v_source suppliers%rowtype;
begin
  if p_target = p_source then
    raise exception 'Нельзя объединить компанию саму с собой';
  end if;

  select * into v_target from suppliers where id = p_target and deleted_at is null;
  if not found then raise exception 'Основная компания не найдена'; end if;
  select * into v_source from suppliers where id = p_source and deleted_at is null;
  if not found then raise exception 'Компания-дубль не найдена'; end if;

  -- Контакты: адрес уникален в пределах компании, поэтому тех, чей адрес у
  -- основной компании уже есть, не переносим, а мягко гасим у дубля —
  -- переносить их означало бы нарушить индекс и уронить всё слияние.
  update supplier_contacts c
     set deleted_at = now()
   where c.supplier_id = p_source
     and c.deleted_at is null
     and c.email <> ''
     and exists (
       select 1 from supplier_contacts t
        where t.supplier_id = p_target and t.deleted_at is null and lower(t.email) = lower(c.email)
     );
  update supplier_contacts set supplier_id = p_target where supplier_id = p_source and deleted_at is null;

  update supplier_research_offers set supplier_id = p_target where supplier_id = p_source;
  update supplier_reliability set supplier_id = p_target where supplier_id = p_source;
  update supplier_reliability_checks set supplier_id = p_target where supplier_id = p_source;

  -- Дополняем основную компанию тем, чего у неё нет. Её собственные данные
  -- не перезаписываем никогда: это та запись, которую человек оставляет жить.
  update suppliers
     set website_host = coalesce(website_host, v_source.website_host),
         website_url  = case when coalesce(trim(website_url), '') = '' then coalesce(v_source.website_url, '') else website_url end,
         inn          = coalesce(nullif(trim(coalesce(inn, '')), ''), nullif(trim(coalesce(v_source.inn, '')), '')),
         country      = case when coalesce(trim(country), '') = '' then coalesce(v_source.country, '') else country end,
         city         = case when coalesce(trim(city), '') = '' then coalesce(v_source.city, '') else city end,
         email        = case when coalesce(trim(email), '') = '' then coalesce(v_source.email, '') else email end,
         phone        = case when coalesce(trim(phone), '') = '' then coalesce(v_source.phone, '') else phone end,
         messengers   = case when jsonb_array_length(messengers) = 0 then v_source.messengers else messengers end,
         terms_note   = case when coalesce(trim(terms_note), '') = '' then coalesce(v_source.terms_note, '') else terms_note end,
         verified     = verified or v_source.verified
   where id = p_target;

  -- Дубль мягко удаляем: как и везде в модуле, строка остаётся — по ней
  -- видно, что такая запись была и во что её слили.
  update suppliers set deleted_at = now() where id = p_source;
end $$;

notify pgrst, 'reload schema';
