// Сбор инфраструктуры вокруг бизнес-центров каталога через API Яндекс.Карт.
//
// ЗАПАСНОЙ путь. Основной — scripts/capture-yandex-nearby.mjs: он собирает
// то же самое браузером на машине владельца, потому что бесплатных лимитов
// ключей Яндекса (500 запросов в сутки) на 141 здание не хватает. Общие
// правила обоих путей — в scripts/nearby-places-common.mjs.
//
// История: 2026-09-18 пилот собрал 69 точек для одного БЦ «Порт» через 2ГИС
// (scripts/sync-2gis-port-pilot.mjs). Ключ 2ГИС владелец отключил, источником
// выбран Яндекс — тот же, чьи карты мы уже показываем на страницах, поэтому
// точка на карте и точка в базе не расходятся.
//
// Два разных API Яндекса и два разных ключа:
//   YANDEX_PLACES_API_KEY   — «Поиск по организациям» (search-maps.yandex.ru),
//                             отдаёт кафе/аптеки/банки/магазины;
//   YANDEX_GEOCODER_API_KEY — HTTP Геокодер (geocode-maps.yandex.ru), только
//                             им находятся станции метро (kind=metro).
// Если второго нет, скрипт пробует первым ключом: в кабинете разработчика
// Яндекса геокодер часто выдаётся тем же ключом, что и JS API.
//
// Запуск:
//   node scripts/sync-bc-nearby-places.mjs --dry-run --limit=3
//   node scripts/sync-bc-nearby-places.mjs --only=port,ajax
//   node scripts/sync-bc-nearby-places.mjs            # весь каталог
//
// Прогон возобновляемый: БЦ, у которого свежий снимок (--max-age-days, по
// умолчанию 45), пропускается. Поэтому упершись в суточный лимит Яндекса,
// достаточно запустить скрипт ещё раз завтра — он продолжит с того же места.

import {
  SOURCE,
  SUPABASE_URL,
  categoryFromRubric,
  dedupePlaces,
  haversineMeters,
  radiusFor,
  readCenters,
  writePlaces,
} from './nearby-places-common.mjs';

// Запросы к «Поиску по организациям». text — обычная поисковая строка, как в
// самих Яндекс.Картах; категорию ставим по запросу, а если Яндекс вернул свою
// рубрику — по рубрике (она точнее: по запросу «магазин» приезжают и аптеки).
//
// 'кафе' и 'ресторан' — оба в категорию 'cafe' (владелец, 2026-09-21: «кафе
// и рестораны делай в одну категорию»), 'кофейня' — отдельным запросом в
// свою 'coffee' («давай соберем кофейни отдельно»). Держать в паре с тем же
// списком в capture-yandex-nearby.mjs — расхождение означает разные наборы
// категорий у двух путей сбора одних и тех же данных.
export const INFRA_QUERIES = [
  { category: 'transport_stop', text: 'остановка общественного транспорта' },
  { category: 'coffee', text: 'кофейня' },
  { category: 'cafe', text: 'кафе' },
  { category: 'cafe', text: 'ресторан' },
  { category: 'grocery', text: 'продуктовый магазин' },
  { category: 'shop', text: 'магазин' },
  { category: 'pharmacy', text: 'аптека' },
  { category: 'bank', text: 'банк' },
  { category: 'atm', text: 'банкомат' },
  { category: 'fitness', text: 'фитнес клуб' },
];

// Places API принимает не радиус, а окно (ll + spn) — переводим метры в
// градусы. Долгота сжимается косинусом широты: в Минске 500 м по долготе —
// это почти вдвое больше градусов, чем по широте.
export function spanForRadius(lat, radiusMeters) {
  const latSpan = (radiusMeters / 111320) * 2;
  const lngSpan = (radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180))) * 2;
  return { latSpan: Number(latSpan.toFixed(6)), lngSpan: Number(lngSpan.toFixed(6)) };
}

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, only: null, maxAgeDays: 45, delayMs: 250, skipMetro: false };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--no-metro') args.skipMetro = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice(8));
    else if (arg.startsWith('--only=')) args.only = arg.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith('--max-age-days=')) args.maxAgeDays = Number(arg.slice(15));
    else if (arg.startsWith('--delay=')) args.delayMs = Number(arg.slice(8));
    else if (arg.startsWith('--')) throw new Error(`Неизвестный флаг: ${arg}`);
  }
  return args;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RateLimitError extends Error {}

async function fetchJson(url, { attempts = 3 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (response.status === 429) throw new RateLimitError('Яндекс: слишком много запросов (429)');
      if (response.status === 403) {
        const body = await response.text();
        throw new RateLimitError(`Яндекс: 403 — ${body.slice(0, 200)}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      return await response.json();
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1500);
    }
  }
  throw lastError;
}


// --- Яндекс ---------------------------------------------------------------

async function searchOrganizations({ center, query, apiKey }) {
  const radius = radiusFor(query.category);
  const { latSpan, lngSpan } = spanForRadius(center.lat, radius);
  const url = new URL('https://search-maps.yandex.ru/v1/');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('text', query.text);
  url.searchParams.set('lang', 'ru_RU');
  url.searchParams.set('ll', `${center.lng},${center.lat}`);
  url.searchParams.set('spn', `${lngSpan},${latSpan}`);
  // rspn=1 — не выпускать выдачу за пределы окна: без него Яндекс дотягивает
  // результаты из другого конца города, и «ближайшая аптека» оказывается за
  // четыре километра.
  url.searchParams.set('rspn', '1');
  url.searchParams.set('type', 'biz');
  url.searchParams.set('results', '50');
  const body = await fetchJson(url);
  const places = [];
  for (const feature of body?.features ?? []) {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const distance = haversineMeters(center, { lat, lng });
    if (distance > radius) continue;
    const meta = feature?.properties?.CompanyMetaData ?? {};
    const classes = (meta.Categories ?? []).map((c) => c?.class).filter(Boolean);
    const category = categoryFromRubric(classes.join(' '), query.category);
    // Категории с меньшим радиусом (магазин попал в окно поиска остановок и
    // наоборот) отсеиваем по их собственному радиусу, иначе окно одной
    // категории тихо расширяет другую.
    if (distance > radiusFor(category)) continue;
    const name = String(meta.name ?? feature?.properties?.name ?? '').trim();
    if (!name) continue;
    places.push({
      business_center_slug: center.slug,
      source_place_id: meta.id ? String(meta.id) : '',
      name,
      category,
      subcategory: meta.Categories?.[0]?.name ?? null,
      address: meta.address ?? null,
      lat,
      lng,
      distance_meters: distance,
      source: SOURCE,
      source_url: meta.id ? `https://yandex.ru/maps/org/${meta.id}` : null,
      collected_at: new Date().toISOString(),
    });
  }
  return places;
}

// Метро отдаёт не «Поиск по организациям», а геокодер: станция — это
// топоним (kind=metro), а не организация.
async function searchMetro({ center, apiKey }) {
  const url = new URL('https://geocode-maps.yandex.ru/1.x/');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('geocode', `${center.lng},${center.lat}`);
  url.searchParams.set('kind', 'metro');
  url.searchParams.set('results', '5');
  url.searchParams.set('format', 'json');
  url.searchParams.set('lang', 'ru_RU');
  const body = await fetchJson(url);
  const members = body?.response?.GeoObjectCollection?.featureMember ?? [];
  const places = [];
  for (const member of members) {
    const geoObject = member?.GeoObject;
    const pos = geoObject?.Point?.pos;
    if (typeof pos !== 'string') continue;
    const [lngRaw, latRaw] = pos.split(' ');
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const distance = haversineMeters(center, { lat, lng });
    if (distance > radiusFor('metro')) continue;
    const name = String(geoObject?.name ?? '').trim();
    if (!name) continue;
    const meta = geoObject?.metaDataProperty?.GeocoderMetaData ?? {};
    places.push({
      business_center_slug: center.slug,
      source_place_id: `metro:${name}`,
      name,
      category: 'metro',
      subcategory: 'Станция метро',
      address: meta.text ?? null,
      lat,
      lng,
      distance_meters: distance,
      source: SOURCE,
      source_url: null,
      collected_at: new Date().toISOString(),
    });
  }
  return places;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const placesKey = process.env.YANDEX_PLACES_API_KEY;
  const geocoderKey = process.env.YANDEX_GEOCODER_API_KEY || placesKey;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!placesKey) {
    console.error('Нужен YANDEX_PLACES_API_KEY (ключ «Поиск по организациям» из кабинета разработчика Яндекса)');
    process.exit(1);
  }
  if (!args.dryRun && !accessToken && !serviceKey) {
    console.error('Нужен SUPABASE_ACCESS_TOKEN или SUPABASE_SERVICE_ROLE_KEY для записи (или флаг --dry-run)');
    process.exit(1);
  }

  let supabase = null;
  if (serviceKey) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, serviceKey);
  }

  const centers = await readCenters({ supabase, accessToken });

  const maxAgeMs = args.maxAgeDays * 24 * 60 * 60 * 1000;
  let queue = centers.filter((center) => {
    if (args.only && !args.only.includes(center.slug)) return false;
    if (!center.collected_at) return true;
    return Date.now() - new Date(center.collected_at).getTime() > maxAgeMs;
  });
  if (args.limit) queue = queue.slice(0, args.limit);

  console.log(`БЦ с координатами: ${centers.length}; в очереди на сбор: ${queue.length}${args.dryRun ? ' (пробный прогон, в базу не пишем)' : ''}`);

  let done = 0;
  let totalPlaces = 0;
  for (const row of queue) {
    const center = { slug: row.slug, lat: Number(row.lat), lng: Number(row.lng) };
    const collected = [];
    try {
      if (!args.skipMetro && geocoderKey) {
        collected.push(...(await searchMetro({ center, apiKey: geocoderKey })));
        await sleep(args.delayMs);
      }
      for (const query of INFRA_QUERIES) {
        collected.push(...(await searchOrganizations({ center, query, apiKey: placesKey })));
        await sleep(args.delayMs);
      }
    } catch (error) {
      if (error instanceof RateLimitError) {
        console.error(`\nЛимит Яндекса на «${row.slug}»: ${error.message}`);
        console.error(`Обработано БЦ: ${done}. Запустите скрипт повторно — уже собранные пропустятся.`);
        process.exit(2);
      }
      throw error;
    }

    const places = dedupePlaces(collected);
    const byCategory = places.reduce((acc, place) => {
      acc[place.category] = (acc[place.category] ?? 0) + 1;
      return acc;
    }, {});
    if (!args.dryRun) await writePlaces({ supabase, accessToken, slug: center.slug, places });
    done += 1;
    totalPlaces += places.length;
    console.log(
      `${done}/${queue.length} ${row.slug}: ${places.length} точек (${Object.entries(byCategory).map(([k, v]) => `${k} ${v}`).join(', ') || 'пусто'})`,
    );
  }

  console.log(`Готово: ${done} БЦ, ${totalPlaces} точек${args.dryRun ? ' (ничего не записано)' : ''}`);
}

// Файл одновременно и скрипт, и модуль с чистыми функциями для тестов.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
