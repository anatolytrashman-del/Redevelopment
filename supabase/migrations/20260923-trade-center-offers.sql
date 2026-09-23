-- Объявления об аренде/продаже в торговых центрах (каталог /minsk/tc).
-- Отдельно от business_center_offers: для посетителей БЦ и ТЦ — два разных
-- раздела, и всё, что читает объявления БЦ целиком (офисная аналитика,
-- снимки рынка, рейтинги), не должно видеть ТЦ даже без фильтров
-- (владелец, 2026-09-23). Схема и доступ — те же, что у business_center_offers.
create table if not exists public.trade_center_offers (
  id uuid primary key default gen_random_uuid(),
  business_center_slug text not null references public.business_centers(slug) on delete cascade,
  source text not null,
  ad_id text not null,
  deal_type text,
  property_type text,
  size numeric,
  price_per_sqm numeric,
  floor numeric,
  address text,
  ad_link text,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_center_slug, source, ad_id)
);
alter table public.trade_center_offers enable row level security;
drop policy if exists anon_select on public.trade_center_offers;
create policy anon_select on public.trade_center_offers for select to anon using (true);
drop policy if exists authenticated_all on public.trade_center_offers;
create policy authenticated_all on public.trade_center_offers for all to authenticated using (true) with check (true);
grant select on public.trade_center_offers to anon;
grant all on public.trade_center_offers to authenticated, service_role;
notify pgrst, 'reload schema';
