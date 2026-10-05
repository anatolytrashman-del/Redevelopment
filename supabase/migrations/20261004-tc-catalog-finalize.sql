-- Финализация каталога ТЦ (2026-10-04).
-- Зеркало src/data/tcCatalogPatches.ts — применить через Management API,
-- когда будет SUPABASE_ACCESS_TOKEN. Код уже патчит данные на чтении;
-- этот SQL закрепляет правки в базе.
--
-- Скрытые ТЦ без обложки / бывшие объекты НЕ открываем.

update public.business_centers set district = 'Центральный' where slug = 'stolitsa' and kind = 'tc' and district is null;
update public.business_centers set district = 'Заводской' where slug = 'univermag-belarus' and kind = 'tc' and district is null;
update public.business_centers set district = 'Фрунзенский', total_area = coalesce(total_area, 39000) where slug = 'zhdanovichi' and kind = 'tc';
update public.business_centers set district = 'Советский' where slug = 'tsum' and kind = 'tc' and district is null;
update public.business_centers set district = 'Центральный' where slug = 'gum' and kind = 'tc' and district is null;
update public.business_centers set district = 'Московский' where slug = 'avtomoll-koltso' and kind = 'tc' and district is null;

update public.business_centers set total_area = 28000 where slug = 'metropol-tc' and kind = 'tc' and total_area is null;
update public.business_centers set total_area = 20300 where slug = 'green-na-partizanskom' and kind = 'tc' and total_area is null;
update public.business_centers set total_area = 16773 where slug = 'gippo-na-goretskogo' and kind = 'tc' and total_area is null;
update public.business_centers set total_area = 5722 where slug = 'nova-mall' and kind = 'tc' and total_area is null;
update public.business_centers set floors = coalesce(floors, 3) where slug = 'ocean' and kind = 'tc';

update public.business_centers
set nearest_metro_stations = jsonb_build_array(
      jsonb_build_object('name', 'Малиновка', 'distanceMeters', 1230, 'line', 'Московская линия', 'color', '#0064AF')
    ),
    metro = coalesce(metro, '«Малиновка», ~1,2 км')
where slug = 'diamond-city' and kind = 'tc'
  and (nearest_metro_stations is null or nearest_metro_stations = '[]'::jsonb);

update public.business_centers set retail_format = 'ТЦ' where slug in ('nord-siti-tc', 'all-house', 'vitalyur-na-rafieva') and kind = 'tc';
update public.business_centers set retail_format = 'районный ТЦ' where slug = 'mayakovskogo-146' and kind = 'tc';
update public.business_centers set retail_format = 'строительный центр' where slug = 'oma-shabany' and kind = 'tc';

-- Локальные обложки вместо Storage (файлы в public/images/business-centers/tc-<slug>.*).
update public.business_centers
set photos = array['/images/business-centers/tc-' || slug || '.jpg']
where kind = 'tc'
  and slug in (
    'most-mogilevskaya','nord-siti-tc','aleksandrov-passazh-tc','all-house','asanalieva-44',
    'avtoindustriya','avtomir','avtozapchast','chizhovskiy-rynok','diana','dmitriev-kirmash',
    'e-siti-goshkevicha','gippo-na-igumenskom-trakte','gippo-na-rokossovskogo','gippo-na-goretskogo',
    'green-na-uborevicha','green-na-partizanskom','komarovskiy-rynok','kupets','kurasovschinskiy-rynok',
    'lukyanovicha-4b','magnit-suharevo','makaenka-11','nova-mall','maksimus-suharevo',
    'mayakovskogo-146','mazurova-24','moskovsko-venskiy','na-golodeda','na-suharevskoy',
    'novyy-lebyazhiy','oma-brilevichi','oma-shabany','pervomayskiy','ramonak','tuteyshy',
    'serebryanka','simax','avtomoll-koltso','uruche-3','viessmann','vitalyur-na-rafieva',
    'zapadnyy-rynok','zhinovicha-7'
  );

NOTIFY pgrst, 'reload schema';
