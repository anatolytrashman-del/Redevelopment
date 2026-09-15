-- Возврат снятых роботом адресов, потерянных при обнулении контактов 14.09.
--
-- Что нашлось (владелец, 2026-09-15, «хочу запустить верификацию оставшейся
-- части поставщиков — какие там проблемы?»): в очереди верификации стояли
-- 106 российских доменов, и НИ У ОДНОГО не было почты — то есть кнопка
-- «Верифицировать» у всех выключена правилом от 15.09
-- (20260915-verify-requires-email.sql), очередь нерабочая. При этом у 76 из
-- них адрес в базе есть: робот съёма снял его 14.09, триггер
-- apply_supplier_contact_capture записал в карточку и пометил строку
-- supplier_contact_captures как applied (проверка landed в той функции не
-- даёт пометить applied то, что не приземлилось), а потом обнуление
-- контактов того же дня стёрло поле в карточке — статусы капчур при этом
-- остались прежними, поэтому дырку никто не заметил. След обнуления —
-- supplier_contacts_backup_20260914 (14.09 09:13, email у 1192 карточек из
-- 1210) против нынешних 24 непустых почт у неверифицированных.
--
-- Адреса берём не из того бэкапа (там дособранное веб-поиском, которое
-- владелец обнулял намеренно), а только из снятого с самих сайтов:
-- kind = 'email', status = 'applied', source робота/закладки. При нескольких
-- адресах на домен выигрывает тот же, что выбрал бы триггер, — по rank
-- (заказные ящики zakaz@/snab@/commerce@ выше общего info@), при равном
-- rank последний снятый.
--
-- Трогаем ТОЛЬКО карточки с пустой почтой: заполненную (в том числе адрес
-- из живой переписки) не перебиваем — тот же выбор, что в ветке «карточка с
-- живой перепиской» apply_supplier_contact_capture.
update supplier_research_offers o
   set email = b.value
  from (
    select distinct on (c.host) c.host, c.value
      from supplier_contact_captures c
     where c.kind = 'email'
       and c.status = 'applied'
     order by c.host, c.rank desc nulls last, c.captured_at desc
  ) b
 where supplier_site_host(o.website_url) = b.host
   and coalesce(trim(o.email), '') = '';

-- Отметка «верифицирован» проставляется не здесь, а действующей функцией —
-- условие у неё одно на все пути (снимок меню + снятый контакт + непустая
-- почта в карточке), дублировать его отдельным update значило бы завести
-- шестой путь отметки с собственной копией правила. Она же пишет строку в
-- activity_log на ИИ-закупщика, поэтому счётчик на /admin/metrics сходится
-- сам.
do $$
declare h text;
begin
  for h in
    select distinct supplier_site_host(o.website_url)
      from supplier_research_offers o
     where coalesce(o.verified, false) = false
       and coalesce(trim(o.email), '') <> ''
  loop
    perform verify_supplier_offers_with_captures(h);
  end loop;
end $$;

notify pgrst, 'reload schema';
