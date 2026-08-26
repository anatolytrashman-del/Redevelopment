// ВРЕМЕННЫЙ диагностический эндпоинт — проверяем, работает ли обращение к
// внутреннему API Яндекс.Карт (список организаций по дому) с сервера, без
// живого браузера. Из песочницы Claude Code yandex.ru заблокирован прокси,
// поэтому единственный способ проверить — задеплоить и дёрнуть с прода.
// Удалить после того, как подход подтверждён и перенесён в постоянный
// scripts/sync-district-business-points.mjs.
//
// GET /api/debug-yandex-business?secret=<DEBUG_SECRET>&address=просп. Мира, 1, Минск

const DEBUG_SECRET = 'mm-yandex-biz-debug-2026';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

function yandexHeaders() {
  const cookie = process.env.YANDEX_MAPS_COOKIE;
  if (!cookie) throw new Error('YANDEX_MAPS_COOKIE не задан в env');
  return {
    'User-Agent': UA,
    Accept: '*/*',
    'Accept-Language': 'ru-RU,ru;q=0.9',
    Referer: 'https://yandex.ru/maps/157/minsk/',
    Cookie: cookie,
  };
}

// Шаг 1: превращаем текст адреса в координаты дома (requestGeoWhere) —
// тот же запрос, что уходит при вводе адреса в поиск на Яндекс.Картах.
async function resolveAddress(address) {
  const url = new URL('https://yandex.ru/maps/api/search');
  url.searchParams.set('ajax', '1');
  url.searchParams.set('add_type', 'direct');
  url.searchParams.set('lang', 'ru_RU');
  url.searchParams.set('results', '25');
  url.searchParams.set('text', address);
  url.searchParams.set('origin', 'maps-form');

  const resp = await fetchWithTimeout(url.toString(), { headers: yandexHeaders() });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`resolveAddress: HTTP ${resp.status}: ${text.slice(0, 500)}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`resolveAddress: не JSON: ${text.slice(0, 500)}`);
  }
  const geoWhere = json?.data?.requestGeoWhere;
  if (!geoWhere?.coordinates) throw new Error(`resolveAddress: нет requestGeoWhere в ответе: ${JSON.stringify(json).slice(0, 500)}`);
  return geoWhere; // { coordinates: [lon, lat], kind, encodedCoordinates, ... }
}

// Шаг 2: список организаций строго в этой точке (дом), постранично.
async function fetchBusinessPage(lat, lon, skip) {
  const url = new URL('https://yandex.ru/maps/api/search');
  url.searchParams.set('ajax', '1');
  url.searchParams.set('type', 'biz');
  url.searchParams.set('business_mode', 'exact');
  url.searchParams.set('business_show_closed', '0');
  url.searchParams.set('lang', 'ru_RU');
  url.searchParams.set('origin', 'maps-toponym-orgs');
  url.searchParams.set('results', '25');
  url.searchParams.set('skip', String(skip));
  url.searchParams.set('text', '');
  url.searchParams.set('geowhere', `${lat},${lon}`);

  const resp = await fetchWithTimeout(url.toString(), { headers: yandexHeaders() });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`fetchBusinessPage(skip=${skip}): HTTP ${resp.status}: ${text.slice(0, 500)}`);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`fetchBusinessPage(skip=${skip}): не JSON: ${text.slice(0, 500)}`);
  }
  return json?.data;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (req.query.secret !== DEBUG_SECRET) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  const address = req.query.address;
  if (!address || typeof address !== 'string') {
    res.status(400).json({ error: 'address query param required' });
    return;
  }

  try {
    const geoWhere = await resolveAddress(address);
    const [lon, lat] = geoWhere.coordinates;

    const items = [];
    let skip = 0;
    let totalResultCount = null;
    for (let page = 0; page < 10; page++) {
      const data = await fetchBusinessPage(lat, lon, skip);
      if (totalResultCount === null) totalResultCount = data?.totalResultCount ?? 0;
      const pageItems = data?.items ?? [];
      items.push(
        ...pageItems.map((it) => ({
          id: it.id,
          title: it.title,
          address: it.address,
          coordinates: it.coordinates,
          categories: (it.categories ?? []).map((c) => ({ name: c.name, seoname: c.seoname })),
          status: it.status,
        })),
      );
      skip += pageItems.length;
      if (pageItems.length === 0 || skip >= totalResultCount) break;
      // пауза между страницами одного дома — не долбим Яндекс без остановки
      await new Promise((r) => setTimeout(r, 800));
    }

    res.status(200).json({
      address,
      resolved: { lat, lon, encodedCoordinates: geoWhere.encodedCoordinates, kind: geoWhere.kind },
      totalResultCount,
      collected: items.length,
      items,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
