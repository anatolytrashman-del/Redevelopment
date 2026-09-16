-- Шаг 8 плана закупок: дожим поставщика — срок ответа, напоминания,
-- «нет ответа» и «отказ».
--
-- Зачем. Сейчас письмо ушло — и дальше тишина: никто не считает, сколько дней
-- поставщик молчит, и никто ему не напоминает. Закупщица либо помнит это в
-- голове, либо не помнит вовсе. Воронка при этом показывает «отправлено 40,
-- ответили 12», а что с остальными 28 — неизвестно: они ещё думают, они
-- отказались или про них просто забыли.
--
-- Что заводим:
--   1) срок ответа у категории (сколько ждём, прежде чем напомнить);
--   2) исход по карточке поставщика: отказался / не ответил (КП получено
--      определяется по самим данным, отдельной отметкой не дублируется —
--      см. комментарий у outcome);
--   3) ступень дожима у карточки: сколько напоминаний уже ушло;
--   4) тип у шаблона письма: чем именно напоминать;
--   5) рубильник автоматического дожима — рядом с рубильником автоответов,
--      по умолчанию ВЫКЛЮЧЕНО (как и автоответы: сначала владелец смотрит
--      тексты напоминаний, потом включает).

-- 1. Срок ответа. На категории, а не на карточке: «умные замки ждём 3 дня,
--    металл — неделю» — это свойство закупки, а не конкретного поставщика.
alter table public.supplier_research_requests
  add column if not exists reply_due_days integer not null default 3;

alter table public.supplier_research_requests
  drop constraint if exists supplier_research_requests_reply_due_days_check;
alter table public.supplier_research_requests
  add constraint supplier_research_requests_reply_due_days_check
  check (reply_due_days between 1 and 60);

-- 2. Исход дожима. Специально ТОЛЬКО про молчание и отказ: «КП получено»
--    остаётся вычисляемым из самих данных (offer.items/price —
--    offerCommunicationStatus в src/data/supplierResearch.ts). Если завести
--    третью отметку 'quoted' колонкой, правда о полученном КП окажется в
--    двух местах сразу, и рано или поздно они разойдутся. Значение в CHECK
--    оставлено на случай, если когда-нибудь понадобится проставить исход
--    руками, но код его не пишет.
alter table public.supplier_research_offers
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz,
  -- Сколько напоминаний уже ушло: 0 — ни одного, 1 — первое, 2 — второе.
  -- Оно же — точка атомарного захвата в воркере (UPDATE ... WHERE
  -- reminder_stage = N), поэтому два одновременных прогона не пришлют
  -- поставщику два одинаковых напоминания.
  add column if not exists reminder_stage integer not null default 0,
  add column if not exists reminder_sent_at timestamptz;

alter table public.supplier_research_offers
  drop constraint if exists supplier_research_offers_outcome_check;
alter table public.supplier_research_offers
  add constraint supplier_research_offers_outcome_check
  check (outcome is null or outcome in ('no_answer', 'declined', 'quoted'));

-- Выборка воркера: карточки, которые ещё в дожиме.
create index if not exists supplier_research_offers_followup_idx
  on public.supplier_research_offers (reminder_stage)
  where outcome is null and deleted_at is null;

-- 3. Тип шаблона письма. null — обычный шаблон (их выбирает человек в
--    композере), 'reminder_1'/'reminder_2' — тексты напоминаний, их берёт
--    воркер. Шаблон с request_id важнее общего: у категории может быть своё
--    напоминание.
alter table public.email_templates
  add column if not exists kind text;

alter table public.email_templates
  drop constraint if exists email_templates_kind_check;
alter table public.email_templates
  add constraint email_templates_kind_check
  check (kind is null or kind in ('reminder_1', 'reminder_2'));

-- Один шаблон напоминания на категорию (и один общий) — иначе непонятно,
-- какой из двух возьмёт воркер.
create unique index if not exists email_templates_kind_request_idx
  on public.email_templates (kind, request_id) where kind is not null;
create unique index if not exists email_templates_kind_common_idx
  on public.email_templates (kind) where kind is not null and request_id is null;

-- 4. Рубильник дожима. Отдельный от enabled (автоответы): отвечать на
--    входящие и писать самому — разные по риску вещи, и включать их владелец
--    может в разное время.
alter table public.email_auto_reply_settings
  add column if not exists followups_enabled boolean not null default false;

-- 5. Тексты напоминаний по умолчанию. Плейсхолдеры те же, что у обычных
--    шаблонов ({компания}, {запрос}, {материалы}, {контакт}), приветствие в
--    тексте: напоминание уходит через дни после последнего письма, то есть
--    всегда «первое письмо за день». Подпись дописывает воркер из
--    email_auto_reply_settings.signature — как и у автоответов.
insert into public.email_templates (name, subject, body, request_id, kind)
select 'Напоминание № 1', 'Напоминание по запросу: {запрос}',
E'Здравствуйте!\n\nНапоминаю о своём запросе по позициям: {материалы}.\n\nПодскажите, пожалуйста, получится ли выставить счёт? Если чего-то не хватает для расчёта — напишите, дошлю.',
       null, 'reminder_1'
where not exists (select 1 from public.email_templates where kind = 'reminder_1' and request_id is null);

insert into public.email_templates (name, subject, body, request_id, kind)
select 'Напоминание № 2', 'Напоминание по запросу: {запрос}',
E'Здравствуйте!\n\nЕщё раз напомню про запрос по позициям: {материалы}.\n\nЕсли эти позиции вы не возите или сейчас не готовы предложить цену — просто ответьте одной строкой, я закрою запрос и не буду вас больше беспокоить.',
       null, 'reminder_2'
where not exists (select 1 from public.email_templates where kind = 'reminder_2' and request_id is null);

-- 6. Автоответы умеют закрывать карточку исходом. Десятый аргумент,
--    по умолчанию null — старые восьми- и девятиаргументные вызовы из
--    промпта Routine продолжают работать как раньше.
--
-- Старую функцию именно УДАЛЯЕМ, а не «create or replace»: другое число
-- аргументов — это другая функция, replace её не перекрывает. Обе разом
-- сделали бы любой девятиаргументный вызов неоднозначным («function is not
-- unique»), то есть уронили бы разбор почты целиком.
drop function if exists public.auto_reply_apply(uuid, uuid, text, text, text, text, text, text, text);

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
  p_outcome text default null
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

  if p_decision = 'auto' then
    v_reply_id := public.auto_reply_queue(p_email_id, p_subject, v_full_body, 'ИИ-закупщик');
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

revoke all on function public.auto_reply_apply(uuid, uuid, text, text, text, text, text, text, text, text) from anon, authenticated;

notify pgrst, 'reload schema';

-- ===========================================================================
-- ВТОРОЙ ШАГ — ТОЛЬКО ПОСЛЕ ДЕПЛОЯ ФУНКЦИИ process-followups.
-- Выполнено 2026-09-16 (cron.job, jobid 4). Оставлено закомментированным,
-- чтобы повторный прогон файла не пытался завести крон второй раз.
-- Раз в час, а не раз в минуту, как у трёх соседних очередей: дожим меряется
-- днями, чаще проверять нечего. Минута 17 — чтобы не совпадать ни с
-- поминутными воркерами, ни с почасовым разбором почты (:27).
-- ===========================================================================
-- select cron.schedule(
--   'process-followups',
--   '17 * * * *',
--   $cron$
--   select net.http_post(
--     url := 'https://iohcdylttyuhwovztrbk.supabase.co/functions/v1/process-followups',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_service_role_key')
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 5000
--   );
--   $cron$
-- );
