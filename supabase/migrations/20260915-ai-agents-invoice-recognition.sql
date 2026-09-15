-- ИИ-закупщик: распознавание счёта — тоже выполненная задача.
--
-- Владелец, 2026-09-15: «выведем статус онлайна ИИ-закупщика и покажем его
-- последнее действие, например, ответ на письмо или распознавание счёта».
-- В ai_agents_last_activity() у 'procurement' были только ответы на письма,
-- рассылка, веб-поиск и обогащение контактов — автораспознавание счетов из
-- вложений (api/_invoiceRecognition.js, след в supplier_offer_emails.extraction)
-- в список не попадало, хотя это самая заметная его работа.
--
-- Время берём из extraction->>'recognizedAt' (ISO-строка, ставит сервер при
-- приёме письма). Регулярка в where — страховка от нечитаемого значения:
-- в SQL нет try_cast, одна кривая строка уронила бы весь RPC.
--
-- Совместимо со старым кодом: меняется только тело функции, сигнатура та же.
create or replace function ai_agents_last_activity()
returns table (agent_id text, label text, done_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  with candidates as (
    -- ИИ-закупщик
    select 'procurement' as agent_id, 'Ответ на письмо поставщика' as label, max(created_at) as done_at
      from email_auto_reply_log where decision = 'sent'
    union all
    select 'procurement', 'Рассылка запросов цен', max(sent_at)
      from bulk_send_job_items where status = 'sent'
    union all
    select 'procurement', 'Веб-поиск поставщиков', max(completed_at)
      from supplier_web_search_jobs where status = 'done'
    union all
    select 'procurement', 'Обогащение контактов поставщика', max(completed_at)
      from supplier_enrichment_jobs where status = 'done'
    union all
    select 'procurement', 'Распознавание счёта',
           max((extraction->>'recognizedAt')::timestamptz)
      from supplier_offer_emails
     where (extraction->>'isInvoice')::text = 'true'
       and extraction->>'recognizedAt' ~ '^\d{4}-\d{2}-\d{2}T'
    union all
    -- ИИ-сборщик информации
    select 'data-collector', 'Статистика спроса: ' || source, max(checked_at)
      from demand_stats group by source
    union all
    select 'data-collector', 'Объявления: ' || source, max(updated_at)
      from market_offers group by source
    union all
    select 'data-collector', 'Первичный рынок: ' || source, max(scraped_at)
      from primary_market_offers group by source
  )
  select distinct on (agent_id) agent_id, label, done_at
    from candidates
   where done_at is not null
   order by agent_id, done_at desc;
$$;

revoke all on function ai_agents_last_activity() from public;
grant execute on function ai_agents_last_activity() to anon, authenticated;

notify pgrst, 'reload schema';
