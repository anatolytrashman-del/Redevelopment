-- Пользователь принял единый фолбэк для организаций, у которых Яндекс Карты
-- не отдали категорию: такие записи показываются как «Офис организации».

update public.business_center_tenant_source_snapshots snapshot
set organizations = normalized.organizations
from lateral (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(item.value) = 'object'
        and nullif(btrim(item.value ->> 'category'), '') is null
      then jsonb_set(item.value, '{category}', to_jsonb('Офис организации'::text), true)
      else item.value
    end
    order by item.ordinality
  ), '[]'::jsonb) as organizations
  from jsonb_array_elements(snapshot.organizations) with ordinality as item(value, ordinality)
) normalized
where snapshot.source = 'yandex_maps'
  and jsonb_typeof(snapshot.organizations) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(snapshot.organizations) item(value)
    where jsonb_typeof(item.value) = 'object'
      and nullif(btrim(item.value ->> 'category'), '') is null
  );

update public.business_centers center
set tenant_organizations = normalized.organizations
from lateral (
  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(item.value) = 'object'
        and nullif(btrim(item.value ->> 'category'), '') is null
      then jsonb_set(item.value, '{category}', to_jsonb('Офис организации'::text), true)
      else item.value
    end
    order by item.ordinality
  ), '[]'::jsonb) as organizations
  from jsonb_array_elements(center.tenant_organizations) with ordinality as item(value, ordinality)
) normalized
where jsonb_typeof(center.tenant_organizations) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(center.tenant_organizations) item(value)
    where jsonb_typeof(item.value) = 'object'
      and nullif(btrim(item.value ->> 'category'), '') is null
  );

notify pgrst, 'reload schema';
