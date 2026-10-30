// Живой сбор «Поиск и ИИ» для /api/search-metrics (30.10.2026).
//
// Почему: до 30.10 страница читала только снимок data/search-metrics.json,
// который собирался руками на машине и попадал на сайт лишь с выкладкой, —
// поэтому «Показатели» застыли на 28.10 (GSC — на 25.10) на всех вкладках.
// Теперь функция сама ходит в GSC (сервисный аккаунт, webmasters.readonly),
// Bing Webmaster и Vercel Web Analytics, кэширует ответ в памяти на 30 минут,
// а снимок остаётся запасным вариантом по каждому источнику отдельно.
//
// Env (Production проекта redevelopment): GSC_SERVICE_ACCOUNT_JSON,
// BING_WEBMASTER_API_KEY, VERCEL_ANALYTICS_TOKEN. Секреты наружу не уходят,
// тела ошибок внешних API в ответ не попадают.
//
// У сайта может быть несколько доменов (GamblingList = gamblinglist.pro +
// whitegambling.pro, второй редиректит на первый): GSC и Bing по ним
// складываются по дням, CTR = клики / показы, позиция взвешена по показам.

import { createSign } from 'node:crypto';
import { botExpression, botNames, withoutBots } from './_webAnalyticsBots.js';

const WA = 'https://api.vercel.com/v1/query/web-analytics/visits';
const GSC_DAYS = 480;
const WA_DAYS = 61; // дневной запрос Web Analytics ограничен 62 днями
const TIMEOUT_MS = 12_000;

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

async function getJson(fetchImpl, url, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetchImpl(url, { ...init, signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    throw new Error(err?.name === 'AbortError' ? 'timeout' : String(err?.message || 'network-error').slice(0, 40));
  } finally {
    clearTimeout(timer);
  }
}

function hostFilter(field, hosts) {
  const values = [...new Set(hosts.flatMap((h) => [h, `www.${h}`]))].sort();
  return `${field} in (${values.map((h) => `'${h}'`).join(',')})`;
}

export function trafficFilters(config) {
  const ai = hostFilter('referrerHostname', config.aiHosts);
  return { ai, search: `(${hostFilter('referrerHostname', config.searchHosts)}) and not (${ai})` };
}

// ---------- GSC ----------
const b64url = (v) => Buffer.from(v).toString('base64url');

async function gscToken(fetchImpl, raw) {
  const info = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: info.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${claim}`);
  const jwt = `${head}.${claim}.${signer.sign(info.private_key).toString('base64url')}`;
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt });
  const data = await getJson(fetchImpl, 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  return data.access_token;
}

async function gscDaily(fetchImpl, token, domain, start, end) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(`sc-domain:${domain}`)}/searchAnalytics/query`;
  const data = await getJson(fetchImpl, url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    // 'all' — вместе со свежими (ещё не окончательными) днями: GSC отдаёт их
    // с задержкой ~1–2 дня вместо 2–3 у 'final'.
    body: JSON.stringify({ startDate: start, endDate: end, dimensions: ['date'], type: 'web', dataState: 'all', rowLimit: 25000 }),
  });
  return (data.rows ?? []).map((r) => ({ day: r.keys[0], clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), position: r.position }));
}

// ---------- Bing ----------
async function bingDaily(fetchImpl, key, domain) {
  const params = new URLSearchParams({ apikey: key, siteUrl: `https://${domain}/` });
  const data = await getJson(fetchImpl, `https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats?${params}`);
  return (data.d ?? []).map((r) => {
    const stamp = /\/Date\((\d+)/.exec(r.Date);
    return { day: stamp ? iso(new Date(Number(stamp[1]))) : String(r.Date).slice(0, 10), clicks: Number(r.Clicks) || 0, impressions: Number(r.Impressions) || 0 };
  });
}

/** Сумма по дням по нескольким доменам; CTR пересчитан, позиция взвешена по показам. */
export function mergeSearchDays(lists) {
  const days = new Map();
  for (const list of lists) {
    for (const r of list) {
      const d = days.get(r.day) ?? { day: r.day, clicks: 0, impressions: 0, _pos: 0, _w: 0 };
      d.clicks += r.clicks;
      d.impressions += r.impressions;
      if (typeof r.position === 'number' && r.impressions > 0) { d._pos += r.position * r.impressions; d._w += r.impressions; }
      days.set(r.day, d);
    }
  }
  return [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map(({ _pos, _w, ...d }) => ({
    ...d,
    ...(_w ? { ctr: d.impressions ? d.clicks / d.impressions : 0, position: _pos / _w } : {}),
  }));
}

// ---------- Vercel Web Analytics ----------
export async function webAnalyticsBots(fetchImpl, { token, teamId, projectId, since, until, config }) {
  const q = (by) => getJson(fetchImpl, `${WA}/aggregate?${new URLSearchParams({ teamId, projectId, since, until, by, limit: '100' })}`,
    { headers: { Authorization: `Bearer ${token}` } }).then((d) => d.data ?? []);
  const [browsers, oses] = await Promise.all([q('browserName'), q('osName')]);
  const names = {
    browserName: botNames(browsers, 'browserName', config.botNamePattern),
    osName: botNames(oses, 'osName', config.botNamePattern),
  };
  return { names, expression: botExpression(config.botRules, names) };
}

async function analyticsDaily(fetchImpl, { token, teamId, projectId, since, until, config }) {
  const { expression: bots } = await webAnalyticsBots(fetchImpl, { token, teamId, projectId, since, until, config });
  const filters = trafficFilters(config);
  const series = { search: withoutBots(filters.search, bots), ai: withoutBots(filters.ai, bots), ...(bots ? { bots } : {}) };
  const daily = new Map();
  await Promise.all(Object.entries(series).map(async ([channel, filter]) => {
    const params = new URLSearchParams({ teamId, projectId, since, until, by: 'day', limit: '100', filter });
    const data = await getJson(fetchImpl, `${WA}/aggregate?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    for (const r of data.data ?? []) {
      const day = String(r.timestamp).slice(0, 10);
      if (day < since.slice(0, 10) || day > until.slice(0, 10)) continue;
      const row = daily.get(day) ?? { day, search: 0, ai: 0, bots: 0 };
      row[channel] = Number(r.visitors) || 0;
      daily.set(day, row);
    }
  }));
  return [...daily.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Старшая история из снимка + свежее окно (окно заменяет снимок целиком). */
function splice(before, fresh, cutoff) {
  return [...(before ?? []).filter((r) => r.day < cutoff), ...fresh];
}

function fallbackSite(snapshot, site) {
  const old = snapshot?.sites?.find((s) => s.id === site.id) ?? {};
  const wg = snapshot?.sites?.find((s) => s.id === 'wg-history');
  const empty = { status: 'not-configured', daily: [] };
  const gsc = old.gsc ?? empty;
  const bing = old.bing ?? empty;
  // Старый снимок (до 30.10) держал whitegambling.pro отдельной строкой — склеиваем.
  const merge = (a, b) => (b?.daily?.length && (site.domains ?? []).includes(wg?.domain)
    ? { ...a, daily: mergeSearchDays([a.daily ?? [], b.daily]) } : a);
  return {
    gsc: merge(gsc, wg?.gsc), bing: merge(bing, wg?.bing),
    analytics: old.analytics ?? empty,
  };
}

/** Снимок старого формата → новый: домены склеены, WG отдельно не выводится. */
export function normalizeSnapshot(snapshot, config) {
  return {
    version: 2,
    generatedAt: snapshot?.generatedAt ?? null,
    sites: config.sites.map((site) => ({ ...site, ...fallbackSite(snapshot, site) })),
  };
}

export async function buildLiveSnapshot({ config, snapshot, env = process.env, fetchImpl = fetch, now = new Date() }) {
  const end = iso(now);
  const gscStart = addDays(end, -GSC_DAYS);
  const waSince = `${addDays(end, -(WA_DAYS - 1))}T00:00:00.000Z`;
  const waUntil = now.toISOString();
  const generatedAt = now.toISOString();
  let tokenPromise = null;
  const gscAccess = () => (tokenPromise ??= gscToken(fetchImpl, env.GSC_SERVICE_ACCOUNT_JSON));

  const sites = await Promise.all(config.sites.map(async (site) => {
    const base = fallbackSite(snapshot, site);
    const domains = site.domains ?? [site.domain];
    const out = { ...site, ...base };
    const tasks = [];
    if (env.GSC_SERVICE_ACCOUNT_JSON) {
      tasks.push((async () => {
        try {
          const token = await gscAccess();
          const fresh = mergeSearchDays(await Promise.all(domains.map((d) => gscDaily(fetchImpl, token, d, gscStart, end))));
          out.gsc = { status: 'ok', updatedAt: generatedAt, daily: splice(base.gsc.daily, fresh, gscStart) };
        } catch { if (base.gsc.daily?.length) out.gsc = { ...base.gsc, status: 'stale' }; }
      })());
    }
    if (env.BING_WEBMASTER_API_KEY) {
      tasks.push((async () => {
        try {
          const fresh = mergeSearchDays(await Promise.all(domains.map((d) => bingDaily(fetchImpl, env.BING_WEBMASTER_API_KEY, d))));
          out.bing = { status: 'ok', updatedAt: generatedAt, daily: splice(base.bing.daily, fresh, fresh[0]?.day ?? end) };
        } catch { if (base.bing.daily?.length) out.bing = { ...base.bing, status: 'stale' }; }
      })());
    }
    if (env.VERCEL_ANALYTICS_TOKEN && site.project) {
      tasks.push((async () => {
        try {
          const fresh = await analyticsDaily(fetchImpl, {
            token: env.VERCEL_ANALYTICS_TOKEN, teamId: config.teamId, projectId: site.project, since: waSince, until: waUntil, config,
          });
          out.analytics = { status: 'ok', updatedAt: generatedAt, since: waSince.slice(0, 10), until: end, metric: 'daily-visitors',
            botsFiltered: true, daily: splice(base.analytics.daily, fresh, waSince.slice(0, 10)) };
        } catch { if (base.analytics.daily?.length) out.analytics = { ...base.analytics, status: 'stale' }; }
      })());
    }
    await Promise.all(tasks);
    return out;
  }));
  return { version: 2, generatedAt, sites };
}
