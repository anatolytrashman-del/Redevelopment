-- Согласованные обложки ТЦ с preview (PR #718) → production.
-- Файлы уже в public/images/business-centers/tc-<slug>.{jpg,webp,...}.
-- Применять вместе с деплоем этих файлов (не раньше): иначе каталог
-- покажет битые обложки. Общая preview-инъекция (_approvedTcPreview)
-- на production не работает — тут нужна живая запись в базе.
update business_centers
set
  photos = array['/images/business-centers/tc-' || slug || '.jpg'],
  is_hidden = false
where kind = 'tc'
  and slug in ('globus-park', 'green-time', 'korona-siti', 'kupalovskiy', 'lobanka-26', 'talisman-tc');

NOTIFY pgrst, 'reload schema';
