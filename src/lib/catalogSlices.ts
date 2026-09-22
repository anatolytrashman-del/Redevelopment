import { BUSINESS_CENTER_CLASSES, type BusinessCenter } from '../data/businessCenters';
import { shortName, streetOfAddress } from './businessCenterDisplay';
import {
  classHubUrl,
  districtHubUrl,
  metroHubDistance,
  metroHubUrl,
  microdistrictHubUrl,
  streetHubUrl,
} from './businessCenterHubs';

// Оси каталога БЦ (класс / район / микрорайон / метро / улица / статус) и
// подсчёт зданий по каждой. Раньше это жило прямо в CatalogSlicesBlock.tsx,
// но с появлением сквозного верхнего меню (владелец, 2026-09-22) те же
// списки понадобились во втором месте. Считать их дважды нельзя по той же
// причине, по которой блок срезов в своё время вынесли из страницы в
// компонент: расхождение даёт меню, которое ведёт на хаб, которого нет
// (или молчит про хаб, который есть), — и заметить это нечем.
//
// Хаб существует только там, где есть хотя бы одно здание: списки слагов в
// businessCenterHubs.ts шире фактических данных (например, станция
// «Автозаводская» в карте слагов есть, а БЦ в радиусе 1500 м у неё нет —
// проверка по базе 2026-09-22), поэтому оси считаются ПО ДАННЫМ, а не по
// карте слагов.

export type CatalogSlice = {
  /** Ключ для React и для сравнения — само значение оси, не slug. */
  key: string;
  /** Подпись в интерфейсе («Московский», «Класс A», «Площадь Победы»). */
  label: string;
  url: string;
  count: number;
};

// «Великий камень» — не район Минска, поэтому в списке идёт последним,
// а не по алфавиту вместе с городскими (то же правило в фильтре каталога).
const OUT_OF_TOWN_DISTRICT = 'Великий камень';

function countBy<T>(items: T[], key: (item: T) => string | null | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** Классы в фиксированном порядке A → B+ → B → C, только реально встречающиеся. */
export function classSlices(centers: BusinessCenter[]): CatalogSlice[] {
  const counts = countBy(centers, (c) => c.businessClass);
  return BUSINESS_CENTER_CLASSES.filter((cls) => counts.has(cls)).map((cls) => ({
    key: cls,
    label: `Класс ${cls}`,
    url: classHubUrl(cls),
    count: counts.get(cls) ?? 0,
  }));
}

/** Административные районы по алфавиту, «Великий камень» — в конце. */
export function districtSlices(centers: BusinessCenter[]): CatalogSlice[] {
  const counts = countBy(centers, (c) => c.district);
  return Array.from(counts.entries())
    .sort(([a], [b]) => {
      if (a === OUT_OF_TOWN_DISTRICT) return 1;
      if (b === OUT_OF_TOWN_DISTRICT) return -1;
      return a.localeCompare(b, 'ru');
    })
    .map(([name, count]) => ({ key: name, label: name, url: districtHubUrl(name), count }))
    .filter((s): s is CatalogSlice => s.url !== null);
}

/** Микрорайоны — по убыванию числа зданий (их много и они неравноценны). */
export function microdistrictSlices(centers: BusinessCenter[]): CatalogSlice[] {
  const counts = countBy(centers, (c) => c.microdistrict);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([name, count]) => ({ key: name, label: name, url: microdistrictHubUrl(name), count }))
    .filter((s): s is CatalogSlice => s.url !== null);
}

/**
 * Станции метро: одно здание попадает в несколько станций сразу (radius
 * METRO_HUB_MAX_DISTANCE_M), поэтому считаем не countBy, а по вложенному
 * списку `nearestMetroStations`.
 */
export function metroSlices(centers: BusinessCenter[], order: 'alpha' | 'count' = 'count'): CatalogSlice[] {
  const counts = new Map<string, number>();
  for (const center of centers) {
    for (const station of center.nearestMetroStations) {
      if (metroHubDistance(center, station.name) === null) continue;
      if (!metroHubUrl(station.name)) continue;
      counts.set(station.name, (counts.get(station.name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) =>
      order === 'alpha' ? a[0].localeCompare(b[0], 'ru') : b[1] - a[1] || a[0].localeCompare(b[0], 'ru'),
    )
    .map(([name, count]) => ({ key: name, label: name, url: metroHubUrl(name), count }))
    .filter((s): s is CatalogSlice => s.url !== null);
}

/** Улицы — только те, у которых есть готовый slug (там, где 2+ здания). */
export function streetSlices(centers: BusinessCenter[]): CatalogSlice[] {
  const counts = countBy(centers, (c) => streetOfAddress(c.address));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([name, count]) => ({ key: name, label: name, url: streetHubUrl(name), count }))
    .filter((s): s is CatalogSlice => s.url !== null);
}

/**
 * Статус. Отдельного хаба «построенные» нет и заводить его не нужно: из 146
 * зданий каталога строятся 4, поэтому такая страница была бы почти точной
 * копией главной каталога (владелец не просил, дубль-контент). Ось состоит
 * из «весь каталог» и «строящиеся»; второй пункт скрывается, если строек в
 * базе не осталось.
 */
export function statusSlices(centers: BusinessCenter[]): CatalogSlice[] {
  const underConstruction = centers.filter((c) => c.status === 'under_construction').length;
  const slices: CatalogSlice[] = [
    { key: 'all', label: 'Весь каталог', url: '/minsk/bcminsk', count: centers.length },
  ];
  if (underConstruction > 0) {
    slices.push({
      key: 'under_construction',
      label: 'Строящиеся',
      url: '/minsk/bcminsk/stroyashchiesya',
      count: underConstruction,
    });
  }
  return slices;
}

/** Все здания каталога по алфавиту — для перечня ссылок на гиде. */
export function alphabeticalCenters(centers: BusinessCenter[]): BusinessCenter[] {
  return [...centers].sort((a, b) => shortName(a).localeCompare(shortName(b), 'ru'));
}
