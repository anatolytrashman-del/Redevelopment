// IndexNow (bing.com/indexnow) — один общий протокол мгновенного
// уведомления поисковиков об URL сайта, участники: Bing, Яндекс, Naver,
// Seznam. Вместо ожидания органического обхода краулером, при каждой
// продовой сборке отправляем полный список URL из готового
// dist/sitemap.xml одним batch-запросом — все участники протокола узнают
// о страницах почти сразу.
//
// Ключ подтверждения владения — статический файл public/<key>.txt (копия
// content = сам ключ), Vite копирует public/ в корень dist как есть, так
// что https://redevelopment.pro/<key>.txt доступен без отдельного кода на
// сервере. Проверка владения — тот факт, что engine может скачать файл по
// этому пути и увидеть внутри тот же ключ, что в теле запроса.
//
// Запускается в `npm run build` сразу после generate-sitemap.mjs (нужен
// уже дополненный dist/sitemap.xml — карточки БЦ/хабы метро/улиц). Как и
// у generate-sitemap.mjs — сетевая ошибка НЕ валит сборку, только
// предупреждение в лог.
//
// Только на реальных сборках Vercel (process.env.VERCEL) — локальные/
// дев-прогоны в песочнице не должны спамить внешний API одним и тем же
// списком URL при каждой отладочной сборке.
//
// 2026-09-23 — пинг только при изменениях и не чаще раза в неделю (решение
// владельца). Раньше список уходил на КАЖДОЙ прод-сборке, а их бывало под
// сотню в сутки (22.09 — 96) — одни и те же 257 URL сотню раз подряд
// поисковик вправе счесть спамом и перестать слушать. Теперь:
// - «изменения» — отпечаток из кода публичных страниц (public-build-id),
//   набора URL карты сайта и данных каталога БЦ (dist/data, без даты
//   сборки). Правки объектов в админке в отпечаток не входят — их страниц
//   единицы, их поисковик подхватит по карте сайта;
// - память между сборками — файл dist/indexnow-state.json ({ sentAt,
//   fingerprint }), который следующая сборка читает с прода, тот же приём,
//   что /public-build-id.txt у пререндера. Не отправили — переносим прежнее
//   состояние как есть, поэтому изменение, придержанное недельным окном,
//   уйдёт первой сборкой после его конца.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computePublicBuildId } from './public-build-id.mjs';

const HOST = 'redevelopment.pro';
const SITE = `https://${HOST}`;
const INDEXNOW_KEY = '8749bf38ccefd4070d1d1cbb901a168f';
const SITEMAP_PATH = resolve(process.cwd(), 'dist/sitemap.xml');
const CATALOG_PATH = resolve(process.cwd(), 'dist/data/business-centers.json');
const STATE_PATH = resolve(process.cwd(), 'dist/indexnow-state.json');
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_EQwXLOy5TmSPj5tzKjbSeg_xj6SM2Iz';
const MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

function fingerprint(urlList) {
  const hash = createHash('sha256');
  hash.update(computePublicBuildId().id);
  hash.update('\n');
  hash.update([...urlList].sort().join('\n'));
  hash.update('\n');
  if (existsSync(CATALOG_PATH)) {
    const { rows } = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
    hash.update(JSON.stringify(rows ?? null));
  }
  return hash.digest('hex').slice(0, 32);
}

// undefined — прод недоступен (не знаем, когда пинговали: лучше промолчать),
// null — состояния на проде ещё нет (первая сборка с этой логикой).
async function previousState() {
  try {
    const res = await fetch(`${SITE}/indexnow-state.json`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    const state = await res.json();
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
  // База закрыта (2026-09-23, 402) — сборка копирует СТАРУЮ разметку с прода
  // (см. prerender.mjs, режим outage): звать поисковик сейчас — потратить
  // недельное окно на прошлую версию страниц.
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
    console.log(`[notify-indexnow] страницы не менялись с отправки ${prev.sentAt} — пропускаем`);
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
    // IndexNow отвечает 200 (принято) или 202 (принято, ключ ещё не проверен
    // по всем участникам) — оба означают "успешно отправлено".
    if (res.ok || res.status === 202) {
      writeFileSync(STATE_PATH, JSON.stringify({ sentAt: new Date().toISOString(), fingerprint: current }));
      console.log(`[notify-indexnow] отправлено ${urlList.length} URL, статус ${res.status}`);
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
  // Не роняем сборку — тот же принцип, что и у generate-sitemap.mjs.
  process.exitCode = 0;
});
