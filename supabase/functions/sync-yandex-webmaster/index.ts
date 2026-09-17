// Синк Яндекс.Вебмастера — Supabase Edge Function, крон раз в сутки (pg_cron).
// Забирает историю индексирования (сколько страниц сайта реально в поиске) и
// статистику по поисковым запросам (показы/клики/позиция) и внешние ссылки —
// сохраняет в public.yandex_webmaster_stats / yandex_webmaster_queries /
// site_backlinks. Источник данных для поисковых блоков страницы «Показатели».
//
// 2026-09-16 — переехало из scripts/sync-yandex-webmaster-stats.mjs (GitHub
// Actions) сюда, вместе с синком Метрики; причины и контекст — в шапке
// supabase/functions/sync-yandex-metrika/index.ts. Раз в сутки, а не в час:
// у Вебмастера на стороне Яндекса лаг в несколько суток, чаще спрашивать
// нечего.
//
// OAuth-токен НЕ секрет окружения — лежит в public.external_api_tokens
// (service='yandex', тот же токен, что у Метрики), читаем сервисной ролью
// перед вызовом API. Токен привязан к аккаунту, где домен redevelopment.pro
// подтверждён в Вебмастере; user_id/host_id вычисляются на лету через
// /v4/user/ и /v4/user/{id}/hosts, не хардкодятся.
//
// ВАЖНО, дважды выстрелившее место. (1) Индикаторы показов/кликов у
// /search-queries/all/history запрашиваются параметром `query_indicator`
// (повторяется столько раз, сколько индикаторов нужно), а НЕ `indicators` —
// `indicators` это имя поля в ОТВЕТЕ. Неизвестный параметр Вебмастер молча
// игнорирует: HTTP 200, `{"indicators":{}}`, ошибки нет, скрипт честно кладёт
// NULL. Из-за этого блок показов/кликов с 2026-09-10 неделю показывал
// «данных пока нет», а комментарий в коде объяснял это тем, что «сайт
// молодой» — неверный диагноз, владелец поймал на своих же цифрах в
// интерфейсе. A/B на живом хосте: `indicators=` → пустой объект,
// `query_indicator=` → 85 показов и 4 клика с 28.08.
// (2) «Страниц в поиске» берётся НЕ из истории индексирования: ряд
// /search-urls/in-search/history обновляется только по апдейтам поисковой
// базы и отстаёт на дни (16.09 его последняя точка — 15.09 со значением 24,
// когда в поиске реально уже 58 страниц). Фактическое текущее число отдаёт
// /search-urls/in-search/samples полем `count` — ровно то, что владелец видит
// в разделе «Страницы в поиске» и получает экспортом (удалённые из поиска URL
// туда не попадают, проверено на двух таких). Поэтому история идёт в прошлые
// дни как тренд, а в строку ЗА СЕГОДНЯ пишется живой count.
//
// РАЗБИВКА ПО ЗАПРОСАМ (2026-09-16, владелец: «очень интересно, по каким
// запросам идут показы и клики»). Даёт её отдельная ручка
// /search-queries/popular — суммы за период целиком, суточной разбивки по
// каждому запросу у Вебмастера нет вообще, поэтому это СНИМОК (таблица
// yandex_webmaster_queries переписывается на каждом прогоне), а не история.
// Индикаторы запрашиваются тем же `query_indicator`, что и в истории — с
// `indicators` ручка так же молча вернёт пустоту. Период просим с запасом,
// но Яндекс сам обрезает его своей глубиной истории (на 16.09 запрос
// 90 дней вернул 18.06—14.09, date_from/date_to в ответе — фактические, их
// и сохраняем, чтобы на странице стояли настоящие даты, а не «за 90 дней»).
// Сумма показов по всем запросам сходится с суммой по дням из истории
// (проверено на живом хосте: 85 показов, 4 клика), то есть список полный, а
// не «топ-N». Подстраховка на будущее: если запросов окажется больше лимита
// выдачи, второй запрос с order_by=TOTAL_CLICKS доносит те, что с кликами —
// иначе сортировка по показам обрезала бы как раз самое ценное.
//
// Тело запроса: {"dryRun":true} — ничего не писать, вернуть строки в ответе.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const WEBMASTER_API = 'https://api.webmaster.yandex.net/v4';
const TARGET_DOMAIN = 'redevelopment.pro';

// Сколько дней истории запросов подтягивать за один прогон — с запасом,
// у Вебмастера всё равно не появится задним числом больше данных, чем он сам
// решит отдать, лишний охват окна ничего не портит.
const QUERY_HISTORY_DAYS = 90;
const QUERY_INDICATORS = ['TOTAL_SHOWS', 'TOTAL_CLICKS', 'AVG_SHOW_POSITION', 'AVG_CLICK_POSITION'];
// Сколько запросов забирать в снимок разбивки. 500 — максимум выдачи ручки
// popular за один вызов; на 16.09 у сайта всего 60 запросов за всю историю,
// запас на вырост.
const QUERY_LIST_LIMIT = 500;
const BACKLINK_PAGE_SIZE = 100; // максимум ручки /links/external/samples

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchYandexOAuthToken(): Promise<string> {
  const { data, error } = await supabase
    .from('external_api_tokens')
    .select('access_token')
    .eq('service', 'yandex')
    .maybeSingle();
  if (error) throw new Error(`Не удалось прочитать токен Яндекса из external_api_tokens: ${error.message}`);
  if (!data?.access_token) throw new Error('В external_api_tokens нет токена service=yandex');
  return data.access_token as string;
}

// deno-lint-ignore no-explicit-any
async function webmasterFetch(token: string, path: string): Promise<any> {
  const res = await fetch(`${WEBMASTER_API}${path}`, {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Яндекс.Вебмастер ${path} вернул ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  return res.json();
}

async function resolveHost(token: string): Promise<{ userId: number; hostId: string }> {
  const user = await webmasterFetch(token, '/user/');
  const { hosts } = await webmasterFetch(token, `/user/${user.user_id}/hosts`);
  // deno-lint-ignore no-explicit-any
  const host = (hosts ?? []).find((h: any) => h.ascii_host_url?.includes(TARGET_DOMAIN) && h.verified);
  if (!host) {
    throw new Error(`В аккаунте Вебмастера не нашёлся подтверждённый хост для ${TARGET_DOMAIN}`);
  }
  return { userId: user.user_id, hostId: host.host_id };
}

async function fetchIndexingHistory(token: string, userId: number, hostId: string): Promise<Map<string, number>> {
  const { history } = await webmasterFetch(
    token,
    `/user/${userId}/hosts/${encodeURIComponent(hostId)}/search-urls/in-search/history`,
  );
  const byDate = new Map<string, number>();
  for (const point of history ?? []) {
    byDate.set(point.date.slice(0, 10), point.value);
  }
  return byDate;
}

// Сколько страниц в поиске ПРЯМО СЕЙЧАС. limit=1 — сам список примеров не
// нужен, нужно только поле count (общее число страниц в поиске), оно приходит
// независимо от limit.
async function fetchCurrentPagesInSearch(token: string, userId: number, hostId: string): Promise<number | null> {
  const data = await webmasterFetch(
    token,
    `/user/${userId}/hosts/${encodeURIComponent(hostId)}/search-urls/in-search/samples?limit=1`,
  );
  return typeof data.count === 'number' ? data.count : null;
}

async function fetchQueryHistory(
  token: string,
  userId: number,
  hostId: string,
): Promise<Map<string, Record<string, number>>> {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - QUERY_HISTORY_DAYS);

  const params = new URLSearchParams({ date_from: isoDate(dateFrom), date_to: isoDate(dateTo) });
  // ИМЕННО `query_indicator`, а не `indicators` — см. комментарий в шапке
  // файла: `indicators` это поле ответа, как параметр запроса оно молча
  // игнорируется и обнуляет весь блок показов/кликов.
  for (const indicator of QUERY_INDICATORS) params.append('query_indicator', indicator);

  const { indicators } = await webmasterFetch(
    token,
    `/user/${userId}/hosts/${encodeURIComponent(hostId)}/search-queries/all/history?${params.toString()}`,
  );

  const byDate = new Map<string, Record<string, number>>();
  for (const [indicator, points] of Object.entries(indicators ?? {})) {
    // deno-lint-ignore no-explicit-any
    for (const point of (points ?? []) as any[]) {
      const date = point.date.slice(0, 10);
      const entry = byDate.get(date) ?? {};
      entry[indicator] = point.value;
      byDate.set(date, entry);
    }
  }
  return byDate;
}

interface QuerySnapshotRow {
  query: string;
  impressions: number | null;
  clicks: number | null;
  avg_position: number | null;
  avg_click_position: number | null;
  date_from: string | null;
  date_to: string | null;
  updated_at: string;
}

// Список запросов с показами/кликами/позицией за окно целиком. order_by
// задаёт только порядок выдачи (и то, что попадёт в лимит, если запросов
// станет больше 500) — цифры у запроса одни и те же при любой сортировке.
async function fetchPopularQueries(
  token: string,
  userId: number,
  hostId: string,
  orderBy: 'TOTAL_SHOWS' | 'TOTAL_CLICKS',
): Promise<{ count: number; dateFrom: string | null; dateTo: string | null; rows: QuerySnapshotRow[] }> {
  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - QUERY_HISTORY_DAYS);

  const params = new URLSearchParams({
    date_from: isoDate(dateFrom),
    date_to: isoDate(dateTo),
    order_by: orderBy,
    limit: String(QUERY_LIST_LIMIT),
  });
  for (const indicator of QUERY_INDICATORS) params.append('query_indicator', indicator);

  const data = await webmasterFetch(
    token,
    `/user/${userId}/hosts/${encodeURIComponent(hostId)}/search-queries/popular?${params.toString()}`,
  );

  const stamp = new Date().toISOString();
  // Фактический период из ответа, а не тот, что просили: Яндекс обрезает
  // окно своей глубиной истории, и подписывать снимок «за 90 дней», когда
  // внутри 88, — врать на ровном месте.
  const actualFrom = typeof data.date_from === 'string' ? data.date_from.slice(0, 10) : null;
  const actualTo = typeof data.date_to === 'string' ? data.date_to.slice(0, 10) : null;

  // deno-lint-ignore no-explicit-any
  const rows: QuerySnapshotRow[] = (data.queries ?? []).map((q: any) => ({
    query: q.query_text,
    impressions: q.indicators?.TOTAL_SHOWS ?? null,
    clicks: q.indicators?.TOTAL_CLICKS ?? null,
    avg_position: q.indicators?.AVG_SHOW_POSITION ?? null,
    avg_click_position: q.indicators?.AVG_CLICK_POSITION ?? null,
    date_from: actualFrom,
    date_to: actualTo,
    updated_at: stamp,
  // deno-lint-ignore no-explicit-any
  })).filter((r: QuerySnapshotRow) => typeof r.query === 'string' && r.query.trim() !== '');

  return { count: typeof data.count === 'number' ? data.count : rows.length, dateFrom: actualFrom, dateTo: actualTo, rows };
}

// Снимок запросов целиком: топ по показам плюс — только если запросов
// больше, чем влезло в один ответ — топ по кликам (иначе сортировка по
// показам выкинула бы как раз запросы, которые реально приводят людей).
async function fetchQuerySnapshot(token: string, userId: number, hostId: string): Promise<QuerySnapshotRow[]> {
  const byShows = await fetchPopularQueries(token, userId, hostId, 'TOTAL_SHOWS');
  const rows = [...byShows.rows];

  if (byShows.count > byShows.rows.length) {
    const byClicks = await fetchPopularQueries(token, userId, hostId, 'TOTAL_CLICKS');
    const merged = new Map<string, QuerySnapshotRow>();
    for (const row of [...byShows.rows, ...byClicks.rows]) merged.set(row.query, row);
    rows.length = 0;
    rows.push(...merged.values());
  }

  // Один updated_at на весь снимок, проставляется ПОСЛЕ слияния: по нему
  // потом удаляются строки, которых в этом прогоне не было, а два вызова
  // ручки дают два разных времени — из второй пачки всё удалилось бы сразу
  // после вставки.
  const stamp = new Date().toISOString();
  return rows.map((row) => ({ ...row, updated_at: stamp }));
}

interface BacklinkSnapshotRow {
  link_key: string;
  provider: 'yandex_webmaster';
  source_url: string;
  destination_url: string;
  discovery_date: string | null;
  source_last_access_date: string | null;
  updated_at: string;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Вебмастер отдаёт максимум 100 внешних ссылок за запрос. Проходим весь
// доступный снимок по offset/count, а не сохраняем только первую страницу —
// иначе число ссылок и топ ссылающихся доменов стали бы неверными без ошибки.
async function fetchBacklinkSnapshot(
  token: string,
  userId: number,
  hostId: string,
): Promise<BacklinkSnapshotRow[]> {
  const links: { source_url: string; destination_url: string; discovery_date?: string; source_last_access_date?: string }[] = [];
  let offset = 0;
  let count = 0;

  do {
    const data = await webmasterFetch(
      token,
      `/user/${userId}/hosts/${encodeURIComponent(hostId)}/links/external/samples?offset=${offset}&limit=${BACKLINK_PAGE_SIZE}`,
    );
    const page = Array.isArray(data.links) ? data.links : [];
    count = typeof data.count === 'number' ? data.count : page.length;
    links.push(...page);
    if (page.length === 0) break;
    offset += page.length;
  } while (offset < count);

  const stamp = new Date().toISOString();
  const rows = await Promise.all(
    links
      .filter((link) => typeof link.source_url === 'string' && typeof link.destination_url === 'string')
      .map(async (link) => ({
        link_key: await sha256(`yandex_webmaster\n${link.source_url}\n${link.destination_url}`),
        provider: 'yandex_webmaster' as const,
        source_url: link.source_url,
        destination_url: link.destination_url,
        discovery_date: link.discovery_date?.slice(0, 10) ?? null,
        source_last_access_date: link.source_last_access_date?.slice(0, 10) ?? null,
        updated_at: stamp,
      })),
  );

  // На случай, если API вернёт одну и ту же пару на границе страниц.
  return [...new Map(rows.map((row) => [row.link_key, row])).values()];
}

Deno.serve(async (req) => {
  const log: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const token = await fetchYandexOAuthToken();
    const { userId, hostId } = await resolveHost(token);
    log.push(`Хост Вебмастера: ${hostId} (user_id=${userId})`);

    const [indexingByDate, queryByDate, currentPagesInSearch, querySnapshot, backlinkSnapshot] = await Promise.all([
      fetchIndexingHistory(token, userId, hostId),
      fetchQueryHistory(token, userId, hostId),
      fetchCurrentPagesInSearch(token, userId, hostId),
      fetchQuerySnapshot(token, userId, hostId),
      fetchBacklinkSnapshot(token, userId, hostId),
    ]);
    log.push(
      `Индексирование: ${indexingByDate.size} точек (сейчас в поиске: ${currentPagesInSearch ?? '—'}). ` +
        `Запросы: ${queryByDate.size} дней с данными, ${querySnapshot.length} запросов в разбивке. ` +
        `Внешние ссылки: ${backlinkSnapshot.length}.`,
    );

    // Живое число страниц в поиске пишем в строку за сегодня — история от
    // Яндекса отстаёт на дни, а карточка «Страниц в поиске» на странице
    // «Показатели» берёт последнее непустое значение в периоде.
    const today = isoDate(new Date());
    if (currentPagesInSearch !== null) indexingByDate.set(today, currentPagesInSearch);

    const allDates = new Set([...indexingByDate.keys(), ...queryByDate.keys()]);
    const rows = [...allDates].map((date) => {
      const q = queryByDate.get(date) ?? {};
      return {
        date,
        pages_in_search: indexingByDate.get(date) ?? null,
        impressions: q.TOTAL_SHOWS ?? null,
        clicks: q.TOTAL_CLICKS ?? null,
        avg_position: q.AVG_SHOW_POSITION ?? null,
        avg_click_position: q.AVG_CLICK_POSITION ?? null,
        updated_at: new Date().toISOString(),
      };
    });

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        log,
        rows,
        queries: querySnapshot,
        backlinkCount: backlinkSnapshot.length,
        backlinkSample: backlinkSnapshot.slice(0, 10),
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('yandex_webmaster_stats').upsert(rows, { onConflict: 'date' });
      if (error) throw error;
      log.push(`Сохранено ${rows.length} записей в yandex_webmaster_stats.`);
    }

    // Снимок запросов переписывается целиком: сначала upsert всех строк
    // одним временем (updated_at у всех одинаковый — он же и метка прогона),
    // потом удаление всего, что этот прогон не принёс. Обратный порядок
    // (сначала delete) оставил бы страницу с пустой таблицей, если вставка
    // упадёт; так в худшем случае останется вчерашний снимок целиком.
    if (querySnapshot.length > 0) {
      const stamp = querySnapshot[0].updated_at;
      const { error: qError } = await supabase
        .from('yandex_webmaster_queries')
        .upsert(querySnapshot, { onConflict: 'query' });
      if (qError) throw qError;
      const { error: delError } = await supabase.from('yandex_webmaster_queries').delete().lt('updated_at', stamp);
      if (delError) throw delError;
      log.push(`Сохранено ${querySnapshot.length} запросов в yandex_webmaster_queries.`);
    }

    // Снимок ссылок тоже заменяется без «пустого окна»: сначала новая версия
    // пачками, затем старые строки этого provider. Нулевой валидный ответ API
    // означает, что ссылок больше нет, — тогда старый снимок удаляем целиком.
    if (backlinkSnapshot.length > 0) {
      const stamp = backlinkSnapshot[0].updated_at;
      for (let from = 0; from < backlinkSnapshot.length; from += 500) {
        const batch = backlinkSnapshot.slice(from, from + 500);
        // deno-lint-ignore no-await-in-loop
        const { error: backlinkError } = await supabase
          .from('site_backlinks')
          .upsert(batch, { onConflict: 'link_key' });
        if (backlinkError) throw backlinkError;
      }
      const { error: staleError } = await supabase
        .from('site_backlinks')
        .delete()
        .eq('provider', 'yandex_webmaster')
        .lt('updated_at', stamp);
      if (staleError) throw staleError;
    } else {
      const { error: staleError } = await supabase.from('site_backlinks').delete().eq('provider', 'yandex_webmaster');
      if (staleError) throw staleError;
    }
    log.push(`Сохранено ${backlinkSnapshot.length} внешних ссылок в site_backlinks.`);

    return json({ ok: true, log });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, log, error: message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
