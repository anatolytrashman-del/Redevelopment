-- Шаблоны писем общего ящика (страница "Почта", владелец 2026-09-16:
-- "мне нужны шаблоны писем... и на этой странице должна быть возможность
-- выбрать шаблон письма").
--
-- Почему отдельная таблица, а не уже существующая email_templates:
-- та обслуживает переписку с поставщиками (fetchEmailTemplates() тянет ВСЕ
-- строки и показывает их в композере Ресерча и в массовой рассылке, плюс
-- у неё есть kind='reminder_1|reminder_2' для дожима). Положив сюда же
-- питчи журналистам, мы получили бы их в выпадашке у закупщика, а
-- закупочные шаблоны — в ящике. Общего у двух наборов ничего нет, кроме
-- слова "шаблон".
create table if not exists mailbox_email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists mailbox_email_templates_name_idx on mailbox_email_templates (name);

alter table mailbox_email_templates enable row level security;
drop policy if exists authenticated_all on mailbox_email_templates;
create policy authenticated_all on mailbox_email_templates for all to authenticated using (true) with check (true);

notify pgrst, 'reload schema';
