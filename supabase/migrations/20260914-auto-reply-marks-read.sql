-- 2026-09-14. Владелец: «если на письмо можно ответить автоматически или я
-- уже дал ответ на письмо через диалог в Клоде, убирай непрочитанный статус
-- по этому письму. Оставляй только то, на что реально нет ответа».
--
-- До этого автоответы (auto_reply_apply → auto_reply_queue) и ответы
-- владельца из почасового разбора (auto_reply_answer) клали исходящее письмо
-- в тред, но входящее оставалось с read_at = null — счётчик «Письма» в
-- Закупках рос на уже отвеченные письма (15 непрочитанных, из них ответа
-- реально не было у трёх).
--
-- Правило зашито в две точки записи:
--   * auto_reply_queue — единственное место, где реально ставится в очередь
--     ответ (и авто-режим Routine, и продиктованный владельцем ответ):
--     входящее помечается прочитанным в момент постановки ответа.
--   * auto_reply_answer с p_action = 'rejected' — владелец сказал «не требует
--     ответа» (или по треду уже есть ответ): тоже прочитано.
-- 'skip' и 'draft' у Routine входящее НЕ трогают — там ответа ещё нет.
-- Совместимо со старым кодом: колонка та же, фронт лишь читает read_at.

create or replace function public.auto_reply_queue(p_email_id uuid, p_subject text, p_full_body text, p_sender_name text)
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

  insert into public.supplier_offer_emails
    (offer_id, order_id, direction, from_address, to_address, subject, body, files, send_status, sent_by_name)
  values
    (v_in.offer_id, v_in.order_id, 'out', v_from, v_to, coalesce(p_subject, ''), p_full_body, '[]'::jsonb, 'queued', p_sender_name)
  returning id into v_reply_id;

  insert into public.outgoing_email_jobs
    (email_table, email_id, from_address, to_address, subject, body, attachments, idempotency_key)
  values
    ('supplier_offer_emails', v_reply_id, v_from, v_to,
     coalesce(nullif(btrim(coalesce(p_subject, '')), ''), 'Запрос цены'), p_full_body, '[]'::jsonb,
     gen_random_uuid()::text);

  -- Ответ поставлен в очередь — входящее письмо отвечено, снимаем «непрочитанное».
  update public.supplier_offer_emails
     set read_at = coalesce(read_at, now())
   where id = p_email_id;

  return v_reply_id;
end;
$function$;

create or replace function public.auto_reply_answer(p_email_id uuid, p_subject text, p_body text, p_action text default 'sent'::text, p_owner_answer text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_in public.supplier_offer_emails%rowtype;
  v_log public.email_auto_reply_log%rowtype;
  v_reply_id uuid;
  v_full_body text;
  v_signature text;
  v_body text;
  v_subject text;
  v_note text := '';
  v_action text := coalesce(nullif(btrim(coalesce(p_action, '')), ''), 'sent');
begin
  select * into v_in from public.supplier_offer_emails where id = p_email_id;
  if not found then
    raise exception 'Письмо % не найдено', p_email_id;
  end if;
  if v_in.direction <> 'in' then
    raise exception 'Письмо % не входящее', p_email_id;
  end if;

  select * into v_log from public.email_auto_reply_log where email_id = p_email_id;

  if v_log.id is not null and v_log.answered_at is not null then
    return v_log.id;
  end if;

  -- Владелец мог ответить руками из интерфейса, пока письмо ждало разбора.
  if v_action <> 'rejected' and exists (
    select 1 from public.supplier_offer_emails t
    where t.offer_id = v_in.offer_id
      and t.order_id is not distinct from v_in.order_id
      and t.direction = 'out'
      and t.created_at > v_in.created_at
  ) then
    v_action := 'rejected';
    v_note := ' [не отправлено: по треду уже есть ответ]';
  end if;

  if v_action <> 'rejected' then
    v_body := coalesce(nullif(btrim(coalesce(p_body, '')), ''), nullif(btrim(coalesce(v_log.proposal, '')), ''));
    if v_body is null then
      raise exception 'Нет текста ответа: ни продиктованного, ни предложенного';
    end if;
    v_subject := coalesce(
      nullif(btrim(coalesce(p_subject, '')), ''),
      nullif(btrim(coalesce(v_log.draft_subject, '')), ''),
      case when coalesce(v_in.subject, '') ilike 'Re:%' then v_in.subject
           else 'Re: ' || coalesce(v_in.subject, '') end);
    v_full_body := public.auto_reply_compose(p_email_id, v_body);
    select coalesce(nullif(btrim(signature), ''), 'Анатолий Трэшмен')
      into v_signature from public.email_auto_reply_settings where id = true;
    v_reply_id := public.auto_reply_queue(p_email_id, v_subject, v_full_body,
                                          coalesce(v_signature, 'Анатолий Трэшмен'));
  else
    -- «Не требует ответа» (или ответ по треду уже есть) — владелец письмо
    -- разобрал, в непрочитанных ему больше нечего делать.
    update public.supplier_offer_emails
       set read_at = coalesce(read_at, now())
     where id = p_email_id;
  end if;

  if v_log.id is null then
    insert into public.email_auto_reply_log
      (email_table, email_id, rule_id, rule_name, decision, confidence, reason,
       draft_subject, draft_body, proposal, reply_email_id, owner_answer,
       answered_at, reviewed_at, reviewed_action)
    values
      ('supplier_offer_emails', p_email_id, null, 'Разбор с владельцем',
       case when v_action = 'rejected' then 'skipped' else 'sent' end, null,
       'Ответ владельца в разборе почты',
       coalesce(v_subject, ''), coalesce(v_full_body, ''), v_body, v_reply_id,
       coalesce(p_owner_answer, '') || v_note, now(), now(), v_action)
    returning id into v_log.id;
  else
    update public.email_auto_reply_log
       set reply_email_id = coalesce(v_reply_id, reply_email_id),
           draft_subject = coalesce(v_subject, draft_subject),
           draft_body = coalesce(v_full_body, draft_body),
           proposal = coalesce(v_body, proposal),
           owner_answer = coalesce(p_owner_answer, '') || v_note,
           answered_at = now(),
           reviewed_at = now(),
           reviewed_action = v_action
     where id = v_log.id;
  end if;

  return v_log.id;
end;
$function$;

NOTIFY pgrst, 'reload schema';
