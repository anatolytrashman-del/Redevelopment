-- Торговые блоки карточки ТЦ (2026-09-23): что на каком этаже, первые в
-- Беларуси и якоря, кино/еда/развлечения, место в рейтинге ТЦ Минска.
-- Одна jsonb-колонка на всё: у БЦ она пустая, заполняет её ресёрч ТЦ
-- (/mnt/project-files/tc-catalog/claude/apply_deep.py).
alter table public.business_centers add column if not exists retail_info jsonb;

notify pgrst, 'reload schema';
