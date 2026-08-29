# Redevelopment — платформа управления редевелопментом коммерческой недвижимости

Прототип платформы для компании, занимающейся редевелопментом коммерческой недвижимости.
Страницы собираются по одной поверх готовой дизайн-системы (шрифт Montserrat, цвета,
UI-компоненты).

## Стек

- React 19 + TypeScript
- Vite 8
- Tailwind CSS v4
- react-router-dom
- Supabase (`@supabase/supabase-js`) — хранение данных
- lucide-react (иконки)

## Запуск

```bash
npm install
npm run dev
```

## Деплой

Прод — Vercel (redevelopment.pro), собирается автоматически при пуше в
`claude/redevelopment-platform-prototype-oodobu` (git-интеграция Vercel, вне репозитория).
Зеркало на GitHub Pages отключено (2026-08-22).

## Модель безопасности

- **Публично, без входа:** лендинги объектов (`/minsk/:slug`), гид по району
  (`/minsk/minsk-mir`), `/plan/:token`, `/tz/:token`, `/summary/:token`,
  `/estimate/:token` (доступ по непредсказуемому токену в самой ссылке),
  `/business-upload` (без пароля — для внешнего сборщика данных). Anon-ключ
  Supabase намеренно зашит в клиентский бандл — граница безопасности не
  секретность ключа, а RLS-политики в самой базе. `npm run audit:rls`
  (`scripts/audit-rls.mjs`) — исполняемая проверка анонимным ключом по всем
  таблицам, падает, если что-то доступно сверх ожидания.
- **За входом (`/admin/*`):** настоящий Supabase Auth
  (`supabase.auth.signInWithPassword`), не клиентская сверка пароля.
  Аккаунты сотрудников заводятся вручную (Supabase Auth Admin API),
  самостоятельная регистрация отключена. RLS требует роль `authenticated`
  почти на всех таблицах; anon видит только то, что нужно публичным
  страницам выше, точечными политиками.
- **Serverless-функции (`api/*.js`):** бόльшая часть требует сессию
  сотрудника (`api/_auth.js`, `requireStaffAuth`) — исключения:
  `agreement-otp-request`/`agreement-otp-verify` (вызывает покупатель при
  удалённом подписании соглашения, без входа) и `exchange-rate`
  (безобидный публичный кэш курса валют).
- **Секреты** (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
  `PROXYAPI_KEY`, Google OAuth, cookies Kufar/Realt/Avito/Megapolis,
  `SUPABASE_ACCESS_TOKEN`) — только в переменных окружения Vercel/сессии
  разработки, никогда не коммитятся в репозиторий.

## Структура

- `src/components/ui` — базовые UI-компоненты (Button, Card, Badge, Input, Select,
  AddableSelect, ToggleGroup, Modal, TreeTable...)
- `src/components/layout` — сайдбар, шапка страницы, инфо-баннер, общий layout
- `src/pages` — активные страницы приложения (Дашборд, Транзакции)
- `src/data` — доменные типы и справочники (валюты, категории, партнёры, источники платежа)
- `src/lib` — клиент Supabase и функции работы с транзакциями
- `public/fonts` — шрифт Montserrat (self-hosted)
- `examples/` — референс-страницы из первого прохода прототипа, не подключены к сборке.
  См. `examples/README.md` — как использовать при добавлении новых страниц.
