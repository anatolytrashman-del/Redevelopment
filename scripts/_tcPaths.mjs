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
// matchesTcTopicHub в src/lib/tradeCenterHubs.ts. Магазины — /minsk/tc/store/*
// (близнец collectTcStoreHubs в tradeCenterStoreHubs.ts). Часть матчей читает
// tcFilters (выжимка /data/tc-filters.json).
export const TC_FORMAT_HUB_VALUES = {
  markets: ['рынок'],
  furniture: ['мебельный центр'],
  outlets: ['аутлет'],
};
export const TC_FORMAT_HUB_MIN_CENTERS = 3;
/** Аутлетов мало — индексируем format/outlets с 1 ТЦ (хвост волны 5, 2026-10-04). */
export const TC_FORMAT_HUB_MIN_CENTERS_BY_SLUG = { outlets: 1 };

export const TC_TOPIC_HUB_SLUGS = [
  'shopping',
  'railway-station',
  'underground',
  'center',
  'metro',
  'belarusian',
  'cinema',
  'kids',
  'entertainment',
  'foodcourt',
  'parking',
  'free-parking',
  'budget',
  'shoes',
  'menswear',
  'ice-rink',
];
// Тематические /with/* индексируем с 1 ТЦ (владелец, 2026-10-04) — не как
// format/улицы с порогом 3. Близнец: TC_TOPIC_HUB_MIN_CENTERS в tradeCenterHubs.ts.
export const TC_TOPIC_HUB_MIN_CENTERS = 1;
export const TC_STORE_HUB_MIN_CENTERS = 1;
export const TC_NON_SHOPPING_FORMATS = ['мебельный центр', 'рынок', 'строительный центр', 'автоцентр'];

export const TC_RAILWAY_STATION = { lat: 53.8907, lng: 27.551 };
export const TC_RAILWAY_MAX_M = 800;
export const TC_METRO_NEAR_MAX_M = 500;
export const TC_CENTER_METRO_STATIONS = ['Немига', 'Площадь Ленина', 'Вокзальная', 'Купаловская'];
export const TC_CENTER_METRO_MAX_M = 700;
export const TC_ENTERTAINMENT_FUN_KINDS = ['cinema', 'games', 'ice', 'quest', 'concert', 'other'];

/** Близнец TC_BUDGET_BRAND_KEYS / TC_SHOE_BRAND_KEYS / TC_MENSWEAR_BRAND_KEYS. */
export const TC_BUDGET_BRAND_KEYS = [
  'familia',
  'sinsay',
  'fix price',
  'три цены',
  'галамарт',
  'defacto',
  'lc waikiki',
  'gloria jeans',
  'new yorker',
  'cropp',
  'house',
  'reserved',
  'kari',
];
export const TC_SHOE_BRAND_KEYS = ['kari', 'belwest', 'ecco', 'megatop', 'marko', 'марко'];
export const TC_MENSWEAR_BRAND_KEYS = [
  'ostin',
  'reserved',
  'cropp',
  'house',
  'pull&bear',
  'bershka',
  'zara',
  'massimo dutti',
  'defacto',
  'lc waikiki',
  'gloria jeans',
  'new yorker',
  'mango',
  'все для мужчин',
];

export const TC_STORE_BRAND_CANONICAL = {
  'd&f (бывший defacto)': 'defacto',
  'defacto outlet (d&f)': 'defacto',
  'магазин марко': 'марко',
};
export const TC_STORE_SLUG_OVERRIDES = {
  'золотое яблоко': 'gold-apple',
  'спортмастер': 'sportmaster',
  'детмир': 'detmir',
  '5 элемент': '5-element',
  'mark formelle': 'mark-formelle',
  'pull&bear': 'pull-and-bear',
  'gloria jeans': 'gloria-jeans',
  'massimo dutti': 'massimo-dutti',
  'new yorker': 'new-yorker',
  'lc waikiki': 'lc-waikiki',
};

const CYR_TO_LAT = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

// Кириллица: \w не работает — буквы через \p{L} (близнец src/lib/tradeCenterHubs.ts).
const UNDERGROUND_NAME_RE = /подземн/iu;
const UNDERGROUND_DESC_RE =
  /подземн\p{L}*\s+торгов|торгов\p{L}[^\.]{0,80}под земл|открыт[^\.]{0,60}под земл/iu;
const CENTER_ADDRESS_RE = /Немига|площад\p{L}*\s+Независимости|пл\.\s*Независимости/iu;
const BELARUSIAN_GOODS_RE =
  /(?:магазин\p{L}*|товар\p{L}*|бренд\p{L}*|производител\p{L}*)\s+белорусск|белорусск\p{L}*\s+(?:магазин\p{L}*|товар\p{L}*|бренд\p{L}*|производител\p{L}*)|только\s+товар\p{L}*\s+белорусск|витрин\p{L}*\s+белорусск/iu;
const BELARUSIAN_NATIONAL_RE = /нацыянальн|национальн\p{L}*\s+(?:гандл|торгов)/iu;

const COVERED_RE = /(?<![\p{L}])крыт|подземн|многоуровн|многоэтажн/iu;
const EV_RE = /электрозаряд|зарядк|зарядн|электромобил/iu;
const FREE_RE = /(?<![\p{L}])бесплатн/iu;
const NOT_FREE_RE = /(?:нет|без)\s+бесплатн|бесплатн\p{L}*\s+(?:период\p{L}*\s+)?нет/iu;

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

export function normalizeBrand(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function expandBrandNames(names) {
  const out = [];
  for (const raw of Array.isArray(names) ? names : []) {
    const text = String(raw ?? '').trim();
    if (!text) continue;
    if (text.includes(',')) {
      for (const part of text.split(',')) {
        const piece = part.trim();
        if (piece) out.push(piece);
      }
    } else {
      out.push(text);
    }
  }
  return out;
}

export function canonicalBrandKey(normalized) {
  return TC_STORE_BRAND_CANONICAL[normalized] ?? normalized;
}

export function slugifyTcBrand(normalizedKey) {
  const key = canonicalBrandKey(normalizedKey);
  const override = TC_STORE_SLUG_OVERRIDES[key];
  if (override) return override;
  let out = '';
  for (const ch of key) {
    if (CYR_TO_LAT[ch] !== undefined) out += CYR_TO_LAT[ch];
    else out += ch;
  }
  return (
    out
      .replace(/&/g, '-and-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-') || 'brand'
  );
}

function parkingFeatureIds(parking) {
  if (!parking) return [];
  const parts = [parking.summary, ...(Array.isArray(parking.items) ? parking.items.map((i) => `${i?.label}: ${i?.value}`) : [])];
  const out = [];
  if (parts.some((p) => FREE_RE.test(String(p ?? '')) && !NOT_FREE_RE.test(String(p ?? '')))) out.push('park-free');
  if (parts.some((p) => COVERED_RE.test(String(p ?? '')))) out.push('park-covered');
  if (parts.some((p) => EV_RE.test(String(p ?? '')))) out.push('ev');
  return out;
}

/** Признаки из сырой выжимки tc-filters — близнец buildTcFilterEntry. */
export function tcFilterFeatures(src) {
  if (!src || typeof src !== 'object') return { features: new Set(), brands: [] };
  const features = new Set();
  const funKinds = Array.isArray(src.funKinds) ? src.funKinds : [];
  if (funKinds.includes('cinema')) features.add('cinema');
  if (funKinds.includes('kids')) features.add('kids');
  if (funKinds.includes('ice')) features.add('ice');
  if ((src.foodZones ?? 0) > 0 || (src.foodcourtPlaces ?? 0) > 0) features.add('foodcourt');
  if (funKinds.some((k) => TC_ENTERTAINMENT_FUN_KINDS.includes(k))) features.add('entertainment');
  if (src.parking) features.add('parking');
  for (const f of parkingFeatureIds(src.parking)) features.add(f);
  const brands = [];
  const seen = new Set();
  for (const name of expandBrandNames(src.brands)) {
    const raw = normalizeBrand(name);
    const key = raw ? canonicalBrandKey(raw) : '';
    if (key && !seen.has(key)) {
      seen.add(key);
      brands.push(key);
    }
  }
  return { features, brands };
}

function hasAnyBrand(brands, keys) {
  return keys.some((k) => brands.includes(k));
}

function filterMatch(slug, row, tcFilters) {
  if (!isEligibleRow(row)) return false;
  const { features, brands } = tcFilterFeatures(tcFilters?.[row.slug]);
  if (slug === 'cinema') return features.has('cinema');
  if (slug === 'kids') return features.has('kids');
  if (slug === 'foodcourt') return features.has('foodcourt');
  if (slug === 'parking') return features.has('parking');
  if (slug === 'free-parking') return features.has('park-free');
  if (slug === 'entertainment') return features.has('entertainment');
  if (slug === 'ice-rink') return features.has('ice');
  if (slug === 'budget') {
    if (row.retail_format === 'аутлет') return true;
    return hasAnyBrand(brands, TC_BUDGET_BRAND_KEYS);
  }
  if (slug === 'shoes') {
    if (hasAnyBrand(brands, TC_SHOE_BRAND_KEYS)) return true;
    return brands.some((b) => b.includes('обув'));
  }
  if (slug === 'menswear') return hasAnyBrand(brands, TC_MENSWEAR_BRAND_KEYS);
  return false;
}

export const TC_TOPIC_HUB_MATCHERS = {
  shopping: (row) =>
    isEligibleRow(row) && (row.retail_format == null || !TC_NON_SHOPPING_FORMATS.includes(row.retail_format)),
  'railway-station': (row) => {
    if (!isEligibleRow(row) || row.lat == null || row.lng == null) return false;
    return haversineMeters(row.lat, row.lng, TC_RAILWAY_STATION.lat, TC_RAILWAY_STATION.lng) <= TC_RAILWAY_MAX_M;
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
  cinema: (row, tcFilters) => filterMatch('cinema', row, tcFilters),
  kids: (row, tcFilters) => filterMatch('kids', row, tcFilters),
  entertainment: (row, tcFilters) => filterMatch('entertainment', row, tcFilters),
  foodcourt: (row, tcFilters) => filterMatch('foodcourt', row, tcFilters),
  parking: (row, tcFilters) => filterMatch('parking', row, tcFilters),
  'free-parking': (row, tcFilters) => filterMatch('free-parking', row, tcFilters),
  budget: (row, tcFilters) => filterMatch('budget', row, tcFilters),
  shoes: (row, tcFilters) => filterMatch('shoes', row, tcFilters),
  menswear: (row, tcFilters) => filterMatch('menswear', row, tcFilters),
  'ice-rink': (row, tcFilters) => filterMatch('ice-rink', row, tcFilters),
};

/** Близнец collectTcStoreHubs: slug'и магазинов с ≥1 подходящим ТЦ. */
export function collectTcStoreSlugs(rows, tcFilters) {
  if (!tcFilters) return [];
  const byKey = new Map();
  for (const r of rows) {
    if (!isEligibleRow(r)) continue;
    const { brands } = tcFilterFeatures(tcFilters[r.slug]);
    for (const key of brands) {
      if (!key || key.length < 2) continue;
      byKey.set(key, (byKey.get(key) ?? 0) + 1);
    }
  }
  const bySlug = new Map();
  for (const [key, count] of byKey) {
    if (count < TC_STORE_HUB_MIN_CENTERS) continue;
    const slug = slugifyTcBrand(key);
    if (!slug || slug === 'brand') continue;
    const prev = bySlug.get(slug);
    if (!prev || count > prev.count || (count === prev.count && key.length < prev.key.length)) {
      bySlug.set(slug, { key, count });
    }
  }
  return [...bySlug.keys()].sort();
}

function formatHubMinCenters(slug) {
  return TC_FORMAT_HUB_MIN_CENTERS_BY_SLUG[slug] ?? TC_FORMAT_HUB_MIN_CENTERS;
}

/**
 * Пути каталога ТЦ.
 * includeStores (по умолчанию true) — /minsk/tc/store/* для sitemap.
 * Пререндер передаёт false: магазинов сотни и будет ещё больше, каждый
 * headless-прогон раздувает деплой (2026-10-04: +237 store → 27+ мин вместо ~11).
 * В индекс они всё равно попадают через sitemap; HTML — SPA до первого
 * точечного пререндера (или пока страница не появится на проде и не
 * скопируется быстрым режимом).
 */
export function tradeCenterPaths(
  rows,
  { districtSlugs, metroSlugs, metroMaxDistance, tcFilters = null, includeStores = true } = {},
) {
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
      if (TC_TOPIC_HUB_MATCHERS[slug]?.(r, tcFilters)) topicCounts[slug] += 1;
    }
    if (districtSlugs[r.district]) districts.add(districtSlugs[r.district]);
    for (const s of Array.isArray(r.nearest_metro_stations) ? r.nearest_metro_stations : []) {
      const slug = metroSlugs[s?.name];
      if (slug && typeof s.distanceMeters === 'number' && s.distanceMeters <= metroMaxDistance) stations.add(slug);
    }
  }
  const storeSlugs = includeStores ? collectTcStoreSlugs(rows, tcFilters) : [];
  return [
    'minsk/tc',
    'minsk/tc/rating',
    'minsk/tc/rating/largest',
    ...[...districts].sort().map((s) => `minsk/tc/district/${s}`),
    ...[...stations].sort().map((s) => `minsk/tc/metro/${s}`),
    ...Object.keys(TC_FORMAT_HUB_VALUES)
      .filter((slug) => (formatCounts[slug] ?? 0) >= formatHubMinCenters(slug))
      .map((slug) => `minsk/tc/format/${slug}`),
    ...TC_TOPIC_HUB_SLUGS.filter((slug) => (topicCounts[slug] ?? 0) >= TC_TOPIC_HUB_MIN_CENTERS).map(
      (slug) => `minsk/tc/with/${slug}`,
    ),
    ...storeSlugs.map((slug) => `minsk/tc/store/${slug}`),
    ...cards.sort(),
  ];
}
