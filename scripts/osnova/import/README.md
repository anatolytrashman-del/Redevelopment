# Импорт инструменты (блок 4, волны миграции Матрёшки)

Скрипты для обратимого импорта данных клиента «Матрёшка» (и других в будущем).
Каждая волна помечается `import_batch_id` → откат возможен.

**Строгие правила:**
- Dry-run — **по умолчанию**.
- Для реальной записи: `--apply --confirm "<client-slug или batch-uuid>"` **оба** флага обязательны.
- Секреты (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) читаются **только** при `--apply`, **никогда не печатаются**.
- **Никаких** сетевых вызовов, чтения `.env`, реального импорта без `--apply --confirm`.
- Не трогаем legacy-таблицы (purchase_*, mailbox_* и т.д.) — для них отдельно 05 (см. plan-wave-3-1.md).
- Не коммитим, не удаляем файлы.

## Файлы
- `lib.mjs` — парсинг CSV (кавычки, запятые), нормализация, маппинг колонок, createBatch/apply/rollback через PostgREST.
- `import-requests-csv.mjs` — импорт `client_requests` из CSV (экспорт Google Sheets «Поставки ... / Матрешка Зеленый» вручную).
- `import-supplier-notes-csv.mjs` — импорт `client_supplier_notes` / `prices`.
- `rollback-batch.mjs` — откат по batch.
- `fixtures/sample-requests.csv` — фейковые данные (без реальных имён/данных).
- `plan-wave-3-1.md` — описание миграции 05 по legacy-таблицам.
- `lib.test.mjs` — vitest-тесты (парсинг, маппинг, ambiguous, отказ apply без confirm).

## Использование (всегда dry-run сначала!)

```bash
# 1. Dry-run (без секретов, без сети)
node scripts/osnova/import/import-requests-csv.mjs \
  --file=scripts/osnova/import/fixtures/sample-requests.csv \
  --client=matreshka \
  --mapping='{"Дата":"date","Поставщик":"supplier","Юрлицо":"legalEntity","Сумма":"amount","Вид поставки":"supplyKind","Номер":"number","Комментарий":"comment"}'

# 2. Реальная запись (оба флага!)
node scripts/osnova/import/import-requests-csv.mjs \
  --file=... --client=matreshka --mapping='...' \
  --apply --confirm "matreshka"

# Аналог для notes
node scripts/osnova/import/import-supplier-notes-csv.mjs --file=... --client=matreshka --apply --confirm "matreshka"

# Dry-run отката
node scripts/osnova/import/rollback-batch.mjs --batch 123e4567-e89b-12d3-a456-426614174000

# Реальный откат
node scripts/osnova/import/rollback-batch.mjs --batch <uuid> --apply --confirm <uuid>
```

## Отчёт сверки
- Печатается в stdout: всего строк, включено/исключено, суммы, список ambiguous (юрлица ≠ Матрёшка, например ИП Трэшмен / Лавэ Драйв).
- JSON-отчёт всегда пишется в `tmp/osnova-import/report-*.json` (даже dry).
- Ambiguous **не импортируются** автоматически — идут списком Анатолию.

## Волны (кратко)
- 3.1: legacy purchase/mailbox → client_id + batch (миграция 05, отдельное одобрение; см. plan-wave-3-1.md)
- 3.2: пометки/цены поставщиков → client_supplier_*
- 3.3: реестр поставок из Google Sheets → client_requests
- Далее: сотрудники, документы и т.д.

После каждой волны: сверка (кол-во + суммы), подпись владельца, потом можно архивировать дубли в старом месте (откат остаётся по batch).

## Тесты
```bash
npm test
# или targeted
npx vitest run scripts/osnova/import/lib.test.mjs
```

## Проверки перед PR
```bash
npm run lint
npx tsc -b
npm test
node scripts/osnova/audit-isolation.mjs
node scripts/osnova/import/import-requests-csv.mjs --file=scripts/osnova/import/fixtures/sample-requests.csv --client=matreshka --mapping='{"Дата":"date"}'   # dry
node scripts/osnova/import/rollback-batch.mjs --batch dry-test
# --apply без --confirm должен отказать мгновенно без сети/секретов
```

Откат по `import_batch_id` удаляет **только** из osnova-таблиц, перечисленных в lib/rollback.
