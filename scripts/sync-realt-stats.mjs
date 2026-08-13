// Раз в сутки (см. .github/workflows/sync-demand-stats.yml) забирает у Realt.by
// статистику по своим объявлениям и сохраняет в public.demand_stats.
//
// Realt авторизует запросы к /bff/graphql через cookie (не bearer-токен, как
// у Kufar). Внутри cookie-строки главный — authToken, это тоже JWT с exp
// на ~год вперёд, но реплеим всю строку целиком (как записал HAR), чтобы не
// гадать, какие ещё куки бэкенд может проверять.
//
// Просмотры и лайки берём из searchMyObjects.counts — это точно totals за
// всё время (проверено на реальных цифрах из HAR). Звонки в этом запросе не
// отдаются, поэтому дополнительно дёргаем analyticsAdvertisementAnalyticsByUser
// с широким диапазоном дат — это best-effort: если формат ответа окажется не
// накопительным, просто увидим это по цифрам и поправим диапазон.
//
// Если когда-нибудь всё начнёт падать с 401 — cookie протухла, нужно повторить
// запись HAR (см. инструкцию, которой мы уже пользовались) и обновить секрет
// REALT_COOKIE.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REALT_COOKIE = process.env.REALT_COOKIE;

if (!SUPABASE_SERVICE_ROLE_KEY || !REALT_COOKIE) {
  console.error('Не заданы переменные окружения SUPABASE_SERVICE_ROLE_KEY / REALT_COOKIE');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GRAPHQL_URL = 'https://realt.by/bff/graphql';

const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  Accept: '*/*',
  Origin: 'https://realt.by',
  Referer: 'https://realt.by/account/my-objects/',
  Cookie: REALT_COOKIE,
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15',
};

const MY_OBJECTS_QUERY = `
fragment myObjectResult on MyObjectResult {
  objectUuid
  objectData {
    code
    uuid
    __typename
  }
  counts {
    favorite
    viewed
    __typename
  }
  __typename
}

query getMyObjectsListing($data: SearchMyObjectsInput!) {
  searchMyObjects(data: $data) {
    pagination {
      page
      pageSize
      totalCount
      __typename
    }
    results {
      ...myObjectResult
      __typename
    }
    __typename
  }
}`;

const ANALYTICS_QUERY = `
query analyticsAdvertisementAnalyticsByUser($data: AnalyticsAdvertisementAnalyticsByUserInput!) {
  analyticsAdvertisementAnalyticsByUser(data: $data) {
    uuid
    views
    chats
    calls
    favorites
    __typename
  }
}`;

async function graphql(operationName, query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: COMMON_HEADERS,
    body: JSON.stringify([{ operationName, query, variables }]),
  });

  if (!res.ok) {
    throw new Error(`Realt GraphQL (${operationName}) вернул ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const result = Array.isArray(data) ? data[0] : data;
  if (result.errors) {
    throw new Error(`Realt GraphQL (${operationName}) вернул ошибки: ${JSON.stringify(result.errors)}`);
  }
  return result.data;
}

async function fetchMyObjects() {
  const data = await graphql('getMyObjectsListing', MY_OBJECTS_QUERY, {
    data: {
      isOBDNAdmin: false,
      isNewBuilds: false,
      where: { statusesForUser: [1, 3, 4, 6, 8, 9], categories: [], excludeCategories: [77] },
      pagination: { page: 1, pageSize: 100 },
      sort: [{ by: 'updatedAt', order: 'DESC' }],
      imagePattern: 36,
    },
  });
  return data.searchMyObjects.results;
}

async function fetchCalls(uuids) {
  if (uuids.length === 0) return {};
  try {
    const data = await graphql('analyticsAdvertisementAnalyticsByUser', ANALYTICS_QUERY, {
      data: { uuids, dateStart: '2020-01-01', dateEnd: new Date().toISOString().slice(0, 10) },
    });
    const byUuid = {};
    for (const row of data.analyticsAdvertisementAnalyticsByUser ?? []) {
      byUuid[row.uuid] = { calls: row.calls ?? 0, chats: row.chats ?? 0 };
    }
    return byUuid;
  } catch (err) {
    console.warn('Не удалось получить звонки (analyticsAdvertisementAnalyticsByUser), пишем 0:', err.message);
    return {};
  }
}

async function main() {
  const objects = await fetchMyObjects();
  console.log(`Realt: получено ${objects.length} объявлений`);

  if (objects.length === 0) return;

  const uuids = objects.map((o) => o.objectUuid);
  const callsByUuid = await fetchCalls(uuids);

  const checkedAt = new Date().toISOString();
  const rows = objects.map((o) => ({
    source: 'Realt',
    ad_id: String(o.objectData.code),
    views: Number(o.counts?.viewed ?? 0),
    calls: Number(callsByUuid[o.objectUuid]?.calls ?? 0),
    favorites: Number(o.counts?.favorite ?? 0),
    messages: Number(callsByUuid[o.objectUuid]?.chats ?? 0),
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
