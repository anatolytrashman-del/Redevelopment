-- История проверок по реестрам (шаг 4 плана docs/procurement-product-steps.md).
--
-- План предлагал снять уникальность с supplier_reliability.inn и вставлять
-- новую строку на каждую перепроверку. Сделано иначе, и вот почему:
--   1. Миграции применяются РАНЬШЕ, чем код доедет до прода (CLAUDE.md).
--      Снятие уникального ключа сразу ломает работающий upsert
--      (`onConflict: 'inn'` в supplierReliabilityApi.ts) — проверка реестра
--      падала бы всё окно между миграцией и READY.
--   2. Сам код давно предусматривает этот вариант: «если понадобится
--      история, это отдельная таблица, а не дубли в этой»
--      (комментарий в supplierReliabilityApi.ts).
-- Поэтому supplier_reliability остаётся «последним известным состоянием»
-- (её читают карточки и бейджи рисков), а история копится рядом.

create table if not exists supplier_reliability_checks (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers (id) on delete cascade,
  inn text not null,
  found boolean not null default false,
  risk_level text not null default 'ok',
  risks jsonb not null default '[]'::jsonb,
  -- Непусто — проверка сорвалась (Checko недоступен, кончился лимит). В
  -- истории такие записи нужны не меньше удачных: по ним видно, что
  -- «не проверено» — это не «не пробовали».
  error text,
  checked_at timestamptz not null default now()
);

comment on table supplier_reliability_checks is
  'История проверок контрагента по реестрам. supplier_reliability хранит последнее состояние, здесь — все проверки подряд.';

create index if not exists supplier_reliability_checks_supplier_idx
  on supplier_reliability_checks (supplier_id, checked_at desc);
create index if not exists supplier_reliability_checks_inn_idx
  on supplier_reliability_checks (inn, checked_at desc);

alter table supplier_reliability_checks enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'supplier_reliability_checks' and policyname = 'authenticated_all') then
    create policy authenticated_all on supplier_reliability_checks for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Связь последней проверки с компанией (шаг 2): раньше единственным ключом
-- был ИНН, и чтобы показать проверку на странице компании, приходилось
-- сопоставлять строки по нему на клиенте.
alter table supplier_reliability add column if not exists supplier_id uuid references suppliers (id) on delete set null;

update supplier_reliability r
   set supplier_id = s.id
  from suppliers s
 where r.supplier_id is null
   and s.deleted_at is null
   and coalesce(trim(s.inn), '') = trim(r.inn);

-- Прошлые проверки в историю — по одной записи на то, что известно сейчас.
insert into supplier_reliability_checks (supplier_id, inn, found, risk_level, risks, error, checked_at)
select r.supplier_id, r.inn, r.found, r.risk_level, coalesce(r.risks, '[]'::jsonb), r.error, r.checked_at
  from supplier_reliability r
 where not exists (
   select 1 from supplier_reliability_checks c
    where c.inn = r.inn and c.checked_at = r.checked_at
 );

-- Дальше история пишется сама. Триггером, а не из клиентского кода: проверку
-- запускает и страница, и серверный action, и разовые скрипты — при записи
-- из кода одно из этих мест рано или поздно забыли бы.
create or replace function supplier_reliability_log_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into supplier_reliability_checks (supplier_id, inn, found, risk_level, risks, error, checked_at)
  values (
    coalesce(new.supplier_id, (select id from suppliers where deleted_at is null and coalesce(trim(inn), '') = trim(new.inn) limit 1)),
    new.inn, new.found, new.risk_level, coalesce(new.risks, '[]'::jsonb), new.error, new.checked_at
  );
  return new;
end $$;

drop trigger if exists supplier_reliability_log_check_trg on supplier_reliability;
create trigger supplier_reliability_log_check_trg
  after insert or update on supplier_reliability
  for each row execute function supplier_reliability_log_check();

notify pgrst, 'reload schema';
