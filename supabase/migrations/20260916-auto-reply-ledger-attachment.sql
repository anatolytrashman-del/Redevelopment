-- Шаг 10b плана закупок: автоответ умеет приложить ведомость запроса.
--
-- Зачем. Поставщик регулярно отвечает не ценой, а вопросом «пришлите
-- объёмы / спецификацию / таблицу количеств» (живой пример — «Подноги»,
-- 2026-09-14: «прошу предоставить таблицу с запланированным кол-вом
-- отгрузки в м2 по позициям керамогранита»). Разбор почты такие письма
-- пропускал к человеку — ни одна ситуация не умела приложить файл, а
-- отвечать «объёмы такие-то» словами модели нельзя (числа она выдумает).
-- Пока письмо ждёт человека, запрос стоит: без объёмов поставщик цену не
-- даст вовсе.
--
-- Откуда берётся ведомость. НЕ из material_ledgers по request_id — такой
-- связи в базе нет (у material_ledgers есть только estimate_id, а привязка
-- к категории живёт по имени в интерфейсе). Берём то, что этому же
-- поставщику в этом же треде уже уходило: последний .xlsx из наших
-- исходящих писем. Это ровно та ведомость, по которой его просили дать
-- цену, — не «похожая по названию», а та самая, и если ведомость
-- обновляли и досылали, берётся свежая версия. Из наших вложений .xlsx
-- бывает только ведомость: карточка организации и адрес доставки — .docx.

-- 1. Где лежит ведомость запроса для конкретного входящего письма.
--    Отдельной функцией, а не запросом внутри auto_reply_apply, потому что
--    тот же ответ нужен промпту Routine ДО решения: нет ведомости — ситуация
--    не срабатывает вовсе, письмо уходит человеку. Две копии этого запроса
--    (в промпте и в функции) разъехались бы молча.
create or replace function public.auto_reply_ledger_file(p_email_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object('fileName', f->>'fileName', 'url', f->>'url')
  from public.supplier_offer_emails e
  join public.supplier_offer_emails t
    on t.offer_id = e.offer_id
   and t.order_id is not distinct from e.order_id
   and t.direction = 'out'
  cross join lateral jsonb_array_elements(coalesce(t.files, '[]'::jsonb)) f
  where e.id = p_email_id
    and lower(coalesce(f->>'fileName', '')) like '%.xlsx'
    and coalesce(f->>'url', '') <> ''
  order by t.created_at desc
  limit 1
$function$;

revoke all on function public.auto_reply_ledger_file(uuid) from public, anon, authenticated;
grant execute on function public.auto_reply_ledger_file(uuid) to service_role;

-- 2. Очередь автоответа умеет вложения. Пятый аргумент, по умолчанию пустой
--    массив — старые четырёхаргументные вызовы (auto_reply_answer и всё, что
--    уже лежит в промптах) работают как раньше.
--
--    Старую функцию именно УДАЛЯЕМ, а не «create or replace»: другое число
--    аргументов — это другая функция, replace её не перекрывает. Обе разом
--    сделали бы любой четырёхаргументный вызов неоднозначным («function is
--    not unique»), то есть уронили бы и разбор почты, и ответы владельца из
--    разбора. Ровно это уже случалось с auto_reply_apply.
drop function if exists public.auto_reply_queue(uuid, text, text, text);

create or replace function public.auto_reply_queue(
  p_email_id uuid,
  p_subject text,
  p_full_body text,
  p_sender_name text,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_in public.supplier_offer_emails%rowtype;
  v_short_code text;
  v_from text;
  v_to text;
  v_reply_id uuid;
  v_attachments jsonb := case
    when jsonb_typeof(p_attachments) = 'array' then p_attachments
    else '[]'::jsonb
  end;
begin
  select * into v_in from public.supplier_offer_emails where id = p_email_id;
  if v_in.order_id is not null then
    select short_code into v_short_code from public.supplier_orders where id = v_in.order_id;
  end if;
  if v_short_code is null then
    select short_code into v_short_code from public.supplier_research_offers where id = v_in.offer_id;
  end if;
  if v_short_code is null then
    raise exception 'Не найден short_code — некуда привязать ответ';
  end if;
  v_from := 'zakupki+' || v_short_code || '@redevelopment.pro';
  v_to := coalesce(substring(v_in.from_address from '<([^>]+)>'), btrim(v_in.from_address));

  -- Вложения идут в ДВА места: files — то, что видно в переписке (иначе
  -- выглядит, будто файл потеряли), attachments — то, что реально приложит
  -- к письму process-outgoing-emails. Формат элемента одинаковый
  -- ({fileName, url}), воркер сам скачает файл из хранилища.
  insert into public.supplier_offer_emails
    (offer_id, order_id, direction, from_address, to_address, subject, body, files, send_status, sent_by_name)
  values
    (v_in.offer_id, v_in.order_id, 'out', v_from, v_to, coalesce(p_subject, ''), p_full_body,
     v_attachments, 'queued', p_sender_name)
  returning id into v_reply_id;

  insert into public.outgoing_email_jobs
    (email_table, email_id, from_address, to_address, subject, body, attachments, idempotency_key)
  values
    ('supplier_offer_emails', v_reply_id, v_from, v_to,
     coalesce(nullif(btrim(coalesce(p_subject, '')), ''), 'Запрос цены'), p_full_body, v_attachments,
     gen_random_uuid()::text);

  -- Ответ поставлен в очередь — входящее письмо отвечено, снимаем «непрочитанное».
  update public.supplier_offer_emails
     set read_at = coalesce(read_at, now())
   where id = p_email_id;

  return v_reply_id;
end;
$function$;

revoke all on function public.auto_reply_queue(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.auto_reply_queue(uuid, text, text, text, jsonb) to service_role;

-- 3. Решение разбора умеет попросить приложить ведомость. Одиннадцатый
--    аргумент, по умолчанию false — вызовы из промпта на 8, 9 и 10
--    аргументов продолжают работать. Drop перед create — по той же причине,
--    что и выше.
drop function if exists public.auto_reply_apply(uuid, uuid, text, text, text, text, text, text, text, text);

create or replace function public.auto_reply_apply(
  p_email_id uuid,
  p_rule_id uuid,
  p_rule_name text,
  p_decision text,
  p_confidence text,
  p_reason text,
  p_subject text,
  p_body text,
  p_question text default null,
  p_outcome text default null,
  p_attach_ledger boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_in public.supplier_offer_emails%rowtype;
  v_reply_id uuid;
  v_log_id uuid;
  v_decision text;
  v_full_body text := '';
  v_attachments jsonb := '[]'::jsonb;
  v_ledger jsonb;
begin
  select * into v_in from public.supplier_offer_emails where id = p_email_id;
  if not found then
    raise exception 'Письмо % не найдено', p_email_id;
  end if;
  if v_in.direction <> 'in' then
    raise exception 'Письмо % не входящее — автоответ на исходящее невозможен', p_email_id;
  end if;

  select id into v_log_id from public.email_auto_reply_log where email_id = p_email_id;
  if found then
    return v_log_id;
  end if;

  if p_decision in ('auto', 'draft') then
    if p_body is null or btrim(p_body) = '' then
      raise exception 'Пустой текст автоответа';
    end if;
    v_full_body := public.auto_reply_compose(p_email_id, p_body);
  elsif p_body is not null and btrim(p_body) <> '' then
    v_full_body := public.auto_reply_compose(p_email_id, p_body);
  end if;

  -- Ведомость (шаг 10b). Прикладывается ТОЛЬКО к автоматически отправляемому
  -- ответу: черновик уходит потом обычной кнопкой «Отправить» из интерфейса,
  -- которая про это вложение ничего не знает, — письмо ушло бы со словами
  -- «во вложении ведомость» и без файла. Файла нет — тоже отказ, а не тихая
  -- отправка обещания без вложения: разбор должен вернуться с 'skip', такое
  -- письмо дописывает человек.
  if p_attach_ledger then
    if p_decision <> 'auto' then
      raise exception 'Ведомость прикладывается только к автоматическому ответу (p_decision = auto), а не к «%»', p_decision;
    end if;
    v_ledger := public.auto_reply_ledger_file(p_email_id);
    if v_ledger is null then
      raise exception 'К письму % нечего приложить: в переписке с этим поставщиком нет ни одной отправленной ведомости (.xlsx). Примените решение заново с skip.', p_email_id;
    end if;
    v_attachments := jsonb_build_array(v_ledger);
  end if;

  if p_decision = 'auto' then
    v_reply_id := public.auto_reply_queue(p_email_id, p_subject, v_full_body, 'ИИ-закупщик', v_attachments);
    v_decision := 'sent';
  elsif p_decision = 'draft' then
    v_decision := 'draft';
  else
    v_decision := 'skipped';
  end if;

  -- Исход дожима (шаг 8). Ставится и при 'skip': «поставщик написал, что не
  -- возит» — повод закрыть карточку, даже если отвечать ему нечего.
  -- Проставляется только на пустое место: исход, поставленный человеком
  -- руками, письмо перебить не может.
  if p_outcome is not null and btrim(p_outcome) <> '' then
    if btrim(p_outcome) not in ('no_answer', 'declined') then
      raise exception 'Неизвестный исход: %', p_outcome;
    end if;
    update public.supplier_research_offers
       set outcome = btrim(p_outcome), outcome_at = now()
     where id = v_in.offer_id and outcome is null;
  end if;

  insert into public.email_auto_reply_log
    (email_table, email_id, rule_id, rule_name, decision, confidence, reason,
     draft_subject, draft_body, proposal, reply_email_id, question, answered_at)
  values
    ('supplier_offer_emails', p_email_id, p_rule_id, coalesce(p_rule_name, ''), v_decision, p_confidence,
     coalesce(p_reason, ''), coalesce(p_subject, ''), v_full_body,
     nullif(btrim(coalesce(p_body, '')), ''), v_reply_id,
     nullif(btrim(coalesce(p_question, '')), ''),
     case when v_decision = 'sent' then now() else null end)
  returning id into v_log_id;

  return v_log_id;
end;
$function$;

-- Права. Раньше здесь стоял только «revoke ... from anon, authenticated», а
-- PUBLIC-грант, который Postgres выдаёт новой функции по умолчанию, оставался
-- — то есть анонимный вызов через PostgREST по-прежнему проходил, хотя в
-- документации записано обратное. Эти функции зовёт только сессия разбора
-- почты через Management API (роль postgres), фронт их не вызывает нигде.
revoke all on function public.auto_reply_apply(uuid, uuid, text, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.auto_reply_apply(uuid, uuid, text, text, text, text, text, text, text, text, boolean) to service_role;
revoke all on function public.auto_reply_answer(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.auto_reply_compose(uuid, text) from public, anon, authenticated;

-- 4. Сама ситуация. Приоритет 150 — после отказа (140), потому что «не возим
--    эти позиции, но пришлите объёмы» это отказ, а не просьба о ведомости.
--    reply_kind = 'template': текст фиксированный, числа из ведомости модель
--    не пересказывает (выдумает), файл говорит сам за себя.
insert into public.email_auto_reply_rules (name, criteria, reply_kind, reply_subject, reply_body, mode, priority, source)
select
  'Просят объёмы или спецификацию',
  E'Поставщик не даёт цену, пока не увидит количества: просит прислать объёмы, спецификацию, ведомость, таблицу количеств, «сколько нужно по позициям», «в каком объёме», «дайте потребность». Срабатывает ТОЛЬКО если в письме нет других вопросов и только когда ведомость по этому запросу есть (поле ledger_file в выборке писем не пустое) — тогда решение auto и одиннадцатым аргументом auto_reply_apply передаётся true, функция приложит тот же файл ведомости, что уже уходил этому поставщику. Ведомости нет — skip, письмо дописывает человек.',
  'template',
  '',
  'Во вложении ведомость с позициями и объёмами по этому запросу. Если по какой-то позиции нужны дополнительные параметры — напишите, уточню.',
  'auto',
  150,
  'manual'
where not exists (select 1 from public.email_auto_reply_rules where name = 'Просят объёмы или спецификацию');

notify pgrst, 'reload schema';
