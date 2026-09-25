-- Отметки «таблица изменилась» для дешёвых опросов админки (2026-09-24).
--
-- Страница «Закупки» раз в 20 секунд перекачивала переписку с поставщиками,
-- все предложения и счета (~2,4 МБ за тик, до 10 ГБ в сутки на открытую
-- вкладку) — ради того, чтобы заметить новое письмо. Бесплатный тариф
-- Supabase — 5 ГБ трафика в месяц. Теперь страница спрашивает эту таблицу
-- (несколько строк) и перекачивает список, только если отметка сдвинулась.
-- Триггер на уровне оператора, не строки: массовое обновление даёт одну
-- запись, а не тысячу.
create table if not exists public.table_change_stamps (
  table_name text primary key,
  changed_at timestamptz not null default now()
);

alter table public.table_change_stamps enable row level security;
drop policy if exists authenticated_read on public.table_change_stamps;
create policy authenticated_read on public.table_change_stamps for select to authenticated using (true);
revoke all on public.table_change_stamps from anon;
grant select on public.table_change_stamps to authenticated;

create or replace function public.touch_table_change_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.table_change_stamps (table_name, changed_at)
  values (tg_table_name, clock_timestamp())
  on conflict (table_name) do update set changed_at = excluded.changed_at;
  return null;
end;
$$;

revoke all on function public.touch_table_change_stamp() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['supplier_offer_emails', 'supplier_research_offers', 'supplier_offer_quotes', 'supplier_enrichment_jobs']
  loop
    execute format('drop trigger if exists trg_table_change_stamp on public.%I', t);
    execute format(
      'create trigger trg_table_change_stamp after insert or update or delete on public.%I
         for each statement execute function public.touch_table_change_stamp()', t);
    insert into public.table_change_stamps (table_name) values (t) on conflict do nothing;
  end loop;
end;
$$;

NOTIFY pgrst, 'reload schema';
