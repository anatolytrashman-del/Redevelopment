-- Очередь заданий для ИИ-воркера на боксе (распознавание счетов и саммери встреч).
--
-- Зачем: ProxyAPI не пополняем, распознавание и саммери уходят на бокс, где
-- воркер вызывает Grok через opencode (OAuth). Воркеру НЕ даём service_role:
-- у него отдельная роль ai_box_worker, которой доступны ТОЛЬКО четыре RPC
-- ниже. Ни таблиц, ни Storage, ни других функций она не видит.
--
-- Как воркер получает роль: JWT с claim role=ai_box_worker, подписанный
-- JWT-секретом проекта (выпускает владелец один раз, срок — по договорённости;
-- см. scripts/box-worker/README.md). PostgREST переключается на эту роль
-- через authenticator.
--
-- Входные данные кладёт серверный код (service_role) через enqueue — сюда
-- попадают только ссылки на файлы/текст, нужный для задания. Результат
-- воркера пишется в result; применение результата к карточкам остаётся
-- в существующем коде (_invoiceApply.js), воркер в карточки не пишет.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ai_box_worker') then
    create role ai_box_worker nologin noinherit;
  end if;
end $$;
grant ai_box_worker to authenticator;
grant usage on schema public to ai_box_worker;

create table if not exists ai_box_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('invoice_recognition', 'meeting_summary')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  payload jsonb not null,
  result jsonb,
  error text,
  attempts int not null default 0,
  max_attempts int not null default 4,
  not_before timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_box_jobs_pick_idx on ai_box_jobs (status, not_before) where status in ('queued', 'running');

alter table ai_box_jobs enable row level security;
-- Политик нет: с таблицей работают только security definer функции ниже
-- и service_role (он обходит RLS).
revoke all on ai_box_jobs from public, anon, authenticated, ai_box_worker;

-- Поставить задание (серверный код, service_role).
create or replace function ai_box_enqueue(p_kind text, p_payload jsonb)
returns uuid language sql security definer set search_path = public as $$
  insert into ai_box_jobs (kind, payload) values (p_kind, p_payload) returning id;
$$;

-- Взять до p_limit заданий. Зависшие (running дольше 15 минут) возвращаются
-- в работу — воркер мог упасть посреди задания. skip locked — два воркера
-- не возьмут одно задание.
create or replace function ai_box_claim(p_worker text, p_limit int default 1)
returns setof ai_box_jobs language sql security definer set search_path = public as $$
  update ai_box_jobs j
     set status = 'running', locked_at = now(), locked_by = left(p_worker, 64),
         attempts = j.attempts + 1, updated_at = now()
   where j.id in (
     select id from ai_box_jobs
      where (status = 'queued' and not_before <= now())
         or (status = 'running' and locked_at < now() - interval '15 minutes' and attempts < max_attempts)
      order by created_at
      limit least(greatest(coalesce(p_limit, 1), 1), 5)
      for update skip locked)
  returning j.*;
$$;

create or replace function ai_box_complete(p_id uuid, p_worker text, p_result jsonb)
returns boolean language sql security definer set search_path = public as $$
  with u as (
    update ai_box_jobs
       set status = 'done', result = p_result, error = null, completed_at = now(),
           locked_at = null, updated_at = now()
     where id = p_id and status = 'running' and locked_by = left(p_worker, 64)
    returning 1)
  select exists (select 1 from u);
$$;

-- Ошибка: при p_retry и оставшихся попытках — обратно в очередь с
-- экспоненциальной паузой (1, 2, 4… мин, не больше часа) или с паузой,
-- которую назвал провайдер (p_retry_after_s, например Retry-After на 429).
create or replace function ai_box_fail(p_id uuid, p_worker text, p_error text, p_retry boolean default true, p_retry_after_s int default null)
returns text language sql security definer set search_path = public as $$
  with u as (
    update ai_box_jobs
       set status = case when p_retry and attempts < max_attempts then 'queued' else 'error' end,
           error = left(p_error, 2000),
           not_before = now() + make_interval(secs => coalesce(
             greatest(p_retry_after_s, 0),
             least(3600, 60 * power(2, greatest(attempts - 1, 0)))::int)),
           locked_at = null, updated_at = now()
     where id = p_id and status = 'running' and locked_by = left(p_worker, 64)
    returning status)
  select status from u;
$$;

revoke all on function ai_box_enqueue(text, jsonb) from public, anon, authenticated;
revoke all on function ai_box_claim(text, int) from public, anon, authenticated;
revoke all on function ai_box_complete(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function ai_box_fail(uuid, text, text, boolean, int) from public, anon, authenticated;
grant execute on function ai_box_enqueue(text, jsonb) to service_role;
grant execute on function ai_box_claim(text, int) to ai_box_worker, service_role;
grant execute on function ai_box_complete(uuid, text, jsonb) to ai_box_worker, service_role;
grant execute on function ai_box_fail(uuid, text, text, boolean, int) to ai_box_worker, service_role;

notify pgrst, 'reload schema';
