// IndexNow (bing.com/indexnow) — один общий протокол мгновенного
// уведомления поисковиков об URL сайта, участники: Bing, Яндекс, Naver,
// Seznam. Вместо ожидания органического обхода краулером, при каждой
// продовой сборке отправляем полный список URL из готового
// dist/sitemap.xml одним batch-запросом — все участники протокола узнают
// о страницах почти сразу.
//
// Ключ подтверждения владения — статический файл public/<key>.txt (копия
// content = сам ключ), Vite копирует public/ в корень dist как есть.
// На malllist.pro тот же ключ (отдельный Vercel-проект, тот же public/).
//
// Запускается в `npm run build` сразу после generate-sitemap.mjs.
// Только на реальных прод-сборках Vercel.
//
// 2026-09-23 — пинг только при изменениях и не чаще раза в неделю.
// 2026-10-10 — host берётся из DEPLOYED_SITE_MODE (platform | malls).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computePublicBuildId } from './public-build-id.mjs';
import {
  DEPLOYED_SITE_MODE,
  MALLS_ORIGIN,
  PLATFORM_ORIGIN,
} from './domainSplit.mjs';

const INDEXNOW_KEY = '8749bf38ccefd4070d1d1cbb901a168f';
const SITE = DEPLOYED_SITE_MODE === 'malls' ? MALLS_ORIGIN : PLATFORM_ORIGIN;
const HOST = new URL(SITE).host;
const SITEMAP_PATH = resolve(process.cwd(), 'dist/sitemap.xml');
const CATALOG_PATH = resolve(
  process.cwd(),
  DEPLOYED_SITE_MODE === 'malls' ? 'dist/data/trade-centers.json' : 'dist/data/business-centers.json',
);
const STATE_PATH = resolve(process.cwd(), 'dist/indexnow-state.json');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function fingerprint(urlList) {
  const hash = createHash('sha256');
  hash.update(computePublicBuildId().id);
  hash.update('\n');
  hash.update(HOST);
  hash.update('\n');
  hash.update([...urlList].sort().join('\n'));
  hash.update('\n');
  if (existsSync(CATALOG_PATH)) {
    const { rows } = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
    hash.update(JSON.stringify(rows ?? null));
  }
  return hash.digest('hex').slice(0, 32);
}

async function previousState() {
  try {
    const res = await fetch(`${SITE}/indexnow-state.json`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null;
    const state = await res.json().catch(() => null);
    return typeof state?.sentAt === 'string' && typeof state?.fingerprint === 'string' ? state : null;
  } catch {
    return undefined;
  }
}

const keepState = (state) => {
  if (state) writeFileSync(STATE_PATH, JSON.stringify(state));
};

async function main() {
  if (!process.env.VERCEL || process.env.VERCEL_ENV !== 'production') {
    console.log('[notify-indexnow] не прод-сборка Vercel — пропускаем (нет смысла пинговать при локальной/превью-сборке)');
    return;
  }
  let xml;
  try {
    xml = readFileSync(SITEMAP_PATH, 'utf8');
  } catch (err) {
    console.warn(`[notify-indexnow] не удалось прочитать ${SITEMAP_PATH}: ${err instanceof Error ? err.message : err}`);
    return;
  }
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (urlList.length === 0) {
    console.log('[notify-indexnow] sitemap пуст — нечего отправлять');
    return;
  }
  const current = fingerprint(urlList);
  const prev = await previousState();
  if (prev === undefined) {
    console.warn('[notify-indexnow] не удалось прочитать /indexnow-state.json с прода — пропускаем, чтобы не пинговать вслепую');
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/business_centers?select=slug&limit=1`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 402) {
      keepState(prev);
      console.log('[notify-indexnow] Supabase закрыт (402) — страницы собраны копиями с прода, пропускаем');
      return;
    }
  } catch {
    // сеть до Supabase не ответила — это не повод молчать, решает отпечаток ниже
  }
  if (prev?.fingerprint === current) {
    keepState(prev);
    console.log('[notify-indexnow] страницы не менялись с отправки ' + prev.sentAt + ' — пропускаем');
    return;
  }
  if (prev && Date.now() - new Date(prev.sentAt).getTime() < MIN_INTERVAL_MS) {
    keepState(prev);
    console.log(`[notify-indexnow] изменения есть, но прошлая отправка ${prev.sentAt} — меньше недели назад, отложено`);
    return;
  }
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok || res.status === 202) {
      writeFileSync(STATE_PATH, JSON.stringify({ sentAt: new Date().toISOString(), fingerprint: current }));
      console.log(`[notify-indexnow] ${HOST}: отправлено ${urlList.length} URL, статус ${res.status}`);
    } else {
      keepState(prev);
      const body = await res.text().catch(() => '');
      console.warn(`[notify-indexnow] IndexNow вернул ${res.status}: ${body.slice(0, 300)}`);
    }
  } catch (err) {
    keepState(prev);
    console.warn(`[notify-indexnow] сетевая ошибка: ${err instanceof Error ? err.message : err}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 0;
});
