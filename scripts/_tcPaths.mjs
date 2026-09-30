// Пути каталога торговых центров для пререндера и sitemap (открыт для
// индексации 2026-09-30): корень /minsk/tc, хабы районов и станций метро,
// где есть хоть один видимый ТЦ, и карточки ТЦ. Скрытые (is_hidden, вторая
// очередь без обложек) сюда не попадают — их нет и в списке каталога.
// Карты slug'ов района и станции передаёт вызывающий скрипт — те же, по
// которым он строит пути каталога БЦ (скрипты без TS-загрузчика, см.
// комментарии у METRO_HUB_SLUG_BY_STATION).
export function tradeCenterPaths(rows, { districtSlugs, metroSlugs, metroMaxDistance }) {
  const cards = [];
  const districts = new Set();
  const stations = new Set();
  for (const r of rows) {
    if (typeof r.slug !== 'string' || !/^[a-z0-9-]+$/.test(r.slug)) continue;
    cards.push(`minsk/tc/${r.slug}`);
    if (districtSlugs[r.district]) districts.add(districtSlugs[r.district]);
    for (const s of Array.isArray(r.nearest_metro_stations) ? r.nearest_metro_stations : []) {
      const slug = metroSlugs[s?.name];
      if (slug && typeof s.distanceMeters === 'number' && s.distanceMeters <= metroMaxDistance) stations.add(slug);
    }
  }
  return [
    'minsk/tc',
    ...[...districts].sort().map((s) => `minsk/tc/district/${s}`),
    ...[...stations].sort().map((s) => `minsk/tc/metro/${s}`),
    ...cards.sort(),
  ];
}
