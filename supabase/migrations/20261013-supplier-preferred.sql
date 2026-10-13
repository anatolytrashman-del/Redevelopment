-- Избранный поставщик: компания, которой по её профилю пишем в первую очередь
-- (сантехника, отопление, трубы — Сантехкомплект и TAVAGO). Отметка на
-- компании, а не на карточке категории: одна фирма видна на всех плитках
-- каталога и в обеих рассылках ведомости.
alter table suppliers add column if not exists preferred boolean not null default false;

update suppliers
set preferred = true
where deleted_at is null
  and website_host in ('santech.ru', 'tavago.ru');

notify pgrst, 'reload schema';
