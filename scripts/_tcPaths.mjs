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

export const TC_TOPIC_HUB_SLUGS = ['shopping'];
export const TC_TOPIC_HUB_MIN_CENTERS = 3;
export const TC_NON_SHOPPING_FORMATS = ['мебельный центр', 'рынок', 'строительный центр', 'автоцентр'];

function isOutsideMinskRow(row) {
  return /Минская область|Минский район|Смолевичск|Великий камень/i.test(`${row.address ?? ''} ${row.district ?? ''}`);
}

export const TC_TOPIC_HUB_MATCHERS = {
  shopping: (row) =>
    row.status !== 'under_construction' &&
    !isOutsideMinskRow(row) &&
    (row.retail_format == null || !TC_NON_SHOPPING_FORMATS.includes(row.retail_format)),
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
