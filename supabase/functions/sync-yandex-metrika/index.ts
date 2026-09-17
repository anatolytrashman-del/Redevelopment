// Синк Яндекс.Метрики — Supabase Edge Function, крон раз в час (pg_cron).
// Забирает из Метрики (Reporting/Stats API) статистику посещаемости сайта и
// складывает в 4 таблицы Supabase — читает их страница «Показатели»
// (/admin/metrics). Счётчик — тот же, что вшит в index.html и
// src/lib/metrika.ts (METRIKA_COUNTER_ID) — держать оба места в синхроне.
//
// 2026-09-16 — переехало из scripts/sync-yandex-metrika.mjs (GitHub Actions)
// сюда. Причина: крон Actions на бесплатном публичном репозитории
// НЕ РАСПИСАНИЕ, А ПОЖЕЛАНИЕ — при заявленных «раз в сутки в 23:00» реальные
// прогоны шли в 00:47, 01:08, 01:12, а часовой крон GitHub уже троттлил этому
// аккаунту (из-за чего очереди поставщиков переехали сюда же 2026-09-11).
// Владелец сравнил страницу с интерфейсом Метрики и увидел вчерашние цифры
// под подписью «Сегодня» — вот это и было расписание Actions в работе.
// Старого скрипта в scripts/ больше НЕТ (дублировать 400 строк логики в двух
// рантаймах — гарантированное расхождение, см. про файлы-близнецы в
// CLAUDE.md); ручной запуск остался кнопкой в Actions, но воркфлоу теперь
// просто дёргает эту функцию.
//
// OAuth-токен НЕ секрет окружения — хранится в таблице external_api_tokens
// (service='yandex', RLS закрыт для всех кроме service_role) и читается
// отсюда каждый прогон. Так его не нужно перевставлять при перевыпуске —
// достаточно обновить строку в базе. У Яндекс-API свой формат заголовка
// авторизации — именно `Authorization: OAuth <токен>`, не Bearer, это не
// опечатка.
//
// Источник разбит на 4 независимых запроса, каждый обёрнут в try/catch —
// сбой одного (например, метрика/измерение с опечаткой, или Яндекс поменял
// имя поля) не должен ронять остальные 3, они не зависят друг от друга:
//  1. daily-stats  — визиты/пользователи/просмотры/отказы по дням (тренд).
//  2. traffic      — источники трафика ЗА ВСЁ ОКНО целиком (см. ниже),
//                     не по дням — полная замена таблицы на каждом прогоне.
//  3. top-pages     — топ страниц ЗА ВСЁ ОКНО целиком, та же логика замены.
//  4. goal          — достижения цели по дням (тренд, как и (1)) — только
//                     если цель 'booking_submitted' (см. metrika.ts) удалось
//                     найти через Management API; ID цели у Метрики
//                     числовой и меняется от инсталляции к инсталляции,
//                     matching идёт по условию цели/имени, не хардкожен.
//
// (2) и (3) сознательно НЕ разбиты по дням — «топ-N по дням» через один
// такой запрос физически не получить (limit у Stats API режет ГЛОБАЛЬНО
// отсортированный список, не по N на группу), а сама задача — рейтинг за
// период, не дневной тренд.
//
// Тело запроса (всё необязательно): {"dryRun":true} — не писать в Supabase,
// только вернуть сводку; {"json":true} — вернуть сырые ответы API целиком;
// {"debugFilter":true} — A/B-проверка admin-фильтра, ничего не пишет;
// {"debugRobots":true} — сколько в данных роботов и работает ли фильтр по
// ним, тоже ничего не пишет; {"backfillDays":N} — РУЧНОЙ пересчёт дневных
// рядов за N последних дней (обычный прогон трогает только вчера+сегодня).
//
// 2026-09-10 — исключение /admin/* (владелец: «нужна только клиентская
// часть», внутренняя CRM не должна попадать в статистику посещаемости).
// Основная защита теперь на уровне отправки хитов (App.tsx/index.html —
// с /admin счётчик вообще не шлёт события в Метрику), но ЭТОТ фильтр в
// самих запросах к Stats API нужен отдельно: он же чистит уже накопленную
// ДО той правки историю визитов внутри окна.
//
// Первая версия ("NOT EXISTS ym:pv:...", без скобок) была НЕВЕРНОЙ —
// Метрика реально отвечала 400 "Incorrectly specified filter for
// segmentation, error code 4003" на каждом прогоне, но ошибка тихо
// глоталась try/catch на уровне раздела — «визиты по дням»/«источники
// трафика»/«достижения целей» молча не обновлялись НИ РАЗУ, старые числа
// продолжали лежать в Supabase. Правильный синтаксис для session-уровневых
// (`ym:s:*`) запросов, где нужно условие по pageview-уровню (`ym:pv:*`) —
// ОТДЕЛЬНЫЙ оператор `NONE(...)` (не `NOT EXISTS`), обязательно со скобками:
// NONE(ym:pv:X) значит «нет ни одного просмотра страницы, удовлетворяющего
// условию». Для pageview-уровневого запроса (топ страниц) — прямой `!~`.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ADMIN_EXCLUDE_FILTER_SESSION = "NONE(ym:pv:URLPathFull=~'^/admin')";
const ADMIN_EXCLUDE_FILTER_PAGEVIEW = "ym:pv:URLPathFull!~'^/admin'";

// 2026-09-17 — исключение роботов (владелец: «очисти онлайн и цифры метрики
// от ИИ-агентов, работающих на сайте»). Вопреки расхожему «Метрика их и так
// не показывает», у НАШЕГО счётчика роботы лежат прямо в данных: настройка
// filter_robots = 1 («только по строгим правилам»), и замер за 90 дней дал
// 292 визита без фильтра против 273 с ним — 19 визитов роботов, из них 6 с
// UA HeadlessChrome (наши же прогоны Playwright по проду). Фильтр нужен ЯВНО.
//
// Этот фильтр чистит уже накопленную историю. Чтобы агенты не попадали в
// счётчик ВООБЩЕ, счётчик Метрики теперь не инициализируется у
// headless-браузеров — см. window.__isLikelyBot в index.html и
// src/lib/botDetection.ts.
const ROBOT_EXCLUDE_FILTER_SESSION = "ym:s:isRobot=='No'";

// ВАЖНО, проверено запросами 2026-09-17. У Stats API условие по isRobot
// НЕЛЬЗЯ соединять с любым другим условием: `ym:s:isRobot=='No' AND <что
// угодно>` не отдаёт ошибку, а МОЛЧА схлопывает весь отчёт до ОДНОЙ строки
// (7 дней визитов превращаются в один день, два источника трафика — в один).
// Скобки, порядок условий и явный group=day не помогают; то же самое
// происходит, если вместо фильтра добавить измерение ym:s:isRobot к любому
// запросу с фильтром. Ровно тот же класс тихого сбоя, что и с NOT EXISTS
// в истории этого файла, только без 400-го ответа — заметить можно лишь по
// цифрам.
//
// Поэтому у сессионных запросов ОДНО условие — про роботов, а админ-фильтр
// (NONE(ym:pv:URLPathFull=~'^/admin')) из них убран. Это безопасно: с
// 2026-09-10 счётчик на /admin вообще не инициализируется, и проверка по
// живым данным показала в накопленном окне НОЛЬ просмотров страниц /admin —
// фильтр стал защитой от истории, которой больше нет (её очистили
// 2026-09-11). Если /admin когда-нибудь снова начнёт слать хиты, чинить надо
// там, а не здесь: второе условие сюда не добавить.
const SESSION_FILTER = ROBOT_EXCLUDE_FILTER_SESSION;

// Топ страниц — запрос pageview-уровня, и там отсечь роботов нечем: и
// ym:pv:isRobot в фильтре, и он же в измерениях схлопывают отчёт до одной
// строки (та же ловушка, что выше). Остаётся прежний админ-фильтр — он на
// pv-уровне работает нормально. Следствие: в топе страниц роботы из уже
// накопленной истории остаются (в окне это 4 просмотра из 174); новых не
// будет — их отсекает botDetection ещё до отправки хита.
const PAGEVIEW_FILTER = ADMIN_EXCLUDE_FILTER_PAGEVIEW;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const METRIKA_API = 'https://api-metrika.yandex.net';
// Должен совпадать с METRIKA_COUNTER_ID в src/lib/metrika.ts.
const COUNTER_ID = 111858495;
const WINDOW_DAYS = 90;
const GOAL_IDENTIFIER = 'booking_submitted';

// 2026-09-13 — владелец попросил очистить накопленные цифры посещаемости и
// дальше показывать только то, что накопится заново. Ряды (1) и (4) идут
// через upsert по date и НЕ удаляются — старые дни, once written, остаются
// сами по себе; опасность была не в хранении, а в том, что WINDOW_DAYS=90
// каждый прогон заново перезатягивал все 90 дней поверх очищенной вручную
// истории. Сузили ИМЕННО окно ЗАПРОСА для этих двух дневных рядов до
// "вчера+сегодня".
//
// 2026-09-15 — остаток той же проблемы: дневные ряды после очистки начинались
// с 11.09, а «Источники трафика»/«Топ страниц» продолжали приходить снимком
// за 90 дней — на странице рядом стояли визиты за 4 дня и источники за 90.
// Теперь окно снимка НЕ фиксированное: считается от самой ранней даты,
// которая реально лежит в yandex_metrika_daily_stats, и обрезается сверху
// теми же WINDOW_DAYS. Так очистка дневных рядов автоматически чистит и эти
// два блока. Если дневная таблица пуста или её не прочитать — падаем на
// TREND_WINDOW_DAYS, а не на 90: лучше показать меньше, чем вернуть старьё.
const TREND_WINDOW_DAYS = 2;

type Flags = { dryRun: boolean; json: boolean; debugFilter: boolean; debugRobots: boolean; backfillDays: number | null };
type SnapshotWindow = { date1: string; date2: string; windowDays: number };

async function fetchYandexToken(): Promise<string> {
  const { data, error } = await supabase
    .from('external_api_tokens')
    .select('access_token')
    .eq('service', 'yandex')
    .maybeSingle();
  if (error) throw error;
  if (!data?.access_token) {
    throw new Error(
      "В таблице external_api_tokens нет строки service='yandex' — токен не сохранён или удалён.",
    );
  }
  return data.access_token as string;
}

// deno-lint-ignore no-explicit-any
async function metrikaFetch(token: string, path: string, params: Record<string, unknown>): Promise<any> {
  const url = new URL(`${METRIKA_API}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url, { headers: { Authorization: `OAuth ${token}` } });
  const bodyText = await res.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error(`Метрика вернула не-JSON (${res.status}): ${bodyText.slice(0, 500)}`);
  }
  if (!res.ok) {
    const message = body?.message || body?.errors?.[0]?.message || bodyText.slice(0, 500);
    throw new Error(`Метрика API вернул ${res.status}: ${message}`);
  }
  return body;
}

async function findGoalId(token: string, log: string[]): Promise<number | null> {
  const body = await metrikaFetch(token, `/management/v1/counter/${COUNTER_ID}/goals`, {});
  const goals = body?.goals ?? [];
  // deno-lint-ignore no-explicit-any
  const byCondition = goals.find((g: any) =>
    (g.conditions ?? []).some((c: any) => c.url === GOAL_IDENTIFIER || c.value === GOAL_IDENTIFIER),
  );
  // deno-lint-ignore no-explicit-any
  const byName = goals.find((g: any) => g.name === GOAL_IDENTIFIER);
  const goal = byCondition ?? byName;
  if (!goal) {
    log.push(
      `Цель '${GOAL_IDENTIFIER}' не найдена среди ${goals.length} целей счётчика — раздел «Достижение целей» пропущен.`,
    );
    return null;
  }
  return goal.id;
}

function windowDateParams() {
  return { date1: `${WINDOW_DAYS - 1}daysAgo`, date2: 'today' };
}

// Обычный прогон тянет только «вчера+сегодня» (см. TREND_WINDOW_DAYS выше —
// так очищенная вручную история не перезатягивается заново). Ручной режим
// {"backfillDays":N} — единственный способ ПЕРЕСЧИТАТЬ уже лежащие дни: нужен
// после любой правки фильтров, иначе новые правила действуют только на
// свежие дни, а старые так и остаются посчитанными по-старому (именно так
// 2026-09-17 переписывались дни, накопленные вместе с роботами). Кроном не
// вызывается никогда — только руками.
function normalizeBackfillDays(value: unknown): number | null {
  const days = typeof value === 'number' ? Math.floor(value) : NaN;
  if (!Number.isFinite(days) || days < 1) return null;
  return Math.min(days, WINDOW_DAYS);
}

function trendWindowDateParams(flags?: Flags) {
  const days = flags?.backfillDays ?? TREND_WINDOW_DAYS;
  return { date1: `${days - 1}daysAgo`, date2: 'today' };
}

// Окно для снимков (2)/(3) — от первой даты в накопленной дневной истории до
// сегодня, но не длиннее WINDOW_DAYS. Возвращает и параметры запроса, и число
// дней — оно уходит в колонку window_days и показывается на странице
// («За последние N дней»), так что подпись всегда совпадает с запрошенным.
async function fetchSnapshotWindow(log: string[]): Promise<SnapshotWindow> {
  const fallback = {
    date1: `${TREND_WINDOW_DAYS - 1}daysAgo`,
    date2: 'today',
    windowDays: TREND_WINDOW_DAYS,
  };

  const { data, error } = await supabase
    .from('yandex_metrika_daily_stats')
    .select('date')
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.push(`Не удалось прочитать начало истории (${error.message}) — снимок за ${TREND_WINDOW_DAYS} дн.`);
    return fallback;
  }
  const firstDate = data?.date as string | undefined;
  if (!firstDate) {
    log.push(`В yandex_metrika_daily_stats пока нет строк — снимок за ${TREND_WINDOW_DAYS} дн.`);
    return fallback;
  }

  const startMs = Date.parse(`${firstDate}T00:00:00Z`);
  if (Number.isNaN(startMs)) return fallback;
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((todayMs - startMs) / 86400000) + 1;
  const windowDays = Math.min(Math.max(days, 1), WINDOW_DAYS);

  return windowDays >= WINDOW_DAYS
    ? { ...windowDateParams(), windowDays: WINDOW_DAYS }
    : { date1: firstDate, date2: 'today', windowDays };
}

async function syncDailyStats(token: string, flags: Flags, log: string[], raw: Record<string, unknown>) {
  const body = await metrikaFetch(token, '/stat/v1/data', {
    ids: COUNTER_ID,
    metrics: 'ym:s:visits,ym:s:users,ym:s:pageviews,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds',
    dimensions: 'ym:s:date',
    sort: 'ym:s:date',
    limit: (flags.backfillDays ?? TREND_WINDOW_DAYS) + 5,
    filters: SESSION_FILTER,
    ...trendWindowDateParams(flags),
  });
  if (flags.json) raw['daily-stats'] = body;

  // deno-lint-ignore no-explicit-any
  const rows = (body.data ?? []).map((row: any) => {
    const [visits, users, pageviews, bounceRate, pageDepth, avgDuration] = row.metrics;
    return {
      date: row.dimensions[0].name,
      visits: Math.round(visits ?? 0),
      users: Math.round(users ?? 0),
      pageviews: Math.round(pageviews ?? 0),
      bounce_rate: bounceRate ?? null,
      page_depth: pageDepth ?? null,
      avg_duration_seconds: avgDuration ?? null,
      updated_at: new Date().toISOString(),
    };
  });
  log.push(`Визиты по дням: ${rows.length} строк.`);
  if (flags.dryRun || rows.length === 0) return;

  const { error } = await supabase.from('yandex_metrika_daily_stats').upsert(rows, { onConflict: 'date' });
  if (error) throw error;
}

// row.dimensions[0].name у ym:s:lastTrafficSource/ym:pv:URLPathFull — уже
// готовый текст (у trafficSource локализованное имя вроде «Переходы из
// поисковых систем», у URLPathFull — сам путь).
async function syncTrafficSources(
  token: string,
  snapshotWindow: SnapshotWindow,
  flags: Flags,
  log: string[],
  raw: Record<string, unknown>,
) {
  const body = await metrikaFetch(token, '/stat/v1/data', {
    ids: COUNTER_ID,
    metrics: 'ym:s:visits,ym:s:users',
    dimensions: 'ym:s:lastTrafficSource',
    sort: '-ym:s:visits',
    limit: 30,
    filters: SESSION_FILTER,
    date1: snapshotWindow.date1,
    date2: snapshotWindow.date2,
  });
  if (flags.json) raw['traffic-sources'] = body;

  const now = new Date().toISOString();
  // deno-lint-ignore no-explicit-any
  const rows = (body.data ?? []).map((row: any) => ({
    source: row.dimensions[0].name,
    visits: Math.round(row.metrics[0] ?? 0),
    users: Math.round(row.metrics[1] ?? 0),
    window_days: snapshotWindow.windowDays,
    updated_at: now,
  }));
  log.push(`Источники трафика: ${rows.length} строк (окно ${snapshotWindow.windowDays} дн., с ${snapshotWindow.date1}).`);
  if (flags.dryRun) return;

  const del = await supabase.from('yandex_metrika_traffic_sources').delete().gte('visits', 0);
  if (del.error) throw del.error;
  if (rows.length === 0) return;
  const { error } = await supabase.from('yandex_metrika_traffic_sources').insert(rows);
  if (error) throw error;
}

async function syncTopPages(
  token: string,
  snapshotWindow: SnapshotWindow,
  flags: Flags,
  log: string[],
  raw: Record<string, unknown>,
) {
  const body = await metrikaFetch(token, '/stat/v1/data', {
    ids: COUNTER_ID,
    metrics: 'ym:pv:pageviews,ym:pv:users',
    dimensions: 'ym:pv:URLPathFull',
    sort: '-ym:pv:pageviews',
    limit: 30,
    filters: PAGEVIEW_FILTER,
    date1: snapshotWindow.date1,
    date2: snapshotWindow.date2,
  });
  if (flags.json) raw['top-pages'] = body;

  const now = new Date().toISOString();
  // deno-lint-ignore no-explicit-any
  const rows = (body.data ?? []).map((row: any) => ({
    path: row.dimensions[0].name,
    pageviews: Math.round(row.metrics[0] ?? 0),
    users: Math.round(row.metrics[1] ?? 0),
    window_days: snapshotWindow.windowDays,
    updated_at: now,
  }));
  log.push(`Топ страниц: ${rows.length} строк (окно ${snapshotWindow.windowDays} дн., с ${snapshotWindow.date1}).`);
  if (flags.dryRun) return;

  const del = await supabase.from('yandex_metrika_top_pages').delete().gte('pageviews', 0);
  if (del.error) throw del.error;
  if (rows.length === 0) return;
  const { error } = await supabase.from('yandex_metrika_top_pages').insert(rows);
  if (error) throw error;
}

async function syncGoalCompletions(token: string, flags: Flags, log: string[], raw: Record<string, unknown>) {
  const goalId = await findGoalId(token, log);
  if (!goalId) return;

  const body = await metrikaFetch(token, '/stat/v1/data', {
    ids: COUNTER_ID,
    metrics: `ym:s:goal${goalId}reaches,ym:s:goal${goalId}conversionRate`,
    dimensions: 'ym:s:date',
    sort: 'ym:s:date',
    limit: (flags.backfillDays ?? TREND_WINDOW_DAYS) + 5,
    filters: SESSION_FILTER,
    ...trendWindowDateParams(flags),
  });
  if (flags.json) raw['goal-completions'] = body;

  const now = new Date().toISOString();
  // deno-lint-ignore no-explicit-any
  const rows = (body.data ?? []).map((row: any) => ({
    date: row.dimensions[0].name,
    goal_name: GOAL_IDENTIFIER,
    goal_id: String(goalId),
    reaches: Math.round(row.metrics[0] ?? 0),
    conversion_rate: row.metrics[1] ?? null,
    updated_at: now,
  }));
  log.push(`Достижения цели '${GOAL_IDENTIFIER}' (id ${goalId}): ${rows.length} строк.`);
  if (flags.dryRun || rows.length === 0) return;

  const { error } = await supabase
    .from('yandex_metrika_goal_completions')
    .upsert(rows, { onConflict: 'date,goal_name' });
  if (error) throw error;
}

// Живая A/B-проверка ADMIN_EXCLUDE_FILTER_SESSION: сумма визитов ЗА ОДИН И
// ТОТ ЖЕ период с фильтром и без — единственный способ убедиться, реально ли
// Метрика исключает сессии с /admin, а не молча игнорирует непонятный ей
// синтаксис (что и произошло с NOT EXISTS). Ничего не пишет.
async function debugAdminFilter(token: string, flags: Flags, log: string[], raw: Record<string, unknown>) {
  const params = {
    ids: COUNTER_ID,
    metrics: 'ym:s:visits',
    dimensions: 'ym:s:date',
    sort: 'ym:s:date',
    limit: WINDOW_DAYS + 10,
    ...windowDateParams(),
  };

  const withoutFilter = await metrikaFetch(token, '/stat/v1/data', params);
  const withFilter = await metrikaFetch(token, '/stat/v1/data', {
    ...params,
    filters: ADMIN_EXCLUDE_FILTER_SESSION,
  });

  // deno-lint-ignore no-explicit-any
  const sumVisits = (body: any) => (body.data ?? []).reduce((acc: number, row: any) => acc + (row.metrics[0] ?? 0), 0);
  const totalWithout = sumVisits(withoutFilter);
  const totalWith = sumVisits(withFilter);

  log.push(`Визиты БЕЗ фильтра (${WINDOW_DAYS} дней): ${totalWithout}`);
  log.push(`Визиты С фильтром "${ADMIN_EXCLUDE_FILTER_SESSION}" (${WINDOW_DAYS} дней): ${totalWith}`);
  log.push(
    totalWith === totalWithout
      ? 'ФИЛЬТР НЕ ДАЛ ЭФФЕКТА — либо синтаксис не поддержан API, либо реально нет ни одной сессии с /admin в окне.'
      : `Фильтр реально исключил ${totalWithout - totalWith} визитов.`,
  );
  if (flags.json) {
    raw['without-filter'] = withoutFilter;
    raw['with-filter'] = withFilter;
  }
}

// Разведка по роботам (ничего не пишет): что вообще Метрика считает роботом
// на нашем счётчике и работает ли фильтр `ym:s:isRobot`. Нужна ровно затем
// же, зачем debugAdminFilter выше, — увидеть ЦИФРЫ, а не поверить в то, что
// фильтр применился. Заодно печатает настройку счётчика filter_robots
// (1 — только строгие правила, 2 — строгие + поведенческие).
async function debugRobots(token: string, flags: Flags, log: string[], raw: Record<string, unknown>) {
  try {
    const counter = await metrikaFetch(token, `/management/v1/counter/${COUNTER_ID}`, {});
    log.push(`Настройка счётчика filter_robots = ${counter?.counter?.filter_robots}`);
    if (flags.json) raw['counter'] = counter;
  } catch (err) {
    log.push(`Настройки счётчика не прочитались: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Группировка по дням нужна не ради самих дней, а чтобы в логе было видно
  // ЧИСЛО СТРОК: связка isRobot с любым вторым условием схлопывает отчёт до
  // одной строки молча, и увидеть это можно только так (см. комментарий у
  // SESSION_FILTER).
  const base = {
    ids: COUNTER_ID,
    metrics: 'ym:s:visits,ym:s:users',
    dimensions: 'ym:s:date',
    sort: 'ym:s:date',
    limit: WINDOW_DAYS + 10,
    ...windowDateParams(),
  };
  // deno-lint-ignore no-explicit-any
  const totals = (body: any) =>
    `${(body?.totals ?? []).map((n: number) => Math.round(n ?? 0)).join(' / ')} (строк: ${(body?.data ?? []).length})`;

  for (const [label, filters] of [
    ['без фильтров', null],
    ['ym:s:isRobot==\'No\'', "ym:s:isRobot=='No'"],
    ['ym:s:isRobot==\'Yes\'', "ym:s:isRobot=='Yes'"],
    ['admin + isRobot==\'No\'', `${ADMIN_EXCLUDE_FILTER_SESSION} AND ym:s:isRobot=='No'`],
  ] as [string, string | null][]) {
    try {
      const body = await metrikaFetch(token, '/stat/v1/data', filters ? { ...base, filters } : base);
      log.push(`Визиты/посетители за ${WINDOW_DAYS} дн. (${label}): ${totals(body)}`);
    } catch (err) {
      log.push(`ОШИБКА на "${label}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Отдельно pageview-уровень (топ страниц) — у него своё пространство имён,
  // и существует ли там ym:pv:isRobot, проверяется только запросом.
  for (const [label, filters] of [
    ['без фильтров', null],
    ['ym:pv:isRobot==\'No\'', "ym:pv:isRobot=='No'"],
  ] as [string, string | null][]) {
    const params = {
      ids: COUNTER_ID,
      metrics: 'ym:pv:pageviews',
      dimensions: 'ym:pv:URLPathFull',
      sort: '-ym:pv:pageviews',
      limit: 30,
      ...windowDateParams(),
    };
    try {
      const body = await metrikaFetch(token, '/stat/v1/data', filters ? { ...params, filters } : params);
      log.push(`Просмотры за ${WINDOW_DAYS} дн. (${label}): ${totals(body)}`);
    } catch (err) {
      log.push(`ОШИБКА на pageview "${label}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

Deno.serve(async (req) => {
  const log: string[] = [];
  const raw: Record<string, unknown> = {};
  let flags: Flags = { dryRun: false, json: false, debugFilter: false, debugRobots: false, backfillDays: null };
  try {
    const body = await req.json().catch(() => ({}));
    flags = {
      dryRun: body?.dryRun === true,
      json: body?.json === true,
      debugFilter: body?.debugFilter === true,
      debugRobots: body?.debugRobots === true,
      backfillDays: normalizeBackfillDays(body?.backfillDays),
    };

    const token = await fetchYandexToken();

    if (flags.debugRobots) {
      await debugRobots(token, flags, log, raw);
      return json({ ok: true, debugRobots: true, log, ...(flags.json ? { raw } : {}) });
    }

    if (flags.debugFilter) {
      await debugAdminFilter(token, flags, log, raw);
      return json({ ok: true, debugFilter: true, log, ...(flags.json ? { raw } : {}) });
    }

    const errors: string[] = [];
    const runSection = async (label: string, run: () => Promise<void>) => {
      try {
        await run();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${label}: ${message.slice(0, 300)}`);
      }
    };

    // Дневные ряды идут первыми отдельно: окно снимков (2)/(3) считается по уже
    // обновлённой истории — иначе в первый прогон после очистки сегодняшнего
    // дня в таблице ещё нет и снимок вышел бы на день короче графика визитов.
    // Их сбой окну не мешает: fetchSnapshotWindow читает Supabase, а не Метрику.
    await runSection('визиты по дням', () => syncDailyStats(token, flags, log, raw));
    const snapshotWindow = await fetchSnapshotWindow(log);

    await runSection('источники трафика', () => syncTrafficSources(token, snapshotWindow, flags, log, raw));
    await runSection('топ страниц', () => syncTopPages(token, snapshotWindow, flags, log, raw));
    await runSection('достижения целей', () => syncGoalCompletions(token, flags, log, raw));

    // Ни один раздел не прошёл — скорее всего протух токен/сменились права.
    // Отвечаем 500, чтобы это было видно в логах функции, а не тихо оставляем
    // пустые таблицы.
    const allFailed = errors.length === 4;
    return json({ ok: !allFailed, dryRun: flags.dryRun, log, errors, ...(flags.json ? { raw } : {}) }, allFailed ? 500 : 200);
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
