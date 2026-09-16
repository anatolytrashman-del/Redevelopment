// Синк Яндекс.Вебмастера — Supabase Edge Function, крон раз в сутки (pg_cron).
// Забирает историю индексирования (сколько страниц сайта реально в поиске) и
// статистику по поисковым запросам (показы/клики/позиция) — сохраняет в
// public.yandex_webmaster_stats, одна строка на календарный день. Источник
// данных для блока «Индексация и поисковые запросы» страницы «Показатели».
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

Deno.serve(async (req) => {
  const log: string[] = [];
  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    const token = await fetchYandexOAuthToken();
    const { userId, hostId } = await resolveHost(token);
    log.push(`Хост Вебмастера: ${hostId} (user_id=${userId})`);

    const [indexingByDate, queryByDate, currentPagesInSearch] = await Promise.all([
      fetchIndexingHistory(token, userId, hostId),
      fetchQueryHistory(token, userId, hostId),
      fetchCurrentPagesInSearch(token, userId, hostId),
    ]);
    log.push(
      `Индексирование: ${indexingByDate.size} точек (сейчас в поиске: ${currentPagesInSearch ?? '—'}). ` +
        `Запросы: ${queryByDate.size} дней с данными.`,
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

    if (rows.length === 0) {
      log.push('Нет данных для сохранения.');
      return json({ ok: true, log });
    }
    if (dryRun) return json({ ok: true, dryRun: true, log, rows });

    const { error } = await supabase.from('yandex_webmaster_stats').upsert(rows, { onConflict: 'date' });
    if (error) throw error;

    log.push(`Сохранено ${rows.length} записей в yandex_webmaster_stats.`);
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
