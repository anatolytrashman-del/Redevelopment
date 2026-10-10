# Разнос проектов по доменам

Решение владельца (2026-10-10): **отдельные Vercel-проекты** (отдельные
деплои, env, домены) — не алиасы на одном проекте. GitHub при этом
**один** (`anatolytrashman-del/Redevelopment`): иначе агент не может
деплоить каталог (у него доступ только к Redevelopment). Отдельный
репозиторий `anatolytrashman-del/malllist` больше не нужен как источник
деплоя.

| Домен | Vercel-проект | GitHub | Роль |
|---|---|---|---|
| **redevelopment.pro** | текущий (платформа) | Redevelopment | CRM, закупки, объекты, аналитика |
| **officelist.pro** | `officelist` (создать) | тот же Redevelopment | Каталог БЦ / OfficeList |
| **malllist.pro** | `malllist` | тот же Redevelopment | Каталог ТЦ / MallList |

Пути каталогов **не меняем** (`/minsk/bc/...`, `/minsk/tc/...`) — 1:1 для
SEO. Смена path → отдельный заход после стабилизации индекса.

## Как подключить malllist к Redevelopment (один раз)

В Vercel → проект **malllist** → Settings → Git:

1. Disconnect от `anatolytrashman-del/malllist` (если ещё подключён).
2. Connect → `anatolytrashman-del/Redevelopment`.
3. Production Branch — пока рабочая ветка агента
   (`cursor/domain-split-catalogs-5bba`), позже можно сменить на
   `claude/redevelopment-platform-prototype-oodobu` (прод платформы и
   каталога из одного мержа, но **два** деплоя Vercel с разным env).
4. Environment Variables (Production + Preview) уже должны быть:

```
VITE_PUBLIC_SITE=malls
PUBLIC_SITE=malls
```

Плюс `VITE_SUPABASE_*` как на платформе. Framework Preset → Vite,
Output Directory → `dist`.

**Build Command** — достаточно `npm run build:app` (как сейчас): при
`PUBLIC_SITE=malls` в конце сам вызывается пререндер ТЦ + OG
(`malls-prerender-if-needed.mjs`). Алиас `npm run build:malls` = то же
самое. Каталог копируется с эталона на `redevelopment.pro` (~300 КБ HTML),
origin → `malllist.pro`, главная `/` рендерится честно.

Не ставить на malllist полный `npm run build` платформы: там ещё
`record-deployment` и логика прод-платформы.

После этого обычный `git push` в Redevelopment сам запускает деплой
проекта malllist. В `vercel.json` для веток агента включено
`cursor/**` (рядом с `main` / `oodobu` / `preview`).

На **платформенном** проекте, если лишние preview-сборки с `cursor/*`
мешают, в Settings → Git → Ignored Build Step:

```bash
[[ "$VERCEL_GIT_COMMIT_REF" == cursor/* ]] && exit 0; exit 1
```

(exit 0 = пропустить сборку). У проекта malllist этот ignore не ставить.

## Режим деплоя (`PUBLIC_SITE` / `VITE_PUBLIC_SITE`)

Один кодовый базис, разные env на Vercel-проекте:

| Значение | Что отдаёт деплой |
|---|---|
| `platform` (по умолчанию) | полный сайт, как сейчас на redevelopment.pro |
| `malls` | главная `/` (MallList) + `/minsk/tc/*` (+ `/privacy`, `/favorites`); `/minsk` → `/minsk/tc` |
| `offices` | только каталог БЦ; `/` и `/minsk` → `/minsk/bc`; sitemap/OG/бренд OfficeList |

Корень (`/`) для платформы и каталогов ведёт middleware (`middleware.ts`),
не `vercel.json`: иначе на отдельном проекте malllist редирект
`"/" → "/minsk"` из vercel.json перехватывает запрос до Edge и главная
домена уходит в 404.

## Рубильник

Файл `src/data/domain-split.json`:

| Поле | Смысл |
|---|---|
| `"enabled": true` | оба каталога сразу (301 + canonical + sitemap) |
| `"redirects.malls": true` | только ТЦ → malllist.pro (БЦ остаётся на платформе) |
| `"redirects.offices": true` | только БЦ → officelist.pro |

Сейчас: `"redirects.malls": true`, `"redirects.offices": true`.
Оба каталога на своих доменах (301 с платформы, sitemap платформы без
`/minsk/tc` и `/minsk/bc`, счётчики `site=malls|offices`).

Дубликат логики для Node-скриптов: `scripts/domainSplit.mjs`.
Правила редиректа: `src/lib/sites.ts` (`crossDomainRedirect`).

**Не включать редиректы в прод, пока не выполнены шаги ниже для того
каталога, который уезжает.** Иначе 301 поведут на неготовый домен.

### Верификация вебмастеров

В `domain-split.json` → `verifications.*.yandex` + шеллы сборки:

```html
<!-- malllist -->
<meta name="yandex-verification" content="5893ee662c25f112" />
<!-- officelist -->
<meta name="yandex-verification" content="7055f1dec94e1e7e" />
```

Google Search Console — meta/DNS в `verifications.*.google` + шелл, когда
появится токен.

## Чеклист перед включением

### 1. DNS и Vercel

1. Домены: `officelist.pro` (office + list) и `malllist.pro` — куплены.
2. Отдельный Vercel-проект на каждый каталог (как malllist), домен
   подключить к своему проекту. DNS — **ровно** IP/CNAME из карточки
   Domains этого проекта (не обязательно `76.76.21.21`).
3. `www` — либо CNAME на Vercel, либо не заводить, пока не добавлен в проект.
4. Проверка: `curl -I https://officelist.pro/minsk/bc` → 200 на проекте
   с `PUBLIC_SITE=offices` (не `DEPLOYMENT_NOT_FOUND`).

### Как подключить officelist (один раз)

Как malllist, но env:

```
VITE_PUBLIC_SITE=offices
PUBLIC_SITE=offices
```

Build Command: `npm run build:app` (алиас `build:offices`). При
`PUBLIC_SITE=offices` в конце — пререндер БЦ + OG с платформы, бренд
OfficeList (фавикон O), sitemap только `/minsk/bc…`.

### 2. Включение в коде

**malllist** — уже включён (`redirects.malls: true`).

**officelist** — включено (2026-10-10), после READY на Vercel-проекте:

1. `"redirects": { "malls": true, "offices": true }` в `domain-split.json`.
2. Платформа: 301 `/minsk/bc…` → officelist, sitemap без БЦ.
3. Проверки:

```bash
curl -sI 'https://redevelopment.pro/minsk/bc' | head -5          # → 301 officelist
curl -sI 'https://redevelopment.pro/minsk/bc/titan' | head -5
curl -sI 'https://officelist.pro/minsk/bc' | head -5             # → 200
curl -sI 'https://officelist.pro/' | head -5                     # → 307 /minsk/bc
```

4. Вебмастер/GSC: свойство `officelist.pro`, sitemap
   `https://officelist.pro/sitemap.xml` (Change of Address не использовать).
5. IndexNow: `node scripts/indexnow-offices-migration.mjs --from-live`.

**Оба каталога разом:** `"enabled": true` (или оба флага в `redirects`).

### 3. Google Search Console

1. Добавить **доменное** свойство `malllist.pro` (DNS TXT) и дождаться
   статуса Verified / Owner (не «ожидает подтверждения»).
2. Sitemaps → добавить `https://malllist.pro/sitemap.xml`.
3. В `sc-domain:redevelopment.pro` **не** включать Change of Address
   (уходит только часть URL). URL Inspection — выборочно старые
   `/minsk/tc…` («Page with redirect»).
4. OAuth-токен синка (`external_api_tokens` / google_search_console) сейчас
   без scope на Submit sitemap и без Owner на malllist — sitemap в GSC
   для malllist пока только руками в UI (2026-10-10).

### 4. Яндекс.Вебмастер

**malllist** (2026-10-10): сайт подтверждён, sitemap user-added, переобход
хабов + старых URL. Переезд сайта не трогать.

**officelist** (2026-10-10): `https://officelist.pro/` VERIFIED (META_TAG),
sitemap `https://officelist.pro/sitemap.xml` user-added, переобход 111 URL
на officelist + 6 старых `/minsk/bc` на redevelopment. Переезд сайта не
трогать. Главное зеркало — apex без www.

### 5. IndexNow / внутренние пинги

`scripts/notify-indexnow.mjs` — host из `DEPLOYED_SITE_MODE`.
Разовый пинг переезда: `node scripts/indexnow-malls-migration.mjs --from-live`
(2026-10-10: 207 URL, HTTP 200). Ключ `public/<key>.txt` общий.

### 6. Аналитика

- Яндекс.Метрика / GA: отдельные счётчики или один с фильтром по hostname —
  решить при включении.
- Синки `sync-yandex-webmaster` / GSC: завести свойства новых доменов в
  тех же таблицах или отдельные — отдельная задача.

## Карта редиректов (при enabled)

| Откуда (host + path) | Куда |
|---|---|
| `redevelopment.pro/minsk/bc…` | `officelist.pro/minsk/bc…` |
| `redevelopment.pro/minsk/bcminsk…` | `officelist.pro/minsk/bc…` |
| `redevelopment.pro/bc/:slug` | `officelist.pro/minsk/bc/:slug` |
| `redevelopment.pro/minsk/tc…` | `malllist.pro/minsk/tc…` |
| `www.*.pro/…` | apex того же домена |
| `officelist.pro/` | `officelist.pro/minsk/bc` |
| `malllist.pro/` | остаётся главной MallList (без 301 на каталог) |
| чужой path на каталожном домене (не статика) | `redevelopment.pro` + тот же path |

Внутрикаталожные legacy-редиректы (`/minsk/bcminsk/…` → `/minsk/bc/…` в
`vercel.json`) остаются: клиент сначала получает их на платформе, затем
второй запрос уже ловит междоменный 301. При желании позже можно схлопнуть
в один hop правилом в middleware.

## Что остаётся на redevelopment.pro

- `/zakupki` — лендинг модуля закупок (начало платформы сервисов)
- `/admin/*` — CRM
- `/minsk` — хаб города, гиды районов, аналитика рынка
- `/minsk/:slug` — лендинги объектов (Red One и др.)
- токен-страницы `/plan`, `/tz`, `/estimate`, `/summary`
- `/privacy`

Ссылки на каталоги с `/minsk` после включения сплита — абсолютные на
новые домены (`MinskHub`).

## Вне скоупа этого захода

- Отдельные брендинг/дизайн officelist и malllist (шапка, лого, og)
- Укорочение путей (`officelist.pro/titan` вместо `/minsk/bc/titan`)
- Вырезание мёртвого кода CRM из репозитория malllist (пока общий снимок)
- Перенос счётчиков и почтовых ящиков на новые домены
