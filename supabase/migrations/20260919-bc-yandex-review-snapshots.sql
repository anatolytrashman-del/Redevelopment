-- Реальные отзывы с Яндекс.Карт по БЦ — владелец прислал .webarchive карточки
-- «Порт», разобран вручную (см. docs/session-journal.md, 2026-09-19). В отличие
-- от business_center_tenant_source_snapshots (снимок целиком в jsonb), тут
-- нужна СОРТИРОВКА по отдельным отзывам (нетто-голоса), поэтому — обычная
-- таблица со строкой на отзыв, не jsonb-блоб.
--
-- Владелец, 2026-09-19, увидев проблему с определением тональности по
-- словам-маркерам (не ловит "не припарковаться" без явного "плохо/беда"):
-- "давай просто выводить самые залайканные комменты, неважно хорошие они
-- или плохие". likes/dislikes с самого Яндекса — то есть сортировка по
-- нетто-голосам делает выбор комментариев объективным (голосует читатели
-- Яндекса, не мы), а не тем самым отбором в одну сторону, которого владелец
-- прямо хотел избежать.
create table if not exists public.business_center_review_snapshots (
  id uuid primary key default gen_random_uuid(),
  business_center_slug text not null references public.business_centers(slug)
    on update cascade on delete cascade,
  source text not null default 'yandex_maps' check (source in ('yandex_maps')),
  author text,
  rating numeric(2,1) check (rating between 1 and 5),
  body text not null,
  likes integer not null default 0 check (likes >= 0),
  dislikes integer not null default 0 check (dislikes >= 0),
  published_at timestamptz,
  captured_at timestamptz not null default now(),
  -- В разметке карточки отзыва нет собственного id отзыва — дедуп по
  -- (здание, автор, дата публикации): у одного автора не может быть двух
  -- отзывов на одно и то же здание в одну и ту же секунду.
  unique (business_center_slug, author, published_at)
);

create index if not exists business_center_review_snapshots_slug_net_idx
  on public.business_center_review_snapshots (business_center_slug, (likes - dislikes) desc);

alter table public.business_center_review_snapshots enable row level security;

drop policy if exists anon_select on public.business_center_review_snapshots;
create policy anon_select on public.business_center_review_snapshots
  for select to anon using (true);

drop policy if exists authenticated_all on public.business_center_review_snapshots;
create policy authenticated_all on public.business_center_review_snapshots
  for all to authenticated using (true) with check (true);

grant select on public.business_center_review_snapshots to anon;
grant select, insert, update, delete on public.business_center_review_snapshots to authenticated;

comment on table public.business_center_review_snapshots is
  'Реальные отзывы с Яндекс.Карт по БЦ (текст + лайки/дизлайки с самого Яндекса) — источник для блока "Что говорят"; заполняется точечным импортом .webarchive, не по расписанию';

notify pgrst, 'reload schema';
