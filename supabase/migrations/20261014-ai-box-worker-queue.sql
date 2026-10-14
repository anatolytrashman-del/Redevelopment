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
-- воркера пишется в result; применение результата к карточкам делает
-- серверный код (api/_aiBox.js → _invoiceApply.js), воркер в карточки не
-- пишет. Задания со статусом error тоже «применяются»: карточка получает
-- пометку «Разобрать вручную».

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
  completed_at timestamptz,
  -- Результат перенесён в карточку счёта / запись встречи (или помечен
  -- «Разобрать вручную»). Ставит серверный код (api/_aiBox.js).
  applied_at timestamptz,
  apply_error text
);

alter table ai_box_jobs add column if not exists applied_at timestamptz;
alter table ai_box_jobs add column if not exists apply_error text;

create index if not exists ai_box_jobs_apply_idx on ai_box_jobs (updated_at) where applied_at is null and status in ('done', 'error');
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

-- Зависшие задания (running дольше 15 минут — воркер упал посреди работы).
-- Остались попытки — обратно в очередь; попытки кончились — error, и
-- триггер ниже ставит письму/встрече «Разобрать вручную». Зовётся в
-- начале каждого ai_box_claim, так что без воркера зависшие не
-- разбираются — но без воркера и новых результатов нет.
create or replace function ai_box_sweep_stale()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update ai_box_jobs
     set status = case when attempts < max_attempts then 'queued' else 'error' end,
         error = case when attempts < max_attempts then error
                      else 'Воркер не ответил за 15 минут, попытки исчерпаны' end,
         locked_at = null, locked_by = null, updated_at = now()
   where status = 'running' and locked_at < now() - interval '15 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

-- Взять до p_limit заданий (после уборки зависших). skip locked — два
-- воркера не возьмут одно задание.
create or replace function ai_box_claim(p_worker text, p_limit int default 1)
returns setof ai_box_jobs language plpgsql security definer set search_path = public as $$
begin
  perform ai_box_sweep_stale();
  return query
  update ai_box_jobs j
     set status = 'running', locked_at = now(), locked_by = left(p_worker, 64),
         attempts = j.attempts + 1, updated_at = now()
   where j.id in (
     select id from ai_box_jobs
      where status = 'queued' and not_before <= now()
      order by created_at
      limit least(greatest(coalesce(p_limit, 1), 1), 5)
      for update skip locked)
  returning j.*;
end $$;

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

-- Результат — в карточку сразу, как только воркер вызвал complete/fail
-- (или уборка пометила задание error). Триггер, security definer: роль
-- воркера по-прежнему видит только RPC, а не таблицы.
--
-- Встреча: саммери пишется в meeting_summaries.content целиком, ошибка —
-- ai_status 'manual'; задание сразу помечается applied_at.
--
-- Счёт: когда разобраны ВСЕ вложения письма, extraction собирается в той
-- же форме, что в api/_aiBox.js (buildExtractionFromJobs): первый счёт в
-- корне, остальные в additionalInvoices; ничего не нашли/ошибка —
-- 'manual' с manualFiles. Статус счёта здесь 'pending', не 'confirmed':
-- запись строки КП и позиций в карточку (applyRecognizedInvoice: НДС
-- юрлица, сопоставление со сметой, файлы) в SQL не повторяем — это
-- дубль сложной логики. Её делает JS applyFinishedBoxJobs (по applied_at,
-- идемпотентно): он переводит письмо в 'confirmed'. До этого интерфейс уже
-- видит счёт с кнопкой подтверждения (boxPrefilled: true).
create or replace function ai_box_job_finished()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email uuid;
  v_unfinished int;
  v_jobs jsonb;
  v_invoices jsonb;
  v_attempts jsonb;
  v_extraction jsonb;
  v_first jsonb;
  v_summary text;
begin
  if new.kind = 'meeting_summary' then
    v_summary := btrim(coalesce(new.result->>'summary', ''));
    if new.status = 'done' and v_summary <> '' then
      update meeting_summaries
         set content = v_summary, ai_status = null, ai_error = null, ai_job_id = null
       where id = (new.payload->>'meetingId')::uuid and (ai_job_id is null or ai_job_id = new.id);
    else
      update meeting_summaries
         set ai_status = 'manual', ai_error = left(coalesce(new.error, 'Пустое саммери'), 300)
       where id = (new.payload->>'meetingId')::uuid and (ai_job_id is null or ai_job_id = new.id);
    end if;
    update ai_box_jobs set applied_at = now() where id = new.id;
    return null;
  end if;

  v_email := nullif(new.payload->>'emailId', '')::uuid;
  if v_email is null then return null; end if;
  -- Два задания одного письма завершаются одновременно — собирает последний.
  perform pg_advisory_xact_lock(hashtext('ai_box_email:' || v_email::text));
  select count(*) into v_unfinished from ai_box_jobs
   where kind = 'invoice_recognition' and payload->>'emailId' = v_email::text and status not in ('done', 'error');
  if v_unfinished > 0 then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'status', status, 'result', result, 'error', error,
           'file', jsonb_build_object('url', payload->>'fileUrl', 'fileName', payload->>'fileName'))
           order by created_at), '[]'::jsonb)
    into v_jobs
    from ai_box_jobs where kind = 'invoice_recognition' and payload->>'emailId' = v_email::text;

  select coalesce(jsonb_agg(jsonb_build_object('fileName', j->'file'->>'fileName', 'outcome',
           case when j->>'status' = 'error' then 'ошибка бокса: ' || left(coalesce(j->>'error', ''), 120)
                when (j->'result'->>'isInvoice')::boolean then 'счёт' else 'не счёт' end)), '[]'::jsonb)
    into v_attempts from jsonb_array_elements(v_jobs) j;

  select coalesce(jsonb_agg(j), '[]'::jsonb) into v_invoices
    from jsonb_array_elements(v_jobs) j
   where j->>'status' = 'done' and coalesce((j->'result'->>'isInvoice')::boolean, false);

  if jsonb_array_length(v_invoices) = 0 then
    v_extraction := jsonb_build_object(
      'status', 'manual', 'isInvoice', false, 'price', null, 'currency', null, 'items', '[]'::jsonb,
      'supplierInn', null, 'sourceFile', null, 'recognizedAt', now(), 'attempts', v_attempts, 'skipped', '[]'::jsonb,
      'manualFiles', (select jsonb_agg(j->'file') from jsonb_array_elements(v_jobs) j))
      || case when exists (select 1 from jsonb_array_elements(v_jobs) j where j->>'status' = 'error')
              then jsonb_build_object('error', 'ИИ на боксе не смог разобрать вложения') else '{}'::jsonb end;
  else
    v_first := v_invoices->0;
    v_extraction := (v_first->'result') || jsonb_build_object(
      'status', 'pending', 'sourceFile', v_first->'file', 'duplicateFiles', '[]'::jsonb,
      'recognizedAt', coalesce(v_first->'result'->'recognizedAt', to_jsonb(now())),
      'attempts', v_attempts, 'boxPrefilled', true);
    if jsonb_array_length(v_invoices) > 1 then
      v_extraction := v_extraction || jsonb_build_object('additionalInvoices',
        (select jsonb_agg((j->'result') || jsonb_build_object('sourceFile', j->'file', 'duplicateFiles', '[]'::jsonb, 'applied', null) order by n)
           from jsonb_array_elements(v_invoices) with ordinality as t(j, n) where n > 1));
    end if;
  end if;

  -- Письмо, которое уже разобрали руками, не трогаем.
  update supplier_offer_emails set extraction = v_extraction
   where id = v_email and coalesce(extraction->>'status', 'queued') in ('queued', 'manual');
  -- 'manual' — в карточку писать нечего, JS это задание больше не нужно.
  if v_extraction->>'status' = 'manual' then
    update ai_box_jobs set applied_at = now()
     where kind = 'invoice_recognition' and payload->>'emailId' = v_email::text and applied_at is null;
  end if;
  return null;
end $$;

drop trigger if exists ai_box_job_finished on ai_box_jobs;
create trigger ai_box_job_finished
  after update of status on ai_box_jobs
  for each row
  when (new.status in ('done', 'error') and old.status is distinct from new.status)
  execute function ai_box_job_finished();

revoke all on function ai_box_enqueue(text, jsonb) from public, anon, authenticated;
revoke all on function ai_box_claim(text, int) from public, anon, authenticated;
revoke all on function ai_box_sweep_stale() from public, anon, authenticated;
revoke all on function ai_box_job_finished() from public, anon, authenticated;
revoke all on function ai_box_complete(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function ai_box_fail(uuid, text, text, boolean, int) from public, anon, authenticated;
grant execute on function ai_box_enqueue(text, jsonb) to service_role;
grant execute on function ai_box_claim(text, int) to ai_box_worker, service_role;
grant execute on function ai_box_sweep_stale() to service_role;
grant execute on function ai_box_complete(uuid, text, jsonb) to ai_box_worker, service_role;
grant execute on function ai_box_fail(uuid, text, text, boolean, int) to ai_box_worker, service_role;

-- Саммери встречи с бокса: пока задание в очереди — ai_status 'queued',
-- бокс не справился — 'manual' («Разобрать вручную»), готово — null.
alter table meeting_summaries add column if not exists ai_status text check (ai_status in ('queued', 'manual'));
alter table meeting_summaries add column if not exists ai_error text;
alter table meeting_summaries add column if not exists ai_job_id uuid;

notify pgrst, 'reload schema';
