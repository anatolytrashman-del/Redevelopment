-- Email — обязательное условие верификации поставщика.
--
-- Владелец, 2026-09-15 (по карточке magmastones.ru, попавшей в
-- верифицированные с телефоном и мессенджером Max, но без почты): «у нас в
-- верификацию попал поставщик без email... это было обязательное условие
-- верификации. Верни всех поставщиков без email в очередь верификации».
--
-- Что было не так: verify_supplier_offers_with_captures (миграция
-- 20260914-auto-apply-captures.sql, затем
-- 20260914-ai-buyer-trigger-verifications-log.sql) требовала «снимок меню +
-- ЛЮБОЙ снятый контакт» — supplier_contact_captures хранит и телефоны, и
-- мессенджеры, поэтому сайт, с которого закладка сняла только номер, уходил
-- в верифицированные. Формулировка владельца 2026-09-14 («собрали каталог +
-- контакты») подразумевала почту: верификация нужна ровно затем, чтобы
-- поставщику можно было писать (см. BulkSendModal/SupplierCorrespondenceTab
-- — оба требуют email И verified).
--
-- Как чиним: условие теперь смотрит не на факт снятого контакта, а на
-- РЕЗУЛЬТАТ — непустой email в самой карточке. Это строже и надёжнее, чем
-- проверка kind = 'email' среди снятого: снятый адрес мог не приземлиться
-- в карточку (ветка «карточка с живой перепиской» в
-- apply_supplier_contact_capture ставит capture в skipped), а адрес мог,
-- наоборот, прийти не закладкой, а из веб-поиска или руками.
--
-- Совместимо со старым кодом: колонки и сигнатуры не меняются, отметка
-- только снимается — старый фронт покажет такие карточки как
-- неверифицированные, то есть в очереди верификации, чего владелец и просит.

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
       -- Почта обязательна (владелец, 2026-09-15). Проверяется на карточке,
       -- а не на снятом контакте — см. шапку миграции.
       and coalesce(trim(o.email), '') <> ''
     returning o.id
  )
  insert into activity_log (profile_id, profile_name, action)
  select null, 'ИИ-закупщик', 'supplier_offer_verified' from up;
end $$;

-- Возврат уже отмеченных карточек без почты в очередь верификации (115
-- карточек на 112 доменов на момент миграции; ни у одной нет переписки —
-- проверено запросом перед написанием). Снятие отметки в activity_log не
-- пишем: отдельного действия «разверифицировал» в логе нет, и вычитать из
-- счётчика ИИ-закупщика владелец не просил (тот же выбор сделан в
-- scripts/verify-recognized.mjs).
update supplier_research_offers
   set verified = false
 where coalesce(verified, false) = true
   and coalesce(trim(email), '') = '';

notify pgrst, 'reload schema';
