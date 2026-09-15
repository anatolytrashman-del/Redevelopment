-- Контактные лица поставщика (шаг 3b плана docs/procurement-product-steps.md,
-- §5.3 аудита).
--
-- Зачем. Сейчас «контакт» у поставщика один и живёт в карточке категории:
-- contact + contact_method + email + manager_name. На практике у компании
-- людей несколько: письмо уходит на общий ящик (info@, zakaz@), а отвечает
-- конкретный менеджер со своего адреса — в живой базе из 124 входящих писем
-- 67 разных адресов, и это в основном личная почта вида karamysheva@…,
-- dashin@…, которой в карточках нет вообще. Закупщик не видит, с кем он
-- реально разговаривал и когда этот человек последний раз отвечал.
--
-- Таблица одна на КОМПАНИЮ (шаг 2), а не на карточку: человек работает с
-- фирмой, а не с её участием в категории закупки.

create table if not exists supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  -- CASCADE здесь безопасен, в отличие от истории с перепиской (шаг 1):
  -- контакт без компании не значит ничего, а сама компания удаляется мягко
  -- (deleted_at), то есть каскад в обычной работе не срабатывает вовсе.
  supplier_id uuid not null references suppliers (id) on delete cascade,
  name text not null default '',
  -- Должность/роль: «менеджер по продажам», «бухгалтерия», «склад».
  role text not null default '',
  phone text not null default '',
  email text not null default '',
  messengers jsonb not null default '[]'::jsonb,
  -- Откуда взялся контакт: 'карточка' (перенос при этой миграции),
  -- 'письмо' (человек сам написал нам), 'вручную' (завела закупщица).
  source text not null default '',
  -- Когда этот человек последний раз нам отвечал. Поддерживается триггером
  -- ниже, поэтому не устаревает.
  last_reply_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table supplier_contacts is
  'Контактные лица компании-поставщика. Одна строка на человека; общий ящик компании — тоже строка, с пустым именем.';

create index if not exists supplier_contacts_supplier_idx
  on supplier_contacts (supplier_id, created_at) where deleted_at is null;
-- Один человек на адрес внутри компании: и перенос, и триггер ниже, и ручное
-- добавление опираются на это, чтобы не плодить дубли одного менеджера.
create unique index if not exists supplier_contacts_email_key
  on supplier_contacts (supplier_id, lower(email))
  where deleted_at is null and email <> '';

alter table supplier_contacts enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'supplier_contacts' and policyname = 'authenticated_all') then
    create policy authenticated_all on supplier_contacts for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ── Перенос 1: общий контакт компании из её карточек. Поля уже сведены в
-- suppliers при бэкфилле шага 2 (правило «первое непустое, приоритет у
-- верифицированных»), поэтому берём их оттуда, а имя менеджера — из карточек:
-- в suppliers его нет, а в карточках оно кое-где заполнено вебхуком по
-- заголовку From.
insert into supplier_contacts (supplier_id, name, phone, email, messengers, source)
select
  s.id,
  coalesce((
    select nullif(trim(o.manager_name), '')
      from supplier_research_offers o
     where o.supplier_id = s.id and o.deleted_at is null and nullif(trim(o.manager_name), '') is not null
     order by o.created_at
     limit 1
  ), ''),
  s.phone, s.email, s.messengers, 'карточка'
from suppliers s
where s.deleted_at is null
  -- Компании совсем без контактов пропускаем: пустая строка «контактное
  -- лицо без имени, без почты и без телефона» — мусор, а не данные.
  and (coalesce(trim(s.email), '') <> '' or coalesce(trim(s.phone), '') <> '' or jsonb_array_length(s.messengers) > 0)
on conflict do nothing;

-- ── Перенос 2: те, кто нам реально писал. Один контакт на уникальный адрес
-- отправителя, с датой последнего ответа. Адрес, совпавший с общим ящиком
-- компании, новой строки не создаёт — ему проставится дата ниже.
insert into supplier_contacts (supplier_id, email, source, last_reply_at)
select o.supplier_id, lower(trim(e.from_address)), 'письмо', max(e.created_at)
  from supplier_offer_emails e
  join supplier_research_offers o on o.id = e.offer_id
 where e.direction = 'in'
   and e.deleted_at is null
   and o.supplier_id is not null
   and coalesce(trim(e.from_address), '') <> ''
 group by o.supplier_id, lower(trim(e.from_address))
on conflict do nothing;

-- ── Дата последнего ответа для уже существующих строк (в том числе общего
-- ящика компании, если отвечали именно с него).
update supplier_contacts c
   set last_reply_at = src.last_reply
  from (
    select o.supplier_id, lower(trim(e.from_address)) as email, max(e.created_at) as last_reply
      from supplier_offer_emails e
      join supplier_research_offers o on o.id = e.offer_id
     where e.direction = 'in' and e.deleted_at is null and o.supplier_id is not null
     group by o.supplier_id, lower(trim(e.from_address))
  ) src
 where c.supplier_id = src.supplier_id
   and lower(c.email) = src.email
   and c.deleted_at is null
   and (c.last_reply_at is null or c.last_reply_at < src.last_reply);

-- ── Список сам себя поддерживает: ответ с нового адреса заводит контакт,
-- ответ со знакомого — обновляет дату. Без этого список зафиксировался бы на
-- состоянии переноса и через месяц снова врал бы.
create or replace function supplier_contact_touch_from_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_supplier uuid;
  v_email text;
begin
  if new.direction <> 'in' then
    return new;
  end if;

  v_email := lower(nullif(trim(coalesce(new.from_address, '')), ''));
  if v_email is null then
    return new;
  end if;

  select supplier_id into v_supplier from supplier_research_offers where id = new.offer_id;
  if v_supplier is null then
    return new;
  end if;

  insert into supplier_contacts (supplier_id, email, source, last_reply_at)
  values (v_supplier, v_email, 'письмо', new.created_at)
  on conflict (supplier_id, lower(email)) where (deleted_at is null and email <> '')
  do update set last_reply_at = greatest(coalesce(supplier_contacts.last_reply_at, new.created_at), new.created_at);

  return new;
end $$;

drop trigger if exists supplier_contact_touch_from_email_trg on supplier_offer_emails;
create trigger supplier_contact_touch_from_email_trg
  after insert on supplier_offer_emails
  for each row execute function supplier_contact_touch_from_email();

notify pgrst, 'reload schema';
