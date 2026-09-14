-- Автоматическая верификация триггером — тоже на баланс ИИ-закупщика.
--
-- 20260914-auto-apply-captures.sql (ветка lucid-faraday) сделала базу
-- четвёртым автоматическим путём отметки «верифицирован»: как только у хоста
-- есть и снимок меню, и снятый контакт, verify_supplier_offers_with_captures
-- ставит verified = true всем его карточкам (731 карточка за первый прогон).
-- В activity_log это не попадало — та же дыра, что у скриптов робота (см.
-- 20260914-ai-buyer-robot-verifications-backfill.sql). Владелец: «все
-- верифицированные автоматическим образом поставщики на странице метрики
-- идут на баланс ИИ-закупщика» — функция теперь логирует каждую
-- перевёрнутую строку одним запросом с обновлением. Имя — то же, что
-- AUTO_REPLY_SENDER_NAME / AI_BUYER_NAME в коде. security definer уже был —
-- insert в activity_log идёт от владельца функции, политики не мешают.
--
-- Совместимо со старым кодом: сигнатура и поведение отметки не меняются.

create or replace function public.verify_supplier_offers_with_captures(target_host text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(target_host, '') = '' then
    return;
  end if;
  if not exists (select 1 from supplier_menu_captures m where m.host = target_host) then
    return;
  end if;
  if not exists (select 1 from supplier_contact_captures c where c.host = target_host) then
    return;
  end if;
  with up as (
    update supplier_research_offers o
       set verified = true
     where supplier_site_host(o.website_url) = target_host
       and coalesce(o.verified, false) = false
     returning o.id
  )
  insert into activity_log (profile_id, profile_name, action)
  select null, 'ИИ-закупщик', 'supplier_offer_verified' from up;
end $$;

NOTIFY pgrst, 'reload schema';
