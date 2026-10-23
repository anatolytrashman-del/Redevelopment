# Админка клиента «Матрешка» и админка платформы Redevelopment — архитектура блоков 1–4

Платформа — Redevelopment (владелец Анатолий). Единственный клиент — «Матрешка» (технический слаг `matreshka`).
Запись `redevelopment` в `matreshka.clients` — служебная запись платформы, не клиент (`status=disabled`, `settings.platform_service=true`).

Источник требований: `TZ-auth.md`, `TZ-admin.md`, `TZ-isolation.md`, `TZ-migration.md` (корень репо).
Этот файл — обязательные решения для реализации. Нарушать их нельзя.

## 0. Главное правило безопасности
- Старая платформа (redevelopment.pro, /admin/*, PasswordGate, токен-страницы, malllist/officelist,
  все существующие api/*.js) должна работать **ровно как раньше**. Ничего не удалять и не переименовывать.
  Существующие файлы правим только минимально и аддитивно (новая ветка `if`, новый маршрут).
- Всё новое поведение включается **только** на хостах клиента (список — `src/lib/matreshkaHosts.js`,
  единственное место с доменными строками), на «/» хоста платформы (redevelopment.pro / www — вход в админку
  «Матрешка», см. §1а) и на новых путях `/platform/*`, `/katalog`, `/api/matreshka`, `/api/auth/*`.
- Превью-override: на `*.vercel.app` **и только при `VERCEL_ENV === 'preview'`** параметр `?tenant=matreshka`
  включает режим клиента (cookie `matreshka_preview=1` / sessionStorage). На проде не действует.
- Секретов в коде нет. `SUPABASE_SERVICE_ROLE_KEY` — только `process.env` на сервере.

## 1. Определение клиента по хосту
- `src/lib/matreshkaHosts.js` (+ `.d.ts`): `MATRESHKA_HOSTS`, `PLATFORM_LOGIN_HOSTS`, флаги/заголовки; импортируют middleware, браузер и API.
- `src/lib/tenant.ts`: `CLIENT_HOSTS` (из `MATRESHKA_HOSTS`),
  `getClientSlugForHost(hostname)`, `isClientAdminHost()` (учитывает превью-override, флаг сборки `__VERCEL_ENV__` из vite define).
- Сервер: `api/_matreshkaTenant.js` — то же по заголовку `host`/`x-forwarded-host` (+ превью-override по cookie, только VERCEL_ENV=preview).
- `middleware.ts`: в самом начале (до siteMode-логики) — если хост клиента (или превью-override):
  `/api/*` и статика → `next()`; `/robots.txt` → `Disallow: /`; остальное → `rewrite('/matreshka.html')` с заголовком `X-Robots-Tag: noindex`.
  Для обычных хостов добавить `/platform` в KNOWN_PREFIXES (и rewrite `/platform`, `/platform/*` → `/platform-admin.html` в vercel.json, в начале rewrites; заголовок «Redevelopment — платформа»).
- `scripts/generate-matreshka-shell.mjs` (в конце `build:app`): `dist/matreshka.html` из `dist/404.html`/`dist/index.html` с `<title>Матрешка — вход</title>`, `noindex`, без og-рекламы.

## 1а. Вход на «/» redevelopment.pro (2026-10-23)
- На `redevelopment.pro` и `www.redevelopment.pro` путь `/` отдаёт только экран входа в админку «Матрешка»
  (middleware → `rewrite('/matreshka-login.html')`, `noindex`, `no-store`); после входа — админка «Матрешка».
- `dist/matreshka-login.html` генерирует тот же `generate-matreshka-shell.mjs`; счётчики Метрики/VK в нём сохранены.
- Прежняя главная платформы (`PlatformHomePage`) — на `/katalog`. Остальные пути и хосты (officelist, malllist) без изменений.
- Браузер: `isPlatformRootLogin()` (tenant.ts) → `RootGate` в App.tsx рендерит `ClientAdminApp`; `api.ts` шлёт заголовок
  `x-matreshka-root-login: 1`; сервер (`_matreshkaTenant.js`) принимает его только с хостов платформы (и превью *.vercel.app).
  Без заголовка (например, `/platform`) — платформенный режим, как раньше.
- Превью: симуляция `/?simulate_host=redevelopment.pro` (только VERCEL_ENV=preview на *.vercel.app).

## 2. Фронтенд
- `src/App.tsx`: самая первая проверка в `App()` — `if (isClientAdminHost()) return <ClientAdminApp/>` (lazy). Плюс маршрут `/platform/*` → `<PlatformAdminApp/>` (lazy) в платформенных Routes. Больше App.tsx не трогать.
- Новый код только в `src/matreshka/**`: `ClientAdminApp.tsx`, `PlatformAdminApp.tsx`, `LoginScreen.tsx`, `api.ts` (fetch к `/api/matreshka?route=...` с Bearer токеном), страницы.
- Вход: экран Email + Пароль + «Войти», ошибка общая «Неверный email или пароль». POST `/api/matreshka?route=auth.login` → `{access_token, refresh_token}` → `supabase.auth.setSession`. Сессия Supabase persistent (бессрочная, refresh).
  Кнопка «Войти через Битрикс24» показывается только если `/api/matreshka?route=auth.providers` вернул `bitrix24: true` (по умолчанию false).
- Профиль: смена своего пароля (с текущим), «Выйти», «Выйти на всех устройствах» (`signOut({scope:'global'})`).
- Переключатель «Платформа / Матрёшка» — в шапке, только если контекстов > 1; переход = ссылка на другой домен.
- В клиентской админке: никакого бейджа владельца; права — только по членству.
- Мобильная вёрстка с 375px, Tailwind, русский язык, компоненты из `src/components/ui` можно переиспользовать.

## 3. Сервер (одна новая функция — лимит функций Vercel!)
- Только ОДИН новый файл-функция: `api/matreshka.js` (роутер по `?route=`). Хелперы — файлы с `_` (`api/_matreshka*.js`), они не считаются функциями.
- vercel.json rewrites (в начало массива): `/api/auth/bitrix/:path*` → `/api/matreshka?route=auth.bitrix.:path*`, `/api/auth/:path*` → `/api/matreshka?route=auth.:path*`.
- Существующие api/*.js и `api/_auth.js` НЕ менять.
- Клиентские маршруты (`client.*`) ходят в базу **от имени пользователя** (anon key + его JWT) — работает RLS.
  `service_role` — только для: логина/лимитов/журнала, `platform.*` (после проверки `platform_owner`), создания пользователей через GoTrue admin.
- Каждый запрос: проверка JWT → `user_profiles.status='active'` (отключённый → 401 сразу, т.е. ≤1 мин) →
  для `client.*`: клиент из хоста, активное членство и `clients.status='active'` иначе 403; для `platform.*`: `platform_roles` иначе 403. Без токена → 401.
- Лимиты входа (таблица `auth_login_attempts`): по IP 20 неудач/15 мин → блок 15 мин; по email 5 неудач/15 мин → блок 15 мин (мягко: только для этого email+IP? — делаем email-wide, но после 15 мин сброс). Всё пишется в `security_log`.
- Битрикс24: `api/_matreshkaProviders.js` — интерфейс провайдера `{ id, enabled(), startLogin(), handleCallback(), getProfile(), createSession() }`; `password` — рабочий; `bitrix24` — заглушка → 404 `{error:'provider_not_connected'}`. Лимит 20 запросов/15 мин с IP на `auth.bitrix.*`.
- Если таблиц ещё нет (миграции не применены) — отвечать 503 `{error:'not_configured'}`, не падать.

## 4. База (только файлы миграций в `supabase/migrations/`, НЕ применять)
Префикс `20261023-matreshka-`. Идемпотентно (`if not exists`, `create or replace`, `drop policy if exists` перед `create policy` только для НОВЫХ таблиц). В конце `NOTIFY pgrst, 'reload schema';`. В шапке файла — комментарий «Откат:» с SQL отката.
- `01-auth-core.sql` (аддитивно, безопасно): `clients`, `platform_roles`, `user_profiles`, `positions`, `client_members`, `security_log`, `auth_login_attempts`, `auth_provider_configs`(или поля bitrix_* в clients); функции SECURITY DEFINER `set search_path = public`: `matreshka_is_platform_owner()`, `matreshka_my_client_ids()`, `matreshka_is_client_member(uuid)`, `matreshka_client_role(uuid)`. RLS включён на всех новых таблицах. Сид: клиент `matreshka` (hosts) и служебная запись платформы `redevelopment` (не клиент: `status=disabled`, `settings.platform_service=true`, в админке не показывается). Пользователей НЕ создавать.
- `02-client-workspace.sql` (аддитивно): `client_requests`, `client_request_events`, `client_supplier_notes`, `client_supplier_prices`, `supplier_moderation` (supplier_id, created_by_client_id, status pending/approved) — без изменения таблицы `suppliers`; функции `matreshka_client_suppliers(p_client uuid)` и `matreshka_client_add_supplier(...)` SECURITY DEFINER с проверкой членства; приватный bucket `client-files` + политики storage.objects ТОЛЬКО для `bucket_id='client-files'` по пути `clients/<client_id>/`.
- `03-legacy-guard.sql` (**РИСК для старой платформы, применять отдельно**): RESTRICTIVE-политики `TO authenticated` на существующих таблицах public со старыми политиками `authenticated`: `using ((select public.matreshka_is_legacy_allowed()))`, где allowed = НЕ «пользователь только клиента» (есть client_members, нет access_profiles, не platform_owner). Существующие аккаунты (без client_members) не затрагиваются. Применять ДО создания аккаунта Грузева.
- `04-import-scaffold.sql` (блок 4, аддитивно): `import_batches`, колонки `import_batch_id` в client_* таблицах, полный справочник должностей, `client_approval_rules`, поля согласования/«согласовано в Битрикс24» в событиях заявок, `clients.settings` флаг `approval_required`.

## 5. Проверки
`npm run lint`, `npx tsc -b`, `npm test`, `npm run build:app`. Новые unit-тесты (vitest) для tenant-детекции, лимитов, роутера api/matreshka (с моками). Миграции — прогон на локальном Postgres со стабами `auth.uid()`.

## Блок 3 — статус
Реализовано: RLS + политики + client_id + индексы на новых client_* таблицах (01/02); client.files.* (upload_url/sign/list) в api/_matreshkaFiles.js + matreshka.js + UI attach/list/open в request card ClientAdminApp; storage policies client-files; matreshka_is_legacy_allowed(); audit-isolation.mjs (вкл. проверка индексов); two-client-test.sql; vitest path validation; 03-legacy-guard.sql (не применена).
Pending отдельного одобрения: применение 03-legacy-guard.sql (меняет RLS на legacy), включение RLS + client_id NOT NULL на purchase_*/mailbox_* и др. legacy, перенос существующих storage файлов, переключение legacy api/* на user JWT (вместо service_role).

## Блок 4 — статус
Реализовано (scaffolding): 04-import-scaffold.sql (import_batches, import_batch_id cols+idx, positions dict+cols, client_approval_rules RLS, approval fields on requests, clients inn/settings); api/matreshka.js + _matreshkaApprovals.js (client.approval_rules.*, requests.approve/reject/mark_bitrix_approved, create logic for approval_status, matchApprover helper + tests, platform.clients.update for settings/inn); src/matreshka/positions.ts + ClientAdminApp (supply_kind, approval badge/buttons, bitrix mark form, history, settings matrix for admin, position sections config); import tooling (lib.mjs CSV+batch, *-csv.mjs, rollback, fixtures, README ru, plan-wave-3-1 +05 flagged); audit updated for 04/05; all under allowed runs only.
Pending: реальные волны импорта/применение, sales/documents tabs, owner-filtering data, Bitrix auto, prod apply 05.
