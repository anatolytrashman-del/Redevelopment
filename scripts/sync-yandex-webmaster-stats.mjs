// Раз в сутки (см. .github/workflows/sync-yandex-webmaster-stats.yml)
// забирает у Яндекс.Вебмастера историю индексирования (сколько страниц
// сайта реально в поиске) и статистику по поисковым запросам (показы/
// клики/позиция) — сохраняет в public.yandex_webmaster_stats, одна строка
// на календарный день. Владелец, 2026-09-10: "Мы делаем страницу
// Показатели в маркетинге, там будут данные из яндекс.метрики, подтягивай
// данные из Вебмастера туда же" — эта таблица и есть источник данных для
// того блока страницы, сама страница делается в параллельной сессии.
//
// OAuth-токен НЕ отдельный секрет GitHub Actions — он уже лежит в самой
// базе (public.external_api_tokens, service='yandex', тот же токен,
// которым будут пользоваться и для Метрики) — читаем его сервисным ключом
// прямо перед вызовом API Вебмастера. Токен привязан к аккаунту, где домен
// redevelopment.pro подтверждён в Вебмастере (verified:true, проверено
// вживую 2026-09-10) — user_id/host_id вычисляются на лету через
// /v4/user/ и /v4/user/{id}/hosts, не хардкодятся (единственный подтверждённый
// хост в аккаунте — сам redevelopment.pro, но на случай появления второго
// хоста явная сверка по домену надёжнее, чем брать hosts[0]).
//
// 2026-09-16 — ИСПРАВЛЕНА ошибка, из-за которой показы/клики не приходили
// НИ РАЗУ. В комментарии здесь раньше стояло "данных ещё физически нет,
// сайт молодой" — это был неверный диагноз: `indicators` возвращался
// пустым объектом, потому что запрашивались индикаторы параметром с
// НЕВЕРНЫМ ИМЕНЕМ. У /search-queries/all/history параметр называется
// `query_indicator` (повторяется столько раз, сколько индикаторов нужно),
// а не `indicators` — `indicators` это имя поля в ОТВЕТЕ. Неизвестный
// параметр Вебмастер молча игнорирует: HTTP 200, пустой объект, ошибки
// нет, скрипт честно кладёт NULL. Проверено вживую A/B-запросом на том же
// хосте: `indicators=` → {"indicators":{}}, `query_indicator=` → 85
// показов и 4 клика с 28.08. Владелец поймал на своих же цифрах в
// интерфейсе Вебмастера («у меня уже есть показы и клики»).
//
// Второе там же: "Страниц в поиске" берётся НЕ из истории индексирования.
// Ряд /search-urls/in-search/history обновляется только по апдейтам
// поисковой базы и отстаёт на дни (16.09 его последняя точка — 15.09 со
// значением 24, когда в поиске реально уже 58 страниц). Фактическое
// текущее число отдаёт /search-urls/in-search/samples полем `count` — это
// ровно то, что владелец видит в разделе «Страницы в поиске» и получает
// экспортом (проверено: удалённые из поиска URL в samples не попадают).
// Поэтому история идёт в прошлые дни как тренд, а в строку ЗА СЕГОДНЯ
// пишется живой count.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const WEBMASTER_API = 'https://api.webmaster.yandex.net/v4';
const TARGET_DOMAIN = 'redevelopment.pro';

// Сколько дней истории запросов подтягивать за один прогон — с запасом,
// у Вебмастера всё равно не появится задним числом больше данных, чем он
// сам решит отдать, лишний охват окна ничего не портит.
const QUERY_HISTORY_DAYS = 90;
const QUERY_INDICATORS = ['TOTAL_SHOWS', 'TOTAL_CLICKS', 'AVG_SHOW_POSITION', 'AVG_CLICK_POSITION'];

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Не задана переменная окружения SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchYandexOAuthToken() {
  const { data, error } = await supabase.from('external_api_tokens').select('access_token').eq('service', 'yandex').single();
  if (error) throw new Error(`Не удалось прочитать токен Яндекса из external_api_tokens: ${error.message}`);
  if (!data?.access_token) throw new Error('В external_api_tokens нет токена service=yandex');
  return data.access_token;
}

async function webmasterFetch(token, path) {
  const res = await fetch(`${WEBMASTER_API}${path}`, {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Яндекс.Вебмастер ${path} вернул ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function resolveHost(token) {
  const user = await webmasterFetch(token, '/user/');
  const { hosts } = await webmasterFetch(token, `/user/${user.user_id}/hosts`);
  const host = hosts.find((h) => h.ascii_host_url?.includes(TARGET_DOMAIN) && h.verified);
  if (!host) {
    throw new Error(`В аккаунте Вебмастера не нашёлся подтверждённый хост для ${TARGET_DOMAIN}`);
  }
  return { userId: user.user_id, hostId: host.host_id };
}

async function fetchIndexingHistory(token, userId, hostId) {
  const { history } = await webmasterFetch(
    token,
    `/user/${userId}/hosts/${encodeURIComponent(hostId)}/search-urls/in-search/history`,
  );
  const byDate = new Map();
  for (const point of history ?? []) {
    byDate.set(point.date.slice(0, 10), point.value);
  }
  return byDate;
}

// Сколько страниц в поиске ПРЯМО СЕЙЧАС. limit=1 — сам список примеров не
// нужен, нужно только поле count (общее число страниц в поиске), оно
// приходит независимо от limit.
async function fetchCurrentPagesInSearch(token, userId, hostId) {
  const data = await webmasterFetch(
    token,
    `/user/${userId}/hosts/${encodeURIComponent(hostId)}/search-urls/in-search/samples?limit=1`,
  );
  return typeof data.count === 'number' ? data.count : null;
}

async function fetchQueryHistory(token, userId, hostId) {
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

  // byDate: date -> { TOTAL_SHOWS, TOTAL_CLICKS, AVG_SHOW_POSITION, AVG_CLICK_POSITION }
  const byDate = new Map();
  for (const [indicator, points] of Object.entries(indicators ?? {})) {
    for (const point of points ?? []) {
      const date = point.date.slice(0, 10);
      const entry = byDate.get(date) ?? {};
      entry[indicator] = point.value;
      byDate.set(date, entry);
    }
  }
  return byDate;
}

async function main() {
  const token = await fetchYandexOAuthToken();
  const { userId, hostId } = await resolveHost(token);
  console.log(`Хост Вебмастера: ${hostId} (user_id=${userId})`);

  const [indexingByDate, queryByDate, currentPagesInSearch] = await Promise.all([
    fetchIndexingHistory(token, userId, hostId),
    fetchQueryHistory(token, userId, hostId),
    fetchCurrentPagesInSearch(token, userId, hostId),
  ]);
  console.log(
    `Индексирование: ${indexingByDate.size} точек (сейчас в поиске: ${currentPagesInSearch ?? '—'}). ` +
      `Запросы: ${queryByDate.size} дней с данными.`,
  );

  // Живое число страниц в поиске пишем в строку за сегодня — история от
  // Яндекса отстаёт на дни, а карточка "Страниц в поиске" на странице
  // "Показатели" берёт последнее непустое значение в периоде.
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
    console.log('Нет данных для сохранения.');
    return;
  }

  if (DRY_RUN) {
    console.log('[dry-run] Записал бы в yandex_webmaster_stats:');
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const { error } = await supabase.from('yandex_webmaster_stats').upsert(rows, { onConflict: 'date' });
  if (error) throw error;

  console.log(`Сохранено ${rows.length} записей в yandex_webmaster_stats.`);
}

main().catch((err) => {
  console.error('Синхронизация не удалась:', err);
  process.exit(1);
});
