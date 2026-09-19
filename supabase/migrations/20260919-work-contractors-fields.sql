-- Расширение реестра подрядчиков (страница "Подрядчики", владелец,
-- 2026-09-19, четыре пункта одним заходом):
--   1) тег "ВК" всем, кому уже отправлено письмо (заведены с Авито до
--      появления категорий);
--   2) 33 контакта поставщиков аренды строительных лесов (Москва/МО) —
--      из присланной владельцем таблицы, со всеми её колонками;
--   3) шаблоны писем — по образцу mailbox_email_templates (страница
--      "Почта" → вкладка "Шаблоны"): отдельная таблица по той же причине,
--      что и там (см. 20260916-mailbox-templates.sql) — общего с
--      шаблонами поставщиков (email_templates, привязаны к запросу
--      Ресерча) ничего нет, кроме слова "шаблон";
--   4) массовая рассылка по категории — своя пара таблиц-очереди по
--      образцу bulk_send_jobs/bulk_send_job_items, но не переиспользует
--      их: там bulk_send_job_items.offer_id NOT NULL и концептуально FK на
--      supplier_research_offers, подрядчика в неё не положить без правки
--      чужой схемы. Разбирает очередь Edge Function
--      process-work-contractor-bulk-send-jobs (деплоится отдельно, см.
--      docs/session-journal.md), pg_cron — второй блок в конце файла.
--
-- Миграция только добавляет и расширяет — старый код (два поля, без
-- категории) продолжает работать как раньше. Применена 2026-09-19.

-- 1. Новые поля карточки подрядчика — все колонки присланной таблицы по
--    аренде лесов, плюс "категория" (растущий тег, тот же паттерн, что и
--    mailboxContactCategories/leadRequirements — пресет + то, что реально
--    встречается, объединяются на фронте).
alter table public.work_contractors
  add column if not exists company_name text not null default '',
  add column if not exists website text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists services text not null default '',
  add column if not exists address text not null default '',
  add column if not exists note text not null default '',
  add column if not exists category text not null default '',
  -- Доп. email'ы компании сверх основного. Основной (email) — тот, что
  -- участвует в переписке (на него настроен short_code /
  -- zakupki+<code>@redevelopment.pro); остальные только показываются в
  -- карточке, письмо на них не уходит.
  add column if not exists extra_emails text[] not null default '{}';

-- 2. Тег "ВК" — владелец: "все текущие контакты, которым отправлены
--    письма, сохрани как ВК". Не трогаем тех, у кого категория уже
--    проставлена, и тех, кому не писали.
update public.work_contractors
set category = 'ВК'
where category = ''
  and id in (select distinct contractor_id from public.work_contractor_emails where direction = 'out');

-- 3. 33 контакта подрядчиков по аренде строительных лесов (Москва/МО).
--    Первый email из ячейки таблицы — тот, что участвует в переписке
--    (email), остальные — extra_emails. Пустой адрес/примечание ("—" в
--    исходной таблице) — пустая строка, не placeholder, как и у остальных
--    текстовых полей проекта.
insert into public.work_contractors (company_name, website, email, extra_emails, phone, services, address, note, category)
select company_name, website, email, extra_emails, phone, services, address, note, 'Аренда лесов' from (values
  ('СпецМонолитСтрой', 'https://speclesa.ru', 'info@specopalubka.ru', '{}'::text[], '+7 (495) 414-11-07', 'рамные, клиновые, хомутовые, монтаж', 'Балашиха, ул. 7-я Нижняя Линия, 2А', '★ Офис в Балашихе'),
  ('PERI (ООО «ПЕРИ»)', 'https://peri.ru', 'market@peri.ru', '{}'::text[], '8 800 505-13-61', 'системные фасадные леса PERI UP, промышленные леса', 'Ногинск-Технопарк, 9; офис Москва, Семёновская пл., 7', '★ База в Ногинске (восток МО); крупный игрок'),
  ('Снабстрой', 'https://snab-str.ru', 'info@snab-str.ru', ARRAY['s.pronina@snab-str.ru','o.boris@snab-str.ru']::text[], '+7 (495) 280-15-04; +7 (926) 300-07-97', 'строительные леса, подвесные леса', 'Москва, Ленинградский пр-т, 37; склад — Богородский г.о., д. Горки', '★ Склад на востоке МО; есть страница по Балашихе'),
  ('ПрофМастер', 'https://pmg.su', 'info@pmg.su', '{}'::text[], '+7 (495) 640-59-79', 'рамные, клиновые, хомутовые', 'Москва, Алтуфьевское ш., 44; склады: Дзержинский, Мытищи, Одинцово', 'Есть страница по Балашихе'),
  ('Версона', 'https://wersona.ru', 'mail@wersona.ru', '{}'::text[], '+7 (495) 725-91-31', 'рамные, клиновые, хомутовые, монтаж', 'Москва, ул. Авиаторов, 12; Подольск', 'Есть страница по Балашихе'),
  ('ДИРС СТРОЙ', 'https://ooodirs.ru', 'info@ooodirs.ru', '{}'::text[], '8 800 775-69-34; +7 (499) 380-70-55', 'рамные, клиновые, хомутовые, штыревые, монтаж', 'Москва', 'Есть страница по Балашихе'),
  ('Стройснаб (Леса-Снаб)', 'https://lesa-snab.ru', 'client@lesa-snab.ru', '{}'::text[], '+7 (495) 162-23-37; +7 (926) 496-56-09', 'рамные, клиновые, хомутовые, штыревые, монтаж', 'Москва; филиал Щёлково', 'Филиал в Щёлкове'),
  ('Твой Монолит', 'https://monolit-moskva.ru', 'stroiproektmonolit@gmail.com', '{}'::text[], '+7 (495) 409-00-06; +7 (910) 466-51-95', 'рамные ЛРСП-30/40', 'Королёв, ул. Пионерская, 1А, стр. 2', 'Северо-восток МО'),
  ('ГК «ПромСтройКонтракт»', 'https://psk-holding.ru', 'info@psk-holding.ru', '{}'::text[], '+7 (499) 444-24-80', 'рамные ЛРСП, клиновые, хомутовые, чашечные', 'Москва, ул. Обручева, 13Б', 'Крупный поставщик, также опалубка'),
  ('Со-Бит (завод «Стройэталон»)', 'https://co-bit.ru', 'st-italon@yandex.ru', ARRAY['co-bet@yandex.ru']::text[], '8 800 775-18-97; +7 (495) 374-74-17', 'рамные, клиновые, хомутовые, монтаж', 'Москва / МО', 'Производитель — аренда и продажа'),
  ('Строительное оборудование', 'https://opaloobka.ru', 'info@opaloobka.ru', ARRAY['sale@opaloobka.ru']::text[], '8 800 250-94-77; +7 (910) 866-13-32', 'рамные, клиновые, хомутовые, штыревые', 'Клин (производство); офис Москва, Рязанский пр-т, 35', 'Производитель'),
  ('ТРИУМФ-РЕНТ', 'https://rentlulek.ru', 'info@rentlulek.ru', '{}'::text[], '+7 (499) 322-07-08', 'рамные, клиновые, хомутовые, штыревые, монтаж', 'Москва', ''),
  ('Фасадные системы', 'https://rent-lesov.ru', 'zakaz@rent-lesov.ru', '{}'::text[], '+7 (495) 120-42-38', 'рамные, клиновые, хомутовые, монтаж', 'Москва', ''),
  ('ГК «Северянин» (РентаСнаб)', 'https://rentasnab.ru', 'zakaz@rentasnab.ru', '{}'::text[], '+7 (495) 120-77-12; +7 (901) 771-91-16', 'рамные, клиновые, хомутовые', 'Москва', ''),
  ('ДАЙЯ групп', 'https://dayagroup.ru', 'info@dayagroup.ru', ARRAY['zayavka@dayagroup.ru']::text[], '+7 (966) 888-12-03; +7 (495) 182-77-31', 'рамные, клиновые, хомутовые, штыревые, монтаж', 'Москва', ''),
  ('ПрофЛеса («Город лесов»)', 'https://arenda-lesov.su', 'zakaz@arenda-lesov.su', '{}'::text[], '+7 (499) 110-61-36', 'рамные, клиновые, хомутовые', 'Москва, Высоковольтный пр-д, 1к8', ''),
  ('ФасадСтройРесурс', 'https://arenda-stroilesov.ru', 'zakaz@arenda-stroilesov.ru', '{}'::text[], '+7 (495) 147-12-70', 'рамные, клиновые, хомутовые, монтаж', 'Москва, ул. Окская, 13; склад ул. 1-я Вольская, 45с7', 'Склад на востоке Москвы'),
  ('Опалубка Трейд', 'https://opalubka-trade.ru', 'info@opalubka-trade.ru', '{}'::text[], '+7 (985) 078-61-68', 'рамные, клиновые, хомутовые, штыревые', 'Москва, Дмитровское ш., 157с9; склад Ярославское ш., 2Ж', ''),
  ('ЛесаПромСтрой', 'https://lesapromstroy.ru', 'info@lesapromstroy.ru', '{}'::text[], '+7 (999) 837-71-08', 'рамные, клиновые, хомутовые, монтаж', '', ''),
  ('ТехноРент', 'https://tehno.rent', 'mail@tehno.rent', '{}'::text[], '+7 (499) 705-13-18', 'клиновые, хомутовые, монтаж', 'Москва, Шлюзовая наб., 6 с4; склад Поярково', ''),
  ('Опалубка-Домстрой', 'https://opalubka-domstroy.ru', 'info@opalubka-domstroy.ru', '{}'::text[], '8 800 444-41-10', 'рамные, клиновые, хомутовые', 'Москва', ''),
  ('МОНОЛИТСТРОЙРЕНТ', 'https://opalubka.pro', 'zakaz@opalubka.pro', '{}'::text[], '+7 (495) 109-59-00; +7 (916) 019-19-60', 'леса ЛРСП-60, расчёт лесов', 'Москва', 'Основной профиль — опалубка'),
  ('Опалубка Партнёр', 'https://opp.rent', 'i@opprent.ru', '{}'::text[], '+7 (495) 481-22-69; +7 (977) 424-31-28', 'строительные леса, вышки-туры', 'Москва', 'Основной профиль — опалубка'),
  ('СТРОИТЕЛИ', 'https://ooostroiteli.com', 'ooostroiteli@mail.ru', ARRAY['arst93@mail.ru','mst-93@mail.ru']::text[], '+7 (495) 995-78-78; +7 (499) 180-99-29', 'рамные ЛРСП-40, Cuplock', 'Москва', ''),
  ('МосСтройПрокат', 'https://mosstroyprokat.ru', 'info@mosstroyprokat.ru', '{}'::text[], '+7 (495) 374-61-08', 'леса строительные', 'Москва, Пятницкое ш., 28 стр. 1', ''),
  ('Инпрокат (ООО «Рента МСК»)', 'https://inprokat.ru', 'info@inprokat.ru', ARRAY['zakaz@inprokat.ru']::text[], '+7 (495) 648-65-14', 'леса строительные, фасадные', 'Москва', ''),
  ('СтройАренда', 'https://prokat1.com', '2152651@mail.ru', '{}'::text[], '+7 (495) 215-26-51; +7 (985) 826-98-13', 'рамные', 'склад: Мытищинский р-н, д. Грибки', ''),
  ('Моспрокат (ООО «МЕГАПОЛИС»)', 'https://mosprokat.com', 'info@mosprokat.com', '{}'::text[], '+7 (903) 796-30-45', 'леса строительные', 'Москва, Дубнинская ул., 79 стр. 10', 'Похоже, одна группа с «Точкой Проката» и «ГлавПрокатом»'),
  ('Точка Проката', 'https://tochkaprokata.com', 'info@tochkaprokata.com', ARRAY['arendamosprokat@gmail.com']::text[], '+7 (903) 798-13-69', 'рамные ЛРСП, хомутовые', 'Москва, Дубнинская ул., 79', 'Та же группа, что и Моспрокат'),
  ('ГЛАВПРОКАТ', 'https://glavprokat.net', 'glavprokat.net@gmail.com', '{}'::text[], '+7 (495) 960-17-15; +7 (966) 175-34-21 (юрлица)', 'рамные, хомутовые', 'пос. Знамя Октября, 8А', 'Та же группа, что и Моспрокат'),
  ('Мастерков (ООО «МАЭРС»)', 'https://masterkrov.su', 'info@masterkrov.su', '{}'::text[], '+7 (903) 233-22-25; +7 (495) 383-40-92', 'рамные ЛРСП-20…100', 'Москва, Булатниковская ул., 20', 'Смешанный бизнес (кровля, печи)'),
  ('Рентбригадир', 'https://rentbrigadir.ru', 'prokat@rentbrigadir.ru', '{}'::text[], '+7 (499) 350-85-72', 'рамные', 'Москва, Б. Волоколамский пр-д, 5', 'Прокат инструмента, скорее мелкие объёмы'),
  ('Фабрика Проката', 'https://fabrikaprokata.ru', 'info@fabrikaprokata.ru', '{}'::text[], '+7 (925) 254-90-48', 'рамные, хомутовые', 'Москва', 'Прокат инструмента, скорее мелкие объёмы')
) as t(company_name, website, email, extra_emails, phone, services, address, note);

notify pgrst, 'reload schema';

-- 4. Шаблоны писем подрядчикам — вкладка "Шаблоны" на странице "Подрядчики",
--    один в один mailbox_email_templates (см. её же миграцию и комментарий
--    там про то, почему это не одна таблица на все случаи разом).
create table if not exists public.work_contractor_email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists work_contractor_email_templates_name_idx
  on public.work_contractor_email_templates (name);

alter table public.work_contractor_email_templates enable row level security;
drop policy if exists authenticated_all on public.work_contractor_email_templates;
create policy authenticated_all on public.work_contractor_email_templates
  for all to authenticated using (true) with check (true);

-- 5. Массовая рассылка по категории. Пара таблиц-очереди по образцу
--    bulk_send_jobs/bulk_send_job_items, но НЕ переиспользует их — там
--    bulk_send_job_items.offer_id not null и концептуально ссылается на
--    supplier_research_offers, подрядчика в неё не положить без правки
--    чужой схемы.
create table if not exists public.work_contractor_bulk_send_jobs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  subject text not null default '',
  body text not null default '',
  -- {fileName, contentType, contentBase64} | null — один файл на задание.
  -- Проще, чем у поставщиков (LedgerAttachment): вложение тут не ведомость
  -- из xlsx, поэтому нет ни contentKey, ни дедупликации копии владельцу.
  attachment jsonb,
  status text not null default 'queued' check (status in ('queued', 'done')),
  created_by_profile_id uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.work_contractor_bulk_send_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.work_contractor_bulk_send_jobs(id) on delete cascade,
  contractor_id uuid not null references public.work_contractors(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'error', 'cancelled')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists work_contractor_bulk_send_job_items_job_idx
  on public.work_contractor_bulk_send_job_items (job_id, status);

-- Тот же рубеж от дубля, что и у поставщиков (см.
-- 20260912-bulk-send-no-duplicates.sql): письмо переписки помнит, по какой
-- строке задания оно ушло, вторая строка по тому же заданию физически не
-- вставится.
alter table public.work_contractor_emails
  add column if not exists bulk_job_item_id uuid;

create unique index if not exists work_contractor_emails_bulk_job_item_uniq
  on public.work_contractor_emails (bulk_job_item_id)
  where bulk_job_item_id is not null;

alter table public.work_contractor_bulk_send_jobs enable row level security;
alter table public.work_contractor_bulk_send_job_items enable row level security;

drop policy if exists authenticated_all on public.work_contractor_bulk_send_jobs;
create policy authenticated_all on public.work_contractor_bulk_send_jobs
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_all on public.work_contractor_bulk_send_job_items;
create policy authenticated_all on public.work_contractor_bulk_send_job_items
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';

-- ===========================================================================
-- ВТОРОЙ ШАГ — выполнено 2026-09-19, ПОСЛЕ деплоя функции
-- process-work-contractor-bulk-send-jobs (cron.job, jobid 7). Оставлено
-- закомментированным, чтобы повторный прогон файла не завёл крон второй раз
-- (тот же паттерн, что у process-outgoing-emails, см.
-- 20260912-outgoing-email-queue.sql).
-- ===========================================================================
-- select cron.schedule(
--   'process-work-contractor-bulk-send-jobs',
--   '* * * * *',
--   $cron$
--   select net.http_post(
--     url := 'https://iohcdylttyuhwovztrbk.supabase.co/functions/v1/process-work-contractor-bulk-send-jobs',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_service_role_key')
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 5000
--   );
--   $cron$
-- );
