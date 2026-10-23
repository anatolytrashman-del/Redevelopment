# План волны 3.1 — теггирование legacy-таблиц client_id (для закупок Матрёшки)

Это **отдельная** миграция, потому что затрагивает СУЩЕСТВУЮЩИЕ таблицы старой платформы (purchase_*, mailbox_*, outgoing_email_jobs и т.д.).

**НЕ ПРИМЕНЯТЬ БЕЗ ОТДЕЛЬНОГО ОДОБРЕНИЯ** (см. шапку 05).

## Что делает
- Добавляет (add column if not exists) `client_id uuid null` + `import_batch_id uuid null`
- Создаёт индексы по ним (if not exists)
- Делает guarded через `DO $$ if to_regclass('public.xxx') is not null`
- Никаких NOT NULL, defaults, backfill данных, изменений RLS в этом файле.
- После отдельного одобрения: скрипты/ручная разметка по legal_entity / категориям / email'ам → client_id = matreshka + import_batch, затем перенос файлов в Storage clients/matreshka/, сверка.

## Почему не в 04
04 трогает только новые matreshka-таблицы (client_* + import_batches). 05 — только legacy.

## Откат
Удалить колонки (после бэкапа), снести индексы.

См. также:
- TZ-migration.md шаг 3.1
- scripts/matreshka/import/rollback-batch.mjs (будет работать и после 05)
- docs/matreshka/ARCHITECTURE.md

После применения 05 + реального теггирования: волна 3.1 закупок и переписки помечена, отчёт сверки подписан, старые записи можно архивировать/удалять вручную (не автоматически, чтобы откат оставался возможным).
