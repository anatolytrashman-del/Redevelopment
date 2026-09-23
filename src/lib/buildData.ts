// Данные раздела БЦ, положенные в сборку (scripts/generate-catalog-data.mjs).
//
// 2026-09-23 Supabase закрыл проект за трафик (402 на любой REST-запрос), и
// владелец попросил, чтобы публичные страницы раздела работали вовсе без
// обращений к базе: «сама инфа про БЦ меня устраивает, вопрос чисто
// оптимизации». Так и устроено: файлы сборки — ОСНОВНОЙ источник для
// публичных страниц, база — запасной путь, только если файла нет (новое
// здание, добавленное после сборки, или сборка без этих файлов). Это не
// только про аварию: отдавать одинаковые для всех посетителей данные с CDN
// дешевле и быстрее, чем каждым заходом ходить в базу, — трафик базы и
// закрыл проект.
//
// Свежесть — ровесник пререндер-снапшота (пересборка раз в час, см.
// CLAUDE.md), то есть ровно то, что и так видит поисковик в разметке.
//
// Админка (/admin/*) этих файлов не читает никогда: там правят данные, и
// показывать надо живую базу, а не снимок часовой давности.

const cache = new Map<string, Promise<unknown>>();
// Уже разобранные файлы — для синхронного чтения в первом рендере
// (peekBuildData). Промис из cache тут не поможет: useState-инициализатор
// не умеет ждать, а первый кадр React обязан совпасть с пререндер-снапшотом,
// где эти данные уже нарисованы (иначе блок пропадёт и появится снова —
// CLS 0,33 на десктопе карточки, замер 2026-09-23).
const resolved = new Map<string, unknown>();

function remember(file: string, pending: Promise<unknown>): Promise<unknown> {
  const tracked = pending.then((value) => {
    if (value) resolved.set(file, value);
    return value;
  });
  cache.set(file, tracked);
  return tracked;
}

function isPublicPage(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location?.pathname;
  return typeof path === 'string' && !path.startsWith('/admin');
}

// Файл качается один раз за жизнь вкладки — повторный вызов (другая
// страница раздела при SPA-переходе, второй блок той же карточки) берёт
// тот же промис. null — файла нет или он не JSON: на неизвестный путь
// SPA-фолбэк Vercel отвечает index.html с кодом 200, и r.json() на нём
// падает — это тоже «нет данных», а не ошибка.
export function loadBuildData<T>(file: string): Promise<T | null> {
  if (!isPublicPage()) return Promise.resolve(null);
  const pending =
    cache.get(file) ??
    remember(
      file,
      fetch(`/data/${file}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  return pending as Promise<T | null>;
}

// Файл, который уже пришёл, — синхронно; не пришёл — null.
export function peekBuildData<T>(file: string): T | null {
  return isPublicPage() ? ((resolved.get(file) as T | undefined) ?? null) : null;
}

// Промис, начатый инлайн-скриптом index.html, становится записью кеша —
// чтобы функции загрузки не качали тот же файл второй раз.
export function seedBuildData(file: string, pending: Promise<unknown>): Promise<unknown> {
  return cache.get(file) ?? remember(file, pending.catch(() => null));
}

// Общие наборы раздела — см. writeExtras в scripts/generate-catalog-data.mjs.
// Ряды лежат в том виде, в каком их отдаёт PostgREST, поэтому функции в
// *Api.ts пропускают их через те же мапперы, что и ответ базы.
export interface BcMarketFile {
  marketSnapshots: Record<string, unknown[]>;
  externalMetrics: Record<string, unknown[]>;
  lotSizes: { business_center_slug: string; size: number }[];
}

export interface BcAnalyticsFile {
  offerSlices: unknown[];
  tenantCity: unknown[];
}

export interface BcExtraFile {
  offers: unknown[];
  reviews: unknown[];
  nearby: unknown[];
  gis2: unknown | null;
  tenants: unknown | null;
}

export const loadBcMarket = () => loadBuildData<BcMarketFile>('bc-market.json');
export const loadBcAnalytics = () => loadBuildData<BcAnalyticsFile>('bc-analytics.json');
export const loadBcSources = () => loadBuildData<{ rows: unknown[] }>('bc-sources.json');
export const bcExtraFile = (slug: string) => `bc/${encodeURIComponent(slug)}.extra.json`;
export const loadBcExtra = (slug: string) => loadBuildData<BcExtraFile>(bcExtraFile(slug));
export const peekBcExtra = (slug: string) => peekBuildData<BcExtraFile>(bcExtraFile(slug));
export const peekBcMarket = () => peekBuildData<BcMarketFile>('bc-market.json');
