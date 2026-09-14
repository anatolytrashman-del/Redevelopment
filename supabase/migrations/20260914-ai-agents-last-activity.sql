-- «ИИ-агенты» в разделе «Команда»: время последней выполненной задачи.
--
-- Владелец, 2026-09-14: «сделай время последней выполненной задачи агента».
-- Агент — это не строка в базе, а набор процессов (см. src/data/aiAgents.ts),
-- каждый из которых оставляет след в своей таблице. Одна SECURITY DEFINER
-- функция собирает эти следы в один ответ «агент → что сделал → когда», чтобы
-- фронт с anon-ключом не ходил в шесть таблиц с разными RLS. Наружу уходят
-- только подпись задачи и время — ни текстов писем, ни результатов поиска.
--
-- Совместимо со старым кодом: только новая функция, таблицы не трогаем.
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

comment on function ai_agents_last_activity() is
  'Последняя выполненная задача каждого ИИ-агента из раздела «Команда» (src/data/aiAgents.ts): подпись и время.';

notify pgrst, 'reload schema';
