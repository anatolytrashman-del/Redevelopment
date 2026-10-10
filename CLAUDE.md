# Redevelopment — CRM + продающий сайт для редевелопмента коммерческой недвижимости

Один репозиторий, две аудитории: **админка** (`/admin/...`, за `PasswordGate`) — внутренняя
CRM (лиды, сделки, объекты, задачи, документы, закупки) и **публичная часть** (`/`, `/:slug`,
`/plan/:token`, каталог БЦ `/minsk/bc`) — лендинги, бронирование, удалённое подписание.
Прод: **redevelopment.pro** (Vercel). Владелец: anatoly.trashman@gmail.com.

**Этот файл — только ядро.** Подробности, история решений и разборы багов лежат в
`docs/claude/` — открывать нужный файл, когда задача касается его темы (таблица ниже),
а не заранее. Старые ссылки в коде и документах вида «см. CLAUDE.md, раздел X» теперь
ведут в эти файлы: названия разделов сохранены.

## Язык общения

Всегда отвечай владельцу на русском — независимо от того, на каком языке думаешь
или писал раньше в этой же сессии. Это касается обычных реплик в диалоге, а не
кода/комментариев/коммитов (там — как и раньше, по остальным правилам этого файла).

## Стек

- React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + react-router-dom v7
- Supabase (`@supabase/supabase-js`) — только anon/publishable key на фронте, без auth;
  доступ регулируется RLS-политиками в самой базе, не секретностью ключа
  (см. `src/lib/supabase.ts`)
- lucide-react — иконки
- Vercel serverless functions (`api/*.js`, обычный JS, не TS) — всё, что требует секретов
  (service-role ключ Supabase, Resend, Google OAuth)

## Структура

```
src/pages/        — маршруты (см. App.tsx). Admin-страницы за PasswordGate под /admin/*;
                     публичные — ObjectLandingPage (/:slug), PublicBuildingPlan (/plan/:token).
src/components/ui       — база: Button, Card, Badge, Input, Select, AddableSelect,
                            ToggleGroup, Modal, TreeTable, SearchInput...
src/components/layout   — Sidebar, PageHeader, AppLayout, PasswordGate, InfoBanner
src/components/objects  — самая тяжёлая папка: планировки (BuildingPlanCanvas/Widget),
                            карта объекта (ObjectMapWidget), публичный флоу бронирования
                            и подписания (PublicPlanAndUnits, AgreementSigningFlow,
                            ZoneDetailModal), формы/модалки объекта
src/components/documents — генерация документов из гугл-шаблонов
src/data/          — доменные типы: для каждой сущности пара `Foo` (camelCase, то,
                     чем оперирует приложение) + `FooRow` (snake_case, форма строки
                     в Supabase) — см. "Паттерн работы с данными" ниже
src/lib/           — supabase-клиент, withRetry, по одному *Api.ts на сущность
                     (fetchX/insertX/updateX/deleteX + fromRow-маппер), мелкие хелперы
api/               — Vercel serverless functions (голый JS): OTP-подписание соглашения,
                     генерация документов, общие Google Docs/Drive хелперы (_google.js)
scripts/           — почасовые cron-синки статистики спроса (Kufar/Realt/Avito/Megapolis)
public/fonts/      — self-hosted Montserrat (+ Yandex Sans Text для части макетов)
examples/          — референс-страницы первого прохода прототипа, в сборку не входят
data/linkbuilding/ — трекер кампании линкбилдинга (CSV: доноры, письма, полученные
                     ссылки) — см. `LINKBUILDING_PLAN.md` и `data/linkbuilding/README.md`
```

## Справочник: что где читать

| Задача касается… | Файл |
|---|---|
| деплоя, Vercel, долгой сборки, пререндера, превью-ветки `preview`, pg_cron/Edge Functions, env-переменных и секретов | `docs/claude/deploy.md` |
| новой сущности/таблицы, SQL-миграций, Management API, чтения почты Resend, RLS | `docs/claude/supabase-and-email.md` |
| багов «молча не работает», PostgREST, регулярок, SQL-функций, ProxyAPI, модалок, дат, загрузок, каталога БЦ | `docs/claude/gotchas.md` |
| FAQ и блока источников на публичных страницах | `docs/claude/public-pages.md` |
| мок-теста UI, веток, порядка публикации, передачи задач Codex | `docs/claude/workflow.md` |
| журнала сессий и рабочих планов (SEO, линкбилдинг, закупки, каталог БЦ, автоответы) | `docs/claude/working-docs.md` |
| разноса каталогов на offiselist.pro / malllist.pro, 301 и Search Console / Вебмастер | `docs/domain-split.md` |

## Жёсткие правила (кратко — подробности по ссылкам)

- **Секреты** (`SUPABASE_ACCESS_TOKEN`, `RESEND_API_KEY`, `VERCEL_TOKEN`, `PROXYAPI_KEY` и др.)
  не печатать в чат/лог и не коммитить. Новый секрет — сразу в три места: окружение
  сессии, Vercel (Production), GitHub Actions secrets.
- **SQL-миграции** выполняем сами через Supabase Management API (проект
  `iohcdylttyuhwovztrbk`), в конце любой DDL — `NOTIFY pgrst, 'reload schema';`.
  Миграции совместимы со старым кодом: добавлять можно, переименовать/удалить/ужесточить
  RLS — только после READY деплоя. Детали — `supabase-and-email.md`.
- **Новая периодическая задача** — в `pg_cron`, не в GitHub Actions.
- **Сборка перед коммитом:** `npm run build:app` (~10 с). Не `npm run build` — там полный
  пререндер на ~20 минут.
- **Git:** добавлять файлы поимённо (никогда `git add -A`/`.`); работать в ветке, которую
  назначил харнесс; перед новой порцией работы `git fetch origin && git status`.
- **Публикация — сразу, без вопроса:** PR из ветки сессии в
  `claude/redevelopment-platform-prototype-oodobu` → мерж →
  `node scripts/cancel-stale-deployments.mjs --confirm` → ждать деплой Vercel опросом с
  выходом по ЛЮБОМУ терминальному состоянию (`READY`/`ERROR`/`CANCELED`), потолок ~15 мин.
  Чужие ветки без команды владельца не мержить; в `preview` не форс-пушить.
  Полный порядок — `workflow.md`.
- **Codex** (`scripts/codex.sh -f docs/codex-tasks/<задача>.md`): рутина от ~100 строк
  кода — ему, до ~50 строк — сам; база, секреты, миграции, деплой и мерж — всегда Claude.
- **Тихие ловушки — проверять в каждом диффе** (разборы — `gotchas.md`): выборки >1000
  строк только через `.range()`; дата из инпута — `value || null`; `0` ≠ «пусто»;
  вложенных модалок нет; файлы-близнецы правятся с обеих сторон (`src/data/vat.ts` ↔
  `api/_vat.js` и др.); `\b` не работает с кириллицей; `primary` не для нейтральных
  статусов; уникальные имена считать ДО `withRetry`; разбор входящего письма — после
  `stripQuotedReply`.
- **Публичная страница** заканчивается FAQ по всему её содержимому, затем дисклеймером
  с источниками (исключение — `/minsk/bc/analytics`, см. `public-pages.md`).
- **Раздел БЦ** читает данные из файлов сборки (`src/lib/buildData.ts`), а сборка вне
  Vercel в базу не ходит — новый запрос раздела добавлять в генератор.

## Правила работы с контекстом (экономия лимита)

- `CLAUDE.md` держать коротким: новые правила — одной строкой сюда плюс подробности в
  нужный файл `docs/claude/`. Логи, отчёты, история — только в `docs/`.
- Журнал сессий — `docs/session-journal.md` (2+ МБ): никогда не читать целиком, только
  `grep -n` по дате/теме и `sed -n` нужного диапазона. Новые записи — сверху.
- Большие md-файлы (`SEO_PLAN.md` 280 КБ, `PAGESPEED_PLAN.md`, `EMAIL_CORRESPONDENCE_PLAN.md`,
  `LINKBUILDING_PLAN.md` и др.) — так же, через `grep`/`head`/`sed -n`.
- Вывод команд ограничивать (`| tail -50`), логи сборки/тестов — последние 30 строк.
- Массовый веб-поиск и ресёрч (поставщики, застройщики, источники) — через субагентов;
  в основной контекст возвращать только итоговую таблицу.
- Одна сессия — одна задача. Закончил и опубликовал — предложить владельцу начать новую
  сессию, а не тянуть следующую тему в тот же контекст.

## Не проектная информация

Владелец иногда обсуждает предметку недвижимости (кредит vs. лизинг, тексты объявлений
и т.п.) — отвечать по существу, без привязки к репозиторию.
