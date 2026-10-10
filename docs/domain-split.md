# Разнос проектов по доменам

Решение владельца (2026-10-10, уточнение в тот же день): **три отдельных
Vercel-проекта и три GitHub-репозитория**, не алиасы на одном проекте.

| Домен | Vercel / GitHub | Роль | Было на redevelopment.pro |
|---|---|---|---|
| **redevelopment.pro** | текущий Redevelopment | Платформа (CRM, закупки `/zakupki`, объекты, аналитика) | всё |
| **offiselist.pro** | отдельный проект (позже) | Каталог БЦ | `/minsk/bc/*`, `/minsk/bcminsk/*`, `/bc/:slug` |
| **malllist.pro** | `malllist` ← `anatolytrashman-del/malllist` | Каталог ТЦ | `/minsk/tc/*` |

Пути каталогов **не меняем** (`/minsk/bc/...`, `/minsk/tc/...`) — 1:1 для
SEO. Смена path → отдельный заход после стабилизации индекса.

## Режим деплоя (`PUBLIC_SITE` / `VITE_PUBLIC_SITE`)

Один кодовый базис, разные env на Vercel-проекте:

| Значение | Что отдаёт деплой |
|---|---|
| `platform` (по умолчанию) | полный сайт, как сейчас на redevelopment.pro |
| `malls` | только `/minsk/tc/*` (+ `/privacy`, `/favorites`), `/` → `/minsk/tc` |
| `offices` | (заготовка) только каталог БЦ |

Для **malllist** в Vercel → Settings → Environment Variables (Production +
Preview):

```
VITE_PUBLIC_SITE=malls
PUBLIC_SITE=malls
```

Плюс те же Supabase/прочие ключи, что на платформе (хотя бы
`VITE_SUPABASE_*`). После сохранения — Redeploy.

В `vercel.json` автодеплой включён для ветки `main` (нужно отдельным
проектам каталогов). На платформе Production Branch остаётся
`claude/redevelopment-platform-prototype-oodobu`.

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
curl -sI 'https://malllist.pro/' | head -5     # → /minsk/tc
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
| `malllist.pro/` | `malllist.pro/minsk/tc` |
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
