// Общее ядро сбора «Инфраструктуры рядом» для двух путей сбора:
//   scripts/capture-yandex-nearby.mjs   — браузером на машине владельца
//                                          (основной путь: ключей API не
//                                          хватает на 141 здание);
//   scripts/sync-bc-nearby-places.mjs   — через API Яндекса, если ключи
//                                          когда-нибудь появятся.
// Радиусы, категории, дедупликация и запись в базу ОДНИ И ТЕ ЖЕ: разойдись
// они — два прогона по одному и тому же зданию дали бы разные карты.

export const SOURCE = 'yandex_maps';
export const PROJECT_REF = 'iohcdylttyuhwovztrbk';
export const SUPABASE_URL = 'https://iohcdylttyuhwovztrbk.supabase.co';

// Радиус на категорию. «Рядом» для офиса — не один круг: до метро в Минске
// обычно идут дольше, чем до ближайшего магазина, и станция в 1,2 км всё ещё
// аргумент за здание, а супермаркет в 1,2 км — уже нет. Верхняя граница
// колонки distance_meters — 3000 (миграция 20260920).
export const CATEGORY_RADIUS = {
  metro: 2000,
  transport_stop: 800,
  default: 500,
};

export function radiusFor(category) {
  return CATEGORY_RADIUS[category] ?? CATEGORY_RADIUS.default;
}

// Порядок важен: «магазин продуктов» должен попасть в grocery, а не в shop,
// «банкомат» — в atm, а не в bank. Поэтому массив, а не объект.
const RUBRIC_RULES = [
  [/метро|станция метро/i, 'metro'],
  [/остановк|автобус|троллейбус|трамвай|маршрутк/i, 'transport_stop'],
  [/банкомат/i, 'atm'],
  [/банк(?![\p{L}])|отделение банка/iu, 'bank'],
  [/аптек/i, 'pharmacy'],
  [/супермаркет|гипермаркет|продуктовый|продукты|гастроном|минимаркет/i, 'grocery'],
  [/кофейн|кафе|кондитерск|пекарн|быстрое питание|фастфуд/i, 'cafe'],
  [/ресторан|бар(?![\p{L}])|паб|пиццери|суши|столовая/iu, 'restaurant'],
  [/фитнес|тренаж|спортзал|бассейн|йога|кроссфит/i, 'fitness'],
  [/торговый центр|магазин|супермаркет одежды|бутик/i, 'shop'],
];

// Рубрика точнее запроса: по запросу «магазин» приезжают и аптеки, и банки —
// у Яндекса это всё «магазин» только в тексте поиска, но не в рубрике.
export function categoryFromRubric(rubricText, fallbackCategory) {
  const text = String(rubricText ?? '');
  if (text.trim()) {
    for (const [pattern, category] of RUBRIC_RULES) {
      if (pattern.test(text)) return category;
    }
  }
  return fallbackCategory;
}

export function haversineMeters(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

// Одна и та же точка приезжает по нескольким запросам («кафе» и «ресторан»),
// а у остановок Яндекс часто не даёт id организации — тогда ключом служат
// координаты, иначе один и тот же павильон запишется пять раз.
export function placeKey(place) {
  return place.source_place_id || `${Number(place.lat).toFixed(5)},${Number(place.lng).toFixed(5)}`;
}

export function dedupePlaces(places) {
  const byKey = new Map();
  for (const place of places) {
    const key = placeKey(place);
    const existing = byKey.get(key);
    if (!existing || place.distance_meters < existing.distance_meters) byKey.set(key, place);
  }
  return [...byKey.values()].sort((a, b) => a.distance_meters - b.distance_meters);
}

export function sqlLiteral(value) {
  if (value == null) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export async function runSql(query, accessToken) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Management API ${response.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export function buildWriteSql(slug, places) {
  const values = places
    .map(
      (place) => `(
      ${sqlLiteral(place.business_center_slug)}, ${sqlLiteral(placeKey(place))}, ${sqlLiteral(place.name)},
      ${sqlLiteral(place.category)}, ${sqlLiteral(place.subcategory)}, ${sqlLiteral(place.address)},
      ${place.lat}, ${place.lng}, ${place.distance_meters}, ${sqlLiteral(place.source)},
      ${sqlLiteral(place.source_url)}, ${sqlLiteral(place.collected_at)}::timestamptz
    )`,
    )
    .join(',');
  // Снимок конкретного БЦ и конкретного источника заменяется целиком: точка,
  // которой в Яндексе больше нет, должна исчезнуть и у нас. Пилотные строки
  // 2ГИС по «Порту» это условие не трогает.
  return `
    delete from public.business_center_nearby_places
      where business_center_slug = ${sqlLiteral(slug)} and source = ${sqlLiteral(SOURCE)};
    ${values ? `insert into public.business_center_nearby_places
      (business_center_slug, source_place_id, name, category, subcategory, address, lat, lng,
       distance_meters, source, source_url, collected_at) values ${values};` : ''}
  `;
}

// Читать и писать умеем двумя путями: service-role ключом (если он есть в
// окружении) и Management API по SUPABASE_ACCESS_TOKEN — в сессиях Claude
// доступен только второй, локально у владельца бывает первый.
export async function readCenters({ supabase, accessToken }) {
  if (supabase) {
    const { data: centers, error } = await supabase
      .from('business_centers')
      .select('slug,name,address,lat,lng')
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('slug')
      .range(0, 999);
    if (error) throw error;
    const { data: snapshots, error: snapshotError } = await supabase
      .from('business_center_nearby_places')
      .select('business_center_slug,collected_at')
      .eq('source', SOURCE)
      .range(0, 9999);
    if (snapshotError) throw snapshotError;
    const latest = new Map();
    for (const row of snapshots ?? []) {
      const current = latest.get(row.business_center_slug);
      if (!current || new Date(row.collected_at) > new Date(current)) latest.set(row.business_center_slug, row.collected_at);
    }
    return (centers ?? []).map((center) => ({ ...center, collected_at: latest.get(center.slug) ?? null }));
  }
  return runSql(
    `select bc.slug, bc.name, bc.address, bc.lat, bc.lng,
            (select max(p.collected_at) from public.business_center_nearby_places p
              where p.business_center_slug = bc.slug and p.source = ${sqlLiteral(SOURCE)}) as collected_at
       from public.business_centers bc
      where bc.lat is not null and bc.lng is not null
      order by bc.slug`,
    accessToken,
  );
}

export async function writePlaces({ supabase, accessToken, slug, places }) {
  if (supabase) {
    const { error: deleteError } = await supabase
      .from('business_center_nearby_places')
      .delete()
      .eq('business_center_slug', slug)
      .eq('source', SOURCE);
    if (deleteError) throw deleteError;
    if (places.length === 0) return;
    const { error: insertError } = await supabase
      .from('business_center_nearby_places')
      .insert(places.map((place) => ({ ...place, source_place_id: placeKey(place) })));
    if (insertError) throw insertError;
    return;
  }
  await runSql(buildWriteSql(slug, places), accessToken);
}
