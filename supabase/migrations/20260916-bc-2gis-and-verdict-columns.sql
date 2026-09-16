-- Продолжение К3/Б2/К9 плана docs/bc-catalog-redesign-plan.md.
--
-- Часть 1 — три параметра из 2ГИС, которых не хватало тумблерам каталога
-- («Круглосуточно», «Доступная среда», «Рейтинг 2ГИС от 4,5») и блоку
-- «Что говорят» на карточке. Они лежат в business_center_2gis_snapshots,
-- а та таблица закрыта для anon — ровно та же история, что с координатами
-- в Д2: переносим в business_centers и держим в актуальном виде триггером
-- на самой таблице снимков, а не разовым UPDATE.
--
-- Часть 2 — вердикт «кому подходит» и плюсы/минусы (Б2, решение владельца
-- 2026-09-16: авточерновик из порогов + ручная правка в админке). Флаг
-- verdict_edited отделяет правленое руками от сгенерированного: иначе
-- следующая генерация затёрла бы формулировки владельца.

alter table public.business_centers
  add column if not exists gis_rating numeric,
  add column if not exists gis_review_count integer,
  add column if not exists is_24x7 boolean,
  add column if not exists accessibility text[],
  add column if not exists verdict text,
  add column if not exists pros text[],
  add column if not exists cons text[],
  add column if not exists verdict_edited boolean not null default false;

-- Разбор одного снимка 2ГИС в колонки БЦ. Вынесено отдельной функцией,
-- чтобы её звали и триггер на снимках, и разовый бэкфилл ниже — без
-- копии логики в двух местах.
create or replace function public.business_centers_apply_2gis(target_slug text)
returns void
language sql
as $$
  update public.business_centers bc
  set
    lat = coalesce((s.point->>'lat')::numeric, bc.lat),
    lng = coalesce((s.point->>'lon')::numeric, bc.lng),
    -- general_rating — рейтинг по зданию целиком (org_rating — по одной
    -- организации в нём), нам нужен первый.
    gis_rating = (s.reviews->>'general_rating')::numeric,
    gis_review_count = (s.reviews->>'general_review_count_with_stars')::integer,
    is_24x7 = (s.schedule->>'is_24x7')::boolean,
    accessibility = (
      select array_agg(a order by a)
      from jsonb_array_elements(coalesce(s.attribute_groups, '[]'::jsonb)) g,
           jsonb_array_elements_text(g->'attributes') a
      where g->>'name' = 'Доступная среда'
    )
  from public.business_center_2gis_snapshots s
  where s.business_center_slug = bc.slug
    and bc.slug = target_slug;
$$;

create or replace function public.business_centers_sync_point()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.business_centers_apply_2gis(new.business_center_slug);
  return new;
end;
$$;

-- Триггер теперь ловит любое изменение снимка, не только точки: рейтинг и
-- часы работы меняются чаще координат.
drop trigger if exists business_centers_sync_point_trg on public.business_center_2gis_snapshots;
create trigger business_centers_sync_point_trg
  after insert or update on public.business_center_2gis_snapshots
  for each row execute function public.business_centers_sync_point();

-- Бэкфилл по всем слагам, у которых есть снимок.
do $$
declare r record;
begin
  for r in select business_center_slug from public.business_center_2gis_snapshots loop
    perform public.business_centers_apply_2gis(r.business_center_slug);
  end loop;
end $$;

notify pgrst, 'reload schema';
