-- Уточнения по ресерчу 2026-10-05 после открытия 4 ТЦ.
UPDATE public.business_centers SET
  year_built = 1986,
  building_facts = COALESCE(building_facts, '[]'::jsonb) ||
    '[{"label":"Год здания (2ГИС)","value":"1986","source":"2ГИС","sourceUrl":"https://2gis.by/minsk/geo/70030076196221465"},{"label":"Сеть «Радзивилловский»","value":"с ~2003 (флагман); сеть прекратила работу к 2021","source":"Realt","sourceUrl":"https://realt.by/news/article/41331/"}]'::jsonb,
  retail_info = jsonb_set(
    COALESCE(retail_info, '{}'::jsonb),
    '{parking}',
    '{"date":"2026","items":[{"label":"У здания","value":"≈20 мест, бесплатно"},{"label":"Доп. у здания","value":"≈24 места, бесплатно"}],"source":"2ГИС","summary":"Наземная бесплатная парковка у дома; оценка 2ГИС ≈20 и ≈24 места. Цифра «более 1000» из отраслевого справочника относится к сети, не к этой площадке.","sourceUrl":"https://2gis.by/minsk/geo/70030076196221465"}'::jsonb
  )
WHERE slug = 'radzivillovskiy' AND kind = 'tc';

UPDATE public.business_centers SET
  floors = 2,
  nearest_metro_stations = (
    SELECT COALESCE(jsonb_agg(s), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(nearest_metro_stations, '[]'::jsonb)) AS s
    WHERE (s->>'distanceMeters')::int <= 1500
  )
WHERE slug = 'schaste' AND kind = 'tc';

UPDATE public.business_centers SET
  floors = 1,
  metro = '«Пролетарская», ~90 м',
  nearest_metro_stations = '[{"line":"Автозаводская линия","name":"Пролетарская","color":"#E90101","distanceMeters":90},{"line":"Автозаводская линия","name":"Первомайская","color":"#E90101","distanceMeters":1100}]'::jsonb
WHERE slug = 'sudmalisa-1g' AND kind = 'tc';

UPDATE public.business_centers SET
  metro = NULL,
  nearest_metro_stations = '[]'::jsonb,
  retail_info = jsonb_set(
    COALESCE(retail_info, '{}'::jsonb),
    '{transport}',
    '[{"mode":"bus","text":"Остановка «Веры Хоружей»: автобусы 19, 25, 29, 46.","source":"minsk.btrans.by","sourceUrl":"https://minsk.btrans.by/ostanovka/very-horuzhej"},{"mode":"trolleybus","text":"Остановка «Веры Хоружей»: троллейбусы 22, 37, 40, 40а, 46, 53.","source":"minsk.btrans.by","sourceUrl":"https://minsk.btrans.by/ostanovka/very-horuzhej"},{"mode":"walk","text":"Ближайшие действующие станции метро дальше 1,5 км (Яндекс: «Площадь Якуба Коласа» ≈1,8 км). На сайте центра заявлены будущие «Комаровская» и «Парк Дружбы Народов».","source":"Яндекс Карты; discounterminsk.by","sourceUrl":"https://yandex.by/maps/org/diskaunter/71375222166/"}]'::jsonb
  )
WHERE slug = 'very-horuzhey-25' AND kind = 'tc';

NOTIFY pgrst, 'reload schema';
