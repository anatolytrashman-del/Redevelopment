-- Добор ресерча тонких ТЦ (2026-10-05). is_hidden уже false, фото локальные.
-- green-time / korona-siti / kupalovskiy — ресерч уже полный, трогаем только
-- пробелы: globus-park, pole-chudes, lobanka-26, stepyanka, talisman-tc.
-- UPDATE сдвинет table_change_stamps.business_centers — прод-сборка
-- заново выгрузит trade-centers.json (на CDN сейчас 134 из 142).

-- 1) Глобус Парк — пустой retail_info; GLA с сайта, часы по справочникам 09–22
UPDATE public.business_centers SET
  total_area = 24247,
  year_built = COALESCE(year_built, 2015),
  website = 'https://globuspark.com/',
  building_facts = '[{"label":"GBA торгового центра","value":"31 934 м²","source":"Сайт комплекса","sourceUrl":"https://globuspark.com/about/"},{"label":"GLA торгового центра","value":"24 247 м²","source":"Сайт комплекса","sourceUrl":"https://globuspark.com/about/"},{"label":"Склады класса A","value":"22 000 м²","source":"Сайт комплекса","sourceUrl":"https://globuspark.com/about/"},{"label":"Парковка ТЦ","value":"1 500 машиномест","source":"Сайт комплекса","sourceUrl":"https://globuspark.com/about/"},{"label":"Год","value":"2015","source":"карточка каталога","sourceUrl":null}]'::jsonb,
  retail_info = COALESCE(retail_info, '{}'::jsonb) || jsonb_build_object(
    'hours', '[{"zone":"Торговый центр","value":"ежедневно 09:00–22:00","note":"по справочникам; отдельные операторы могут отличаться","source":"dir.by / dosug.by","sourceUrl":"https://dir.by/belarus/minskaya_oblast/globus_park/"}]'::jsonb,
    'parking', '{"date":"2026","items":[{"label":"Мест","value":"1 500"}],"source":"Сайт комплекса","summary":"Парковка торгового центра — 1 500 машиномест (официальный сайт).","sourceUrl":"https://globuspark.com/about/"}'::jsonb,
    'anchors', '[{"name":"OZ.by","category":"другое","floor":null,"area":null,"since":null,"text":"Пункт выдачи интернет-магазина OZ.by.","yandexUrl":null,"source":"Сайт комплекса","sourceUrl":"https://globuspark.com/category/arendatori/"},{"name":"MEGATOP","category":"fashion","floor":null,"area":null,"since":null,"text":"Сеть магазинов обуви.","yandexUrl":null,"source":"Сайт комплекса","sourceUrl":"https://globuspark.com/category/arendatori/"},{"name":"Мой","category":"дом и интерьер","floor":null,"area":null,"since":null,"text":"Магазин бытовой химии и товаров для дома (Cash and Carry).","yandexUrl":null,"source":"Сайт комплекса","sourceUrl":"https://globuspark.com/category/arendatori/"},{"name":"DOMO техника","category":"электроника","floor":null,"area":null,"since":null,"text":"Дистрибьютор бытовой техники / пункт выдачи.","yandexUrl":null,"source":"Сайт комплекса","sourceUrl":"https://globuspark.com/category/arendatori/"}]'::jsonb,
    'transport', '[{"mode":"car","text":"Агрогородок Щомыслица, около 3 км от МКАД по трассе Р1 (Минск — Брест).","source":"Сайт комплекса","sourceUrl":"https://globuspark.com/"}]'::jsonb,
    'factCards', '[{"headline":"Торгово-логистический комплекс","text":"Кроме галереи — склады класса A (22 тыс. м²), офисы и пункт таможенного декларирования."},{"headline":"GLA около 24 тыс. м²","text":"Официальные цифры: GBA 31 934 м², GLA 24 247 м², парковка на 1 500 мест."}]'::jsonb
  )
WHERE slug = 'globus-park' AND kind = 'tc';

-- 2) Поле чудес — часы и парковка уже верные (Yandex / Ждановичи);
--    не ставим устаревшие 400 м² (после переезда площадь больше).
--    Добираем якорь и микрорайон.
UPDATE public.business_centers SET
  microdistrict = COALESCE(NULLIF(microdistrict, ''), 'Победителей'),
  retail_info = COALESCE(retail_info, '{}'::jsonb) || jsonb_build_object(
    'anchors', '[{"name":"Блошиный рынок","category":"другое","floor":null,"area":null,"since":null,"text":"Единственный в Минске рынок подержанных товаров на территории ТГ «Ждановичи».","yandexUrl":"https://yandex.by/maps/org/pole_chudes/131608552826/","source":"ТГ «Ждановичи»; Megapolis","sourceUrl":"https://zhdanovichi.by/area/rynok-pole-chudes"}]'::jsonb
  )
WHERE slug = 'pole-chudes' AND kind = 'tc';

-- 3) Лобанка 26 — часы «Соседи»/«Точка», парковка, якорь «Соседи», factCards
UPDATE public.business_centers SET
  year_built = COALESCE(year_built, 2008),
  retail_info = COALESCE(retail_info, '{}'::jsonb) || jsonb_build_object(
    'hours', '[{"zone":"«Соседи Экспресс»","value":"ежедневно 07:00–23:00","note":null,"source":"Pakupnik / сеть «Соседи»","sourceUrl":"https://pakupnik.by/sosedi/shops/15517/"},{"zone":"«Точка»","value":"пн–чт 11:00–23:00, пт 11:00–00:00, сб–вс 10:00–00:00","note":null,"source":"tochca.by / каталоги","sourceUrl":"https://your.beer/place/tochka-lobanka/about"}]'::jsonb,
    'parking', '{"date":"2026","items":[{"label":"Режим","value":"круглосуточно"},{"label":"Тип","value":"у здания"}],"source":"Справочники","summary":"У адреса ул. Лобанка, 26 указана круглосуточная парковка.","sourceUrl":"https://minsk.jsprav.ru/avtostoyanki-parkingi/parkovka-413/"}'::jsonb,
    'anchors', '[{"name":"Соседи Экспресс","category":"гипермаркет","floor":"1","area":null,"since":null,"text":"Супермаркет сети «Соседи» — продуктовый якорь здания.","yandexUrl":null,"source":"2ГИС / Pakupnik","sourceUrl":"https://2gis.by/minsk/firm/70000001083500482"},{"name":"Зообазар","category":"другое","floor":"1","area":null,"since":null,"text":"Зоомагазин Zoobazar с ветеринарной аптекой.","yandexUrl":null,"source":"Отраслевой справочник","sourceUrl":"https://megapolis-real.by/torgovyie-czentryi/lobanka-26.html"},{"name":"Точка","category":"другое","floor":"1","area":null,"since":null,"text":"Магазин разливного пива сети «Точка».","yandexUrl":null,"source":"Яндекс / tochca.by","sourceUrl":"https://your.beer/place/tochka-lobanka/about"}]'::jsonb,
    'factCards', '[{"headline":"Якорь — «Соседи Экспресс»","text":"Супермаркет сети работает ежедневно с 7:00 до 23:00; рядом Zoobazar, «Точка», пекарня и кафе."},{"headline":"У метро «Каменная горка»","text":"Около 800 м пешком до станции."}]'::jsonb
  )
WHERE slug = 'lobanka-26' AND kind = 'tc';

-- 4) Степянка — парковка у Карвата 4/2 + factCards (площадь в справочниках спорная — не пишем)
UPDATE public.business_centers SET
  retail_info = COALESCE(retail_info, '{}'::jsonb) || jsonb_build_object(
    'parking', '{"date":"2026","items":[{"label":"Адрес стоянки","value":"ул. Карвата, 4/2"},{"label":"Режим","value":"круглосуточно"}],"source":"Справочники","summary":"Рядом с ТЦ указана автомобильная парковка по адресу Карвата, 4/2, круглосуточно.","sourceUrl":"https://minsk.jsprav.ru/avtostoyanki-parkingi/avtomobilnaia-parkovka-1237/"}'::jsonb,
    'factCards', '[{"headline":"Районный ТЦ 2004 года","text":"Построен в 2004-м в микрорайоне Степянка (Партизанский район)."},{"headline":"Якорь Fix Price","text":"Среди арендаторов — Fix Price, кафе Kebab Town, «Рыбка моя» и ателье."},{"headline":"Часы галереи","text":"По справочникам центр работает ежедневно 9:00–20:00; магазины могут закрываться позже."}]'::jsonb
  )
WHERE slug = 'stepyanka' AND kind = 'tc';

-- 5) Talisman — расширяем factCards (было одно)
UPDATE public.business_centers SET
  retail_info = jsonb_set(
    COALESCE(retail_info, '{}'::jsonb),
    '{factCards}',
    '[{"headline":"Супермаркет 658 м²","text":"На 1 этаже — помещение под супермаркет 658,6 м² (план talisman.by); якорь — «Евроопт Market»."},{"headline":"3 этажа + цоколь","text":"Цоколь — услуги и склады; 2–3 этажи — торговые и сервисные помещения группы TALISMAN."},{"headline":"Группа TALISMAN","text":"Второй объект группы — бизнес-центр на ул. Чапаева, 4А (2021)."}]'::jsonb
  )
WHERE slug = 'talisman-tc' AND kind = 'tc';

NOTIFY pgrst, 'reload schema';
