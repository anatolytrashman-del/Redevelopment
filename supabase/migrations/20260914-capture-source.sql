-- Кто снял: робот на машине владельца или человек закладкой. Владелец,
-- 2026-09-14: «я начал сомневаться в качестве. Давай сверим ручную проверку
-- через закладку и твою автоматическую на предмет совпадения данных».
--
-- Без этого поля сверка невозможна: контакты складываются по уникальному
-- ключу (хост + вид + значение), поэтому повторный съём того же номера
-- обновляет ту же строку, и чей он — не видно.
--
-- Код съёма у робота и у закладки ОДИН И ТОТ ЖЕ файл, различается только
-- окружение: headless против настоящего окна, отключённые картинки, момент
-- съёма. Сверка проверяет ровно эту разницу.
alter table supplier_contact_captures add column if not exists source text not null default '';
alter table supplier_menu_captures add column if not exists source text not null default '';

-- Всё, что снято до сегодняшней правки, снимал робот: закладкой владелец
-- проходил только первые пять сайтов утром, они помечены отдельно ниже.
update supplier_contact_captures set source = 'robot' where source = '';
update supplier_menu_captures set source = 'robot' where source = '';
update supplier_menu_captures set source = 'bookmarklet'
  where host in ('msk.avangardrf.ru', 'abclight.ru', 'glavrele.ru', 'ironpolimer.ru');
update supplier_contact_captures set source = 'bookmarklet'
  where host in ('msk.avangardrf.ru', 'glavrele.ru', 'ironpolimer.ru');

notify pgrst, 'reload schema';
