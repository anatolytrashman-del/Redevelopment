// Раз в сутки (см. .github/workflows/sync-demand-stats.yml) забирает у Kufar
// статистику (просмотры/звонки/лайки) по всем активным объявлениям аккаунта
// одним запросом и сохраняет в таблицу public.demand_stats.
//
// Токен долгоживущий (см. exp в JWT — выдан на ~год), логиниться не нужно.
// Если когда-нибудь начнёт падать с 401 — токен протух, нужно получить новый
// тем же способом (через консоль браузера в уже залогиненной вкладке) и
// обновить секрет KUFAR_BEARER_TOKEN в GitHub Actions.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KUFAR_BEARER_TOKEN = process.env.KUFAR_BEARER_TOKEN;

if (!SUPABASE_SERVICE_ROLE_KEY || !KUFAR_BEARER_TOKEN) {
  console.error('Не заданы переменные окружения SUPABASE_SERVICE_ROLE_KEY / KUFAR_BEARER_TOKEN');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const KUFAR_STATS_URL =
  'https://api.kufar.by/my-items/v1/account_get_published?limit=100&offset=0&stats=1&status=active';

async function fetchKufarAds() {
  const res = await fetch(KUFAR_STATS_URL, {
    headers: {
      Authorization: `Bearer ${KUFAR_BEARER_TOKEN}`,
      Accept: '*/*',
      'Accept-Language': 'ru',
      Origin: 'https://www.kufar.by',
      Referer: 'https://www.kufar.by/',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15',
    },
  });

  if (!res.ok) {
    throw new Error(`Kufar API вернул ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.ads ?? [];
}

async function main() {
  const ads = await fetchKufarAds();
  console.log(`Kufar: получено ${ads.length} объявлений`);

  if (ads.length === 0) return;

  const checkedAt = new Date().toISOString();
  const rows = ads.map((ad) => ({
    source: 'Kufar',
    ad_id: String(ad.ad_id),
    views: Number(ad.statistics?.view ?? 0),
    calls: Number(ad.statistics?.phone ?? 0),
    favorites: Number(ad.statistics?.favorite ?? 0),
    messages: Number(ad.statistics?.mail ?? 0),
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
