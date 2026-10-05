-- Открытие 4 скрытых ТЦ с обложками после ресерча (2026-10-05).
-- Радзивилловский, Счастье, Судмалиса 1Г, Веры Хоружей 25:
-- is_hidden=false + актуальные имена/площади/часы/якоря. Фото локализуются
-- в репозитории (tcCatalogPatches LOCALIZED_SET); в БД URL Storage оставляем.

-- 1) Радзивилловский (Веснянка) — якорь «Санта» с ноября 2024
UPDATE public.business_centers SET
  is_hidden = false,
  name = 'Торговый центр «Радзивилловский»',
  district = 'Центральный',
  microdistrict = 'Веснянка',
  total_area = 8612,
  year_built = 2003,
  floors = 3,
  retail_format = 'районный ТЦ',
  description = 'Районный торговый объект на ул. Леси Украинки, 22 в Веснянке. Исторически — флагман сети «Радзивилловский» (с 2003); универсам закрылся в начале 2020-х, в ноябре 2024 на его месте открылся супермаркет «Санта». В здании также работают Fix Price, отделение Белпочты, бассейн «Акула» и другие арендаторы.',
  media_mentions = CASE
    WHEN media_mentions::text LIKE '%realt.by/news/article/41331%' THEN media_mentions
    ELSE COALESCE(media_mentions, '[]'::jsonb) ||
      '[{"url":"https://realt.by/news/article/41331/","date":"2024-11-05","title":"На месте известного универсама в Минске открылся новый супермаркет","outlet":"Realt"}]'::jsonb
  END,
  retail_info = retail_info || jsonb_build_object(
    'hours', '[{"zone":"Супермаркет «Санта»","value":"ежедневно 09:00–23:00","note":null,"source":"Onliner / 2ГИС","sourceUrl":"https://money.onliner.by/2024/11/03/magazin-v-vesnyanke"}]'::jsonb,
    'transport', '[{"mode":"bus","text":"Остановка «Леси Украинки» / «Веснянка»: автобусы 73, 130, 151с, 190э; троллейбусы 14, 58.","source":"Расписание транспорта Минска","sourceUrl":"https://minsk.btrans.by/ostanovka/lesi-ukrainki"},{"mode":"walk","text":"Ближайшее метро «Пушкинская» — около 2,4 км; в карточке метро не указываем (порог каталога ≤1,5 км).","source":"Zoon","sourceUrl":"https://zoon.by/minsk/street/lesi_ukrainki_ulitsa/bld/22/"}]'::jsonb
  ),
  building_facts = CASE
    WHEN building_facts IS NULL OR building_facts = '[]'::jsonb THEN
      '[{"label":"Год постройки","value":"2003","source":"Отраслевой справочник","sourceUrl":"https://megapolis-real.by/torgovyie-czentryi/torgovyij-czentr-radzivillovskij.html"},{"label":"Общая площадь","value":"8 612 м²","source":"Отраслевой справочник","sourceUrl":"https://megapolis-real.by/torgovyie-czentryi/torgovyij-czentr-radzivillovskij.html"},{"label":"Этажность","value":"3","source":"2ГИС","sourceUrl":"https://2gis.by/minsk/geo/70030076196221465"},{"label":"Якорь с 2024","value":"Супермаркет «Санта»","source":"Onliner","sourceUrl":"https://money.onliner.by/2024/11/03/magazin-v-vesnyanke"}]'::jsonb
    ELSE building_facts
  END
WHERE slug = 'radzivillovskiy' AND kind = 'tc';

-- 2) Счастье — якорь «Санта» с июня 2023, галерея арендаторов сохраняется
UPDATE public.business_centers SET
  is_hidden = false,
  name = 'Торговый центр «Счастье»',
  district = COALESCE(district, 'Первомайский'),
  microdistrict = COALESCE(microdistrict, 'Восток'),
  total_area = 1997,
  year_built = 1979,
  floors = 3,
  retail_format = 'районный ТЦ',
  description = 'Небольшой торговый центр у выхода метро «Восток» (пр. Независимости, 155/1), напротив Dana Mall. Здание известно с конца 1970-х как свадебный салон «Счастье»; в 2003 его переоборудовали в ТЦ. В июне 2023 на месте якорной площади открылся супермаркет «Санта» (~500 м²); в галерее по-прежнему аптеки, услуги, секонд-хенд и мелкий ритейл.',
  media_mentions = CASE
    WHEN media_mentions::text LIKE '%belretail.by/news/na-meste-tts-schaste%' THEN media_mentions
    ELSE COALESCE(media_mentions, '[]'::jsonb) ||
      '[{"url":"https://belretail.by/news/na-meste-tts-schaste-v-minske-otkryilsya-supermarket-santa","date":"2023-06-22","title":"На месте ТЦ «Счастье» в Минске открылся супермаркет «Санта»","outlet":"Belretail"}]'::jsonb
  END,
  retail_info = retail_info || jsonb_build_object(
    'hours', '[{"zone":"Супермаркет «Санта»","value":"ежедневно 09:00–23:00","note":"площадь супермаркета ~500 м²","source":"Belretail","sourceUrl":"https://belretail.by/news/na-meste-tts-schaste-v-minske-otkryilsya-supermarket-santa"}]'::jsonb
  )
WHERE slug = 'schaste' AND kind = 'tc';

-- 3) Судмалиса 1Г — подтверждённый малый ТЦ у м. Пролетарская
UPDATE public.business_centers SET
  is_hidden = false,
  name = 'Торговый центр на Судмалиса, 1Г',
  alt_names = '["ТЦ на Судмалиса 1Г","Судмалиса 1Г","Магазин «Мила» на Судмалиса, 1Г"]'::jsonb,
  district = COALESCE(district, 'Ленинский'),
  microdistrict = COALESCE(NULLIF(microdistrict, ''), 'Пролетарская'),
  year_built = 2021,
  retail_format = 'районный ТЦ',
  description = 'Небольшое торговое здание 2021 года у станции метро «Пролетарская» и остановки электричек «Минск-Восточный» (ул. Судмалиса, 1Г). В справочнике Megapolis указан как ТЦ «Судмалиса 1Г»: работают магазины повседневного спроса — «Мила», «Три цены» и Zooбазар (часть операторов в объявлениях фигурирует также по соседнему корпусу 1Б того же узла).',
  building_facts = '[{"label":"Год постройки","value":"2021","source":"Отраслевой справочник","sourceUrl":"https://megapolis-real.by/torgovyie-czentryi/korona-na-sudmalisa-1g.html"},{"label":"Метро","value":"«Пролетарская», у выхода","source":"Отраслевой справочник","sourceUrl":"https://megapolis-real.by/torgovyie-czentryi/korona-na-sudmalisa-1g.html"}]'::jsonb,
  highlights = '[{"icon":"design","text":"Здание стоит в нескольких шагах от выхода станции метро «Пролетарская» и остановки городской электрички «Минск-Восточный».","label":"Рядом с метро и электричками"},{"icon":"fact","text":"По данным отраслевого справочника, в узле давно работают «Мила», «Три цены» и Zooбазар.","label":"Три магазина повседневного спроса"}]'::jsonb,
  retail_info = retail_info || jsonb_build_object(
    'hours', '[{"zone":"«Мила»","value":"ежедневно 09:00–21:00","note":null,"source":"Pakupnik / сеть «Мила»","sourceUrl":"https://pakupnik.by/mila/shops/13641/"},{"zone":"«Три цены»","value":"ежедневно 09:00–21:00","note":"в каталогах также ул. Судмалиса, 1Б","source":"2ГИС","sourceUrl":"https://2gis.by/minsk/firm/70000001067844231"}]'::jsonb,
    'anchors', '[{"area":null,"name":"Мила","text":"Магазин косметики и бытовой химии сети «Мила».","floor":null,"since":null,"source":"Отраслевой справочник; Яндекс Карты","category":"красота","sourceUrl":"https://megapolis-real.by/torgovyie-czentryi/korona-na-sudmalisa-1g.html","yandexUrl":"https://yandex.by/maps/org/mila/223223256356/"},{"area":null,"name":"Три цены","text":"Магазин низких цен; в части каталогов указан адрес Судмалиса, 1Б рядом с 1Г.","floor":"1","since":null,"source":"Отраслевой справочник; 2ГИС","category":"дом и интерьер","sourceUrl":"https://megapolis-real.by/torgovyie-czentryi/korona-na-sudmalisa-1g.html","yandexUrl":null},{"area":null,"name":"Zooбазар","text":"Зоомагазин в торговом узле у метро «Пролетарская».","floor":null,"since":null,"source":"Отраслевой справочник","category":"другое","sourceUrl":"https://megapolis-real.by/torgovyie-czentryi/korona-na-sudmalisa-1g.html","yandexUrl":null}]'::jsonb,
    'factCards', '[{"headline":"У метро и электрички","text":"Выход «Пролетарской» и остановка «Минск-Восточный» — в нескольких шагах от входа."},{"headline":"Построен в 2021 году","text":"Небольшой районный объект у жилого массива и «Антоновского пассажа»."}]'::jsonb
  ),
  tenant_count = GREATEST(COALESCE(tenant_count, 0), 3)
WHERE slug = 'sudmalisa-1g' AND kind = 'tc';

-- 4) Веры Хоружей 25 — дискаунтер-центр уже почти полный, добираем площадь/год
UPDATE public.business_centers SET
  is_hidden = false,
  name = 'Торговый центр на Веры Хоружей, 25',
  total_area = COALESCE(total_area, 3700),
  year_built = COALESCE(year_built, 1978),
  floors = COALESCE(floors, 4),
  retail_format = COALESCE(NULLIF(retail_format, ''), 'районный ТЦ'),
  description = COALESCE(
    NULLIF(description, ''),
    'Дискаунтер-центр на пересечении ул. Веры Хоружей и Старовиленской / Богдановича: торговая площадь около 3 700 м², якорь — «Светофор» (~1 200 м²). В здании также фитнес, дрифт-арена и офисные арендаторы; рядом строятся станции метро «Комаровская» и «Парк Дружбы Народов».'
  )
WHERE slug = 'very-horuzhey-25' AND kind = 'tc';

NOTIFY pgrst, 'reload schema';
