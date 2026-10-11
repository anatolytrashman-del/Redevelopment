# Supabase: паттерн данных, миграции, почта Resend

> Справочник вынесен из `CLAUDE.md` 2026-09-30, чтобы не грузить его в каждую сессию.
> Текст перенесён без изменений. Читать, когда задача касается темы файла.

## Паттерн работы с данными (Supabase)

Для каждой сущности одинаковая связка из трёх файлов — смотри как эталон
`src/data/leads.ts` + `src/lib/leadsApi.ts`:

1. `data/foo.ts` — `interface Foo` (camelCase, что видит остальной код) и
   `interface FooRow` (snake_case, ровно колонки таблицы в Supabase). Плюс открытые
   списки-константы для растущих enum-полей (`leadRequirements`, `leadContactMethods`,
   `leadClientTypes` и т.п.) — они не жёсткие enum'ы в базе, а просто набор значений
   "по умолчанию", к которому пользователь может добавлять свои прямо из формы
   (см. `AddableSelect` + паттерн `useMemo`, объединяющий пресет с фактически
   встречающимися значениями — есть в `Leads.tsx`, `ObjectFormModal.tsx`).
2. `lib/fooApi.ts` — `fromRow(row: FooRow): Foo`, `fetchFoo()`, `insertFoo()`,
   `updateFoo()`, `deleteFoo()`. Все запросы обёрнуты в `withRetry` (см. ниже).
   `insertFoo`/`updateFoo` принимают `Omit<Foo, 'id' | 'createdAt'>`.
3. Компонент страницы держит форму в стейте, мапит в обе стороны (`fooToForm` /
   payload на submit).

**Важно:** после `ALTER TABLE ... ADD COLUMN` в Supabase PostgREST иногда не видит
новую колонку сразу — ошибка `Could not find the 'x' column ... in the schema cache`.
Чинится через `NOTIFY pgrst, 'reload schema';` сразу после миграции (эту строку
добавлять в конец любой DDL-миграции автоматически).

**SQL-миграции (2026-08-20+): выполняем сами, без ручного шага пользователя.**
У окружения открыт домен `api.supabase.com` (см. Allowed domains в настройках
окружения — рядом с уже бывшим там `*.supabase.co`), и в переменных окружения лежит
`SUPABASE_ACCESS_TOKEN` (Supabase Management API personal access token, скоуп на
аккаунт владельца, не на конкретный проект — обращаться с той же осторожностью, что
и с service-role ключом, никогда не коммитить, не печатать в лог/файл, не палить в
чате сверх необходимого). Ref проекта — `iohcdylttyuhwovztrbk`. Выполнение:

```bash
curl -sS -X POST "https://api.supabase.com/v1/projects/iohcdylttyuhwovztrbk/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL здесь, экранировать кавычки>"}'
```

Если `$SUPABASE_ACCESS_TOKEN` в окружении пуст (`env | grep SUPABASE`) — значит это
свежая сессия до применения переменной, или её ещё не сохранили в настройках
окружения; в этом случае вернуться к старому способу (готовый SQL-файл пользователю
на ручной запуск через `SendUserFile`) и попросить проверить переменную. Если
`api.supabase.com` вдруг снова недоступен (403 от прокси) — проверить, не пропал ли
домен из Allowed domains.

**Почта (Resend) — читаем сами, 2026-09-11+.** В окружении лежит `RESEND_API_KEY`
(тот же ключ, что в Vercel), домены `resend.com`/`api.resend.com` открыты. Вся
входящая переписка доступна через API и переживает удаление записей из нашей БД —
это фактический бэкап писем: `GET /emails/receiving?limit=100[&after=<id>]` (список,
`has_more` для пагинации), `GET /emails/receiving/<id>` (полное письмо: `text`,
`html`, `subject`, `from`, `created_at`, `headers`, вложения с `filename`/`size`),
`GET /emails/<id>/attachments/<attachment_id>` (сам файл). Исходящие — `GET /emails`.
Использовано 2026-09-11 для восстановления снесённой переписки (см. журнал).
`WebFetch` на resend.com может отдавать EGRESS_BLOCKED из старого кэша — ходить
`curl`'ом. Ключ не печатать в чат/лог и не коммитить.

Публичный флоу (бронирование, подписание) работает без авторизации — `leads`,
`agreement_signatures` и т.п. закрыты RLS от анонимной записи там, где нужна
серверная логика (email, генерация PDF), поэтому такие операции идут не напрямую из
фронта в Supabase, а через `api/*.js` с `SUPABASE_SERVICE_ROLE_KEY`.
