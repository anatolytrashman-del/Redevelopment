create table if not exists public.business_center_yandex_buildings (
  id uuid primary key default gen_random_uuid(),
  business_center_slug text not null references public.business_centers(slug)
    on update cascade on delete cascade,
  address text not null,
  yandex_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_center_slug, address)
);

alter table public.business_center_yandex_buildings enable row level security;

create policy anon_select on public.business_center_yandex_buildings
  for select to anon using (true);
create policy authenticated_all on public.business_center_yandex_buildings
  for all to authenticated using (true) with check (true);

grant select on public.business_center_yandex_buildings to anon;
grant select, insert, update, delete on public.business_center_yandex_buildings to authenticated;

comment on table public.business_center_yandex_buildings is
  'Отдельные карточки корпусов БЦ в Яндекс Картах; отсутствие строк означает поиск по основному адресу business_centers';

notify pgrst, 'reload schema';
