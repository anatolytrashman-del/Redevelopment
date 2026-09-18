// Одноразовый безопасный пилот только для БЦ «Порт» на пр-те Независимости, 177.
// Другие строки business_centers этот скрипт не читает и не обновляет.
// 1) находит все корпуса точного адреса (Шафарнянская, 11 исключена);
// 2) проходит всю пагинацию организаций по каждому building_id;
// 3) собирает инфраструктуру в радиусе 500 м и сохраняет снимок в базе.

const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';
const PORT_SLUG = 'port';
const PORT_ADDRESS_QUERY = 'Минск проспект Независимости 177';
const PORT_POINT = { lat: 53.946157, lng: 27.682522 };
const RADIUS_METERS = 500;
const PAGE_SIZE = 50;
const GIS_API_KEY = process.env.GIS_API_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = 'iohcdylttyuhwovztrbk';

if (!GIS_API_KEY || (!SERVICE_ROLE_KEY && !ACCESS_TOKEN)) {
  console.error('Нужен GIS_API_KEY и один из SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

let supabase = null;
if (SERVICE_ROLE_KEY) {
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function runSql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Management API ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function sqlLiteral(value) {
  if (value == null) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

class ApiError extends Error {}

async function request(params) {
  const url = new URL('https://catalog.api.2gis.com/3.0/items');
  url.searchParams.set('key', GIS_API_KEY);
  url.searchParams.set('locale', 'ru_BY');
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = await response.json();
  if (body?.meta?.code === 404) return { total: 0, items: [] };
  if (body?.meta?.code !== 200) throw new ApiError(`2GIS ${body?.meta?.code}: ${body?.meta?.error?.message ?? 'без текста'}`);
  return { total: body.result?.total ?? 0, items: body.result?.items ?? [] };
}

async function allPages(params) {
  const items = [];
  let total = 0;
  for (let page = 1; page === 1 || (page - 1) * PAGE_SIZE < total; page += 1) {
    const result = await request({ ...params, page, page_size: PAGE_SIZE });
    if (page === 1) total = result.total;
    items.push(...result.items);
    if (result.items.length === 0) break;
  }
  return { total, items };
}

function normalized(value) {
  return String(value ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^а-яa-z0-9]+/g, ' ').trim();
}

async function findPortBuildingIds() {
  const result = await allPages({
    q: PORT_ADDRESS_QUERY,
    type: 'building',
    point: `${PORT_POINT.lng},${PORT_POINT.lat}`,
    radius: 700,
    fields: 'items.point,items.address',
  });
  const buildings = result.items.filter((item) => {
    const address = normalized(item.address_name ?? item.full_name ?? item.name);
    return address.includes('независимости') && address.includes('177') && !address.includes('шафарнянская');
  });
  if (buildings.length === 0) throw new Error('2GIS не вернул ни одного корпуса по адресу пр-т Независимости, 177');
  return [...new Set(buildings.map((item) => String(item.id)))];
}

function primaryRubric(item) {
  return Array.isArray(item?.rubrics) ? item.rubrics.find((rubric) => rubric.kind === 'primary') ?? item.rubrics[0] : null;
}

async function collectTenants(buildingIds) {
  const seen = new Set();
  const organizations = [];
  let reportedTotal = 0;
  for (const buildingId of buildingIds) {
    const result = await allPages({ building_id: buildingId, type: 'branch', fields: 'items.rubrics' });
    reportedTotal += result.total;
    for (const item of result.items) {
      const id = String(item.id ?? '');
      const name = String(item.name ?? '').trim();
      if (!name || seen.has(id || name)) continue;
      seen.add(id || name);
      const rubric = primaryRubric(item);
      organizations.push({
        name,
        gis_id: id || null,
        rubric: rubric?.name ?? null,
        industry: rubric?.parent_id ? String(rubric.parent_id) : null,
      });
    }
  }
  return { organizations, total: Math.max(reportedTotal, organizations.length) };
}

const INFRA_QUERIES = [
  { category: 'metro', type: 'station.metro' },
  { category: 'transport_stop', type: 'station' },
  { category: 'cafe', q: 'кафе' },
  { category: 'restaurant', q: 'ресторан' },
  { category: 'grocery', q: 'продуктовый магазин' },
  { category: 'shop', q: 'магазин' },
  { category: 'pharmacy', q: 'аптека' },
  { category: 'bank', q: 'банк' },
  { category: 'atm', q: 'банкомат' },
  { category: 'fitness', q: 'фитнес' },
];

function haversineMeters(a, b) {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

async function collectNearbyPlaces() {
  const byId = new Map();
  for (const query of INFRA_QUERIES) {
    const result = await allPages({
      q: query.q,
      type: query.type,
      point: `${PORT_POINT.lng},${PORT_POINT.lat}`,
      radius: RADIUS_METERS,
      fields: 'items.point,items.rubrics',
      sort: 'distance',
    });
    for (const item of result.items) {
      const id = String(item.id ?? '');
      const point = item.point;
      if (!id || !point || typeof point.lat !== 'number' || typeof point.lon !== 'number') continue;
      const distance = haversineMeters(PORT_POINT, { lat: point.lat, lng: point.lon });
      if (distance > RADIUS_METERS || byId.has(id)) continue;
      byId.set(id, {
        business_center_slug: PORT_SLUG,
        source_place_id: id,
        name: String(item.name ?? item.full_name ?? '').trim(),
        category: query.category,
        subcategory: primaryRubric(item)?.name ?? null,
        address: item.address_name ?? null,
        lat: point.lat,
        lng: point.lon,
        distance_meters: distance,
        source: '2gis',
        source_url: `https://2gis.by/minsk/geo/${id}`,
        collected_at: new Date().toISOString(),
      });
    }
  }
  return [...byId.values()].filter((place) => place.name);
}

async function main() {
  const buildingIds = await findPortBuildingIds();
  console.log(`Порт: найдено корпусов по адресу: ${buildingIds.length}`);
  const [{ organizations, total }, nearbyPlaces] = await Promise.all([
    collectTenants(buildingIds),
    collectNearbyPlaces(),
  ]);

  if (supabase) {
    const { error: tenantError } = await supabase
      .from('business_center_2gis_snapshots')
      .update({
        tenant_organizations: organizations,
        tenant_organizations_total: total,
        tenant_organizations_fetched: organizations.length,
        tenant_organizations_fetched_at: new Date().toISOString(),
      })
      .eq('business_center_slug', PORT_SLUG);
    if (tenantError) throw tenantError;

    const { error: deleteError } = await supabase
      .from('business_center_nearby_places')
      .delete()
      .eq('business_center_slug', PORT_SLUG);
    if (deleteError) throw deleteError;
    if (nearbyPlaces.length > 0) {
      const { error: insertError } = await supabase.from('business_center_nearby_places').insert(nearbyPlaces);
      if (insertError) throw insertError;
    }
  } else {
    const values = nearbyPlaces.map((place) => `(
      ${sqlLiteral(place.business_center_slug)}, ${sqlLiteral(place.source_place_id)}, ${sqlLiteral(place.name)},
      ${sqlLiteral(place.category)}, ${sqlLiteral(place.subcategory)}, ${sqlLiteral(place.address)},
      ${place.lat}, ${place.lng}, ${place.distance_meters}, ${sqlLiteral(place.source)},
      ${sqlLiteral(place.source_url)}, ${sqlLiteral(place.collected_at)}::timestamptz
    )`).join(',');
    await runSql(`
      update public.business_center_2gis_snapshots set
        tenant_organizations = ${sqlLiteral(JSON.stringify(organizations))}::jsonb,
        tenant_organizations_total = ${total},
        tenant_organizations_fetched = ${organizations.length},
        tenant_organizations_fetched_at = now()
      where business_center_slug = ${sqlLiteral(PORT_SLUG)};
      delete from public.business_center_nearby_places where business_center_slug = ${sqlLiteral(PORT_SLUG)};
      ${values ? `insert into public.business_center_nearby_places
        (business_center_slug, source_place_id, name, category, subcategory, address, lat, lng,
         distance_meters, source, source_url, collected_at) values ${values};` : ''}
    `);
  }

  console.log(`Порт: организаций ${organizations.length} из ${total}; инфраструктура ${nearbyPlaces.length} точек`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
