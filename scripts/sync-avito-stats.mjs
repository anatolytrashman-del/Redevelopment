// Раз в сутки (см. .github/workflows/sync-demand-stats.yml) забирает у Avito
// статистику (просмотры/избранное/контакты) и сохраняет в public.demand_stats.
//
// В отличие от Kufar/Realt, у Avito нет найденного эндпойнта "список всех
// моих объявлений" — поэтому список ID берём из ссылок, которые сами
// пользователи добавляют в "Проверку спроса" (object.demand_links, source =
// 'Avito'), а не напрямую из аккаунта Avito.
//
// Авторизация — через cookie сессии. У Avito cookie sessid — JWT со сроком
// жизни всего 24 часа (в отличие от Kufar/Realt, где токены живут ~год), но
// мы не знаем наверняка, продлевает ли Avito сессию сама через Set-Cookie на
// обычных ответах (частый паттерн — "скользящее" продление). Поэтому после
// каждого запроса проверяем ответ на Set-Cookie и, если он есть, сохраняем
// обновлённую cookie в таблицу public.integration_cookies — следующий запуск
// возьмёт её оттуда вместо секрета AVITO_COOKIE. Если Avito так не делает,
// это просто ничего не меняет, а cookie всё равно протухнет через 24 часа и
// нужно будет обновить секрет AVITO_COOKIE вручную (см. инструкцию, которой
// уже пользовались — консоль браузера в залогиненной вкладке).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AVITO_COOKIE_SEED = process.env.AVITO_COOKIE;

if (!SUPABASE_SERVICE_ROLE_KEY || !AVITO_COOKIE_SEED) {
  console.error('Не заданы переменные окружения SUPABASE_SERVICE_ROLE_KEY / AVITO_COOKIE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const STATS_URL = 'https://www.avito.ru/web/1/vas/stats';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

function parseCookieString(cookieString) {
  const jar = new Map();
  for (const pair of cookieString.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  return jar;
}

function cookieHeaderFromJar(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

// res.headers.getSetCookie() — стандартный метод fetch/undici (Node 18.14+)
// для получения всех Set-Cookie как отдельных значений (join(', ') их бы
// испортил, т.к. внутри значений cookie тоже встречаются запятые).
function applySetCookie(jar, res) {
  const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
  let changed = false;
  for (const raw of setCookieHeaders) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (jar.get(name) !== value) {
      jar.set(name, value);
      changed = true;
    }
  }
  return changed;
}

async function loadCookieJar() {
  const { data, error } = await supabase
    .from('integration_cookies')
    .select('cookie')
    .eq('source', 'Avito')
    .maybeSingle();
  if (error) throw error;
  return parseCookieString(data?.cookie ?? AVITO_COOKIE_SEED);
}

async function saveCookieJar(jar) {
  const { error } = await supabase
    .from('integration_cookies')
    .upsert({ source: 'Avito', cookie: cookieHeaderFromJar(jar), updated_at: new Date().toISOString() });
  if (error) throw error;
}

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

async function fetchItemStats(adId, jar) {
  const res = await fetch(STATS_URL, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Content-Type': 'application/json',
      Origin: 'https://www.avito.ru',
      Referer: 'https://www.avito.ru/profile',
      Cookie: cookieHeaderFromJar(jar),
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ itemId: Number(adId) }),
  });

  const cookieChanged = applySetCookie(jar, res);

  if (!res.ok) {
    throw new Error(`Avito vas/stats (${adId}) вернул ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const days = Object.values(data.stats ?? {});
  const sum = (key) => days.reduce((total, day) => total + (day[key] ?? 0), 0);

  return {
    cookieChanged,
    stats: {
      views: sum('views'),
      favorites: sum('favorites'),
      calls: sum('contactsShowPhone'),
      messages: sum('contactsMessenger'),
    },
  };
}

async function main() {
  const adIds = await fetchAvitoAdIds();
  console.log(`Avito: найдено ${adIds.length} объявлений в ссылках "Проверки спроса"`);

  if (adIds.length === 0) return;

  const jar = await loadCookieJar();
  let cookieChanged = false;

  const checkedAt = new Date().toISOString();
  const rows = [];
  for (const adId of adIds) {
    try {
      const result = await fetchItemStats(adId, jar);
      cookieChanged = cookieChanged || result.cookieChanged;
      rows.push({ source: 'Avito', ad_id: adId, checked_at: checkedAt, ...result.stats });
    } catch (err) {
      console.warn(`Не удалось получить статистику для ${adId}:`, err.message);
    }
  }

  if (cookieChanged) {
    await saveCookieJar(jar);
    console.log('Avito обновил cookie сессии — сохранили новую версию для следующего запуска.');
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
