-- Яндекс Карты иногда включает сам бизнес-центр в список организаций внутри
-- здания (например, «Порт» с категорией «Бизнес-центр подъезд 1»). Такая
-- карточка описывает объект каталога, а не арендатора, поэтому удаляем её из
-- сохранённого снимка и публичной карточки БЦ.

with cleaned as (
  select
    snapshot.business_center_slug,
    snapshot.source,
    coalesce(
      jsonb_agg(item.value order by item.ordinality) filter (
        where jsonb_typeof(item.value) <> 'object'
          or lower(btrim(coalesce(item.value ->> 'category', '')))
            !~ '^бизнес[[:space:]-]*центр([[:space:],.:;/-]|$)'
      ),
      '[]'::jsonb
    ) as organizations
  from public.business_center_tenant_source_snapshots snapshot
  cross join lateral jsonb_array_elements(snapshot.organizations)
    with ordinality as item(value, ordinality)
  where snapshot.source = 'yandex_maps'
    and jsonb_typeof(snapshot.organizations) = 'array'
  group by snapshot.business_center_slug, snapshot.source
)
update public.business_center_tenant_source_snapshots snapshot
set
  organizations = cleaned.organizations,
  organization_count = jsonb_array_length(cleaned.organizations)
from cleaned
where snapshot.business_center_slug = cleaned.business_center_slug
  and snapshot.source = cleaned.source
  and snapshot.organizations is distinct from cleaned.organizations;

with cleaned as (
  select
    center.slug,
    coalesce(
      jsonb_agg(item.value order by item.ordinality) filter (
        where jsonb_typeof(item.value) <> 'object'
          or lower(btrim(coalesce(item.value ->> 'category', '')))
            !~ '^бизнес[[:space:]-]*центр([[:space:],.:;/-]|$)'
      ),
      '[]'::jsonb
    ) as organizations
  from public.business_centers center
  cross join lateral jsonb_array_elements(center.tenant_organizations)
    with ordinality as item(value, ordinality)
  where jsonb_typeof(center.tenant_organizations) = 'array'
  group by center.slug
)
update public.business_centers center
set tenant_organizations = cleaned.organizations
from cleaned
where center.slug = cleaned.slug
  and center.tenant_organizations is distinct from cleaned.organizations;

notify pgrst, 'reload schema';
