-- Вкладка "Подрядчики" на странице "Закупки" (владелец, 2026-09-14: "заложить
-- основу... на старте нужно всего два поля — ссылка на страницу на Авито и
-- email подрядчика. С подрядчиками должна быть возможность общаться по email.
-- Пока делаем только индивидуальные рассылки. Никаких автоматических файлов к
-- письму не прикрепляется").
--
-- ПОЧЕМУ work_contractors, а не contractors: имя занято — таблица contractors
-- держит состав команды (страница /admin/contractors, в меню называется
-- "Команда", см. src/data/contractors.ts). Рядом же есть
-- contractor_research_requests/offers — сравнение предложений на услуги по
-- цене (секция "Работы" внутри вкладки "Поставщики"). Эта таблица — третья и
-- самостоятельная: реестр подрядчиков, найденных на Авито, с перепиской.
--
-- Миграция только добавляет и расширяет: две новые таблицы плюс расширение
-- списка в CHECK у outgoing_email_jobs (см. в самом конце файла). Ничего не
-- переименовывает, не удаляет и не ужесточает — старый код на проде её не
-- замечает, безопасно применять до публикации (см. CLAUDE.md, "Очередь
-- релиза"). Применена 2026-09-14.

create table if not exists public.work_contractors (
  id uuid primary key default gen_random_uuid(),
  -- Ровно два поля, которые попросил владелец. Не not null: карточку заводят
  -- с тем, что есть под рукой (нашли на Авито — ссылка уже есть, email ещё
  -- нет), пустая строка вместо NULL — тот же стиль, что и у остальных
  -- текстовых полей проекта.
  avito_url text not null default '',
  email text not null default '',
  -- Адрес переписки строится как zakupki+<short_code>@redevelopment.pro —
  -- тот же механизм и та же генерация, что у supplier_research_offers:
  -- ответ подрядчика прилетает на этот адрес и матчится по коду, без
  -- отдельного ящика на каждого (см. api/purchase-email-webhook.js).
  short_code text not null unique default substr(md5((random())::text || (clock_timestamp())::text), 1, 5),
  created_at timestamptz not null default now()
);

-- Переписка с подрядчиком. Урезанная копия supplier_offer_emails: без
-- extraction (распознавание счетов — про поставщиков материалов, здесь не
-- нужно), без order_id (заявок на поставку у подрядчика нет) и без
-- bulk_job_item_id (массовой рассылки по подрядчикам пока не делаем —
-- владелец: "пока делаем только индивидуальные рассылки").
create table if not exists public.work_contractor_emails (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.work_contractors(id) on delete cascade,
  direction text not null,
  from_address text not null,
  to_address text not null,
  subject text,
  body text,
  files jsonb not null default '[]'::jsonb,
  resend_message_id text,
  -- Только у входящих (direction='in'); у исходящих всегда null — как в
  -- supplier_offer_emails.
  read_at timestamptz,
  -- Кто отправил (учёт работы с письмами по сотрудникам, см. Metrics.tsx) —
  -- проставляет сервер по реально вошедшему пользователю, не по имени с
  -- клиента.
  sent_by_profile_id uuid,
  sent_by_name text,
  -- Очередь повторной отправки (api/purchase-send-email.js +
  -- supabase/functions/process-outgoing-emails): 'sent' | 'queued' | 'failed'.
  send_status text not null default 'sent',
  send_error text,
  created_at timestamptz not null default now()
);

create index if not exists work_contractor_emails_contractor_idx
  on public.work_contractor_emails (contractor_id, created_at);

-- RLS как у соседних таблиц закупок: анонимной записи нет вообще, всё
-- делает вошедший сотрудник; письма пишет сервер сервисным ключом в обход
-- RLS (ключ Resend не может жить на фронте).
alter table public.work_contractors enable row level security;
alter table public.work_contractor_emails enable row level security;

drop policy if exists authenticated_all on public.work_contractors;
create policy authenticated_all on public.work_contractors
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_all on public.work_contractor_emails;
create policy authenticated_all on public.work_contractor_emails
  for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';

-- Очередь повторной отправки (outgoing_email_jobs, см. api/purchase-send-email.js
-- и supabase/functions/process-outgoing-emails) перечисляет допустимые таблицы
-- писем списком в CHECK. Без этой правки письмо подрядчику при ВРЕМЕННОМ
-- отказе Resend (кончился дневной лимит, 5xx) не встало бы в очередь: вставка
-- задания упала бы на констрейнте, и письмо помечалось бы как "не отправлено"
-- вместо "уйдёт само". Сам воркер ничего про конкретные таблицы не знает —
-- пишет в job.email_table как есть, поэтому правки там не нужно.
--
-- Расширение списка, не сужение: старый код в эту колонку 'work_contractor_emails'
-- никогда не кладёт, прод от такой миграции не ломается.
do $$
begin
  if to_regclass('public.outgoing_email_jobs') is not null then
    alter table public.outgoing_email_jobs drop constraint if exists outgoing_email_jobs_email_table_check;
    alter table public.outgoing_email_jobs add constraint outgoing_email_jobs_email_table_check
      check (email_table = any (array['supplier_offer_emails', 'purchase_emails', 'work_contractor_emails']));
  end if;
end $$;

notify pgrst, 'reload schema';
