-- Снимок инфраструктуры в радиусе 500 м от бизнес-центров. Источник данных
-- намеренно не зашит в схему: точки можно собирать через 2GIS, другой API
-- или импорт, а публичная страница всегда читает уже сохранённый результат.
create table if not exists public.business_center_nearby_places (
  id uuid primary key default gen_random_uuid(),
  business_center_slug text not null references public.business_centers(slug)
    on update cascade on delete cascade,
  source_place_id text not null,
  name text not null,
  category text not null check (category in (
    'metro', 'transport_stop', 'cafe', 'restaurant', 'grocery', 'shop',
    'pharmacy', 'bank', 'atm', 'fitness', 'other'
  )),
  subcategory text,
  address text,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  distance_meters integer not null check (distance_meters between 0 and 500),
  source text not null,
  source_url text,
  collected_at timestamptz not null default now(),
  unique (business_center_slug, source, source_place_id)
);

create index if not exists business_center_nearby_places_slug_distance_idx
  on public.business_center_nearby_places (business_center_slug, distance_meters);

alter table public.business_center_nearby_places enable row level security;

drop policy if exists anon_select on public.business_center_nearby_places;
create policy anon_select on public.business_center_nearby_places
  for select to anon using (true);

drop policy if exists authenticated_all on public.business_center_nearby_places;
create policy authenticated_all on public.business_center_nearby_places
  for all to authenticated using (true) with check (true);

grant select on public.business_center_nearby_places to anon;
grant select, insert, update, delete on public.business_center_nearby_places to authenticated;

comment on table public.business_center_nearby_places is
  'Периодически обновляемый снимок инфраструктуры в радиусе 500 м от БЦ';
comment on column public.business_center_nearby_places.collected_at is
  'Дата получения точки у картографического источника; ожидаемое обновление раз в 1–2 месяца';

notify pgrst, 'reload schema';
