-- Раздел "Коллаборации" в меню Маркетинг (src/pages/Collaborations.tsx).
create table if not exists public.collaborations (
  id uuid primary key default gen_random_uuid(),
  partner text not null,
  contact_method text,
  contact text,
  link text,
  agreement text,
  status text not null default 'Обсуждаем',
  created_at timestamptz not null default now()
);

alter table public.collaborations enable row level security;

create policy authenticated_all on public.collaborations
  for all
  to authenticated
  using (true)
  with check (true);

notify pgrst, 'reload schema';
