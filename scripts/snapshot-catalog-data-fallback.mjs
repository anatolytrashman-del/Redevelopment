// Снимок «догружаемых» данных раздела БЦ для сборки без Supabase REST.
//
// Зачем (2026-09-23): Supabase закрыл проект за трафик (402
// exceed_egress_quota на любой REST-запрос), и владелец попросил, чтобы
// публичные страницы раздела на эти дни работали вовсе без обращений к базе.
// Здание и список уже лежат в сборке (/data/business-centers.json,
// /data/bc/<slug>.json); этот снимок добавляет всё остальное, что страницы
// раздела запрашивали из браузера: ставки рынка, объявления, отзывы, 2ГИС,
// арендаторов, окружение, отраслевой срез, внешние метрики, источники.
//
// Снимается через Management API (он не закрыт вместе с REST) под ролью
// anon — ровно с теми правами, что у посетителя сайта. Это не формальность:
// к business_center_2gis_snapshots и business_center_tenant_source_snapshots
// у anon доступ только к отдельным колонкам, и выгрузка «select *» от
// имени владельца положила бы в публичный файл закрытые поля. Поэтому и
// колонки здесь — ровно те, что запрашивают функции в src/lib/*Api.ts.
//
// Запуск из сессии, где есть SUPABASE_ACCESS_TOKEN:
//   node scripts/snapshot-catalog-data-fallback.mjs
// Результат — scripts/catalog-data-fallback.json.gz (сжатый: несжатым это
// ~9 МБ, в репозитории держать такое незачем). Читает его
// scripts/generate-catalog-data.mjs, только когда REST не отвечает.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const REF = 'iohcdylttyuhwovztrbk';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const OUT = resolve(process.cwd(), 'scripts/catalog-data-fallback.json.gz');

if (!TOKEN) {
  console.error('[catalog-fallback] нет SUPABASE_ACCESS_TOKEN — снимок снимается только из сессии с доступом к Management API');
  process.exit(1);
}

// Имя набора → SELECT ровно с колонками и порядком, как в src/lib/*Api.ts.
const DATASETS = {
  // marketSnapshotsApi.fetchLatestMarketSnapshots('ofisy_bc'): последний период.
  market_ofisy_bc: `select * from market_snapshots where segment = 'ofisy_bc'
    and period = (select period from market_snapshots where segment = 'ofisy_bc' order by period desc limit 1)`,
  // marketSnapshotsApi.fetchExternalMetrics('ofisy_bc').
  external_ofisy_bc: `select * from external_metrics where segment = 'ofisy_bc'`,
  // businessCenterOffersApi.fetchBusinessCenterLotSizes.
  lot_sizes: `select business_center_slug, size from business_center_offers`,
  // businessCenterOffersApi.fetchBusinessCenterOfferSlices (SLICE_COLUMNS).
  offer_slices: `select business_center_slug, source, ad_id, deal_type, property_type, size, price_per_sqm
    from business_center_offers order by id asc`,
  // businessCenterTenantCityApi.fetchTenantCitySlice.
  tenant_city: `select categories, org_total, building_total, computed_at from business_center_tenant_city_categories`,
  // businessCenterSourcesApi.fetchCatalogSiteSources.
  site_sources: `select website, developer_info, media_mentions, building_facts from business_centers where kind = 'bc' limit 1000`,
  // Карточка БЦ: по зданию, группируется по слагу в generate-catalog-data.
  // businessCenterOffersApi.fetchBusinessCenterOffers — сортировка та же.
  offers: `select * from business_center_offers order by price_per_sqm asc, id asc`,
  // businessCenterReviewsApi.fetchBusinessCenterReviews (сортирует в JS).
  reviews: `select * from business_center_review_snapshots`,
  // businessCenterNearbyPlacesApi.fetchBusinessCenterNearbyPlaces.
  nearby: `select * from business_center_nearby_places order by distance_meters asc`,
  // businessCenter2gisApi.fetchBusinessCenter2gisSnapshot — только разрешённые anon колонки.
  gis2: `select business_center_slug, match_status, rubrics, schedule, reviews, links, attribute_groups, fetched_at,
    tenant_organizations, tenant_organizations_total, tenant_organizations_fetched, tenant_organizations_fetched_at
    from business_center_2gis_snapshots`,
  // businessCenterTenantsApi.fetchBusinessCenterTenantSnapshot (YANDEX_TENANT_SOURCE).
  tenants: `select business_center_slug, source, source_url, organizations, organization_count, captured_at
    from business_center_tenant_source_snapshots where source = 'yandex_maps'`,
};

async function runAsAnon(sql) {
  const query = `set role anon; select coalesce(json_agg(t), '[]'::json) as rows from (${sql}) t`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json();
  if (!res.ok || !Array.isArray(body)) throw new Error(`Management API ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body[0].rows;
}

const datasets = {};
for (const [name, sql] of Object.entries(DATASETS)) {
  datasets[name] = await runAsAnon(sql);
  console.log(`[catalog-fallback] ${name}: ${datasets[name].length} строк`);
}
const json = JSON.stringify({ generatedAt: new Date().toISOString(), datasets });
const gz = gzipSync(json, { level: 9 });
writeFileSync(OUT, gz);
console.log(`[catalog-fallback] ${Math.round(json.length / 1024)} КБ → ${Math.round(gz.length / 1024)} КБ сжатыми: ${OUT}`);
