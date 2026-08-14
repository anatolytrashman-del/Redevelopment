// Раз в час (см. .github/workflows/sync-demand-stats.yml) забирает у
// Megapolis-real.by статистику (просмотры/клики по телефону/избранное) по
// объявлениям личного кабинета и сохраняет в public.demand_stats.
//
// У Megapolis-real нет отдельного JSON API — личный кабинет
// (/lichnyij-kabinet/) дозагружает список объявлений через
// POST /assets/snippets/ajax/userObj.php, который отдаёт готовый HTML-кусок
// (см. HAR-капture от 2026-08-14). Значения лежат прямо в разметке:
//   <div class="rInfo_code">код 39711A</div>
//   <div class="rInfo_views">4</div>      — просмотры
//   <div class="rInfo_clicked">0</div>    — клики по телефону
//   <div class="fav_count">0</div>        — избранное
//   data-go-url="/realt/.../slug.html"    — путь объявления
// Сообщений/чатов на сайте нет как фичи, поэтому messages всегда 0.
//
// ad_id берём из data-go-url тем же способом, что и extractAdId в
// src/data/objects.ts для этого домена — последний сегмент пути без ".html".
//
// objVid[]=1&objVid[]=2 в теле запроса — это все объявления пользователя
// вне зависимости от типа сделки (в кабинете это чекбоксы "Аренда" /
// "Продажа / покупка", оба включены по умолчанию — то, что записано в HAR).
//
// Авторизация — через cookie сессии (см. cookie evohe9g1z в HAR, это
// session-id MODX). Срок жизни неизвестен (в отличие от Kufar/Realt/Avito,
// для которых мы это выяснили) — если синк начнёт возвращать пустой список
// объявлений или ошибку, значит cookie протухла: нужно повторить HAR-запись
// в залогиненном личном кабинете и обновить секрет MEGAPOLIS_COOKIE.
//
// MEGAPOLIS_COOKIE хранится в base64 (как и AVITO_COOKIE) — так проще не
// словить порчу строки при копировании через чат/редактор.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MEGAPOLIS_COOKIE = process.env.MEGAPOLIS_COOKIE
  ? Buffer.from(process.env.MEGAPOLIS_COOKIE.replace(/\s+/g, ''), 'base64').toString('utf8')
  : '';

if (!SUPABASE_SERVICE_ROLE_KEY || !MEGAPOLIS_COOKIE) {
  console.error('Не заданы переменные окружения SUPABASE_SERVICE_ROLE_KEY / MEGAPOLIS_COOKIE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const USER_OBJ_URL = 'https://megapolis-real.by/assets/snippets/ajax/userObj.php';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15';

// Дублирует ветку megapolis-real.by из extractAdId в src/data/objects.ts —
// здесь на входе уже относительный путь (data-go-url), не полный URL.
function adIdFromPath(path) {
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  return last ? last.replace(/\.html?$/i, '') : null;
}

function extractField(section, className) {
  const match = section.match(new RegExp(`class="${className}"[^>]*>\\s*(\\d+)`));
  return match ? Number(match[1]) : 0;
}

async function fetchMyAds() {
  const res = await fetch(USER_OBJ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: '*/*',
      Origin: 'https://megapolis-real.by',
      Referer: 'https://megapolis-real.by/lichnyij-kabinet/',
      Cookie: MEGAPOLIS_COOKIE,
      'User-Agent': USER_AGENT,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: 'objVid%5B%5D=1&objVid%5B%5D=2&type=total&action=list',
  });

  if (!res.ok) {
    throw new Error(`Megapolis-real userObj.php вернул ${res.status}: ${await res.text()}`);
  }

  const html = await res.text();
  const sections = [...html.matchAll(/<section class="rItem[^"]*">([\s\S]*?)<\/section>/g)].map((m) => m[1]);

  return sections
    .map((section) => {
      const urlMatch = section.match(/data-go-url="([^"]+)"/);
      const adId = urlMatch ? adIdFromPath(urlMatch[1]) : null;
      if (!adId) return null;
      return {
        adId,
        views: extractField(section, 'rInfo_views'),
        calls: extractField(section, 'rInfo_clicked'),
        favorites: extractField(section, 'fav_count'),
      };
    })
    .filter((ad) => ad !== null);
}

async function main() {
  const ads = await fetchMyAds();
  console.log(`Megapolis-real: получено ${ads.length} объявлений`);

  if (ads.length === 0) return;

  const checkedAt = new Date().toISOString();
  const rows = ads.map((ad) => ({
    source: 'Megapolis-real',
    ad_id: ad.adId,
    views: ad.views,
    calls: ad.calls,
    favorites: ad.favorites,
    messages: 0,
    checked_at: checkedAt,
  }));

  const { error } = await supabase.from('demand_stats').upsert(rows, { onConflict: 'source,ad_id' });
  if (error) throw error;

  console.log(`Сохранено ${rows.length} записей в demand_stats.`);
}

main().catch((err) => {
  console.error('Синхронизация не удалась:', err);
  process.exit(1);
});
