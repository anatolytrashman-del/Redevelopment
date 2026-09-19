-- Отзыв лишних прав anon у business_center_review_snapshots (2026-09-20).
--
-- Таблица заведена миграцией 20260919-bc-yandex-review-snapshots.sql с явным
-- `grant select ... to anon`, но Supabase раздаёт новым таблицам в public
-- полный набор прав для anon и authenticated через default privileges —
-- фактически у anon оказались ещё INSERT, UPDATE, DELETE и TRUNCATE. Тот же
-- случай, что уже разбирался 2026-09-19 с таблицами арендаторов.
--
-- Сами записи и так не проходят: политика у anon одна и только на select, а
-- RLS без политики на команду её запрещает. Но TRUNCATE под RLS НЕ ходит
-- вовсе, и держать выданные права рядом с единственной строчкой политики —
-- ровно та ловушка, от которой предостерегает CLAUDE.md. Отзываем явно.
--
-- Права authenticated НЕ трогаем: политика authenticated_all заведена
-- сознательно под точечный импорт отзывов, а регистрация в проекте отключена
-- (disable_signup = true), поэтому роль достаётся только аккаунтам владельца.
revoke insert, update, delete, truncate, references, trigger
  on public.business_center_review_snapshots from anon;

notify pgrst, 'reload schema';
