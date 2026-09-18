create table if not exists public.business_center_tenant_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_center_slug text not null references public.business_centers(slug)
    on update cascade on delete cascade,
  source text not null check (source in ('yandex_maps', '2gis', 'manual')),
  source_url text,
  address_query text,
  organizations jsonb not null default '[]'::jsonb,
  organization_count integer not null default 0 check (organization_count >= 0),
  captured_at timestamptz not null default now(),
  unique (business_center_slug, source)
);

alter table public.business_center_tenant_source_snapshots enable row level security;

revoke all on table public.business_center_tenant_source_snapshots from public, anon;
grant select, insert, update, delete on table public.business_center_tenant_source_snapshots to authenticated;

comment on table public.business_center_tenant_source_snapshots is
  'Снимки организаций внутри БЦ по источникам; локальный сбор не смешивает Яндекс, 2GIS и ручные данные';

notify pgrst, 'reload schema';
