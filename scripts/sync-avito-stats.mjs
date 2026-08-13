// Раз в сутки (см. .github/workflows/sync-demand-stats.yml) забирает у Avito
// статистику (просмотры/избранное/контакты) и сохраняет в public.demand_stats.
//
// В отличие от Kufar/Realt, у Avito нет найденного эндпойнта "список всех
// моих объявлений" — поэтому список ID берём из ссылок, которые сами
// пользователи добавляют в "Проверку спроса" (object.demand_links, source =
// 'Avito'), а не напрямую из аккаунта Avito.
//
// Авторизация — через cookie сессии, записанную из консоли браузера в уже
// залогиненной вкладке. В отличие от Kufar/Realt (токены живут ~год), у
// Avito cookie sessid — JWT со сроком жизни ВСЕГО 24 ЧАСА (см. exp внутри
// токена), так что она гарантированно протухнет уже на следующие сутки.
// Когда начнёт падать с 401/403 — повторить запись и обновить секрет
// AVITO_COOKIE; долгоживущей альтернативы (refresh-flow через куку rt) в
// этой версии скрипта нет.
//
// Эндпойнт /web/1/vas/stats отдаёт статистику по дням начиная со дня
// создания объявления (без явного указания диапазона дат), поэтому
// суммируем views/favorites/contactsShowPhone/contactsMessenger по всем
// дням, чтобы получить показатели за всё время.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AVITO_COOKIE = process.env.AVITO_COOKIE;

if (!SUPABASE_SERVICE_ROLE_KEY || !AVITO_COOKIE) {
  console.error('Не заданы переменные окружения SUPABASE_SERVICE_ROLE_KEY / AVITO_COOKIE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const STATS_URL = 'https://www.avito.ru/web/1/vas/stats';

const COMMON_HEADERS = {
  Accept: '*/*',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  'Content-Type': 'application/json',
  Origin: 'https://www.avito.ru',
  Referer: 'https://www.avito.ru/profile',
  Cookie: AVITO_COOKIE,
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
};

// Дублирует extractAdId из src/data/objects.ts — у Avito id приклеен к
// слагу через подчёркивание в последнем сегменте пути, а не отдельным
// сегментом, как у Kufar/Realt.
function extractAdId(url) {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^\d{5,}$/.test(segments[i])) return segments[i];
    }
    const trailing = segments[segments.length - 1]?.match(/(\d{6,})$/);
    if (trailing) return trailing[1];
  } catch {
    // не похоже на валидный URL
  }
  return null;
}

async function fetchAvitoAdIds() {
  const { data, error } = await supabase.from('objects').select('demand_links');
  if (error) throw error;

  const ids = new Set();
  for (const row of data ?? []) {
    for (const link of row.demand_links ?? []) {
      if (link.source !== 'Avito') continue;
      const id = extractAdId(link.url);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

async function fetchItemStats(adId) {
  const res = await fetch(STATS_URL, {
    method: 'POST',
    headers: COMMON_HEADERS,
    body: JSON.stringify({ itemId: Number(adId) }),
  });

  if (!res.ok) {
    throw new Error(`Avito vas/stats (${adId}) вернул ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const days = Object.values(data.stats ?? {});
  const sum = (key) => days.reduce((total, day) => total + (day[key] ?? 0), 0);

  return {
    views: sum('views'),
    favorites: sum('favorites'),
    calls: sum('contactsShowPhone'),
    messages: sum('contactsMessenger'),
  };
}

async function main() {
  const adIds = await fetchAvitoAdIds();
  console.log(`Avito: найдено ${adIds.length} объявлений в ссылках "Проверки спроса"`);

  if (adIds.length === 0) return;

  const checkedAt = new Date().toISOString();
  const rows = [];
  for (const adId of adIds) {
    try {
      const stats = await fetchItemStats(adId);
      rows.push({ source: 'Avito', ad_id: adId, checked_at: checkedAt, ...stats });
    } catch (err) {
      console.warn(`Не удалось получить статистику для ${adId}:`, err.message);
    }
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from('demand_stats').upsert(rows, { onConflict: 'source,ad_id' });
  if (error) throw error;

  console.log(`Сохранено ${rows.length} записей в demand_stats.`);
}

main().catch((err) => {
  console.error('Синхронизация не удалась:', err);
  process.exit(1);
});
