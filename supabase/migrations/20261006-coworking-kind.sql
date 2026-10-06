-- Каталог коворкингов Минска — тот же business_centers, kind = 'cw'.
-- Скрыты (is_hidden), пока нет публичных страниц. Сбор Яндекса:
--   node scripts/capture-yandex-all.mjs --kind cw --auto --write-db

alter table public.business_centers
  drop constraint if exists business_centers_kind_check;
alter table public.business_centers
  add constraint business_centers_kind_check check (kind in ('bc', 'tc', 'cw'));

insert into public.business_centers (slug, name, address, alt_names, kind, status, is_hidden, sort_order)
values
  ('campus-coworking', 'Коворкинг Campus', 'г. Минск, ул. Якуба Коласа, 73/3', array['Campus'], 'cw', 'built', true, 1),
  ('hub-1', 'Коворкинг HUB#1', 'г. Минск, ул. Пинская, 28/1', array['HUB#1','HUB 1'], 'cw', 'built', true, 2),
  ('rabotaem-gorizont', 'Коворкинг «Работаем! Горизонт»', 'г. Минск, ул. Куйбышева, 35/1', array['Работаем! К-35','Работаем Горизонт'], 'cw', 'built', true, 3),
  ('rabotaem-okean', 'Коворкинг «Работаем! Океан»', 'г. Минск, пр-т Дзержинского, 3б', array['Работаем! К-22','Работаем Океан'], 'cw', 'built', true, 4),
  ('kino-moskva-coworking', 'Коворкинг кинотеатра «Москва»', 'г. Минск, пр-т Победителей, 13', array['Москва коворкинг'], 'cw', 'built', true, 5),
  ('nbb-coworking', 'Коворкинг Национальной библиотеки', 'г. Минск, пр-т Независимости, 116', array['Национальная библиотека коворкинг'], 'cw', 'built', true, 6),
  ('kb-16', 'Коворкинг «КБ-16»', 'г. Минск, ул. Якуба Коласа, 16', array['КБ-16','коворкинг БНТУ'], 'cw', 'built', true, 7),
  ('igrow', 'Центр притяжения Igrow', 'г. Минск, ул. Шаранговича, 4', array['Igrow'], 'cw', 'built', true, 8),
  ('alfa-business-hub', 'Альфа-Бизнес Хаб', 'г. Минск, ул. Немига, 5', array['Альфа Бизнес-Хаб'], 'cw', 'built', true, 9),
  ('sber-business-hub', 'Бизнес-хаб Сбер Банка', 'г. Минск, пр-т Независимости, 32а/3', array['Сбер бизнес-хаб'], 'cw', 'built', true, 10),
  ('john-galt', 'Свободное пространство «Кто такой Джон Голт?»', 'г. Минск, ул. Шорная, 20', array['Джон Голт'], 'cw', 'built', true, 11)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
