-- Стоп-лист поставщиков (шаг 4b плана docs/procurement-product-steps.md).
--
-- Зачем. Сейчас «больше не писать этой компании» выражается только удалением
-- карточки — то есть потерей переписки и истории цен (после шага 1 она хотя
-- бы мягкая, но карточка всё равно исчезает из работы). Нужен способ сказать
-- «компания есть, данные её храним, но письма ей не шлём»: нахамили,
-- поставили брак, задрали цену, работают только по предоплате 100 %.
--
-- Блокировка живёт на КОМПАНИИ, а не на карточке категории: отказ работать
-- относится к фирме целиком, а не к её участию в закупке краски.

alter table suppliers add column if not exists blocked_reason text;
alter table suppliers add column if not exists blocked_at timestamptz;

comment on column suppliers.blocked_reason is
  'Причина стоп-листа. NULL — компания в работе. Непусто — в рассылку не попадает, письма ей не шлём.';

-- Индекс частичный: заблокированных всегда меньшинство, а спрашивают у базы
-- именно их (список для фильтра рассылки).
create index if not exists suppliers_blocked_idx
  on suppliers (id) where blocked_reason is not null and deleted_at is null;

notify pgrst, 'reload schema';
