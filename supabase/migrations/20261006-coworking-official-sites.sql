-- Коворкинги: условия с официальных сайтов (главный источник),
-- обзоры СМИ — только дополнение. Фото не трогаем.

-- Campus: campus.by, /pay, /rules, карточки тарифов.
update public.business_centers set
  website = 'https://campus.by/',
  district = 'Советский',
  floors = 6,
  is_24x7 = true,
  parking = 'Подземный и открытый паркинг',
  metro = '«Московская» ~2,2 км',
  nearest_metro_stations = $m$[
    {"name":"Московская","distanceMeters":2170,"line":"Московская линия","color":"#0064AF"},
    {"name":"Парк Челюскинцев","distanceMeters":2283,"line":"Московская линия","color":"#0064AF"},
    {"name":"Академия наук","distanceMeters":2402,"line":"Московская линия","color":"#0064AF"}
  ]$m$::jsonb,
  description = $d$Коворкинг в бизнес-центре класса A CAMPUS (ул. Я. Коласа, 73/3): более 40 мест в open space, 10 отдельных офисов, 2 переговорные, capsula и skype-комнаты, кухня, игровая, круглосуточный доступ по СКУД.$d$,
  rental_info = jsonb_build_object(
    'caveat', 'Тарифы — страница оплаты campus.by/pay. CityDog.io (22.06.2026) не указывает дневной закреплённый (70 руб.) и месячное свободное место (465 руб.).',
    'rates', E'Демодень — бесплатно.\nДень, свободное место — 60 руб. (capsula/skype 2 ч/день).\nДень, закреплённое место — 70 руб.\nНеделя (7 календарных дней, без закрепления) — 165 руб.\n8 дней в месяц — 280 руб.\nСвободное место на месяц — 465 руб.\nФиксированное место на месяц — 650 руб. (переговорки и skype 30 ч/мес).\nОфис без окна — 660 руб. за рабочее место/мес (юр. адрес, переговоры, коммуналка).\nЮридический адрес — 72 руб./мес.\nКонференц-зал «Skype» 176 м² (100–120 чел.) — 84 и 120 руб./час, минимум 2 часа.\nОплата картой или ЕРИП.',
    'terms', E'Круглосуточно, без выходных. Вход по СКУД (приложение или карта). Гости — только 08:00–20:00, до 1 часа, не больше двух в день; дальше — дневной абонемент.\nТихая и шумная зоны. В дневной тариф входят кухня (кофе/чай/печенье/фрукты), локер, интернет, охрана, уборка, ресепшен, игровая (PlayStation, настольный футбол), принтер.',
    'parking', 'Свой паркинг: подземный и открытый.',
    'contacts', '+375 29 117-22-22, office@campus.by. ООО «ДС-Базис», УНП 192728694. campus.by'
  ),
  building_facts = $f$[
    {"label":"Площадь объекта","value":"6 619 м²","source":"CAMPUS","sourceUrl":"https://campus.by/","note":"формулировка сайта — «пространства», не отдельно коворкинг"},
    {"label":"Этажи","value":"6","source":"CAMPUS","sourceUrl":"https://campus.by/","note":"3 лифта"},
    {"label":"Open space","value":"40+ мест","source":"CAMPUS","sourceUrl":"https://campus.by/","note":null},
    {"label":"Офисы в коворкинге","value":"10 отдельных","source":"CAMPUS","sourceUrl":"https://campus.by/","note":null},
    {"label":"Переговорные","value":"2 комнаты","source":"CAMPUS","sourceUrl":"https://campus.by/","note":"бронь на сайте, у администратора или в Telegram"},
    {"label":"Часы","value":"круглосуточно","source":"CAMPUS","sourceUrl":"https://campus.by/","note":"карта СКУД 24/7; гости 08:00–20:00"},
    {"label":"Потолки БЦ","value":"4,1–4,9 м","source":"CAMPUS","sourceUrl":"https://campus.by/","note":"чиллер, вентустановка 70 м³ на человека"},
    {"label":"Юр. адрес","value":"72 руб./мес","source":"CAMPUS","sourceUrl":"https://campus.by/tproduct/479929857-531124824731-yuridicheskii-adres-ili-virtualnii-ofis","note":"почта, скан на email/Telegram"}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"}
  ]$m$::jsonb
where slug = 'campus-coworking' and kind = 'cw';

-- HUB#1: coworking.by (официальные тарифы), hub1.by — витрина.
update public.business_centers set
  website = 'https://coworking.by/',
  district = 'Фрунзенский',
  is_24x7 = true,
  parking = 'Закрытая парковка; крытая велопарковка',
  metro = '«Молодёжная», ~470 м',
  nearest_metro_stations = $m$[
    {"name":"Молодёжная","distanceMeters":468,"line":"Автозаводская линия","color":"#E90101"},
    {"name":"Пушкинская","distanceMeters":1433,"line":"Автозаводская линия","color":"#E90101"},
    {"name":"Фрунзенская","distanceMeters":1612,"line":"Автозаводская линия","color":"#E90101"}
  ]$m$::jsonb,
  description = $d$Коворкинг HUB#1 на 1-м этаже лофт-БЦ (ул. Пинская, 28/1): фиксированные места в трёх open space, 5 переговорных, 4 звукоизоляционные капсулы, кухня, закрытая парковка, круглосуточный доступ по магнитному ключу.$d$,
  rental_info = jsonb_build_object(
    'caveat', 'На Яндекс.Картах часы пн–пт 09:00–18:00 с перерывом — это часы администратора, не работы коворкинга. Почасовой аренды места нет, минимум сутки.',
    'rates', E'Сутки — 40 руб. с НДС.\nМесяц Open Space #1 и #3 — 465 руб. без юр. адреса, 525 руб. с юр. адресом.\nМесяц Open Space #2 — 520 / 580 руб.\nВ месячный абонемент: закреплённое место, 1 гостевой визит на сутки, 4 часа переговорных.\nЮр. адрес отдельно — +60 руб./мес.\nПереговорные вне пакета: 30 руб./час (3–5 чел.), 40 руб./час (10–12 чел.), каминная до 12 чел. — 60 руб./час.\nСкидки от 6 месяцев или 6 человек — по запросу.',
    'terms', E'Круглосуточно, доступ магнитным ключом. Администратор — будни 09:00–18:00; новый визит без ключа нужно согласовать заранее (Viber/Telegram).\nБронь open space — не более чем за сутки, считается подтверждённой после ответа администратора.\nВ сутки: локер, ч/б печать и сканер, чай/кофе/печенье, закрытая парковка. В месяце дополнительно цветная печать и переговорные.',
    'parking', 'Закрытая автопарковка и крытая велопарковка.',
    'contacts', '+375 29 107-66-11 (Viber, Telegram), info@coworking.by. coworking.by, hub1.by'
  ),
  building_facts = $f$[
    {"label":"Этажность локации","value":"1-й этаж, БЦ в стиле лофт","source":"HUB#1","sourceUrl":"https://coworking.by/","note":null},
    {"label":"Open space","value":"три зала, места фиксированные","source":"HUB#1","sourceUrl":"https://coworking.by/","note":"CityDog.io: 318 рабочих мест"},
    {"label":"Переговорные","value":"5 комнат (3/3/5/10/до 12 чел.)","source":"HUB#1","sourceUrl":"https://coworking.by/arenda/","note":"плюс 4 звукоизоляционные капсулы"},
    {"label":"Часы","value":"круглосуточно","source":"HUB#1","sourceUrl":"https://coworking.by/","note":"администратор пн–пт 09:00–18:00"},
    {"label":"Потолки","value":"6 м, окна 4 м","source":"HUB#1","sourceUrl":"https://coworking.by/","note":null}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"}
  ]$m$::jsonb
where slug = 'hub-1' and kind = 'cw';

-- «Работаем! Горизонт»: работаем.бел/horizont.
update public.business_centers set
  website = 'https://работаем.бел/horizont',
  district = 'Первомайский',
  is_24x7 = null,
  metro = '«Площадь Победы», ~860 м',
  nearest_metro_stations = $m$[
    {"name":"Площадь Победы","distanceMeters":859,"line":"Московская линия","color":"#0064AF"},
    {"name":"Площадь Якуба Коласа","distanceMeters":1273,"line":"Московская линия","color":"#0064AF"},
    {"name":"Немига","distanceMeters":1598,"line":"Автозаводская линия","color":"#E90101"}
  ]$m$::jsonb,
  description = $d$Коворкинг «Работаем! Горизонт» в здании бывшего завода «Горизонт» (ул. Куйбышева, 35/1, 3-й этаж): лофт, lounge и open space, скайп-румы и переговорные. Вторая локация сети — «Океан».$d$,
  rental_info = jsonb_build_object(
    'caveat', 'На сайте нет явного графика. CityDog.io (22.06.2026) пишет «круглосуточно»; на Яндекс.Картах — ежедневно 09:00–20:00. 24/7 не записываем, пока этого нет на работаем.бел.',
    'rates', E'Lounge (незакреплённое): день — 50 руб. +1 ч скайп-рум; 8 посещений — 300 руб. +8 ч; безлимит — 450 руб. +20 ч скайп-рум.\nOpen space (закреплённое): день — 50 руб. +1 ч; безлимит — 550 руб. +20 ч скайп-рум и 4 ч переговорной/мес.\nClub (оба коворкинга, незакреплённое) — 600 руб. +22 ч скайп-рум и 5 ч переговорной.\nЗакреплённое 1/2/6 мес. — 1067 / 1584 / 3069 руб.\nПереговорные: 45 руб./ч, от 8 ч — 35 руб./ч; пакеты 10/20/30 ч — 350/660/930 руб.\nСкайп-рум: 20 руб./ч; пакеты 25/50 ч — 300/500 руб.',
    'terms', E'3-й этаж, ул. Куйбышева, 35/1. Есть lounge, open space, мини-офисы, скайп-румы, переговорные, кухня. CityDog.io: пространство dog-friendly, можно заказать завтрак и обед.',
    'parking', null,
    'contacts', '+375 44 753-38-03, coworkingrabotaem@gmail.com. работаем.бел/horizont'
  ),
  building_facts = $f$[
    {"label":"Этаж","value":"3-й этаж, здание бывшего завода «Горизонт»","source":"Работаем!","sourceUrl":"https://работаем.бел/horizont","note":"этаж — CityDog.io, 22.06.2026"},
    {"label":"Стиль","value":"лофт","source":"Работаем!","sourceUrl":"https://работаем.бел/horizont","note":null},
    {"label":"День","value":"50 руб. +1 ч скайп-рум","source":"Работаем!","sourceUrl":"https://работаем.бел/horizont","note":null},
    {"label":"Безлимит lounge","value":"450 руб./мес.","source":"Работаем!","sourceUrl":"https://работаем.бел/horizont","note":"+20 ч скайп-рум"}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"}
  ]$m$::jsonb
where slug = 'rabotaem-gorizont' and kind = 'cw';

-- «Работаем! Океан»: работаем.бел/ocean.
update public.business_centers set
  website = 'https://работаем.бел/ocean',
  district = 'Московский',
  is_24x7 = null,
  metro = '«Площадь Франтишка Богушевича», ~890 м',
  nearest_metro_stations = $m$[
    {"name":"Площадь Франтишка Богушевича","distanceMeters":886,"line":"Зеленолужская линия","color":"#3EA332"},
    {"name":"Грушевка","distanceMeters":985,"line":"Московская линия","color":"#0064AF"},
    {"name":"Институт культуры","distanceMeters":1622,"line":"Московская линия","color":"#0064AF"}
  ]$m$::jsonb,
  description = $d$Коворкинг «Работаем! Океан» на 4-м этаже БЦ «Океан» (пр-т Дзержинского, 3Б): open space, мини-офисы, скайп-румы и переговорные. Сеть с локацией «Горизонт».$d$,
  rental_info = jsonb_build_object(
    'caveat', 'Графика на сайте нет. CityDog.io — круглосуточно; Яндекс.Карты — ежедневно 09:00–20:00. 24/7 не записываем без страницы на работаем.бел.',
    'rates', E'Незакреплённое: день — 50 руб. +1 ч скайп-рум; 8 посещений — 300 руб. +8 ч; безлимит — 550 руб. +20 ч.\nЗакреплённое безлимит — 660 руб. +20 ч скайп-рум и 4 ч переговорной/мес.\nClub (оба коворкинга) — 600 руб.\nЗакреплённое 1/2/6 мес. — 1280 / 1900 / 3680 руб.\nПереговорные: 55 руб./ч, от 8 ч — 40 руб./ч; пакеты 10/20/30 ч — 400/750/1050 руб.\nОтдельный зал — от 70 руб./ч.',
    'terms', E'4-й этаж, пр-т Дзержинского, 3Б. Open space, мини-офисы, переговорные, скайп-румы, лаунж. CityDog.io: безлимитный кофе и печенье.',
    'parking', null,
    'contacts', '+375 44 783-68-69, coworkingrabotaem@gmail.com. работаем.бел/ocean'
  ),
  building_facts = $f$[
    {"label":"Этаж","value":"4-й этаж БЦ «Океан»","source":"Работаем!","sourceUrl":"https://работаем.бел/ocean","note":"этаж — CityDog.io, 22.06.2026"},
    {"label":"День","value":"50 руб. +1 ч скайп-рум","source":"Работаем!","sourceUrl":"https://работаем.бел/ocean","note":null},
    {"label":"Безлимит незакреплённое","value":"550 руб./мес.","source":"Работаем!","sourceUrl":"https://работаем.бел/ocean","note":null},
    {"label":"Безлимит закреплённое","value":"660 руб./мес.","source":"Работаем!","sourceUrl":"https://работаем.бел/ocean","note":"+4 ч переговорной"}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"}
  ]$m$::jsonb
where slug = 'rabotaem-okean' and kind = 'cw';

-- Кинотеатр «Москва»: kinominska.by + CityDog про бесплатный коворкинг.
update public.business_centers set
  website = 'https://kinominska.by/objects/17',
  district = 'Центральный',
  is_24x7 = false,
  metro = '«Немига», ~620 м',
  nearest_metro_stations = $m$[
    {"name":"Немига","distanceMeters":622,"line":"Автозаводская линия","color":"#E90101"},
    {"name":"Юбилейная площадь","distanceMeters":877,"line":"Зеленолужская линия","color":"#3EA332"},
    {"name":"Фрунзенская","distanceMeters":956,"line":"Автозаводская линия","color":"#E90101"}
  ]$m$::jsonb,
  description = $d$Бесплатный коворкинг на 2-м этаже кинотеатра «Москва» после реконструкции 7 мая 2025 года. На сайте сети — «коворкинг-пространство для встреч и общения»; отдельной карточки коворкинга на картах нет.$d$,
  rental_info = jsonb_build_object(
    'caveat', 'Отдельной карточки коворкинга на картах нет — рейтинг кинотеатра к коворкингу не относится. Часы коворкинга на kinominska.by не выделены: кассы кинотеатра 10:00–22:00.',
    'rates', 'Бесплатно (CityDog.io, 22.06.2026). На сайте кинотеатра цены на коворкинг не указаны.',
    'terms', E'2-й этаж, пр-т Победителей, 13. CityDog.io: ежедневно 10:00–22:00, столики, кресла, розетки, кофейня, вид на Дворец спорта.\nКассы кинотеатра: 10:00–22:00 (kinominska.by).',
    'parking', null,
    'contacts', '+375 17 369-04-68. kinominska.by/objects/17'
  ),
  building_facts = $f$[
    {"label":"Открытие после реконструкции","value":"7 мая 2025","source":"КиноМинска","sourceUrl":"https://kinominska.by/objects/17","note":"на сайте — кинобар и коворкинг-пространство"},
    {"label":"Этаж коворкинга","value":"2-й этаж","source":"CityDog.io","sourceUrl":"https://citydog.io/post/kovorkingi-minska/","note":"обновлено 22.06.2026"},
    {"label":"Стоимость","value":"бесплатно","source":"CityDog.io","sourceUrl":"https://citydog.io/post/kovorkingi-minska/","note":"на kinominska.by цены коворкинга нет"},
    {"label":"Кассы кинотеатра","value":"ежедневно 10:00–22:00","source":"КиноМинска","sourceUrl":"https://kinominska.by/objects/17","note":null}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"},
    {"url":"https://realt.onliner.by/2025/05/07/v-minske-posle-rekonstrukcii-otkryvaetsya-kinoteatr-moskva-popast-na-pervyj-kinoseans","date":"2025-05-07","title":"В Минске после реконструкции открылся кинотеатр «Москва»","outlet":"Onliner"}
  ]$m$::jsonb
where slug = 'kino-moskva-coworking' and kind = 'cw';

-- НББ: официальный nlb.by уже записан — добавляем район и метро.
update public.business_centers set
  district = 'Первомайский',
  is_24x7 = false,
  metro = '«Восток», ~400 м',
  nearest_metro_stations = $m$[
    {"name":"Восток","distanceMeters":405,"line":"Московская линия","color":"#0064AF"},
    {"name":"Московская","distanceMeters":1214,"line":"Московская линия","color":"#0064AF"},
    {"name":"Борисовский Тракт","distanceMeters":1740,"line":"Московская линия","color":"#0064AF"}
  ]$m$::jsonb
where slug = 'nbb-coworking' and kind = 'cw';

-- КБ-16: прейскурант и новость библиотеки БНТУ.
update public.business_centers set
  website = 'https://library.bntu.by/news/kovorking-kb-16-prostranstvo-dlja-obshhenija-uchjoby-i-otdyha/',
  district = 'Советский',
  is_24x7 = false,
  metro = '«Площадь Якуба Коласа», ~790 м',
  nearest_metro_stations = $m$[
    {"name":"Площадь Якуба Коласа","distanceMeters":791,"line":"Московская линия","color":"#0064AF"},
    {"name":"Академия наук","distanceMeters":822,"line":"Московская линия","color":"#0064AF"},
    {"name":"Площадь Победы","distanceMeters":1703,"line":"Московская линия","color":"#0064AF"}
  ]$m$::jsonb,
  description = $d$Коворкинг «КБ-16» научной библиотеки БНТУ (ул. Я. Коласа, 16, 2-й этаж, каб. 203): зона А до 45 человек, зона B до 53, зона C до 12. Студенты и сотрудники БНТУ — по читательскому билету, остальные — по абонементу.$d$,
  rental_info = jsonb_build_object(
    'caveat', 'В новости библиотеки от 27.11.2024 абонемент 2,22 / 18,89 руб. и зал 27 руб./час — это старые цифры. Берём действующий прейскурант. CityDog.io путает летний график читальных залов с коворкингом.',
    'rates', E'Студенты и сотрудники БНТУ — бесплатно при читательском билете.\nСторонние (прейскурант library.bntu.by): читательский билет — 4,00 руб.; абонемент на месяц — 3,10 руб.; на год — 21,60 руб.; разовое посещение — 1,05 руб.\nМероприятие — 34,20 руб./час.\nПечать от 0,23 руб., копия от 0,20 руб. (новость 27.11.2024).',
    'terms', E'Пн–пт 09:00–20:00, сб 09:00–16:45, вс выходной.\nЗона B — без записи. Зоны A и C — по брони; без мероприятия работают как индивидуальные.\nНужны читательский билет и абонемент (для сторонних).',
    'parking', null,
    'contacts', '+375 17 290-45-78, kb16@bntu.by. Каб. 203, 2-й этаж. library.bntu.by'
  ),
  building_facts = $f$[
    {"label":"Адрес","value":"ул. Я. Коласа, 16, 2-й этаж, каб. 203","source":"Научная библиотека БНТУ","sourceUrl":"https://library.bntu.by/news/kovorking-kb-16-prostranstvo-dlja-obshhenija-uchjoby-i-otdyha/","note":null},
    {"label":"Зона А","value":"до 45 человек, лекции и презентации","source":"Научная библиотека БНТУ","sourceUrl":"https://library.bntu.by/news/kovorking-kb-16-prostranstvo-dlja-obshhenija-uchjoby-i-otdyha/","note":"по брони"},
    {"label":"Зона B","value":"до 53 человек, индивидуальная работа","source":"Научная библиотека БНТУ","sourceUrl":"https://library.bntu.by/news/kovorking-kb-16-prostranstvo-dlja-obshhenija-uchjoby-i-otdyha/","note":"без записи"},
    {"label":"Зона C","value":"до 12 человек, совместная работа","source":"Научная библиотека БНТУ","sourceUrl":"https://library.bntu.by/news/kovorking-kb-16-prostranstvo-dlja-obshhenija-uchjoby-i-otdyha/","note":"по брони"},
    {"label":"Часы","value":"пн–пт 09:00–20:00, сб 09:00–16:45","source":"Научная библиотека БНТУ","sourceUrl":"https://library.bntu.by/news/kovorking-kb-16-prostranstvo-dlja-obshhenija-uchjoby-i-otdyha/","note":"воскресенье выходной"},
    {"label":"Абонемент сторонних","value":"3,10 руб./мес., 21,60 руб./год, разово 1,05 руб.","source":"Научная библиотека БНТУ","sourceUrl":"https://library.bntu.by/stoimost-platnyh-uslug/drugie/","note":"прейскурант; билет 4,00 руб."}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"}
  ]$m$::jsonb
where slug = 'kb-16' and kind = 'cw';

-- Igrow: страница банка, не витрина igrow.by.
update public.business_centers set
  website = 'https://belapb.by/malomu-i-srednemu-biznesu/ekosistema-belagroprombanka/kovorking-centry-prityazheniya/',
  district = 'Фрунзенский',
  is_24x7 = false,
  metro = '«Кунцевщина», ~1,9 км',
  nearest_metro_stations = $m$[
    {"name":"Кунцевщина","distanceMeters":1862,"line":"Автозаводская линия","color":"#E90101"},
    {"name":"Каменная Горка","distanceMeters":2710,"line":"Автозаводская линия","color":"#E90101"},
    {"name":"Спортивная","distanceMeters":2745,"line":"Автозаводская линия","color":"#E90101"}
  ]$m$::jsonb,
  description = $d$Центр притяжения «Стартап-хаб Igrow» Белагропромбанка (ул. Шаранговича, 4): зоны коллективной и индивидуальной работы, переговорная и зона отдыха. Услуги бесплатные, вход по регистрации с паспортом.$d$,
  rental_info = jsonb_build_object(
    'caveat', 'На Яндекс.Картах «ежедневно 09:00–18:00»; у банка — пн–пт 09:00–18:00, сб–вс выходной. Берём график банка.',
    'rates', 'Бесплатно. Клиенты банка имеют приоритет при бронировании; банк может отказать без объяснения причин (правила ЦП).',
    'terms', E'Пн–пт 09:00–18:00, сб–вс выходной. Вместимость более 50 человек.\nЗоны: A коллективная, B индивидуальная, C переговорная, D отдых. A и C — только по брони (сайт банка или телефон); B и D — при свободных местах.\nРегистрация: анкета и паспорт.',
    'parking', null,
    'contacts', '+375 17 359-11-96, +375 17 359-11-97, +375 29 681-99-82. belapb.by, igrow.by'
  ),
  building_facts = $f$[
    {"label":"Часы","value":"пн–пт 09:00–18:00, сб–вс выходной","source":"Белагропромбанк","sourceUrl":"https://belapb.by/by/malomu-i-srednemu-biznesu/ekasistema-belagraprambanka/kovorking-centry-prityazheniya/minsk-kovorking-startap-khab/","note":null},
    {"label":"Вместимость","value":"более 50 человек","source":"Белагропромбанк","sourceUrl":"https://belapb.by/by/malomu-i-srednemu-biznesu/ekasistema-belagraprambanka/kovorking-centry-prityazheniya/minsk-kovorking-startap-khab/","note":null},
    {"label":"Стоимость","value":"бесплатно","source":"Белагропромбанк","sourceUrl":"https://www.belapb.by/about/press-tsentr/novosti/tsentry-prityazheniya-igrow-belagroprombanka-vsegda-otkryty-dlya-vashikh-meropriyatiy/","note":"нужна регистрация"},
    {"label":"Зоны","value":"коллективная, индивидуальная, переговорная, отдых","source":"Белагропромбанк","sourceUrl":"https://www.belapb.by/upload/sprint.editor/8f9/8f992964a918e9adeaa206961b1ea0df.pdf","note":"A и C по брони"}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"}
  ]$m$::jsonb
where slug = 'igrow' and kind = 'cw';

-- Альфа-Бизнес Хаб: hub.client-club.by.
update public.business_centers set
  website = 'https://hub.client-club.by/',
  district = 'Центральный',
  is_24x7 = false,
  metro = '«Немига», ~370 м',
  nearest_metro_stations = $m$[
    {"name":"Немига","distanceMeters":374,"line":"Автозаводская линия","color":"#E90101"},
    {"name":"Фрунзенская","distanceMeters":797,"line":"Автозаводская линия","color":"#E90101"},
    {"name":"Юбилейная площадь","distanceMeters":824,"line":"Зеленолужская линия","color":"#3EA332"}
  ]$m$::jsonb,
  description = $d$Альфа-Бизнес Хаб в ТЦ «Метрополь» (ул. Немига, 5): open space до 3 часов в день, 8 переговорных до 4 часов в месяц на компанию, учебный класс и конференц-зал. Бронь онлайн на hub.client-club.by.$d$,
  rental_info = jsonb_build_object(
    'caveat', 'На сайте хаба нет цен и явного «только для клиентов банка». CityDog.io (22.06.2026): бесплатно для бизнес-клиентов Альфа-Банка. Часы на сайте не опубликованы: CityDog — пн–пт 09:00–21:00, сб 09:00–17:00; Яндекс ещё указывает вс 09:00–21:00.',
    'rates', 'На hub.client-club.by стоимости нет. CityDog.io: бесплатно для бизнес-клиентов Альфа-Банка.',
    'terms', E'Open space — до 3 часов в день по брони.\nПереговорные — до 4 часов в календарный месяц на компанию (8 комнат: 1 чел. капсула, 4–10 чел., учебный класс 18+, конференц-зал 40+).\nWi-Fi, розетки, ТВ/проектор в части комнат, печать, кофе.\nБронь на hub.client-club.by.',
    'parking', null,
    'contacts', '+375 29 666-90-95. ТЦ «Метрополь», ул. Немига, 5. hub.client-club.by'
  ),
  building_facts = $f$[
    {"label":"Адрес","value":"ТЦ «Метрополь», ул. Немига, 5","source":"Альфа-Бизнес Хаб","sourceUrl":"https://hub.client-club.by/","note":null},
    {"label":"Open space","value":"до 3 часов в день","source":"Альфа-Бизнес Хаб","sourceUrl":"https://hub.client-club.by/","note":"по брони"},
    {"label":"Переговорные","value":"8 комнат, до 4 ч/мес. на компанию","source":"Альфа-Бизнес Хаб","sourceUrl":"https://hub.client-club.by/","note":"плюс капсула, класс 18+, зал 40+"},
    {"label":"Часы (СМИ)","value":"пн–пт 09:00–21:00, сб 09:00–17:00","source":"CityDog.io","sourceUrl":"https://citydog.io/post/kovorkingi-minska/","note":"на сайте хаба графика нет"}
  ]$f$::jsonb,
  media_mentions = $m$[
    {"url":"https://citydog.io/post/kovorkingi-minska/","date":"2026-06-22","title":"Где поработать в Минске, если нет офиса: вот 10 коворкингов","outlet":"CityDog.io"}
  ]$m$::jsonb
where slug = 'alfa-business-hub' and kind = 'cw';

-- Сбер: отдельной страницы хаба нет, оставляем СМИ, добавляем район/метро.
update public.business_centers set
  website = 'https://www.sber-bank.by/',
  district = 'Центральный',
  is_24x7 = false,
  metro = '«Октябрьская», ~560 м',
  nearest_metro_stations = $m$[
    {"name":"Октябрьская","distanceMeters":558,"line":"Московская линия","color":"#0064AF"},
    {"name":"Площадь Победы","distanceMeters":597,"line":"Московская линия","color":"#0064AF"},
    {"name":"Купаловская","distanceMeters":773,"line":"Автозаводская линия","color":"#E90101"}
  ]$m$::jsonb,
  rental_info = jsonb_build_object(
    'caveat', 'Отдельной страницы хаба и карточки коворкинга на картах нет. Тарифы и часы — из Onliner и CityDog.io, не с sber-bank.by.',
    'rates', 'Бесплатно для бизнес-клиентов Сбер Банка (CityDog.io, 22.06.2026; Onliner — для представителей МСБ).',
    'terms', 'Пн–чт 09:00–17:30, пт 09:00–16:15 (Onliner, 13.02.2025). Коворкинг, переговорные, зоны отдыха, техника, консультации банка.',
    'parking', 'Бесплатная парковка для посетителей (Onliner).',
    'contacts', 'пр-т Независимости, 32А/3. sber-bank.by'
  )
where slug = 'sber-business-hub' and kind = 'cw';

-- «Джон Голт»: живого сайта с тарифами нет.
update public.business_centers set
  website = null,
  district = 'Центральный',
  is_24x7 = false,
  metro = '«Юбилейная площадь», ~520 м',
  nearest_metro_stations = $m$[
    {"name":"Юбилейная площадь","distanceMeters":521,"line":"Зеленолужская линия","color":"#3EA332"},
    {"name":"Фрунзенская","distanceMeters":532,"line":"Автозаводская линия","color":"#E90101"},
    {"name":"Немига","distanceMeters":715,"line":"Автозаводская линия","color":"#E90101"}
  ]$m$::jsonb,
  description = $d$Свободное пространство «Кто такой Джон Голт?». В нашем списке — ул. Шорная, 20; карточка Яндекса, которую открыли при сборе, — ул. Романовская Слобода, 3. Актуальные тарифы на сайте не опубликованы, в подборке CityDog.io от 22.06.2026 объекта нет.$d$,
  rental_info = jsonb_build_object(
    'caveat', 'Официального прайса нет (wordpress-витрина 2017 года без цен). Цифры из каталогов вроде «10 руб. первый час» не берём — источник не официальный и не свежий. Адрес на Яндексе не совпадает со списком.',
    'rates', null,
    'terms', 'Телефон с карточки Яндекса: +375 44 721-00-40. Часов на карточке нет.',
    'parking', null,
    'contacts', '+375 44 721-00-40'
  ),
  building_facts = $f$[
    {"label":"Адрес в списке","value":"ул. Шорная, 20","source":"список каталога","sourceUrl":"","note":null},
    {"label":"Адрес карточки Яндекса","value":"ул. Романовская Слобода, 3","source":"Яндекс.Карты","sourceUrl":"","note":"карточка, которую открыли при сборе отзывов"}
  ]$f$::jsonb,
  media_mentions = '[]'::jsonb
where slug = 'john-galt' and kind = 'cw';
