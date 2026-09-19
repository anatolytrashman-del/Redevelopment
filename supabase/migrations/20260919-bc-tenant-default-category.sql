-- Пользователь принял единый фолбэк для организаций, у которых Яндекс Карты
-- не отдали категорию: такие записи показываются как «Офис организации».
--
-- Было UPDATE ... FROM LATERAL (...), ссылающийся на саму обновляемую
-- таблицу изнутри LATERAL-подзапроса — Postgres такое не разрешает
-- (42P10 "invalid reference to FROM-clause entry"): в UPDATE ... FROM
-- целевая таблица не входит в FROM-список, на который может смотреть
-- LATERAL. Заменено на коррелированный скалярный подзапрос прямо в SET —
-- тот же результат, но так Postgres действительно умеет.

update public.business_center_tenant_source_snapshots snapshot
set organizations = (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(item.value) = 'object'
        and nullif(btrim(item.value ->> 'category'), '') is null
      then jsonb_set(item.value, '{category}', to_jsonb('Офис организации'::text), true)
      else item.value
    end
    order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(snapshot.organizations) with ordinality as item(value, ordinality)
)
where snapshot.source = 'yandex_maps'
  and jsonb_typeof(snapshot.organizations) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(snapshot.organizations) item(value)
    where jsonb_typeof(item.value) = 'object'
      and nullif(btrim(item.value ->> 'category'), '') is null
  );

update public.business_centers center
set tenant_organizations = (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(item.value) = 'object'
        and nullif(btrim(item.value ->> 'category'), '') is null
      then jsonb_set(item.value, '{category}', to_jsonb('Офис организации'::text), true)
      else item.value
    end
    order by item.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(center.tenant_organizations) with ordinality as item(value, ordinality)
)
where jsonb_typeof(center.tenant_organizations) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(center.tenant_organizations) item(value)
    where jsonb_typeof(item.value) = 'object'
      and nullif(btrim(item.value ->> 'category'), '') is null
  );

notify pgrst, 'reload schema';
