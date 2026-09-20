-- Рейтинги арендаторов в запасном списке БЦ.
--
-- Карточка БЦ берёт арендаторов из трёх источников по убыванию полноты
-- (см. BusinessCenterDetailPage): живой срез Яндекса
-- (business_center_tenant_source_snapshots), материализованный список в самой
-- строке БЦ (business_centers.tenant_organizations) и 2GIS. Второй источник —
-- тот же Яндекс, разложенный по колонке отдельным проходом, и при этой
-- раскладке рейтинг с числом оценок потерялся: на 2026-09-20 из 136 зданий с
-- таким списком рейтинги были только у 25, хотя в срезе они есть у 134.
--
-- Почему это видно пользователю, хотя снапшот «главнее». Запрос за срезом
-- уходит отдельно от самой карточки БЦ, и если он не доехал (медленная сеть,
-- расширение браузера, фильтрующий провайдер), страница МОЛЧА показывает
-- запасной список — с теми же организациями и рубриками, но без звёзд, без
-- сортировки по числу оценок и без строки «N отзывов / средний рейтинг».
-- Снаружи это неотличимо от «у нас нет этих данных», хотя данные есть.
-- Владелец поймал это дважды подряд, 2026-09-20; опознаётся по подвалу блока:
-- «Организации из Яндекс.Карт по адресу здания» БЕЗ даты среза — дату рисует
-- только снапшот.
--
-- Лечим данные, а не симптом: запасной список должен быть полноценным, тогда
-- звёзды на месте при любом исходе второго запроса. Сопоставление идёт по
-- паре «название + рубрика» внутри одного здания; у одноимённых карточек
-- (в срезе встречаются три «Сбер Банк» подряд) берётся та, где больше оценок.
-- Уже проставленные рейтинги не трогаются: функция дописывает ключи только
-- тем организациям, у которых их нет.
--
-- Функция, а не разовый UPDATE, потому что срез пересобирается руками
-- (scripts/capture-yandex-bc-tenants.mjs) — после каждого нового захвата копии
-- разъедутся снова, и это надо будет просто позвать ещё раз.
create or replace function public.sync_bc_tenant_ratings() returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  touched integer := 0;
begin
  with snap as (
    select
      s.business_center_slug as slug,
      org ->> 'name' as name,
      coalesce(org ->> 'category', '') as category,
      org -> 'rating' as rating_j,
      org -> 'reviewCount' as review_j,
      (org ->> 'reviewCount')::int as review_n
    from business_center_tenant_source_snapshots s
    cross join lateral jsonb_array_elements(s.organizations) org
    where s.source = 'yandex_maps'
      and jsonb_typeof(s.organizations) = 'array'
      and (org ->> 'rating') is not null
  ),
  by_key as (
    select distinct on (slug, name, category)
      slug, name, category, rating_j, review_j
    from snap
    order by slug, name, category, review_n desc nulls last
  ),
  rebuilt as (
    select
      c.slug,
      jsonb_agg(
        case
          when jsonb_typeof(item.value) = 'object'
           and not (item.value ? 'rating')
           and k.rating_j is not null
          then item.value
               || jsonb_build_object('rating', k.rating_j)
               || case
                    when k.review_j is not null and jsonb_typeof(k.review_j) = 'number'
                    then jsonb_build_object('reviewCount', k.review_j)
                    else '{}'::jsonb
                  end
          else item.value
        end
        order by item.ordinality
      ) as organizations
    from business_centers c
    cross join lateral jsonb_array_elements(c.tenant_organizations)
      with ordinality as item(value, ordinality)
    left join by_key k
      on k.slug = c.slug
     and k.name = item.value ->> 'name'
     and k.category = coalesce(item.value ->> 'category', '')
    where jsonb_typeof(c.tenant_organizations) = 'array'
    group by c.slug
  )
  update business_centers c
  set tenant_organizations = r.organizations
  from rebuilt r
  where c.slug = r.slug
    and c.tenant_organizations is distinct from r.organizations;

  get diagnostics touched = row_count;
  return touched;
end;
$function$;

-- Postgres выдаёт EXECUTE роли PUBLIC при создании функции, а anon и
-- authenticated его наследуют — отзыв персонально у них ничего не меняет
-- (CLAUDE.md, разбор auto_reply_apply). Закрываем у PUBLIC.
revoke all on function public.sync_bc_tenant_ratings() from public, anon, authenticated;
grant execute on function public.sync_bc_tenant_ratings() to service_role;

select public.sync_bc_tenant_ratings();

notify pgrst, 'reload schema';
