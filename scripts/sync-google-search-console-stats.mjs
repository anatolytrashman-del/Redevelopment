// Раз в сутки (см. .github/workflows/sync-google-search-console-stats.yml)
// забирает у Google Search Console индексацию сайта (сколько URL из
// sitemap.xml реально проиндексировано) и статистику по поисковым
// запросам (показы/клики/позиция) — сохраняет в
// public.google_search_console_stats, одна строка на календарный день, плюс
// разбивку тех же показов/кликов ПО ЗАПРОСАМ — снимком за окно в
// public.google_search_console_queries (2026-09-16, см. fetchQueryBreakdown).
// Ровно тот же принцип, что и у scripts/sync-yandex-webmaster-stats.mjs —
// источник данных для блока "Индексация в Google" на странице "Показатели"
// (владелец, 2026-09-10: "подключим гугл консоль в таком же формате").
//
// В отличие от Яндекса, у Google OAuth-токен — это refresh token, который
// нужно обменивать на короткоживущий access token перед каждым вызовом
// (client_id/client_secret/refresh_token — все три читаются из
// external_api_tokens, service='google_search_console'; получены владельцем
// разовым локальным запуском scripts/get-google-search-console-refresh-token.mjs,
// см. комментарий там же).
//
// "Отправлено в sitemap" — из Sitemaps.get (contents[].submitted).
// "Проиндексировано" — НЕ оттуда: contents[].indexed Google объявил
// устаревшим, и он всегда 0 (2026-09-28). Число считается по URL Inspection
// API — статус каждой страницы из sitemap.xml лежит в
// google_search_console_page_index, см. syncPageIndex ниже.
//
// siteUrl (свойство Search Console) не хардкодится — вычисляется через
// sites.list на лету, найденное свойство может быть либо URL-префиксом
// ("https://redevelopment.pro/"), либо доменным свойством
// ("sc-domain:redevelopment.pro") — сверяем оба формата по домену.
//
// 2026-09-10 проверялись только ключевые хабы и лендинги объектов
// (KEY_PAGE_PATHS + objects.landing_slug), потому что «0» из Sitemaps.get
// сочли отставанием отчёта. С 2026-09-28 проверяется весь sitemap.xml:
// уже проиндексированные страницы не перепроверяются вовсе, остальные — не
// чаще раза в сутки (квота urlInspection — 2000 запросов в сутки). Одна
// инспекция — один HTTP-запрос, провал одной страницы остальным не мешает.

import { createClient } from '@supabase/supabase-js';
import { newCatalogPath } from './legacyCatalogUrls.mjs';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const SEARCH_CONSOLE_API = 'https://www.googleapis.com/webmasters/v3';
const SEARCH_CONSOLE_INSPECTION_API = 'https://searchconsole.googleapis.com/v1';
const TARGET_DOMAIN = 'redevelopment.pro';
const SITE_ORIGIN = 'https://redevelopment.pro';
const SITEMAP_PATH = 'https://redevelopment.pro/sitemap.xml';

// Куратированный список ключевых страниц для точной проверки — тот же
// принцип отбора, что уже применялся при переобходе Яндекса тем же днём
// ("хабы, не единичные карточки БЦ/объектов"): хаб-страницы, приводящие ко
// всему остальному через внутренние ссылки, важнее сотен листовых страниц.
const KEY_PAGE_PATHS = [
  'minsk',
  'minsk/minsk-mir',
  'minsk/analytics',
  'minsk/analytics/metodika',
  'minsk/analytics/minsk-mir',
  'minsk/analytics/rajony',
  'minsk/analytics/ofisy/arenda',
  'minsk/analytics/torgovye/arenda',
  'minsk/analytics/sklady/arenda',
  'minsk/analytics/mashinomesta/arenda',
  'minsk/bc',
  'minsk/bc/rating',
  'minsk/bc/guide',
  'minsk/bc/new',
  'minsk/bc/analytics',
  // Каталог ТЦ (открыт 2026-09-30): хабы важнее листовых /store/* —
  // приоритет urlInspection после чистки sitemap (2026-10-07).
  'minsk/tc',
  'minsk/tc/rating',
  'minsk/tc/rating/largest',
];

// Сколько дней истории запросов подтягивать за один прогон — у Search
// Console данные приходят с лагом 2-3 дня, запас с лихвой не портит.
const QUERY_HISTORY_DAYS = 30;

// Окно снимка разбивки ПО ЗАПРОСАМ (не по дням) — шире, чем история выше:
// запросы у молодого сайта единичные, за 30 дней список был бы почти пустым.
const QUERY_BREAKDOWN_DAYS = 90;
const QUERY_BREAKDOWN_LIMIT = 500;

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Не задана переменная окружения SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchCredentials() {
  const { data, error } = await supabase
    .from('external_api_tokens')
    .select('access_token, client_id, client_secret')
    .eq('service', 'google_search_console')
    .single();
  if (error) throw new Error(`Не удалось прочитать токен Google из external_api_tokens: ${error.message}`);
  if (!data?.access_token || !data?.client_id || !data?.client_secret) {
    throw new Error('В external_api_tokens нет полного набора (access_token/client_id/client_secret) для service=google_search_console');
  }
  return { refreshToken: data.access_token, clientId: data.client_id, clientSecret: data.client_secret };
}

async function getAccessToken({ refreshToken, clientId, clientSecret }) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) {
    throw new Error(`Не удалось обменять refresh token Google на access token: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.access_token;
}

async function searchConsoleFetch(accessToken, path, options = {}) {
  const res = await fetch(`${SEARCH_CONSOLE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Search Console ${path} вернул ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function resolveSiteUrl(accessToken) {
  const { siteEntry } = await searchConsoleFetch(accessToken, '/sites');
  const sites = siteEntry ?? [];
  const match = sites.find((s) => s.siteUrl?.includes(TARGET_DOMAIN));
  if (!match) {
    throw new Error(
      `В аккаунте Search Console не нашлось свойства для ${TARGET_DOMAIN} — сначала добавьте и подтвердите сайт на search.google.com/search-console`,
    );
  }
  return match.siteUrl;
}

async function fetchSitemapCoverage(accessToken, siteUrl) {
  const path = `/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(SITEMAP_PATH)}`;
  const sitemap = await searchConsoleFetch(accessToken, path);
  const contents = sitemap.contents ?? [];
  // Суммируем по всем типам контента (обычно один — "web") — на случай,
  // если Google когда-нибудь разложит по нескольким типам сразу.
  // contents[].indexed не берём: Google объявил поле устаревшим и отдаёт в
  // нём 0 всегда, а не «с отставанием» (2026-09-28 владелец увидел в
  // админке «Проиндексировано: 0» при 2,8 тыс. показов). Число
  // проиндексированных считает syncPageIndex по каждой странице.
  const submitted = contents.reduce((acc, c) => acc + Number(c.submitted ?? 0), 0);
  return { submitted };
}

// Все URL из живого sitemap.xml — в том же виде, что и KEY_PAGE_PATHS
// (путь без домена и ведущего слэша).
async function fetchSitemapPaths() {
  const res = await fetch(SITEMAP_PATH);
  if (!res.ok) throw new Error(`sitemap.xml вернул ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => m[1])
    .filter((url) => url.startsWith(SITE_ORIGIN))
    .map((url) => url.slice(SITE_ORIGIN.length).replace(/^\/+|\/+$/g, ''));
}

async function fetchQueryHistory(accessToken, siteUrl) {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - QUERY_HISTORY_DAYS);

  const body = {
    startDate: isoDate(dateFrom),
    endDate: isoDate(dateTo),
    dimensions: ['date'],
    rowLimit: 1000,
    // По умолчанию API отдаёт только окончательные данные — это минус 2–3 дня
    // от сегодня, тогда как интерфейс Search Console показывает и свежие
    // предварительные. 'all' даёт то же, что видно в интерфейсе; цифры
    // последних дней потом уточняются, и следующий синк их перезапишет.
    dataState: 'all',
  };

  const path = `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const { rows } = await searchConsoleFetch(accessToken, path, { method: 'POST', body: JSON.stringify(body) });

  const byDate = new Map();
  for (const row of rows ?? []) {
    const date = row.keys?.[0];
    if (!date) continue;
    byDate.set(date, { impressions: row.impressions ?? null, clicks: row.clicks ?? null, position: row.position ?? null });
  }
  return byDate;
}

// Разбивка показов/кликов ПО ЗАПРОСАМ — тот же searchAnalytics, но
// dimensions=['query'] вместо ['date']: суммы за окно целиком, снимок, а не
// история (у Google есть и разбивка «запрос × день», но для сайта с
// единицами показов это строки по 1 показу — смотреть нечего).
//
// ВАЖНО: пустой ответ здесь — норма, а не поломка. Google не показывает
// «анонимизированные» запросы (редкие, задаваемые единицами людей), и пока
// сайт молодой, под этот фильтр попадают ВСЕ запросы: живая проверка
// 2026-09-16 на нашем свойстве — dimensions=['page'] отдаёт 5 страниц с 25
// показами и 1 кликом, dimensions=['query'] за тот же период — 0 строк.
// Поэтому страница «Показатели» в этом случае должна объяснять причину, а
// не показывать «данных нет» рядом с ненулевыми показами. У Яндекса такого
// фильтра нет — там все 60 запросов отдаются как есть.
async function fetchQueryBreakdown(accessToken, siteUrl) {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - QUERY_BREAKDOWN_DAYS);

  const body = {
    startDate: isoDate(dateFrom),
    endDate: isoDate(dateTo),
    dimensions: ['query'],
    rowLimit: QUERY_BREAKDOWN_LIMIT,
  };

  const path = `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const { rows } = await searchConsoleFetch(accessToken, path, { method: 'POST', body: JSON.stringify(body) });

  const stamp = new Date().toISOString();
  return (rows ?? [])
    .map((row) => ({
      query: row.keys?.[0],
      impressions: row.impressions ?? null,
      clicks: row.clicks ?? null,
      ctr: row.ctr ?? null,
      avg_position: row.position ?? null,
      date_from: isoDate(dateFrom),
      date_to: isoDate(dateTo),
      updated_at: stamp,
    }))
    .filter((row) => typeof row.query === 'string' && row.query.trim() !== '');
}

// Разбивка по СТРАНИЦАМ (2026-09-29). По запросам Google прячет редкие
// формулировки, и владелец видел 6 кликов в таблице при 49 в плитке; по
// страницам такой фильтрации нет. Старые адреса каталога (/minsk/bcminsk/…)
// сводятся к новым, чтобы одна страница не делилась на две строки.
async function fetchPageBreakdown(accessToken, siteUrl) {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - QUERY_BREAKDOWN_DAYS);

  const path = `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const { rows } = await searchConsoleFetch(accessToken, path, {
    method: 'POST',
    body: JSON.stringify({
      startDate: isoDate(dateFrom),
      endDate: isoDate(dateTo),
      dimensions: ['page'],
      rowLimit: QUERY_BREAKDOWN_LIMIT,
    }),
  });

  const merged = new Map();
  for (const row of rows ?? []) {
    let page;
    try {
      page = new URL(row.keys?.[0]).pathname.replace(/\/+$/, '') || '/';
    } catch {
      continue;
    }
    const legacy = page.match(/^\/minsk\/bcminsk(\/.*)?$/);
    if (legacy) page = newCatalogPath((legacy[1] ?? '').split('/'));
    const acc = merged.get(page) ?? { impressions: 0, clicks: 0, positionWeight: 0 };
    acc.impressions += row.impressions ?? 0;
    acc.clicks += row.clicks ?? 0;
    // Средняя позиция при слиянии — взвешенная по показам.
    acc.positionWeight += (row.position ?? 0) * (row.impressions ?? 0);
    merged.set(page, acc);
  }

  const stamp = new Date().toISOString();
  return [...merged.entries()].map(([page, acc]) => ({
    page,
    impressions: acc.impressions,
    clicks: acc.clicks,
    ctr: acc.impressions ? acc.clicks / acc.impressions : null,
    avg_position: acc.impressions ? acc.positionWeight / acc.impressions : null,
    date_from: isoDate(dateFrom),
    date_to: isoDate(dateTo),
    updated_at: stamp,
  }));
}

async function fetchLandingPagePaths() {
  const { data, error } = await supabase.from('objects').select('landing_slug').not('landing_slug', 'is', null);
  if (error) throw new Error(`Не удалось прочитать objects.landing_slug: ${error.message}`);
  return (data ?? [])
    .map((r) => r.landing_slug)
    .filter((slug) => typeof slug === 'string' && slug.trim() !== '')
    .map((slug) => `minsk/${slug}`);
}

async function inspectUrl(accessToken, siteUrl, path) {
  const inspectionUrl = `${SITE_ORIGIN}/${path}`;
  const res = await fetch(`${SEARCH_CONSOLE_INSPECTION_API}/urlInspection/index:inspect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl, siteUrl }),
    // Без таймаута один зависший ответ Google стопорит весь прогон.
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`urlInspection для ${path} вернул ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const result = body.inspectionResult?.indexStatusResult ?? {};
  return {
    path,
    verdict: result.verdict ?? null,
    coverage_state: result.coverageState ?? null,
    last_crawl_time: result.lastCrawlTime ?? null,
    checked_at: new Date().toISOString(),
  };
}

// Владелец, 2026-09-10, сразу после первого живого прогона: "если страница
// уже в поиске, во второй раз гонять скрипт не надо — просто прогоняй новые
// страницы на предмет попадания в выдачу". "В индексе" — стабильный
// результат (Google не выкидывает страницу из индекса просто так), поэтому
// уже подтверждённые ("Submitted and indexed") пропускаем на последующих
// прогонах — экономим квоту urlInspection и время. Перепроверяем только те,
// что ещё НЕ в индексе (могли появиться в поиске с прошлого прогона) и
// новые (появившиеся в KEY_PAGE_PATHS/landingPaths после прошлого раза).
// Статусы URL Inspection, при которых страница в индексе.
const INDEXED_STATES = ['Submitted and indexed', 'Indexed, not submitted in sitemap'];

// Страницу не в индексе перепроверяем не чаще раза в сутки: синк дёргают
// и крон, и плановая проверка каждые три часа, а квота urlInspection —
// 2000 запросов в сутки на свойство, при 250+ страницах её легко выбрать.
const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;

async function fetchPageIndexState() {
  const { data, error } = await supabase.from('google_search_console_page_index').select('path, coverage_state, checked_at');
  if (error) throw new Error(`Не удалось прочитать google_search_console_page_index: ${error.message}`);
  return new Map((data ?? []).map((r) => [r.path, r]));
}

// Возвращает число проиндексированных страниц из sitemap.xml (или null,
// если sitemap прочитать не удалось) — это и есть «Проиндексировано
// страниц» в админке.
async function syncPageIndex(accessToken, siteUrl) {
  const [landingPaths, sitemapPaths] = await Promise.all([
    fetchLandingPagePaths(),
    fetchSitemapPaths().catch((err) => {
      console.error('Не удалось прочитать sitemap.xml:', err.message ?? err);
      return null;
    }),
  ]);
  const allPaths = [...new Set([...KEY_PAGE_PATHS, ...landingPaths, ...(sitemapPaths ?? [])])];
  const known = await fetchPageIndexState();
  const now = Date.now();
  const paths = allPaths.filter((p) => {
    const row = known.get(p);
    if (!row) return true;
    if (INDEXED_STATES.includes(row.coverage_state)) return false;
    return now - new Date(row.checked_at).getTime() > RECHECK_AFTER_MS;
  });

  const countIndexed = () =>
    sitemapPaths === null ? null : sitemapPaths.filter((p) => INDEXED_STATES.includes(known.get(p)?.coverage_state)).length;

  if (paths.length === 0) {
    console.log(`Все ${allPaths.length} страниц проверены недавно или уже в индексе — новых проверок не требуется.`);
    return countIndexed();
  }
  console.log(`Проверяю ${paths.length} из ${allPaths.length} страниц.`);

  const rows = [];
  for (const path of paths) {
    try {
      // eslint-disable-next-line no-await-in-loop
      rows.push(await inspectUrl(accessToken, siteUrl, path));
    } catch (err) {
      console.error(`Не удалось проверить ${path}:`, err.message ?? err);
    }
  }

  if (rows.length === 0) {
    console.log('Ни одну страницу не удалось проверить — пропускаю запись в google_search_console_page_index.');
    return countIndexed();
  }
  for (const r of rows) known.set(r.path, r);

  const newlyIndexed = rows.filter((r) => INDEXED_STATES.includes(r.coverage_state)).length;
  console.log(
    `Проверено ${rows.length} страниц, из них ${newlyIndexed} в индексе. Из sitemap в индексе: ${countIndexed() ?? '—'} из ${sitemapPaths?.length ?? '—'}.`,
  );

  if (DRY_RUN) {
    console.log('[dry-run] Записал бы в google_search_console_page_index:');
    console.log(JSON.stringify(rows, null, 2));
    return countIndexed();
  }

  const { error } = await supabase.from('google_search_console_page_index').upsert(rows, { onConflict: 'path' });
  if (error) throw error;
  return countIndexed();
}

async function main() {
  const credentials = await fetchCredentials();
  const accessToken = await getAccessToken(credentials);
  const siteUrl = await resolveSiteUrl(accessToken);
  console.log(`Свойство Search Console: ${siteUrl}`);

  const [coverage, queryByDate, queryBreakdown, pageBreakdown] = await Promise.all([
    fetchSitemapCoverage(accessToken, siteUrl),
    fetchQueryHistory(accessToken, siteUrl),
    fetchQueryBreakdown(accessToken, siteUrl),
    fetchPageBreakdown(accessToken, siteUrl).catch((err) => {
      console.error('Разбивка по страницам не удалась:', err.message ?? err);
      return [];
    }),
  ]);
  console.log(
    `Sitemap: submitted=${coverage.submitted}. ` +
      `Запросы: ${queryByDate.size} дней с данными, ${queryBreakdown.length} запросов в разбивке.`,
  );

  const today = isoDate(new Date());
  const rows = [...queryByDate.entries()].map(([date, q]) => ({
    date,
    // Покрытие sitemap — состояние на СЕГОДНЯ (Google не отдаёт его историю
    // по дням), пишем его только в сегодняшнюю строку, у остальных дат —
    // null (страница показывает "последнее известное значение", как и у
    // аналогичного показателя Яндекса). pages_indexed здесь не пишется
    // вовсе — его дописывает проверка страниц в конце, а upsert без этого
    // поля не затирает прошлое значение.
    pages_submitted: date === today ? coverage.submitted : null,
    impressions: q.impressions,
    clicks: q.clicks,
    avg_position: q.position,
    updated_at: new Date().toISOString(),
  }));

  // Если сегодняшнего дня нет среди дат с данными по запросам (свежий день
  // ещё не обработан Search Console) — всё равно записываем отдельной
  // строкой хотя бы покрытие sitemap, не теряем его.
  if (!rows.some((r) => r.date === today)) {
    rows.push({
      date: today,
      pages_submitted: coverage.submitted,
      impressions: null,
      clicks: null,
      avg_position: null,
      updated_at: new Date().toISOString(),
    });
  }

  if (rows.length === 0) {
    console.log('Нет данных для сохранения.');
  } else if (DRY_RUN) {
    console.log('[dry-run] Записал бы в google_search_console_stats:');
    console.log(JSON.stringify(rows, null, 2));
  } else {
    const { error } = await supabase.from('google_search_console_stats').upsert(rows, { onConflict: 'date' });
    if (error) throw error;
    console.log(`Сохранено ${rows.length} записей в google_search_console_stats.`);
  }

  // Снимок разбивки по запросам — целиком перезаписывается: upsert всех
  // строк одним временем, затем удаление всего, что этот прогон не принёс.
  // Пустой ответ (анонимизация Google, см. fetchQueryBreakdown) НЕ чистит
  // таблицу: иначе один день без данных стирал бы уже показанную владельцу
  // картину.
  if (queryBreakdown.length === 0) {
    console.log('Разбивка по запросам пуста — Google анонимизирует редкие запросы; прошлый снимок оставлен как есть.');
  } else if (DRY_RUN) {
    console.log('[dry-run] Записал бы в google_search_console_queries:');
    console.log(JSON.stringify(queryBreakdown, null, 2));
  } else {
    const stamp = queryBreakdown[0].updated_at;
    const { error: upsertError } = await supabase
      .from('google_search_console_queries')
      .upsert(queryBreakdown, { onConflict: 'query' });
    if (upsertError) throw upsertError;
    const { error: deleteError } = await supabase
      .from('google_search_console_queries')
      .delete()
      .lt('updated_at', stamp);
    if (deleteError) throw deleteError;
    console.log(`Сохранено ${queryBreakdown.length} запросов в google_search_console_queries.`);
  }

  // Снимок по страницам — так же, как по запросам: upsert, затем удаление
  // того, чего этот прогон не принёс. Пустой ответ прошлый снимок не трогает.
  if (pageBreakdown.length === 0) {
    console.log('Разбивка по страницам пуста — прошлый снимок оставлен как есть.');
  } else if (DRY_RUN) {
    console.log('[dry-run] Записал бы в google_search_console_pages:');
    console.log(JSON.stringify(pageBreakdown, null, 2));
  } else {
    const stamp = pageBreakdown[0].updated_at;
    const { error: upsertError } = await supabase
      .from('google_search_console_pages')
      .upsert(pageBreakdown, { onConflict: 'page' });
    if (upsertError) throw upsertError;
    const { error: deleteError } = await supabase
      .from('google_search_console_pages')
      .delete()
      .lt('updated_at', stamp);
    if (deleteError) throw deleteError;
    console.log(`Сохранено ${pageBreakdown.length} страниц в google_search_console_pages.`);
  }

  // Проверка страниц — последним шагом: она самая долгая (до сотни-другой
  // запросов), а показы и клики выше не должны её ждать. Её итог дописывается
  // в сегодняшнюю строку как pages_indexed; упала — остаётся null («—» в
  // админке), а не 0.
  let pagesIndexed = null;
  try {
    pagesIndexed = await syncPageIndex(accessToken, siteUrl);
  } catch (err) {
    console.error('Проверка страниц не удалась:', err.message ?? err);
  }
  if (pagesIndexed !== null && !DRY_RUN) {
    const { error } = await supabase
      .from('google_search_console_stats')
      .update({ pages_indexed: pagesIndexed })
      .eq('date', today);
    if (error) throw error;
    console.log(`Проиндексировано страниц из sitemap: ${pagesIndexed}.`);
  }

  // Generative AI (AI Overviews / AI Mode). В UI GSC отчёт есть с 2026-06,
  // но searchAnalytics.query type для AI на 2026-10-07 ещё отвергает.
  // Пробуем на каждом прогоне — как только Google откроет enum, данные
  // потекут сами; до тех пор владелец грузит CSV в /admin/site-metrics.
  try {
    await syncGenerativeAiIfAvailable(accessToken, siteUrl);
  } catch (err) {
    console.error('Generative AI синк не удался:', err.message ?? err);
  }
}

// Кандидаты type — на день проверки API ни один не принимался. Оставляем
// список, чтобы не править код, когда Google добавит значение.
const GENERATIVE_AI_TYPE_CANDIDATES = ['generativeAi', 'aiOverview', 'aiMode', 'GENERATIVE_AI', 'AI_OVERVIEW', 'AI_MODE'];

async function syncGenerativeAiIfAvailable(accessToken, siteUrl) {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - QUERY_BREAKDOWN_DAYS);
  const path = `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  let workingType = null;
  let dailyRows = null;

  for (const type of GENERATIVE_AI_TYPE_CANDIDATES) {
    try {
      const { rows } = await searchConsoleFetch(accessToken, path, {
        method: 'POST',
        body: JSON.stringify({
          startDate: isoDate(dateFrom),
          endDate: isoDate(dateTo),
          dimensions: ['date'],
          type,
          rowLimit: 1000,
          dataState: 'all',
        }),
      });
      workingType = type;
      dailyRows = rows ?? [];
      break;
    } catch (err) {
      const msg = String(err.message ?? err);
      if (msg.includes('400') || msg.includes('Invalid value')) continue;
      throw err;
    }
  }

  if (!workingType) {
    console.log(
      'Generative AI в Search Analytics API пока недоступен (type не принят) — оставляем CSV-загрузку в админке.',
    );
    return;
  }

  console.log(`Generative AI API заработал с type=${workingType}, строк по дням: ${dailyRows.length}.`);
  const stamp = new Date().toISOString();
  const stats = dailyRows
    .map((row) => ({
      date: row.keys?.[0],
      impressions: row.impressions ?? null,
      source: `api:${workingType}`,
      updated_at: stamp,
    }))
    .filter((r) => typeof r.date === 'string');

  if (stats.length && !DRY_RUN) {
    const { error } = await supabase.from('google_search_console_ai_stats').upsert(stats, { onConflict: 'date' });
    if (error) throw error;
  }

  const { rows: pageRows } = await searchConsoleFetch(accessToken, path, {
    method: 'POST',
    body: JSON.stringify({
      startDate: isoDate(dateFrom),
      endDate: isoDate(dateTo),
      dimensions: ['page'],
      type: workingType,
      rowLimit: QUERY_BREAKDOWN_LIMIT,
      dataState: 'all',
    }),
  });
  const pages = [];
  for (const row of pageRows ?? []) {
    let page;
    try {
      page = new URL(row.keys?.[0]).pathname.replace(/\/+$/, '') || '/';
    } catch {
      continue;
    }
    pages.push({
      page,
      impressions: row.impressions ?? null,
      date_from: isoDate(dateFrom),
      date_to: isoDate(dateTo),
      updated_at: stamp,
    });
  }
  if (pages.length && !DRY_RUN) {
    const del = await supabase.from('google_search_console_ai_pages').delete().gte('impressions', 0);
    if (del.error) throw del.error;
    const { error } = await supabase.from('google_search_console_ai_pages').insert(pages);
    if (error) throw error;
  }
  console.log(`Generative AI: сохранено ${stats.length} дней и ${pages.length} страниц.`);
}

main().catch((err) => {
  console.error('Синхронизация не удалась:', err);
  process.exit(1);
});
