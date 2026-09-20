// Хелперы блока «Инфраструктура рядом» (BusinessCenterNeighbours.tsx).
// Вынесены из компонента, потому что те же данные нужны FAQ карточки БЦ:
// по правилу владельца (CLAUDE.md, 2026-09-17) FAQ описывает ВСЁ, что есть
// на странице, а значит должен пересказывать ровно тот же список точек, что
// нарисован выше, а не свою версию.
import type { BusinessCenter, NearestMetroStation } from '../data/businessCenters';
import type { BusinessCenterNearbyPlace, NearbyPlaceCategory } from '../data/businessCenterNearbyPlaces';

export const NEARBY_CATEGORY_LABELS: Record<NearbyPlaceCategory, string> = {
  metro: 'Метро',
  transport_stop: 'Остановки',
  grocery: 'Продукты',
  shop: 'Магазины',
  // «Магазины» больше не собираем и не показываем (владелец, 2026-09-21):
  // запрос «магазин» был самым «шумным» — под него попадало что попало.
  // Метка в словаре остаётся, чтобы не падать на старых строках источника
  // (source), которые эту категорию ещё называют; из NEARBY_CATEGORY_ORDER
  // категория убрана — это и есть фактическое отключение показа.
  pharmacy: 'Аптеки',
  bank: 'Банки',
  atm: 'Банкоматы',
  cafe: 'Кафе',
  restaurant: 'Рестораны',
  fitness: 'Фитнес',
  other: 'Другое',
};

// Порядок фиксированный и осмысленный, а не алфавитный: сотрудник сначала
// спрашивает «как доехать», потом «где обедать», и только потом про фитнес.
export const NEARBY_CATEGORY_ORDER: NearbyPlaceCategory[] = [
  'metro',
  'transport_stop',
  'grocery',
  'pharmacy',
  'bank',
  'atm',
  'cafe',
  'restaurant',
  'fitness',
  'other',
];

export function nearbyCategoryLabel(category: NearbyPlaceCategory): string {
  return NEARBY_CATEGORY_LABELS[category] ?? NEARBY_CATEGORY_LABELS.other;
}

export function formatMeters(distanceMeters: number): string {
  if (distanceMeters >= 1000) {
    const km = distanceMeters / 1000;
    return `${km.toLocaleString('ru-RU', { maximumFractionDigits: 1 })} км`;
  }
  return `${distanceMeters.toLocaleString('ru-RU')} м`;
}

export interface NearbyCategoryGroup {
  category: NearbyPlaceCategory;
  label: string;
  places: BusinessCenterNearbyPlace[];
}

export function groupNearbyPlaces(places: BusinessCenterNearbyPlace[]): NearbyCategoryGroup[] {
  const byCategory = new Map<NearbyPlaceCategory, BusinessCenterNearbyPlace[]>();
  for (const place of places) {
    const list = byCategory.get(place.category);
    if (list) list.push(place);
    else byCategory.set(place.category, [place]);
  }
  return NEARBY_CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    label: nearbyCategoryLabel(category),
    places: [...(byCategory.get(category) ?? [])].sort((a, b) => a.distanceMeters - b.distanceMeters),
  }));
}

// Станции метро приезжают из двух мест: поле `nearestMetroStations` самой
// строки БЦ (собрано раньше, есть у 112 из 141) и снимок инфраструктуры
// (категория metro). Расходятся они не в названиях, а в метрах, поэтому
// сливаем по имени и берём меньшее расстояние — иначе одна и та же станция
// покажется в блоке дважды с разными цифрами.
export function mergeMetroStations(
  stations: NearestMetroStation[],
  places: BusinessCenterNearbyPlace[],
): NearestMetroStation[] {
  const byName = new Map<string, NearestMetroStation>();
  const put = (station: NearestMetroStation) => {
    const key = station.name.toLocaleLowerCase('ru-RU').replace(/^метро\s+/, '').trim();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, station);
      return;
    }
    byName.set(key, {
      name: existing.name,
      distanceMeters: Math.min(existing.distanceMeters, station.distanceMeters),
      line: existing.line ?? station.line,
      color: existing.color ?? station.color,
    });
  };
  for (const station of stations) put(station);
  for (const place of places) {
    if (place.category !== 'metro') continue;
    put({
      name: place.name.replace(/^метро\s+/i, '').trim() || place.name,
      distanceMeters: place.distanceMeters,
      line: null,
      color: null,
    });
  }
  return [...byName.values()].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

const SOURCE_LABELS: Record<string, string> = {
  yandex_maps: 'Яндекс.Карты',
  '2gis': '2ГИС',
};

export function nearbySourceLabels(places: BusinessCenterNearbyPlace[]): string[] {
  const sources = new Set<string>();
  for (const place of places) sources.add(SOURCE_LABELS[place.source] ?? place.source);
  return [...sources].sort();
}

export function latestCollectedAt(places: BusinessCenterNearbyPlace[]): Date | null {
  let latest: number | null = null;
  for (const place of places) {
    const time = new Date(place.collectedAt).getTime();
    if (!Number.isFinite(time)) continue;
    if (latest == null || time > latest) latest = time;
  }
  return latest == null ? null : new Date(latest);
}

// Одна строка на категорию для FAQ: «Аптеки: 3 в радиусе 500 м, ближайшая —
// «Планета Здоровья», 180 м». Считается из тех же сгруппированных данных,
// что рисует блок.
export function nearbyFaqLines(places: BusinessCenterNearbyPlace[]): string[] {
  return groupNearbyPlaces(places).map((group) => {
    const nearest = group.places[0];
    return `${group.label}: ${group.places.length}, ближайший — «${nearest.name}», ${formatMeters(nearest.distanceMeters)}`;
  });
}

// Блок рисуется у любого БЦ с координатами (владелец, 2026-09-20: «поставим
// его на все страницы»), но заголовок честный: пока снимок инфраструктуры для
// здания не собран и метро не известно, это просто карта расположения, а не
// «инфраструктура рядом».
export function hasNearbyContent(center: BusinessCenter, places: BusinessCenterNearbyPlace[]): boolean {
  return places.length > 0 || center.nearestMetroStations.length > 0;
}
