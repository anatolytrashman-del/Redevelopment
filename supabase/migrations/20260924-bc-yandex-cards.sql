-- Карточка здания на Яндекс Картах (2026-09-24): общий рейтинг, часы,
-- телефоны, сайты и соцсети, удобства, рубрики, метро. Владелец: «нужны
-- арендаторы, отзывы и все остальное, но не места вокруг». Пишет
-- scripts/capture-yandex-reviews.mjs (заодно с отзывами, одной командой
-- scripts/capture-yandex-all.mjs) с ноутбука владельца; одна строка на здание,
-- каждый прогон перезаписывает её целиком. Сырые списки — jsonb: набор полей
-- у Яндекса плавает, а сайт пока их не показывает.
create table if not exists public.business_center_yandex_cards (
  business_center_slug text primary key references public.business_centers(slug)
    on update cascade on delete cascade,
  org_id text not null,
  name text,
  address text,
  rating numeric(2,1) check (rating between 0 and 5),
  rating_count integer check (rating_count >= 0),
  review_count integer check (review_count >= 0),
  status text,
  working_time_text text,
  working_time jsonb,
  phones jsonb not null default '[]'::jsonb,
  sites jsonb not null default '[]'::jsonb,
  social_links jsonb not null default '[]'::jsonb,
  categories jsonb not null default '[]'::jsonb,
  features jsonb not null default '[]'::jsonb,
  metro jsonb not null default '[]'::jsonb,
  photo_count integer,
  captured_at timestamptz not null default now()
);

alter table public.business_center_yandex_cards enable row level security;

drop policy if exists anon_select on public.business_center_yandex_cards;
create policy anon_select on public.business_center_yandex_cards
  for select to anon using (true);

-- Supabase раздаёт новым таблицам anon полный набор прав (см.
-- 20260920-bc-reviews-anon-revoke.sql) — оставляем только чтение.
revoke all on public.business_center_yandex_cards from anon, authenticated;
grant select on public.business_center_yandex_cards to anon, authenticated;
grant all on public.business_center_yandex_cards to service_role;

comment on table public.business_center_yandex_cards is
  'Собственная карточка здания на Яндекс Картах (рейтинг, часы, телефоны, ссылки, удобства); пишет сбор с ноутбука владельца, без мест вокруг';

notify pgrst, 'reload schema';
