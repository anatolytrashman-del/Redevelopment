-- Письма, отправленные по подсказке владельца, подписываются автором
-- «ИИ-закупщик», а не подписью в тексте.
--
-- Владелец, 2026-09-15: «поправь и в метриках, все письма прогоняй через
-- ИИ-закупщика» (уточнение: его — те письма, где участвовал ИИ: автоответы,
-- отправленные по подсказке владельца и его же черновики, отправленные
-- кнопкой; письма, которые владелец пишет с нуля, остаются за ним).
--
-- Что было не так. auto_reply_answer передавала в auto_reply_queue подпись из
-- email_auto_reply_settings.signature («Анатолий Трэшмен») как p_sender_name,
-- а p_sender_name уходит в колонку sent_by_name — «кто отправил», а не «чем
-- подписано». Подпись в текст письма ставит сама auto_reply_compose, так что
-- второй раз она тут была не нужна: письмо, отправленное агентом, выглядело
-- в ленте и в метриках (/admin/metrics считает письма по sent_by_name) как
-- письмо человека.
--
-- Теперь автор — AUTO_REPLY_SENDER_NAME из src/data/emailAutoReply.ts, та же
-- строка, которой подписывает свои письма auto_reply_apply. Подпись в тексте
-- не меняется: её по-прежнему ставит auto_reply_compose из настроек.
--
-- Совместимо со старым кодом: сигнатура функции прежняя, колонок не трогаем.
create or replace function auto_reply_answer(
  p_email_id uuid,
  p_subject text,
  p_body text,
  p_action text default 'sent',
  p_owner_answer text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_in public.supplier_offer_emails%rowtype;
  v_log public.email_auto_reply_log%rowtype;
  v_reply_id uuid;
  v_full_body text;
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
    -- Автор письма — агент: отправляет его он, даже если текст подсказал
    -- владелец. Подпись в теле письма ставит auto_reply_compose из настроек,
    -- поэтому сюда она больше не подмешивается.
    v_reply_id := public.auto_reply_queue(p_email_id, v_subject, v_full_body, 'ИИ-закупщик');
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

-- Уже отправленные такие письма (на 15.09 — 6 штук) переписываем на агента.
-- Ровно те, на которые ссылается лог решений: reply_email_id проставляет
-- только auto_reply_queue, то есть отправка из очереди автоответов.
update public.supplier_offer_emails e
   set sent_by_name = 'ИИ-закупщик',
       sent_by_profile_id = null
  from public.email_auto_reply_log l
 where l.reply_email_id = e.id
   and l.reviewed_action in ('sent', 'edited')
   and coalesce(e.sent_by_name, '') <> 'ИИ-закупщик';

notify pgrst, 'reload schema';
