#!/usr/bin/env node
// Обновляет запасной снимок data/search-metrics.json тем же кодом, что и живой
// /api/search-metrics (api/_searchMetricsLive.js): GSC + Bing по всем доменам
// сайта (склеены), Vercel Web Analytics без ботов и ИИ-агентов.
// Ключи — из env: GSC_SERVICE_ACCOUNT_JSON, BING_WEBMASTER_API_KEY,
// VERCEL_ANALYTICS_TOKEN. Секреты в файл и в консоль не пишутся.
//   node scripts/refresh-search-metrics.mjs
import { rename, writeFile } from 'node:fs/promises';
import { readMetricsConfig, readMetricsSnapshot } from '../api/search-metrics.js';
import { buildLiveSnapshot } from '../api/_searchMetricsLive.js';

const target = new URL('../data/search-metrics.json', import.meta.url);
const [config, snapshot] = await Promise.all([readMetricsConfig(), readMetricsSnapshot()]);
const data = await buildLiveSnapshot({ config, snapshot });
const text = `${JSON.stringify(data, null, 2)}\n`;
if (/private_key|client_email|apikey|Bearer /i.test(text)) throw new Error('в снимке оказался секрет — не записываю');
const tmp = new URL('../data/search-metrics.json.tmp', import.meta.url);
await writeFile(tmp, text);
await rename(tmp, target);
for (const s of data.sites) {
  console.log(s.id, 'gsc', s.gsc.status, s.gsc.daily.at(-1)?.day ?? '—', 'bing', s.bing.status, s.bing.daily.at(-1)?.day ?? '—', 'wa', s.analytics.status, s.analytics.daily.at(-1)?.day ?? '—');
}
