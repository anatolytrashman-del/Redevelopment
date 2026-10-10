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
| **offiselist.pro** | отдельный (позже) | тот же Redevelopment | Каталог БЦ |
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

**Build Command** проекта malllist (не дефолтный `npm run build`):

```
npm run build:malls
```

Это `build:app` + пререндер + OG: каталог ТЦ копируется с эталона на
`redevelopment.pro` (те же LCP/HTML ~300 КБ), origin переписывается на
`malllist.pro`, главная `/` рендерится честно (у платформы другой корень).
Обычный `npm run build` на malllist тоже сработает, но `build:malls`
явно фиксирует пайплайн каталога и не зовёт `record-deployment`
платформы.

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
| `offices` | (заготовка) только каталог БЦ; `/` и `/minsk` → `/minsk/bc` |

Корень (`/`) для платформы и каталогов ведёт middleware (`middleware.ts`),
не `vercel.json`: иначе на отдельном проекте malllist редирект
`"/" → "/minsk"` из vercel.json перехватывает запрос до Edge и главная
домена уходит в 404.

## Рубильник

Файл `src/data/domain-split.json`, поле `"enabled"`:

- `false` (сейчас) — каталоги живут на redevelopment.pro как раньше;
  canonical, sitemap, внутренние ссылки без изменений для поисковиков.
- `true` — включаются:
  - 301 в `middleware.ts` с платформы на каталожные домены;
  - `catalogSiteUrl()` / canonical / JSON-LD на новые origin;
  - раздельные `sitemap.xml` (платформа / offices / malls);
  - host-aware `robots.txt`.

Дубликат логики для Node-скриптов: `scripts/domainSplit.mjs`.
Правила редиректа: `src/lib/sites.ts` (`crossDomainRedirect`).

**Не включать `enabled: true` в прод, пока не выполнены шаги ниже.**
Иначе 301 поведут на мёртвые домены и сольют уже набранный индекс.

## Чеклист перед включением

### 1. DNS и Vercel

1. Зарегистрировать `offiselist.pro` и `malllist.pro` (имя с одной `f` —
   осознанный бренд, не опечатка `office`).
2. В Vercel → проект redevelopment → Domains добавить:
   - `offiselist.pro`, `www.offiselist.pro`
   - `malllist.pro`, `www.malllist.pro`
3. У регистратора — DNS как скажет Vercel (обычно A/`76.76.21.21` или
   nameservers Vercel). Дождаться SSL `Valid`.
4. Проверка: `curl -I https://offiselist.pro/minsk/bc` отдаёт 200
   (пока `enabled: false` — тот же контент, что на платформе).

### 2. Включение в коде

1. В `src/data/domain-split.json` поставить `"enabled": true`.
2. Собрать: `npm run build:app` — в логе должны появиться
   `sitemap-offices.xml` и `sitemap-malls.xml`.
3. Закоммитить, смёржить в прод, дождаться `READY`.
4. Проверки 301 (должен быть `301: 301` и `location` на новый домен):

```bash
curl -sI 'https://redevelopment.pro/minsk/bc' | head -5
curl -sI 'https://redevelopment.pro/minsk/bc/titan' | head -5
curl -sI 'https://redevelopment.pro/minsk/tc' | head -5
curl -sI 'https://redevelopment.pro/bc/titan' | head -5
curl -sI 'https://offiselist.pro/' | head -5   # → /minsk/bc
curl -sI 'https://malllist.pro/' | head -5     # → 200 главная MallList
```

5. Canonical на карточке: в HTML `offiselist.pro`, не `redevelopment.pro`.
6. `https://offiselist.pro/sitemap.xml` и `https://malllist.pro/sitemap.xml`
   отдают каталожные URL; `https://redevelopment.pro/sitemap.xml` — без
   `/minsk/bc` и `/minsk/tc`.

### 3. Google Search Console

1. Добавить **доменные** свойства `offiselist.pro` и `malllist.pro`
   (DNS-подтверждение).
2. Отправить sitemap:
   - `https://offiselist.pro/sitemap.xml`
   - `https://malllist.pro/sitemap.xml`
3. В старом свойстве `sc-domain:redevelopment.pro`:
   - Settings → **Change of Address** — только если уводите *весь* домен.
     Здесь уводим **часть** URL, Change of Address не подходит.
   - Вместо этого: 301 уже делают работу; в URL Inspection выборочно
     проверить старые URL («Page with redirect»).
4. Обновить ссылки в Search Console / любых внешних отчётах.

### 4. Яндекс.Вебмастер

1. Добавить сайты `offiselist.pro` и `malllist.pro`, подтвердить DNS/meta.
2. Индексирование → Файлы Sitemap — добавить sitemap каждого домена.
3. **Переезд сайта** в Вебмастере — только для полного переезда домена.
   Для частичного: достаточно 301 + новые sitemap; в «Переобход страниц»
   можно кинуть главные хабы каталога на старых URL, чтобы быстрее
   подхватили редиректы.
4. Главное зеркало: apex без www (www уже 301 в `vercel.json` +
   middleware).

### 5. IndexNow / внутренние пинги

После включения обновить `scripts/notify-indexnow.mjs` и
`scripts/indexnow-submit.mjs`, чтобы пинговать URL всех трёх host
(ключ `public/<key>.txt` уже общий на проекте). Пока сплит выключен —
пингуется только redevelopment.pro, как раньше.

### 6. Аналитика

- Яндекс.Метрика / GA: отдельные счётчики или один с фильтром по hostname —
  решить при включении.
- Синки `sync-yandex-webmaster` / GSC: завести свойства новых доменов в
  тех же таблицах или отдельные — отдельная задача.

## Карта редиректов (при enabled)

| Откуда (host + path) | Куда |
|---|---|
| `redevelopment.pro/minsk/bc…` | `offiselist.pro/minsk/bc…` |
| `redevelopment.pro/minsk/bcminsk…` | `offiselist.pro/minsk/bc…` |
| `redevelopment.pro/bc/:slug` | `offiselist.pro/minsk/bc/:slug` |
| `redevelopment.pro/minsk/tc…` | `malllist.pro/minsk/tc…` |
| `www.*.pro/…` | apex того же домена |
| `offiselist.pro/` | `offiselist.pro/minsk/bc` |
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

- Отдельные брендинг/дизайн offiselist и malllist (шапка, лого, og)
- Укорочение путей (`offiselist.pro/titan` вместо `/minsk/bc/titan`)
- Вырезание мёртвого кода CRM из репозитория malllist (пока общий снимок)
- Перенос счётчиков и почтовых ящиков на новые домены
