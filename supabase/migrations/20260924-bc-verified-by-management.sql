-- Отметка «Информация проверена администрацией БЦ» (владелец, 24.09.2026).
-- Дата сверки карточки с УК или администрацией здания. Пока стоит, под
-- заголовком страницы БЦ есть зелёная отметка, а блока «Вы собственник или
-- управляющая компания?» нет. Первая — CAMPUS: Анна из УК прислала правки,
-- они внесены (20260924-campus-owner-corrections.sql).
alter table business_centers add column if not exists verified_by_management_at date;

update business_centers
set verified_by_management_at = date '2026-09-24',
    name = 'Бизнес-центр CAMPUS'
where slug = 'campus';

notify pgrst, 'reload schema';
