-- ИИ-агенты: письма, отправленные по подсказке владельца, + подписи от первого лица.
--
-- Владелец, 2026-09-15: «даже если я помогаю с ответами, всё равно ИИ-закупщик
-- отправляет письма. Давай фиксировать и эти его действия в статус-баре» и
-- «давай писать так "Отправил письмо", "Распознал счёт" — прям от его лица».
--
-- 1. Чего не хватало. Разбор с владельцем (второй Routine, docs/auto-reply-routine.md)
--    заводит строку лога заранее, в момент «вынесено на разбор», с decision='skipped'.
--    Когда владелец отвечает («1 да» или своим текстом), auto_reply_answer НЕ меняет
--    decision — она ставит answered_at/reviewed_at и reviewed_action='sent'|'edited',
--    а письмо кладёт в очередь (auto_reply_queue → outgoing_email_jobs). То есть
--    письмо реально отправил агент, а в ai_agents_last_activity() эта работа не
--    попадала: у 'procurement' учитывалось только decision='sent'. На 15.09 так
--    потерялось 6 отправленных писем, последнее — в то же утро, пока пилюля
--    показывала «Распознавание счёта · вчера».
--
--    reply_email_id is not null — граница «кто отправил». Черновик, который
--    владелец отправил кнопкой в переписке (markAutoReplyReviewed), тоже получает
--    reviewed_action='sent', но письмо там уходит обычным путём от человека и
--    reply_email_id остаётся пустым — такое агенту не приписываем.
--
-- 2. Подписи. Были отглагольные существительные («Распознавание счёта»), стали
--    репликой самого агента в прошедшем времени («Распознал счёт»). Строка в
--    пилюле узкая (max-w 320px, длинное режется многоточием), поэтому подписи
--    короткие: подпись у 'procurement' держим в пределах ~20 знаков, иначе она
--    режется прямо в пилюле (проверено скриншотом — «Отправил ваш ответ
--    поставщику» превращалось в «Отправил ваш ответ постав…»). У 'data-collector'
--    ограничения нет: он показывается только в широкой карточке «Команды».
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
    select 'procurement' as agent_id, 'Отправил письмо' as label, max(created_at) as done_at
      from email_auto_reply_log where decision = 'sent'
    union all
    select 'procurement', 'Отправил ваш ответ',
           max(coalesce(answered_at, reviewed_at))
      from email_auto_reply_log
     where reviewed_action in ('sent', 'edited')
       and reply_email_id is not null
    union all
    select 'procurement', 'Разослал запросы цен', max(sent_at)
      from bulk_send_job_items where status = 'sent'
    union all
    select 'procurement', 'Нашёл поставщиков', max(completed_at)
      from supplier_web_search_jobs where status = 'done'
    union all
    select 'procurement', 'Собрал контакты', max(completed_at)
      from supplier_enrichment_jobs where status = 'done'
    union all
    select 'procurement', 'Распознал счёт',
           max((extraction->>'recognizedAt')::timestamptz)
      from supplier_offer_emails
     where (extraction->>'isInvoice')::text = 'true'
       and extraction->>'recognizedAt' ~ '^\d{4}-\d{2}-\d{2}T'
    union all
    -- ИИ-сборщик информации
    select 'data-collector', 'Собрал статистику спроса: ' || source, max(checked_at)
      from demand_stats group by source
    union all
    select 'data-collector', 'Собрал объявления: ' || source, max(updated_at)
      from market_offers group by source
    union all
    select 'data-collector', 'Собрал первичный рынок: ' || source, max(scraped_at)
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
