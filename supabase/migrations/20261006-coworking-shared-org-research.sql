-- Три коворкинга без своей карточки Яндекса: факты и один отзыв 2ГИС
-- (кинотеатр «Москва»). Живую базу применяем через Management API;
-- файл — зеркало. Отзывы кино/библиотеки/банка не возвращаем.

insert into public.business_center_review_snapshots
  (business_center_slug, source, author, rating, body, likes, dislikes, published_at, captured_at)
select
  'kino-moskva-coworking',
  '2gis',
  'Beluga Belugsvich',
  null,
  'Там крутые пуфики, классно сидеть с друзьями, работать. Короче говоря шикарное место.',
  0,
  0,
  null,
  '2026-10-06 15:00:00+00'
where not exists (
  select 1 from public.business_center_review_snapshots
  where business_center_slug = 'kino-moskva-coworking'
    and source = '2gis'
    and author = 'Beluga Belugsvich'
);

-- Карточка «Москва»: рейтинг только по отзывам про коворкинг (Яндекс 1 + 2ГИС без оценки).
update public.business_center_yandex_cards c
set
  review_count = s.n,
  rating_count = s.rated,
  rating = s.avg
from (
  select
    count(*)::int as n,
    count(rating)::int as rated,
    round(avg(rating), 1) as avg
  from public.business_center_review_snapshots
  where business_center_slug = 'kino-moskva-coworking'
) s
where c.business_center_slug = 'kino-moskva-coworking';

update public.business_centers set
  website = 'https://kinominska.by/objects/17',
  is_24x7 = false,
  description = $d$Бесплатный коворкинг на 2-м этаже кинотеатра «Москва» после реконструкции 2025 года: столики, кресла, розетки, кофейня и вид на Дворец спорта. Отдельной карточки коворкинга на Яндекс.Картах нет.$d$,
  rental_info = jsonb_build_object(
    'caveat', 'Отдельной карточки коворкинга на картах нет — рейтинг кинотеатра к коворкингу не относится.',
    'rates', 'Бесплатно.',
    'terms', 'Ежедневно 10:00–22:00, 2-й этаж. Столики, кресла, розетки, кофейня.',
    'parking', null,
    'contacts', 'Кинотеатр «Москва»: +375 17 203-27-10. Сайт kinominska.by/objects/17'
  ),
  building_facts = $f$[
    {"label":"Этаж","value":"2-й этаж кинотеатра","source":"CityDog.io","sourceUrl":"https://citydog.io/post/kovorkingi-minska/","note":"обновлено 22.06.2026"},
    {"label":"Часы","value":"ежедневно 10:00–22:00","source":"CityDog.io","sourceUrl":"https://citydog.io/post/kovorkingi-minska/","note":null},
    {"label":"Стоимость","value":"бесплатно","source":"CityDog.io","sourceUrl":"https://citydog.io/post/kovorkingi-minska/","note":null},
    {"label":"Открытие после реконструкции","value":"7 мая 2025","source":"Onliner","sourceUrl":"https://realt.onliner.by/2025/05/07/v-minske-posle-rekonstrukcii-otkryvaetsya-kinoteatr-moskva-popast-na-pervyj-kinoseans","note":"кофейня и коворкинг-пространство в обновлённом здании"}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"},
    {"url":"https://realt.onliner.by/2025/05/07/v-minske-posle-rekonstrukcii-otkryvaetsya-kinoteatr-moskva-popast-na-pervyj-kinoseans","date":"2025-05-07","title":"В Минске после реконструкции открылся кинотеатр «Москва»","outlet":"Onliner"}
  ]$m$::jsonb
where slug = 'kino-moskva-coworking' and kind = 'cw';

update public.business_centers set
  website = 'https://www.nlb.by/content/uslugi/dopolnitelnye-uslugi/coworking/',
  is_24x7 = false,
  description = $d$Коворкинг Национальной библиотеки — три зала для групповых образовательных и культурных мероприятий (15, 20 и 22 места), бесплатно для читателей. Для работы с ноутбуком в читальных залах достаточно читательского билета. Отдельной карточки коворкинга на Яндекс.Картах нет.$d$,
  rental_info = jsonb_build_object(
    'caveat', 'Отдельной карточки коворкинга на картах нет. Залы коворкинга — для групповых некоммерческих мероприятий, не open space на каждый день.',
    'rates', 'Залы коворкинга — бесплатно (нужен читательский билет). Билет по данным CityDog.io на 22.06.2026 — 5,04 руб.',
    'terms', E'Залы: 15, 20 и 22 места, не более 4 часов в день, от 2 человек, некоммерческие образовательные и культурные мероприятия.\nЧасы библиотеки: пн–пт 10:00–20:00, сб–вс 10:00–18:00 (летний: сб 10:00–18:00, вс выходной — как указано у CityDog.io).',
    'parking', null,
    'contacts', 'Коворкинг: +375 17 293-28-55, +375 17 293-29-04. Библиотека: +375 17 368-37-37. nlb.by'
  ),
  building_facts = $f$[
    {"label":"Залы","value":"три зала на 15, 20 и 22 места","source":"Национальная библиотека Беларуси","sourceUrl":"https://www.nlb.by/content/uslugi/dopolnitelnye-uslugi/coworking/","note":"групповые мероприятия от 2 человек"},
    {"label":"Зал «Атриум»","value":"20 мест, 51,8 м², 1-й этаж, wi-fi, компьютер, ТВ, флипчарт","source":"Национальная библиотека Беларуси","sourceUrl":"https://www.nlb.by/content/uslugi/dopolnitelnye-uslugi/coworking/atrium/","note":"без звукоизоляции"},
    {"label":"Часы","value":"пн–пт 10:00–20:00, сб–вс 10:00–18:00","source":"CityDog.io","sourceUrl":"https://citydog.io/post/kovorkingi-minska/","note":"как у библиотеки; летний график — сб 10:00–18:00"},
    {"label":"Читательский билет","value":"5,04 руб.","source":"CityDog.io","sourceUrl":"https://citydog.io/post/kovorkingi-minska/","note":"на 22.06.2026"}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"},
    {"url":"https://www.nlb.by/content/uslugi/dopolnitelnye-uslugi/coworking/","date":null,"title":"Коворкинг Национальной библиотеки Беларуси","outlet":"nlb.by"}
  ]$m$::jsonb
where slug = 'nbb-coworking' and kind = 'cw';

update public.business_centers set
  is_24x7 = false,
  description = $d$Двухэтажный бизнес-хаб Сбер Банка: коворкинг, переговорные, зоны отдыха и консультации для малого и среднего бизнеса. Открыт в феврале 2025-го. Отдельной карточки коворкинга на Яндекс.Картах нет — там отделение «СберПервый».$d$,
  rental_info = jsonb_build_object(
    'caveat', 'Отдельной карточки коворкинга на картах нет — отзывы отделения банка к хабу не относятся.',
    'rates', 'Бесплатно для бизнес-клиентов Сбер Банка (CityDog.io, 22.06.2026).',
    'terms', 'Пн–чт 09:00–17:30, пт 09:00–16:15. Коворкинг, переговорные, зоны отдыха, техника.',
    'parking', 'Бесплатная парковка для посетителей.',
    'contacts', 'пр-т Независимости, 32А/3'
  ),
  building_facts = $f$[
    {"label":"Часы","value":"пн–чт 09:00–17:30, пт 09:00–16:15","source":"Onliner","sourceUrl":"https://money.onliner.by/2025/02/13/v-minske-otkrylsya-dvuxetazhnyj-biznes-xab-s-besplatnym-kovorkingom","note":null},
    {"label":"Стоимость","value":"бесплатно для бизнес-клиентов Сбер Банка","source":"CityDog.io","sourceUrl":"https://citydog.io/post/kovorkingi-minska/","note":"Onliner пишет, что поработать можно бесплатно представителям МСБ"},
    {"label":"Состав","value":"коворкинг, переговорные, зоны отдыха, эксперты банка","source":"Onliner","sourceUrl":"https://money.onliner.by/2025/02/13/v-minske-otkrylsya-dvuxetazhnyj-biznes-xab-s-besplatnym-kovorkingom","note":"открытие февраля 2025"},
    {"label":"Парковка","value":"бесплатная для посетителей","source":"Onliner","sourceUrl":"https://money.onliner.by/2025/02/13/v-minske-otkrylsya-dvuxetazhnyj-biznes-xab-s-besplatnym-kovorkingom","note":null}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"},
    {"url":"https://money.onliner.by/2025/02/13/v-minske-otkrylsya-dvuxetazhnyj-biznes-xab-s-besplatnym-kovorkingom","date":"2025-02-13","title":"В Минске открылся двухэтажный бизнес-хаб с бесплатным коворкингом","outlet":"Onliner"},
    {"url":"https://myfin.by/article/banki/v-centre-minska-poavilsa-dvukhetaznyj-biznes-khab-posmotreli-cto-vnutri-35821","date":"2025-02-25","title":"В центре Минска появился двухэтажный бизнес-хаб: посмотрели, что внутри","outlet":"Myfin"},
    {"url":"https://belretail.by/news/v-tsentre-minska-otkryilsya-dvuhetajnyiy-biznes-hab","date":null,"title":"В центре Минска открылся двухэтажный бизнес-хаб","outlet":"BelRetail"}
  ]$m$::jsonb
where slug = 'sber-business-hub' and kind = 'cw';

notify pgrst, 'reload schema';
