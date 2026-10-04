// Пути каталога торговых центров для пререндера и sitemap (открыт для
// индексации 2026-09-30): корень /minsk/tc, хабы районов и станций метро,
// где есть хоть один видимый ТЦ, и карточки ТЦ. Скрытые (is_hidden, вторая
// очередь без обложек) сюда не попадают — их нет и в списке каталога.
// Карты slug'ов района и станции передаёт вызывающий скрипт — те же, по
// которым он строит пути каталога БЦ (скрипты без TS-загрузчика, см.
// комментарии у METRO_HUB_SLUG_BY_STATION).
//
// Подборки по формату (/minsk/tc/format/<slug>) — только те, где видимых ТЦ
// не меньше MIN_INDEXABLE_HUB_CENTERS: страница с меньшим числом закрыта от
// индекса. ФАЙЛ-БЛИЗНЕЦ TC_FORMAT_HUBS в src/lib/tradeCenterCatalogFeatures.ts,
// сверяет тест там же.
//
// Тематические подборки (/minsk/tc/with/<slug>) и рейтинги (/minsk/tc/rating*)
// — 2026-10-04. Правила отбора with/* — близнец TC_TOPIC_HUBS /
// matchesTcTopicHub в src/lib/tradeCenterHubs.ts.
export const TC_FORMAT_HUB_VALUES = {
  markets: ['рынок'],
  furniture: ['мебельный центр'],
  outlets: ['аутлет'],
};
export const TC_FORMAT_HUB_MIN_CENTERS = 3;

export const TC_TOPIC_HUB_SLUGS = [
  'shopping',
  'railway-station',
  'underground',
  'center',
  'metro',
  'belarusian',
];
// Тематические /with/* индексируем с 1 ТЦ (владелец, 2026-10-04) — не как
// format/улицы с порогом 3. Близнец: TC_TOPIC_HUB_MIN_CENTERS в tradeCenterHubs.ts.
export const TC_TOPIC_HUB_MIN_CENTERS = 1;
export const TC_NON_SHOPPING_FORMATS = ['мебельный центр', 'рынок', 'строительный центр', 'автоцентр'];

export const TC_RAILWAY_STATION = { lat: 53.8907, lng: 27.551 };
export const TC_RAILWAY_MAX_M = 800;
export const TC_METRO_NEAR_MAX_M = 500;
export const TC_CENTER_METRO_STATIONS = ['Немига', 'Площадь Ленина', 'Вокзальная', 'Купаловская'];
export const TC_CENTER_METRO_MAX_M = 700;

// Кириллица: \w не работает — буквы через \p{L} (близнец src/lib/tradeCenterHubs.ts).
const UNDERGROUND_NAME_RE = /подземн/iu;
const UNDERGROUND_DESC_RE =
  /подземн\p{L}*\s+торгов|торгов\p{L}[^\.]{0,80}под земл|открыт[^\.]{0,60}под земл/iu;
const CENTER_ADDRESS_RE = /Немига|площад\p{L}*\s+Независимости|пл\.\s*Независимости/iu;
const BELARUSIAN_GOODS_RE =
  /(?:магазин\p{L}*|товар\p{L}*|бренд\p{L}*|производител\p{L}*)\s+белорусск|белорусск\p{L}*\s+(?:магазин\p{L}*|товар\p{L}*|бренд\p{L}*|производител\p{L}*)|только\s+товар\p{L}*\s+белорусск|витрин\p{L}*\s+белорусск/iu;
const BELARUSIAN_NATIONAL_RE = /нацыянальн|национальн\p{L}*\s+(?:гандл|торгов)/iu;

function isOutsideMinskRow(row) {
  return /Минская область|Минский район|Смолевичск|Великий камень/i.test(`${row.address ?? ''} ${row.district ?? ''}`);
}

function isEligibleRow(row) {
  return row.status !== 'under_construction' && !isOutsideMinskRow(row);
}

function haversineMeters(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
}

function nearestMetroWithin(row, maxMeters, names) {
  const stations = Array.isArray(row.nearest_metro_stations) ? row.nearest_metro_stations : [];
  return stations.some((s) => {
    if (typeof s?.distanceMeters !== 'number') return false;
    if (s.distanceMeters > maxMeters) return false;
    if (names && !names.includes(s.name)) return false;
    return true;
  });
}

function topicTextBlob(row) {
  const highlights = Array.isArray(row.highlights) ? row.highlights : [];
  return [
    row.name ?? '',
    ...(Array.isArray(row.alt_names) ? row.alt_names : []),
    row.description ?? '',
    ...highlights.map((h) => `${h?.label ?? ''} ${h?.text ?? ''}`),
  ].join('\n');
}

export const TC_TOPIC_HUB_MATCHERS = {
  shopping: (row) =>
    isEligibleRow(row) && (row.retail_format == null || !TC_NON_SHOPPING_FORMATS.includes(row.retail_format)),
  'railway-station': (row) => {
    if (!isEligibleRow(row) || row.lat == null || row.lng == null) return false;
    return (
      haversineMeters(row.lat, row.lng, TC_RAILWAY_STATION.lat, TC_RAILWAY_STATION.lng) <= TC_RAILWAY_MAX_M
    );
  },
  underground: (row) => {
    if (!isEligibleRow(row)) return false;
    const nameBlob = [row.name, ...(Array.isArray(row.alt_names) ? row.alt_names : [])].join(' ');
    return UNDERGROUND_NAME_RE.test(nameBlob) || UNDERGROUND_DESC_RE.test(row.description ?? '');
  },
  center: (row) => {
    if (!isEligibleRow(row)) return false;
    if (CENTER_ADDRESS_RE.test(row.address ?? '')) return true;
    return nearestMetroWithin(row, TC_CENTER_METRO_MAX_M, TC_CENTER_METRO_STATIONS);
  },
  metro: (row) => isEligibleRow(row) && nearestMetroWithin(row, TC_METRO_NEAR_MAX_M),
  belarusian: (row) => {
    if (!isEligibleRow(row)) return false;
    if (row.retail_format != null && TC_NON_SHOPPING_FORMATS.includes(row.retail_format)) return false;
    const blob = topicTextBlob(row);
    return BELARUSIAN_GOODS_RE.test(blob) || BELARUSIAN_NATIONAL_RE.test(blob);
  },
};

export function tradeCenterPaths(rows, { districtSlugs, metroSlugs, metroMaxDistance }) {
  const cards = [];
  const formatCounts = {};
  const topicCounts = Object.fromEntries(TC_TOPIC_HUB_SLUGS.map((s) => [s, 0]));
  const districts = new Set();
  const stations = new Set();
  for (const r of rows) {
    if (typeof r.slug !== 'string' || !/^[a-z0-9-]+$/.test(r.slug)) continue;
    cards.push(`minsk/tc/${r.slug}`);
    for (const [slug, values] of Object.entries(TC_FORMAT_HUB_VALUES)) {
      // Строящиеся в каталоге ТЦ по умолчанию скрыты — в подборке их тоже нет.
      if (values.includes(r.retail_format) && r.status !== 'under_construction') formatCounts[slug] = (formatCounts[slug] ?? 0) + 1;
    }
    for (const slug of TC_TOPIC_HUB_SLUGS) {
      if (TC_TOPIC_HUB_MATCHERS[slug]?.(r)) topicCounts[slug] += 1;
    }
    if (districtSlugs[r.district]) districts.add(districtSlugs[r.district]);
    for (const s of Array.isArray(r.nearest_metro_stations) ? r.nearest_metro_stations : []) {
      const slug = metroSlugs[s?.name];
      if (slug && typeof s.distanceMeters === 'number' && s.distanceMeters <= metroMaxDistance) stations.add(slug);
    }
  }
  return [
    'minsk/tc',
    'minsk/tc/rating',
    'minsk/tc/rating/largest',
    ...[...districts].sort().map((s) => `minsk/tc/district/${s}`),
    ...[...stations].sort().map((s) => `minsk/tc/metro/${s}`),
    ...Object.keys(TC_FORMAT_HUB_VALUES)
      .filter((slug) => (formatCounts[slug] ?? 0) >= TC_FORMAT_HUB_MIN_CENTERS)
      .map((slug) => `minsk/tc/format/${slug}`),
    ...TC_TOPIC_HUB_SLUGS.filter((slug) => (topicCounts[slug] ?? 0) >= TC_TOPIC_HUB_MIN_CENTERS).map(
      (slug) => `minsk/tc/with/${slug}`,
    ),
    ...cards.sort(),
  ];
}
