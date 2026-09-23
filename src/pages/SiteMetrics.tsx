import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { ToggleGroup } from '../components/ui/ToggleGroup';
import { cn } from '../lib/cn';
import {
  fetchMetrikaDailyStats,
  fetchMetrikaTrafficSources,
  fetchMetrikaTopPages,
  fetchMetrikaGoalCompletions,
} from '../lib/metrikaStatsApi';
import type { MetrikaDailyStat, MetrikaTrafficSource, MetrikaTopPage, MetrikaGoalCompletion } from '../data/metrikaStats';
import { fetchYandexWebmasterStats, fetchYandexWebmasterQueries } from '../lib/yandexWebmasterStatsApi';
import type { YandexWebmasterStat, YandexWebmasterQuery } from '../data/yandexWebmasterStats';
import { fetchGoogleSearchConsoleStats, fetchGoogleSearchConsoleQueries } from '../lib/googleSearchConsoleStatsApi';
import type { GoogleSearchConsoleStat, GoogleSearchConsoleQuery } from '../data/googleSearchConsoleStats';
import { fetchSiteBacklinks } from '../lib/siteBacklinksApi';
import type { SiteBacklink } from '../data/siteBacklinks';

// Показатели посещаемости сайта из Яндекс.Метрики (счётчик 111858495) —
// не отчёт по staff-активности (это отдельная /admin/metrics, RequireSuperAdmin,
// не путать), а посещаемость публичной части платформы: гид района, каталог
// БЦ, лендинги объектов и т.д. Данные читаются уже готовыми из 4 таблиц
// Supabase, заполняемых раз в час supabase/functions/sync-yandex-metrika (2026-09-16,
// было раз в сутки) — сам OAuth-токен на этой странице не фигурирует нигде.
//
// "Визиты по дням"/"Достижение целей" — настоящий тренд, можно выбрать
// период (7/30/90 дней), считается из уже загруженных daily/goal рядов на
// клиенте. "Источники трафика"/"Топ страниц" — НЕ разбиты по дням (см.
// комментарий в самом скрипте синка) — это один снимок за окно целиком,
// полностью перезаписываемый каждым синком, выбор периода на них не влияет
// (явно подписано в интерфейсе, не скрыто). Длина окна с 2026-09-15 не
// фиксированные 90 дней, а ровно та история визитов, что накоплена после
// последней очистки (скрипт синка берёт её из yandex_metrika_daily_stats и
// кладёт в колонку window_days) — иначе на странице соседствовали визиты за
// 4 дня и источники за 90.
//
// Блок "Индексация и поисковые запросы" — данные Яндекс.Вебмастера (не
// Метрики), из отдельного синка supabase/functions/sync-yandex-webmaster
// (параллельная сессия, 2026-09-10, тот же OAuth-токен из external_api_
// tokens) — владелец явно попросил показать их на этой же странице, не
// заводить отдельную. impressions/clicks/avgPosition у молодого сайта
// почти наверняка null (сам синк-скрипт это документирует) — компонент
// должен честно показывать "данных пока нет", а не подставлять нули.
//
// Второй такой же блок — "Индексация в Google" (scripts/sync-google-
// search-console-stats.mjs, 2026-09-10) — тот же принцип: отдельный
// try/catch на фетч (нет токена/ещё не подключено — блок просто не
// рендерится, не роняет страницу), pagesIndexed — состояние на сегодня,
// не сумма по дням.
//
// "Проиндексировано страниц" (из Sitemaps.get) — тот же день, живой прогон
// на реальном сайте показал 0, хотя реально уже несколько страниц в
// индексе — известная особенность Google, число из отчёта по sitemap
// считается отдельным, медленным конвейером и может отставать от
// реального индекса на недели (владелец спросил "это правда 0?", проверка
// через URL Inspection API опровергла).
//
// 2026-09-16 — в оба блока добавлена РАЗБИВКА ПО ЗАПРОСАМ (владелец: «очень
// интересно, по каким запросам идут показы и клики»). Данные — снимок за
// окно целиком (yandex_webmaster_queries / google_search_console_queries),
// поэтому переключатель периода 7/30/90 на них НЕ влияет, и это подписано
// в самом блоке фактическими датами окна, как у «Источников трафика».
// Гугловская таблица может быть пустой при ненулевых показах — Google
// скрывает редкие запросы (см. комментарий в data/googleSearchConsoleStats.ts),
// в этом случае показываем причину, а не «данных нет».
//
// Точная проверка по каждой странице (urlInspection.index:inspect,
// google_search_console_page_index) по-прежнему собирается тем же
// sync-скриптом раз в сутки — 2026-09-10 владелец попросил убрать
// соответствующий блок с этой страницы ("не нужен"), данные не удалялись,
// просто больше не выводятся здесь; смотреть напрямую в таблице, если
// понадобится точный статус конкретной страницы.
//
// «Обратные ссылки» (2026-09-17) забираются тем же суточным синком из
// официальной ручки Яндекс.Вебмастера /links/external/samples. У Google
// отчёт Links существует в интерфейсе Search Console, но НЕ входит в
// официальный Search Console API (там только Search Analytics, Sitemaps,
// Sites и URL Inspection). Поэтому Google не подменяем Яндексом и не
// скрейпим недокументированные ручки: показываем честный статус и прямую
// ссылку на штатный отчёт Google.

// 2026-09-13 — по просьбе владельца добавлен период "Вчера" (ровно один
// календарный день, не "последний день из окна") — отдельно от 7/30/90,
// потому что те считают скользящее окно N дней, а "Вчера" должен показывать
// именно вчерашний день без сегодняшнего (у которого сутки ещё не закончились).
// Порядок вариантов задаём явно массивом PERIOD_ORDER, а не полагаемся на
// порядок ключей объекта — числовые ключи (7/30/90) в JS всегда
// перечисляются раньше строковых ('yesterday'), это увело бы "Вчера" в конец
// списка вместо начала.
//
// 2026-09-16 — добавлен период "Сегодня": синк переведён на часовой крон
// (было раз в сутки), так что последняя строка данных внутри текущих суток
// реально успевает обновиться несколько раз, а не только на завтра —
// "Вчера"-only больше не отражал этого. Логика та же, что у "Вчера" —
// последняя строка массива и есть "сегодня" (date2: 'today' в запросе к
// Метрике), сравниваем с предыдущей (вчера).
type Period = 'today' | 'yesterday' | 7 | 30 | 90;
const PERIOD_LABELS: Record<Period, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  7: '7 дней',
  30: '30 дней',
  90: '90 дней',
};
const PERIOD_ORDER: Period[] = ['today', 'yesterday', 7, 30, 90];
const PERIOD_OPTIONS = PERIOD_ORDER.map((p) => PERIOD_LABELS[p]);
const LABEL_TO_PERIOD = Object.fromEntries(
  PERIOD_ORDER.map((p) => [PERIOD_LABELS[p], p]),
) as Record<string, Period>;

// Данные приходят по дням без пропусков (см. supabase/functions/sync-yandex-metrika)
// и последняя строка — всегда "сегодня" (date2: 'today' в запросе к Метрике),
// поэтому "вчера" — предпоследняя строка массива, а не дата, вычисленная
// вручную через часовой пояс (так это остаётся верным независимо от того,
// в каком часовом поясе Метрика считает границу суток).
function sliceCurrentPeriod<T>(data: T[], period: Period): T[] {
  if (period === 'today') return data.length >= 1 ? data.slice(-1) : [];
  if (period === 'yesterday') return data.length >= 2 ? data.slice(-2, -1) : [];
  return data.slice(-period);
}

function slicePreviousPeriod<T>(data: T[], period: Period): T[] {
  if (period === 'today') return data.length >= 2 ? data.slice(-2, -1) : [];
  if (period === 'yesterday') return data.length >= 3 ? data.slice(-3, -2) : [];
  return data.slice(-period * 2, -period);
}

function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} мин ${s} с` : `${s} с`;
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return '—';
  return `${value.toFixed(digits)}%`;
}

function sum(values: (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function average(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return sum(present) / present.length;
}

// Метрика отдаёт ym:s:lastTrafficSource английскими категориями (не
// локализованным текстом, как ожидалось при первой реализации — см. журнал
// docs/session-journal.md 2026-09-10) — переводим на отображении, не трогая сырое
// значение в базе (сравнение/группировка синка остаются по нему). Ключи —
// ровно те категории, что реально документирует Метрика; неизвестное
// значение показывается как есть, не прячется.
const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  'Direct traffic': 'Прямые заходы',
  'Internal traffic': 'Внутренние переходы',
  'Search engine traffic': 'Переходы из поисковых систем',
  'Link traffic': 'Переходы по ссылкам на сайтах',
  'Referral traffic': 'Переходы по ссылкам на сайтах',
  'Social network traffic': 'Переходы из социальных сетей',
  'Recommendation system traffic': 'Переходы из рекомендательных систем',
  'Ad traffic': 'Переходы по рекламе',
  'Messenger traffic': 'Переходы из мессенджеров',
  'Email traffic': 'Переходы с email-рассылок',
  'QR-code traffic': 'Переходы по QR-коду',
  'Not determined': 'Не определено',
  'Other traffic': 'Прочие переходы',
};

function trafficSourceLabel(source: string): string {
  return TRAFFIC_SOURCE_LABELS[source] ?? source;
}

// Понятная подпись строки в "Топ страниц" вместо сырого пути — по известным
// маршрутам из App.tsx, регэкспы под динамические сегменты (:slug/:token и
// т.п.). Хэш (#якорь — попадает в данные только с ПЕРВОЙ загрузки страницы,
// см. index.html — ym('init',{url: location.href}) включает хэш, а
// последующие SPA-хиты в App.tsx — нет) не участвует в сопоставлении
// маршрута, но дописывается к подписи отдельно, чтобы не терять инфу о
// конкретном якоре. Неизвестный путь — возвращается как есть, не гадаем.
function readablePageLabel(fullPath: string): string {
  const hashIndex = fullPath.indexOf('#');
  const base = hashIndex === -1 ? fullPath : fullPath.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : fullPath.slice(hashIndex + 1);
  const label = resolvePageBaseLabel(base);
  return hash ? `${label} · #${hash}` : label;
}

function resolvePageBaseLabel(base: string): string {
  const STATIC_LABELS: Record<string, string> = {
    '/minsk': 'Хаб /minsk (комплексы, гиды, аналитика)',
    '/minsk/analytics': 'Аналитика рынка — хаб',
    '/minsk/analytics/metodika': 'Аналитика — методика',
    '/minsk/analytics/ofisy/arenda': 'Аналитика — офисы (аренда)',
    '/minsk/analytics/ofisy/prodazha': 'Аналитика — офисы (продажа)',
    '/minsk/analytics/torgovye/arenda': 'Аналитика — торговые (аренда)',
    '/minsk/analytics/torgovye/prodazha': 'Аналитика — торговые (продажа)',
    '/minsk/analytics/sklady/arenda': 'Аналитика — склады (аренда)',
    '/minsk/analytics/sklady/prodazha': 'Аналитика — склады (продажа)',
    '/minsk/analytics/mashinomesta/arenda': 'Аналитика — машиноместа (аренда)',
    '/minsk/analytics/mashinomesta/prodazha': 'Аналитика — машиноместа (продажа)',
    '/minsk/analytics/minsk-mir': 'Аналитика — Минск Мир',
    '/minsk/analytics/rajony': 'Аналитика — сравнение районов',
    '/minsk/minsk-mir': 'Гид района — Минск Мир',
    '/minsk/bcminsk': 'Каталог бизнес-центров',
    '/minsk/bcminsk/stroyashchiesya': 'БЦ — строящиеся',
    '/minsk/bcminsk/rating': 'Рейтинг бизнес-центров',
    '/minsk/bcminsk/gid': 'БЦ — справочник по рынку',
    // С 2026-09-23 раздел переехал на /minsk/bc (старые адреса — 301); старые
    // подписи остаются для истории Метрики.
    '/minsk/bc': 'Каталог бизнес-центров',
    '/minsk/bc/new': 'БЦ — строящиеся',
    '/minsk/bc/rating': 'Рейтинг бизнес-центров',
    '/minsk/bc/guide': 'БЦ — справочник по рынку',
    '/minsk/bc/analytics': 'БЦ — аналитика',
    '/rayon-minsk-mir': 'Гид района (старая ссылка)',
    '/business-upload': 'Форма загрузки организаций',
  };
  if (STATIC_LABELS[base]) return STATIC_LABELS[base];

  // Известные объекты — с человеческим названием, остальные лендинги
  // объектов (/minsk/:slug) — общим шаблоном по слагу.
  const KNOWN_OBJECT_LABELS: Record<string, string> = {
    one: 'Лендинг Red One',
    redstorage: 'Лендинг Red Storage',
  };

  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^\/minsk\/minsk-mir\/([^/]+)$/, (m) => `Гид района — тема «${m[1]}»`],
    [/^\/minsk\/bc\/class\/([^/]+)\/district\/([^/]+)$/, (m) => `БЦ — класс «${m[1]}», район «${m[2]}»`],
    [/^\/minsk\/bc\/class\/([^/]+)$/, (m) => `БЦ — класс «${m[1]}»`],
    [/^\/minsk\/bc\/district\/([^/]+)$/, (m) => `БЦ — район «${m[1]}»`],
    [/^\/minsk\/bc\/area\/([^/]+)$/, (m) => `БЦ — микрорайон «${m[1]}»`],
    [/^\/minsk\/bc\/metro\/([^/]+)$/, (m) => `БЦ — метро «${m[1]}»`],
    [/^\/minsk\/bc\/street\/([^/]+)$/, (m) => `БЦ — улица «${m[1]}»`],
    [/^\/minsk\/bc\/rating\/([^/]+)$/, (m) => `БЦ — рейтинг «${m[1]}»`],
    [/^\/minsk\/bc\/([^/]+)$/, (m) => `Бизнес-центр «${m[1]}»`],
    [/^\/minsk\/bcminsk\/class\/([^/]+)\/raion\/([^/]+)$/, (m) => `БЦ — класс «${m[1]}», район «${m[2]}»`],
    [/^\/minsk\/bcminsk\/class\/([^/]+)$/, (m) => `БЦ — класс «${m[1]}»`],
    [/^\/minsk\/bcminsk\/raion\/([^/]+)$/, (m) => `БЦ — район «${m[1]}»`],
    [/^\/minsk\/bcminsk\/microrayon\/([^/]+)$/, (m) => `БЦ — микрорайон «${m[1]}»`],
    [/^\/minsk\/bcminsk\/metro\/([^/]+)$/, (m) => `БЦ — метро «${m[1]}»`],
    [/^\/minsk\/bcminsk\/ulitsa\/([^/]+)$/, (m) => `БЦ — улица «${m[1]}»`],
    [/^\/minsk\/bcminsk\/([^/]+)$/, (m) => `Бизнес-центр «${m[1]}»`],
    [/^\/minsk\/analytics\/([^/]+)$/, (m) => `Аналитика — район «${m[1]}»`],
    [/^\/plan\/[^/]+$/, () => 'Бронирование по ссылке'],
    [/^\/tz\/[^/]+$/, () => 'ТЗ по ссылке'],
    [/^\/summary\/[^/]+$/, () => 'Саммери встречи по ссылке'],
    [/^\/estimate\/[^/]+$/, () => 'Смета по ссылке'],
    [/^\/minsk\/([^/]+)$/, (m) => KNOWN_OBJECT_LABELS[m[1]] ?? `Лендинг «${m[1]}»`],
  ];
  for (const [pattern, build] of patterns) {
    const m = base.match(pattern);
    if (m) return build(m);
  }
  return base;
}

// Окно снимков «Источники трафика»/«Топ страниц» больше не константа 90 —
// скрипт синка считает его от начала накопленной истории визитов (см.
// supabase/functions/sync-yandex-metrika, правка 2026-09-15), так что здесь может
// оказаться и 5, и 1 день — подпись склоняем.
function pluralDays(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}

function pluralPages(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'страниц';
  if (mod10 === 1) return 'страница';
  if (mod10 >= 2 && mod10 <= 4) return 'страницы';
  return 'страниц';
}

const VISIBLE_TOP_PAGES = 5;

// 2026-09-16 — владелец: синк Метрики теперь раз в час, пусть страница сама
// подтягивает свежие цифры, как /admin/metrics (см. REFRESH_INTERVAL_MS там).
// Интервал длиннее минуты намеренно: сам источник (Метрика/Вебмастер/Google)
// не обновляется чаще раза в час, минутный опрос просто дёргал бы Supabase
// без единого шанса увидеть новые данные.
const REFRESH_INTERVAL_MS = 5 * 60_000;

interface ChangeBadgeProps {
  current: number;
  previous: number;
  // Для отказов/времени на сайте рост — не обязательно "хорошо" (зелёный),
  // это не бинарная метрика вроде визитов — оставляем нейтральным цветом,
  // просто показываем направление и величину.
  neutral?: boolean;
}

function ChangeBadge({ current, previous, neutral }: ChangeBadgeProps) {
  if (previous === 0) return null;
  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 0.5) {
    return (
      <Badge tone="neutral">
        <Minus className="h-3 w-3" />
        без изменений
      </Badge>
    );
  }
  const up = diff > 0;
  const tone = neutral ? 'neutral' : up ? 'success' : 'danger';
  return (
    <Badge tone={tone}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {diff.toFixed(0)}%
    </Badge>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  change?: { current: number; previous: number; neutral?: boolean };
}

function KpiTile({ label, value, change }: KpiTileProps) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-3xl font-semibold text-ink">{value}</p>
      {change && <ChangeBadge {...change} />}
    </Card>
  );
}

interface SparkbarsProps {
  data: { date: string; value: number }[];
}

// Один ряд тонких столбиков (магнитуда одной серии — свой акцентный цвет,
// легенда не нужна, заголовок карточки уже называет серию). Подсказка —
// видимая при наведении карточка со значением (не только нативный title,
// который показывается с задержкой и не всегда заметен) — владелец прямо
// попросил, чтобы число было видно при наведении.
function Sparkbars({ data }: SparkbarsProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    // Высота столбика — % от ВЫСОТЫ этого флекс-контейнера (h-24, задана
    // явно): если обернуть столбик ещё одним div без своей высоты, процент
    // не от чего считать (родитель — auto) и столбик схлопывается в 0 —
    // столбик обязан быть САМИМ флекс-элементом, не вложенным в обёртку.
    // Тултип — абсолютно спозиционированный ребёнок ВНУТРИ этого же
    // элемента (не в отдельной обёртке снаружи) — abs-позиционирование
    // вынимает его из потока, на расчёт высоты столбика не влияет.
    <div className="flex h-24 items-end gap-px">
      {data.map((d) => (
        <div
          key={d.date}
          className="group relative flex-1 rounded-t bg-primary/70 transition-colors hover:bg-primary"
          style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
        >
          <span
            className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
            role="tooltip"
          >
            {formatDateShort(d.date)}: {d.value.toLocaleString('ru-RU')}
          </span>
        </div>
      ))}
    </div>
  );
}

// Сколько строк таблицы запросов показываем до нажатия «показать ещё» —
// столько же, сколько в «Топ страниц», чтобы блоки читались одинаково.
const VISIBLE_QUERIES = 10;

type QuerySort = 'impressions' | 'clicks';
const QUERY_SORT_LABELS: Record<QuerySort, string> = {
  impressions: 'По показам',
  clicks: 'По кликам',
};

interface SearchQueryRow {
  query: string;
  impressions: number | null;
  clicks: number | null;
  avgPosition: number | null;
  dateFrom: string | null;
  dateTo: string | null;
}

function pluralQueries(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'запросов';
  if (mod10 === 1) return 'запрос';
  if (mod10 >= 2 && mod10 <= 4) return 'запроса';
  return 'запросов';
}

interface SearchQueriesTableProps {
  title: string;
  queries: SearchQueryRow[];
  emptyText: string;
  // Показываем ПОД итогом таблицы, а не только в emptyText — та ветка рисуется
  // только когда список запросов пуст целиком, а расхождение с плитками выше
  // (Google отдаёт по dimensions=['query'] меньше показов/кликов, чем по
  // dimensions=['date'], из-за анонимизации редких запросов) видно и тогда,
  // когда часть запросов уже показывается — см. sync-google-search-console-stats.mjs.
  note?: string;
}

// Таблица «по каким запросам нас показывают и по каким кликают». Сортировка
// переключается вручную не для красоты: клики у молодого сайта единичны, и
// при сортировке по показам запросы С КЛИКАМИ (самое ценное, что тут есть)
// оказываются в хвосте — по умолчанию открываем по показам, но переключить
// на клики можно в один тык.
function SearchQueriesTable({ title, queries, emptyText, note }: SearchQueriesTableProps) {
  const [sort, setSort] = useState<QuerySort>('impressions');
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    const primary = (q: SearchQueryRow) => (sort === 'clicks' ? q.clicks : q.impressions) ?? 0;
    const secondary = (q: SearchQueryRow) => (sort === 'clicks' ? q.impressions : q.clicks) ?? 0;
    return [...queries].sort((a, b) => primary(b) - primary(a) || secondary(b) - secondary(a));
  }, [queries, sort]);

  if (queries.length === 0) {
    return (
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <p className="text-sm text-ink-muted">{emptyText}</p>
      </div>
    );
  }

  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_QUERIES);
  const maxValue = Math.max(1, ...sorted.map((q) => ((sort === 'clicks' ? q.clicks : q.impressions) ?? 0)));
  const totalImpressions = sum(sorted.map((q) => q.impressions));
  const totalClicks = sum(sorted.map((q) => q.clicks));
  // Окно у всех строк снимка одно и то же (его ставит синк), берём из первой.
  const { dateFrom, dateTo } = sorted[0];

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-ink">{title}</h4>
          <p className="text-xs text-ink-muted">
            {dateFrom && dateTo
              ? `${sorted.length} ${pluralQueries(sorted.length)} за ${formatDateShort(dateFrom)} — ${formatDateShort(dateTo)}`
              : `${sorted.length} ${pluralQueries(sorted.length)}`}
            {' · '}
            {totalImpressions.toLocaleString('ru-RU')} показов, {totalClicks.toLocaleString('ru-RU')} кликов
            {' · '}не зависит от выбранного периода выше
          </p>
          {note && <p className="mt-1 text-xs text-ink-muted">{note}</p>}
        </div>
        <ToggleGroup
          label="Сортировка"
          options={[QUERY_SORT_LABELS.impressions, QUERY_SORT_LABELS.clicks]}
          value={QUERY_SORT_LABELS[sort]}
          onChange={(label) => setSort(label === QUERY_SORT_LABELS.clicks ? 'clicks' : 'impressions')}
        />
      </div>

      <div className="flex flex-col divide-y divide-border">
        <div className="flex items-center gap-3 pb-1 text-xs text-ink-muted">
          <span className="flex-1">Запрос</span>
          <span className="w-16 shrink-0 text-right">Показы</span>
          <span className="w-14 shrink-0 text-right">Клики</span>
          <span className="w-16 shrink-0 text-right">Позиция</span>
        </div>
        {visible.map((q) => (
          <div key={q.query} className="relative flex items-center gap-3 py-2 text-sm">
            <div
              className="absolute inset-y-0 left-0 -z-10 rounded bg-primary/10"
              style={{ width: `${(((sort === 'clicks' ? q.clicks : q.impressions) ?? 0) / maxValue) * 100}%` }}
            />
            <span className="flex-1 truncate text-ink" title={q.query}>
              {q.query}
            </span>
            <span className="w-16 shrink-0 text-right text-ink-muted">
              {q.impressions !== null ? q.impressions.toLocaleString('ru-RU') : '—'}
            </span>
            <span className={cn('w-14 shrink-0 text-right', q.clicks ? 'font-semibold text-ink' : 'text-ink-muted')}>
              {q.clicks !== null ? q.clicks.toLocaleString('ru-RU') : '—'}
            </span>
            <span className="w-16 shrink-0 text-right text-ink-muted">
              {q.avgPosition !== null ? q.avgPosition.toFixed(1) : '—'}
            </span>
          </div>
        ))}
      </div>

      {sorted.length > VISIBLE_QUERIES && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-sm text-primary-hover hover:underline"
        >
          {expanded
            ? 'Свернуть'
            : `Показать ещё ${sorted.length - VISIBLE_QUERIES} ${pluralQueries(sorted.length - VISIBLE_QUERIES)}`}
        </button>
      )}
    </div>
  );
}

const VISIBLE_BACKLINKS = 10;
const GOOGLE_LINKS_REPORT_URL =
  'https://search.google.com/search-console/links?resource_id=sc-domain%3Aredevelopment.pro';

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function backlinkSourceLabel(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${host}${path}`;
  } catch {
    return value;
  }
}

function backlinkDestinationLabel(value: string): string {
  try {
    const url = new URL(value);
    return readablePageLabel(url.pathname + url.hash);
  } catch {
    return value;
  }
}

function backlinkDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function formatBacklinkDate(value: string | null): string {
  return value ? formatDateShort(value) : '—';
}

interface BacklinksCardProps {
  backlinks: SiteBacklink[];
}

function BacklinksCard({ backlinks }: BacklinksCardProps) {
  const [expanded, setExpanded] = useState(false);
  const yandexLinks = useMemo(
    () => backlinks.filter((link) => link.provider === 'yandex_webmaster'),
    [backlinks],
  );
  const googleLinks = useMemo(
    () => backlinks.filter((link) => link.provider === 'google_search_console'),
    [backlinks],
  );
  const visible = expanded ? yandexLinks : yandexLinks.slice(0, VISIBLE_BACKLINKS);
  const referringDomains = new Set(yandexLinks.map((link) => backlinkDomain(link.sourceUrl))).size;
  const targetPages = new Set(yandexLinks.map((link) => link.destinationUrl)).size;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Обратные ссылки</h3>
        <p className="text-xs text-ink-muted">
          Кто ссылается на страницы redevelopment.pro и куда ведут ссылки. Снимок Яндекс.Вебмастера обновляется раз в сутки.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Ссылок нашёл Яндекс" value={yandexLinks.length.toLocaleString('ru-RU')} />
        <KpiTile label="Ссылающихся доменов" value={referringDomains.toLocaleString('ru-RU')} />
        <KpiTile label="Наших страниц со ссылками" value={targetPages.toLocaleString('ru-RU')} />
      </div>

      {yandexLinks.length > 0 ? (
        <div className="flex flex-col divide-y divide-border">
          <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 pb-1 text-xs text-ink-muted sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_7rem]">
            <span>Откуда</span>
            <span className="hidden sm:block">Куда</span>
            <span className="text-right">Обнаружена</span>
          </div>
          {visible.map((link) => {
            const sourceHref = safeHttpUrl(link.sourceUrl);
            const destinationHref = safeHttpUrl(link.destinationUrl);
            return (
              <div
                key={link.linkKey}
                className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 py-2 text-sm sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_7rem]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Badge tone="neutral">Яндекс</Badge>
                  {sourceHref ? (
                    <a
                      className="flex min-w-0 items-center gap-1 text-ink hover:text-primary-hover hover:underline"
                      href={sourceHref}
                      target="_blank"
                      rel="noreferrer"
                      title={link.sourceUrl}
                    >
                      <span className="truncate">{backlinkSourceLabel(link.sourceUrl)}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="truncate text-ink" title={link.sourceUrl}>{link.sourceUrl}</span>
                  )}
                </div>
                <div className="hidden min-w-0 sm:block">
                  {destinationHref ? (
                    <a
                      className="flex min-w-0 items-center gap-1 text-ink-muted hover:text-primary-hover hover:underline"
                      href={destinationHref}
                      target="_blank"
                      rel="noreferrer"
                      title={link.destinationUrl}
                    >
                      <span className="truncate">{backlinkDestinationLabel(link.destinationUrl)}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="truncate text-ink-muted" title={link.destinationUrl}>{link.destinationUrl}</span>
                  )}
                </div>
                <span className="text-right text-xs text-ink-muted" title={`Последний обход: ${formatBacklinkDate(link.sourceLastAccessDate)}`}>
                  {formatBacklinkDate(link.discoveryDate)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          Яндекс пока не нашёл внешних ссылок либо новый снимок ещё не успел пройти первый суточный синк.
        </p>
      )}

      {yandexLinks.length > VISIBLE_BACKLINKS && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="self-start text-sm text-primary-hover hover:underline"
        >
          {expanded ? 'Свернуть' : `Показать ещё ${yandexLinks.length - VISIBLE_BACKLINKS} ссылок`}
        </button>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge tone="neutral">Google</Badge>
            <span className="text-sm font-medium text-ink">
              {googleLinks.length > 0 ? `${googleLinks.length.toLocaleString('ru-RU')} ссылок` : 'только в отчёте Search Console'}
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            Официальный Search Console API не отдаёт отчёт Links, поэтому автоматически забрать его без ручного экспорта нельзя.
          </p>
        </div>
        <a
          className="inline-flex items-center gap-1 text-sm text-primary-hover hover:underline"
          href={GOOGLE_LINKS_REPORT_URL}
          target="_blank"
          rel="noreferrer"
        >
          Открыть ссылки в Google
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </Card>
  );
}

interface TrendCardProps {
  title: string;
  data: MetrikaDailyStat[];
  valueOf: (d: MetrikaDailyStat) => number;
}

function TrendCard({ title, data, valueOf }: TrendCardProps) {
  const bars = data.map((d) => ({ date: d.date, value: valueOf(d) }));
  const first = data[0]?.date;
  const last = data[data.length - 1]?.date;
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <Sparkbars data={bars} />
      {first && last && (
        <div className="flex justify-between text-xs text-ink-muted">
          <span>{formatDateShort(first)}</span>
          <span>{formatDateShort(last)}</span>
        </div>
      )}
    </Card>
  );
}

export function SiteMetrics() {
  const [dailyStats, setDailyStats] = useState<MetrikaDailyStat[] | null>(null);
  const [trafficSources, setTrafficSources] = useState<MetrikaTrafficSource[] | null>(null);
  const [topPages, setTopPages] = useState<MetrikaTopPage[] | null>(null);
  const [goalCompletions, setGoalCompletions] = useState<MetrikaGoalCompletion[] | null>(null);
  const [webmasterStats, setWebmasterStats] = useState<YandexWebmasterStat[] | null>(null);
  const [googleStats, setGoogleStats] = useState<GoogleSearchConsoleStat[] | null>(null);
  const [webmasterQueries, setWebmasterQueries] = useState<YandexWebmasterQuery[]>([]);
  const [googleQueries, setGoogleQueries] = useState<GoogleSearchConsoleQuery[]>([]);
  const [backlinks, setBacklinks] = useState<SiteBacklink[] | null>(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>(30);
  const [topPagesExpanded, setTopPagesExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const inFlight = useRef(false);

  // Тот же паттерн, что на /admin/metrics: фоновый тик не сбрасывает уже
  // показанные цифры (никакого мигания "Загрузка…" на автообновлении) —
  // ошибка тоже не затирает старые данные, только показывается строкой
  // сверху, пока следующий тик не подтянет данные успешно.
  const load = useCallback(async () => {
    if (inFlight.current) return; // предыдущий тик ещё идёт — не копим параллельные запросы
    inFlight.current = true;
    setRefreshing(true);
    try {
      const [daily, traffic, pages, goals, webmaster, google, webmasterQ, googleQ, backlinkRows] = await Promise.all([
        fetchMetrikaDailyStats(),
        fetchMetrikaTrafficSources(),
        fetchMetrikaTopPages(),
        fetchMetrikaGoalCompletions(),
        // Отдельный try/catch на каждый источник поисковой индексации: если
        // синк ещё ни разу не прошёл, упал, или сервис ещё не подключён
        // (Google), это не должно ронять всю страницу — её главный предмет
        // всё равно Метрика.
        fetchYandexWebmasterStats().catch(() => []),
        fetchGoogleSearchConsoleStats().catch(() => []),
        fetchYandexWebmasterQueries().catch(() => []),
        fetchGoogleSearchConsoleQueries().catch(() => []),
        fetchSiteBacklinks().catch(() => []),
      ]);
      setDailyStats(daily);
      setTrafficSources(traffic);
      setTopPages(pages);
      setGoalCompletions(goals);
      setWebmasterStats(webmaster);
      setGoogleStats(google);
      setWebmasterQueries(webmasterQ);
      setGoogleQueries(googleQ);
      setBacklinks(backlinkRows);
      setLastCheckedAt(new Date());
      setError('');
    } catch {
      setError('Не удалось загрузить показатели.');
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Пока вкладка скрыта, базу не дёргаем — вместо этого обновляемся сразу
    // при возврате, чтобы первый же взгляд на страницу видел свежие данные.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  const loading = dailyStats === null || trafficSources === null || topPages === null || goalCompletions === null;

  const currentPeriod = useMemo(() => sliceCurrentPeriod(dailyStats ?? [], period), [dailyStats, period]);
  const previousPeriod = useMemo(() => slicePreviousPeriod(dailyStats ?? [], period), [dailyStats, period]);

  const currentGoals = useMemo(() => sliceCurrentPeriod(goalCompletions ?? [], period), [goalCompletions, period]);
  const previousGoals = useMemo(
    () => slicePreviousPeriod(goalCompletions ?? [], period),
    [goalCompletions, period],
  );

  // Какие КАЛЕНДАРНЫЕ дни реально показаны. Периоды нарезаются по строкам
  // массива, а не по датам (см. sliceCurrentPeriod), и строки приходят
  // только за дни, где был хоть один визит — поэтому "Сегодня" молча
  // показывал вчерашний день, если за сегодня визитов ещё не было или синк
  // не успел отработать (владелец поймал 2026-09-16: карточки — за 15-е,
  // подпись — "Сегодня"). Даты здесь берём из самих данных, без вычисления
  // "сегодня" в часовом поясе счётчика: подпись остаётся верной в любом
  // часовом поясе, а расхождение с Метрикой сразу видно глазами.
  const periodDatesLabel = useMemo(() => {
    if (currentPeriod.length === 0) return null;
    const first = currentPeriod[0].date;
    const last = currentPeriod[currentPeriod.length - 1].date;
    return first === last ? `за ${formatDateShort(first)}` : `${formatDateShort(first)} — ${formatDateShort(last)}`;
  }, [currentPeriod]);

  const currentWebmaster = useMemo(() => sliceCurrentPeriod(webmasterStats ?? [], period), [webmasterStats, period]);
  // "Страниц в поиске" — не сумма по дням (это счётчик состояния, не
  // событие), берём последнее известное значение в периоде.
  const latestPagesInSearch = useMemo(() => {
    for (let i = currentWebmaster.length - 1; i >= 0; i--) {
      const v = currentWebmaster[i].pagesInSearch;
      if (v !== null) return v;
    }
    return null;
  }, [currentWebmaster]);
  const hasSearchQueryData = currentWebmaster.some((d) => d.impressions !== null || d.clicks !== null);

  const currentGoogle = useMemo(() => sliceCurrentPeriod(googleStats ?? [], period), [googleStats, period]);
  const latestGoogleCoverage = useMemo(() => {
    for (let i = currentGoogle.length - 1; i >= 0; i--) {
      const d = currentGoogle[i];
      if (d.pagesIndexed !== null || d.pagesSubmitted !== null) return d;
    }
    return null;
  }, [currentGoogle]);
  const hasGoogleQueryData = currentGoogle.some((d) => d.impressions !== null || d.clicks !== null);

  const maxUpdatedAt = useMemo(() => {
    const dates = (trafficSources ?? []).map((s) => s.updatedAt);
    if (dates.length === 0) return null;
    return dates.reduce((a, b) => (a > b ? a : b));
  }, [trafficSources]);

  const maxTrafficVisits = Math.max(1, ...(trafficSources ?? []).map((s) => s.visits));
  const maxTopPageviews = Math.max(1, ...(topPages ?? []).map((p) => p.pageviews));
  const totalTrafficVisits = sum((trafficSources ?? []).map((s) => s.visits));

  return (
    <>
      <PageHeader title="Показатели" />

      {error && <p className="text-sm text-danger">{error}</p>}

      {loading && !error && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      )}

      {!loading && dailyStats!.length === 0 && (
        <Card className="text-sm text-ink-muted">
          Данные ещё не собраны — первый синк со статистикой Яндекс.Метрики придёт по расписанию (раз в час) либо
          после ручного запуска воркфлоу «Sync Yandex Metrika stats» на GitHub Actions (он дёргает ту же Edge Function).
        </Card>
      )}

      {!loading && dailyStats!.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              label="Период"
              options={PERIOD_OPTIONS}
              value={PERIOD_LABELS[period]}
              onChange={(label) => setPeriod(LABEL_TO_PERIOD[label])}
            />
            <div className="flex flex-col items-end gap-1 text-xs text-ink-muted">
              {periodDatesLabel && <p className="font-semibold text-ink">Данные {periodDatesLabel}</p>}
              {maxUpdatedAt && (
                <p>
                  Данные синка: {new Date(maxUpdatedAt).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              <span className="inline-flex items-center gap-1">
                <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
                {lastCheckedAt
                  ? `проверено в ${lastCheckedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · автоматически раз в 5 минут`
                  : 'проверка…'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiTile
              label="Визиты"
              value={sum(currentPeriod.map((d) => d.visits)).toLocaleString('ru-RU')}
              change={{ current: sum(currentPeriod.map((d) => d.visits)), previous: sum(previousPeriod.map((d) => d.visits)) }}
            />
            <KpiTile
              label="Посетители"
              value={sum(currentPeriod.map((d) => d.users)).toLocaleString('ru-RU')}
              change={{ current: sum(currentPeriod.map((d) => d.users)), previous: sum(previousPeriod.map((d) => d.users)) }}
            />
            <KpiTile
              label="Просмотры страниц"
              value={sum(currentPeriod.map((d) => d.pageviews)).toLocaleString('ru-RU')}
              change={{
                current: sum(currentPeriod.map((d) => d.pageviews)),
                previous: sum(previousPeriod.map((d) => d.pageviews)),
              }}
            />
            <KpiTile
              label="Отказы"
              value={formatPercent(average(currentPeriod.map((d) => d.bounceRate)))}
              change={
                previousPeriod.length > 0
                  ? {
                      current: average(currentPeriod.map((d) => d.bounceRate)) ?? 0,
                      previous: average(previousPeriod.map((d) => d.bounceRate)) ?? 0,
                      neutral: true,
                    }
                  : undefined
              }
            />
            <KpiTile
              label="Глубина просмотра"
              value={(average(currentPeriod.map((d) => d.pageDepth)) ?? 0).toFixed(1)}
              change={
                previousPeriod.length > 0
                  ? {
                      current: average(currentPeriod.map((d) => d.pageDepth)) ?? 0,
                      previous: average(previousPeriod.map((d) => d.pageDepth)) ?? 0,
                      neutral: true,
                    }
                  : undefined
              }
            />
            <KpiTile
              label="Время на сайте"
              value={formatDuration(average(currentPeriod.map((d) => d.avgDurationSeconds)))}
              change={
                previousPeriod.length > 0
                  ? {
                      current: average(currentPeriod.map((d) => d.avgDurationSeconds)) ?? 0,
                      previous: average(previousPeriod.map((d) => d.avgDurationSeconds)) ?? 0,
                      neutral: true,
                    }
                  : undefined
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TrendCard title="Визиты по дням" data={currentPeriod} valueOf={(d) => d.visits} />
            <TrendCard title="Посетители по дням" data={currentPeriod} valueOf={(d) => d.users} />
            <TrendCard title="Просмотры по дням" data={currentPeriod} valueOf={(d) => d.pageviews} />
          </div>

          {currentGoals.length > 0 && (
            <Card className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">Достижение целей — бронирование кабинета</h3>
                <div className="flex items-center gap-3 text-sm text-ink-muted">
                  <span>
                    <strong className="text-ink">{sum(currentGoals.map((g) => g.reaches)).toLocaleString('ru-RU')}</strong> достижений
                  </span>
                  {previousGoals.length > 0 && (
                    <ChangeBadge
                      current={sum(currentGoals.map((g) => g.reaches))}
                      previous={sum(previousGoals.map((g) => g.reaches))}
                    />
                  )}
                </div>
              </div>
              <Sparkbars data={currentGoals.map((g) => ({ date: g.date, value: g.reaches }))} />
            </Card>
          )}
          {currentGoals.length === 0 && (
            <Card className="text-sm text-ink-muted">
              Цель «бронирование кабинета» пока не найдена в данных — либо ещё не было ни одной брони за выбранный
              период, либо цель ещё не завершила первый синк.
            </Card>
          )}

          {currentWebmaster.length > 0 && (
            <Card className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Индексация и поисковые запросы (Яндекс.Вебмастер)</h3>
                <p className="text-xs text-ink-muted">Не путать с трафиком выше — это данные о видимости в поиске Яндекса, не о посетителях.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile label="Страниц в поиске" value={latestPagesInSearch !== null ? latestPagesInSearch.toLocaleString('ru-RU') : '—'} />
                {hasSearchQueryData ? (
                  <>
                    <KpiTile label="Показы в поиске" value={sum(currentWebmaster.map((d) => d.impressions)).toLocaleString('ru-RU')} />
                    <KpiTile label="Клики из поиска" value={sum(currentWebmaster.map((d) => d.clicks)).toLocaleString('ru-RU')} />
                    <KpiTile label="Средняя позиция" value={(average(currentWebmaster.map((d) => d.avgPosition)) ?? 0).toFixed(1)} />
                  </>
                ) : (
                  <div className="flex items-center sm:col-span-3">
                    <p className="text-sm text-ink-muted">
                      Данных по показам/кликам пока нет — сайт ещё молодой в поиске Яндекса, либо запросов слишком мало,
                      чтобы Вебмастер их показал.
                    </p>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs text-ink-muted">Страниц в поиске по дням</p>
                <Sparkbars
                  data={currentWebmaster
                    .filter((d) => d.pagesInSearch !== null)
                    .map((d) => ({ date: d.date, value: d.pagesInSearch as number }))}
                />
              </div>
              {hasSearchQueryData && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs text-ink-muted">Показы в поиске по дням</p>
                    <Sparkbars
                      data={currentWebmaster
                        .filter((d) => d.impressions !== null)
                        .map((d) => ({ date: d.date, value: d.impressions as number }))}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-ink-muted">Клики из поиска по дням</p>
                    <Sparkbars
                      data={currentWebmaster
                        .filter((d) => d.clicks !== null)
                        .map((d) => ({ date: d.date, value: d.clicks as number }))}
                    />
                  </div>
                </div>
              )}
              <SearchQueriesTable
                title="По каким запросам показывают в Яндексе"
                queries={webmasterQueries}
                emptyText="Разбивка по запросам появится после ближайшего суточного синка Вебмастера — сами показы и клики выше уже посчитаны."
              />
            </Card>
          )}

          {currentGoogle.length > 0 && (
            <Card className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Индексация в Google (Search Console)</h3>
                <p className="text-xs text-ink-muted">
                  «Проиндексировано» — по данным Sitemap в Search Console, не по всем URL сайта, а по тем, что перечислены
                  в sitemap.xml.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile
                  label="Проиндексировано страниц"
                  value={
                    latestGoogleCoverage?.pagesIndexed !== null && latestGoogleCoverage?.pagesIndexed !== undefined
                      ? latestGoogleCoverage.pagesIndexed.toLocaleString('ru-RU')
                      : '—'
                  }
                />
                <KpiTile
                  label="Отправлено в sitemap"
                  value={
                    latestGoogleCoverage?.pagesSubmitted !== null && latestGoogleCoverage?.pagesSubmitted !== undefined
                      ? latestGoogleCoverage.pagesSubmitted.toLocaleString('ru-RU')
                      : '—'
                  }
                />
                {hasGoogleQueryData ? (
                  <>
                    <KpiTile label="Показы в поиске" value={sum(currentGoogle.map((d) => d.impressions)).toLocaleString('ru-RU')} />
                    <KpiTile label="Клики из поиска" value={sum(currentGoogle.map((d) => d.clicks)).toLocaleString('ru-RU')} />
                  </>
                ) : (
                  <div className="flex items-center sm:col-span-2">
                    <p className="text-sm text-ink-muted">
                      Данных по показам/кликам пока нет — сайт ещё молодой в поиске Google, либо запросов слишком мало.
                    </p>
                  </div>
                )}
              </div>
              {hasGoogleQueryData && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs text-ink-muted">Показы в поиске по дням</p>
                    <Sparkbars
                      data={currentGoogle
                        .filter((d) => d.impressions !== null)
                        .map((d) => ({ date: d.date, value: d.impressions as number }))}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-ink-muted">Клики из поиска по дням</p>
                    <Sparkbars
                      data={currentGoogle
                        .filter((d) => d.clicks !== null)
                        .map((d) => ({ date: d.date, value: d.clicks as number }))}
                    />
                  </div>
                </div>
              )}
              <SearchQueriesTable
                title="По каким запросам показывают в Google"
                queries={googleQueries}
                emptyText={
                  hasGoogleQueryData
                    ? 'Google не раскрывает сами запросы, пока их задают единицы людей («анонимизированные запросы») — показы и клики выше он при этом считает. Список появится сам, когда запросов станет больше.'
                    : 'Показов из Google пока нет — как только они появятся, здесь будут сами запросы.'
                }
                note="Сумма показов/кликов здесь обычно МЕНЬШЕ плиток выше — Google скрывает сами формулировки редких («анонимизированных») запросов, но в общий счёт показов/кликов наверху их всё равно включает. Это не рассинхрон в данных."
              />
              <p className="text-xs text-ink-muted">
                «Проиндексировано страниц» считается по отдельному, медленному отчёту Google и может отставать от
                реального индекса на недели — реальный статус страницы может быть точнее, чем показывает эта цифра.
              </p>
            </Card>
          )}
          {webmasterStats !== null && googleStats !== null && currentWebmaster.length > 0 && currentGoogle.length === 0 && (
            <Card className="text-sm text-ink-muted">
              Google Search Console пока не подключён — данные по индексации в Google появятся здесь, как только
              владелец пройдёт разовую авторизацию (см. scripts/get-google-search-console-refresh-token.mjs).
            </Card>
          )}

          {backlinks !== null && <BacklinksCard backlinks={backlinks} />}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Источники трафика</h3>
                <p className="text-xs text-ink-muted">
                  {(() => {
                    const days = trafficSources?.[0]?.windowDays ?? 90;
                    return `За последние ${days} ${pluralDays(days)} — не зависит от выбранного периода выше.`;
                  })()}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {(trafficSources ?? []).map((s) => (
                  <div key={s.source} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink">{trafficSourceLabel(s.source)}</span>
                      <span className="text-ink-muted">
                        {s.visits.toLocaleString('ru-RU')}
                        {totalTrafficVisits > 0 && (
                          <span className="ml-1 text-xs">({((s.visits / totalTrafficVisits) * 100).toFixed(0)}%)</span>
                        )}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(s.visits / maxTrafficVisits) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
                {(trafficSources ?? []).length === 0 && (
                  <p className="text-sm text-ink-muted">Пока нет данных по источникам.</p>
                )}
              </div>
            </Card>

            <Card className="flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Топ страниц</h3>
                <p className="text-xs text-ink-muted">
                  {(() => {
                    const days = topPages?.[0]?.windowDays ?? 90;
                    return `За последние ${days} ${pluralDays(days)} — не зависит от выбранного периода выше.`;
                  })()}
                </p>
              </div>
              <div className="flex flex-col divide-y divide-border">
                {(topPagesExpanded ? (topPages ?? []) : (topPages ?? []).slice(0, VISIBLE_TOP_PAGES)).map((p) => (
                  <div key={p.path} className="relative flex items-center justify-between gap-3 py-2 text-sm">
                    <div
                      className="absolute inset-y-0 left-0 -z-10 rounded bg-primary/10"
                      style={{ width: `${(p.pageviews / maxTopPageviews) * 100}%` }}
                    />
                    <span className="truncate text-ink" title={p.path}>
                      {readablePageLabel(p.path)}
                    </span>
                    <span className="shrink-0 font-medium text-ink">{p.pageviews.toLocaleString('ru-RU')}</span>
                  </div>
                ))}
                {(topPages ?? []).length === 0 && <p className="text-sm text-ink-muted">Пока нет данных по страницам.</p>}
              </div>
              {(topPages ?? []).length > VISIBLE_TOP_PAGES && (
                <button
                  type="button"
                  onClick={() => setTopPagesExpanded((v) => !v)}
                  className="self-start text-sm text-primary-hover hover:underline"
                >
                  {topPagesExpanded
                    ? 'Свернуть'
                    : `Показать ещё ${(topPages ?? []).length - VISIBLE_TOP_PAGES} ${pluralPages((topPages ?? []).length - VISIBLE_TOP_PAGES)}`}
                </button>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
