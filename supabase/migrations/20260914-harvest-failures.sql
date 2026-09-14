-- Отказы робота съёма (scripts/harvest.mjs). Владелец, 2026-09-14: «много
-- ошибок. Может быть, из-за vpn? Но у нас есть российский ip-адрес».
--
-- Без записи причин этот вопрос не разрешить: «ошибка» — это и обрыв
-- соединения (похоже на сеть), и капча (похоже на блокировку робота), и
-- пустая страница при живом ответе (похоже на сайт, который рисует всё
-- скриптом позже). Лечатся они по-разному, а на глаз в терминале
-- неотличимы. Строки пишет робот на машине владельца, читает сессия.
create table if not exists supplier_harvest_failures (
  host text primary key,
  -- network | empty | error
  kind text not null default 'error',
  error text not null default '',
  attempts int not null default 1,
  http_status int,
  page_title text not null default '',
  last_try_at timestamptz not null default now()
);

alter table supplier_harvest_failures enable row level security;
drop policy if exists authenticated_all on supplier_harvest_failures;
create policy authenticated_all on supplier_harvest_failures
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
