-- Обложки для 8 скрытых ТЦ без фото (2026-10-05).
-- Файлы: public/images/business-centers/tc-<slug>.jpg (вырез на белом 1200×1200).
-- После READY деплоя с картинками — снять is_hidden, чтобы попали в каталог.

update business_centers
set
  photos = array['/images/business-centers/tc-' || slug || '.jpg'],
  is_hidden = false
where kind = 'tc'
  and slug in (
    'globus-park',
    'green-time',
    'korona-siti',
    'kupalovskiy',
    'lobanka-26',
    'pole-chudes',
    'stepyanka',
    'talisman-tc'
  );

NOTIFY pgrst, 'reload schema';
