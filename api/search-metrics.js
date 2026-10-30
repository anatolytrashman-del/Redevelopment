import { readFile } from 'node:fs/promises';
import { requireStaffAuth } from './_auth.js';
import { buildLiveSnapshot, normalizeSnapshot } from './_searchMetricsLive.js';

// 30.10.2026: живой сбор (api/_searchMetricsLive.js) с кэшем в памяти функции;
// снимок data/search-metrics.json — запасной вариант по каждому источнику.
const CACHE_MS = 30 * 60_000;
let cache = null;

export async function readMetricsSnapshot() {
  return JSON.parse(await readFile(new URL('../data/search-metrics.json', import.meta.url), 'utf8'));
}

export async function readMetricsConfig() {
  return JSON.parse(await readFile(new URL('../data/metrics-sources.json', import.meta.url), 'utf8'));
}

export function resetMetricsCache() {
  cache = null;
}

export async function currentMetrics({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const [snapshot, config] = await Promise.all([readMetricsSnapshot(), readMetricsConfig()]);
  const live = env.GSC_SERVICE_ACCOUNT_JSON || env.BING_WEBMASTER_API_KEY || env.VERCEL_ANALYTICS_TOKEN;
  if (!live) return normalizeSnapshot(snapshot, config);
  if (cache && now.getTime() - cache.at < CACHE_MS) return cache.data;
  const data = await buildLiveSnapshot({ config, snapshot, env, fetchImpl, now });
  cache = { at: now.getTime(), data };
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Метод не поддерживается' });
  if (!await requireStaffAuth(req, res)) return;
  try {
    return res.status(200).json(await currentMetrics());
  } catch {
    return res.status(503).json({ error: 'Показатели недоступны' });
  }
}
