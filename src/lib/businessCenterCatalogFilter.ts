// Клиентская модель фильтра каталога БЦ (К2–К5 плана
// docs/bc-catalog-redesign-plan.md). Вынесена из
// pages/BusinessCentersMinskPage.tsx отдельным файлом: страница и без того
// на 1400 строк, а здесь — чистые функции без JSX, которые одинаково нужны
// и панели чипов, и сетке карточек, и живым счётчикам.
//
// Разделение обязанностей, важное для SEO: ОСИ МАРШРУТА (класс/район как
// хаб-URL, микрорайон, улица, станция метро, «строящиеся») по-прежнему
// живут в пути и остаются индексируемыми входами — см. businessCenterHubs.ts.
// Всё, что здесь, — это ДОБАВОЧНЫЙ слой поверх маршрута, живущий в
// query-параметрах: мультивыбор класса и района, расстояние до метро,
// тумблеры-факты, поиск и сортировка. Query не индексируется (canonical
// всегда указывает на ближайший одноосевой хаб), поэтому комбинации не
// плодят тонкие страницы, но ссылкой с отфильтрованным списком можно
// поделиться.
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import { shortName, streetOfAddress } from './businessCenterDisplay';

// --- Сортировка (К5) ---------------------------------------------------

export type CatalogSortKey =
  | 'default'
  | 'rent'
  | 'area'
  | 'metro'
  | 'offers'
  | 'floor-plate'
  | 'name';

export const CATALOG_SORTS: { key: CatalogSortKey; label: string }[] = [
  // По умолчанию — sort_order каталога (примерно по частотности поисковых
  // запросов, см. BusinessCenter.sortOrder), а не алфавит.
  { key: 'default', label: 'По умолчанию' },
  { key: 'rent', label: 'Ставка аренды' },
  { key: 'area', label: 'Площадь' },
  { key: 'metro', label: 'Ближе к метро' },
  { key: 'offers', label: 'Больше объявлений' },
  { key: 'floor-plate', label: 'Типовой этаж' },
  { key: 'name', label: 'По алфавиту' },
];

// --- Состояние ---------------------------------------------------------

export interface CatalogFilterState {
  classes: string[];
  districts: string[];
  // Метры до ближайшей станции метро (500 / 1000 / 1500). Заменяет список
  // из 32 станций в старом сайдбаре: станцию по имени теперь ищут строкой
  // поиска или открывают её SEO-хаб, а «хочу рядом с метро, всё равно с
  // какой» — это именно расстояние, а не перебор чек-боксов.
  metroWithin: number | null;
  facts: string[];
  query: string;
  sort: CatalogSortKey;
}

export const EMPTY_CATALOG_FILTER: CatalogFilterState = {
  classes: [],
  districts: [],
  metroWithin: null,
  facts: [],
  query: '',
  sort: 'default',
};

export const METRO_WITHIN_OPTIONS: { value: number; label: string }[] = [
  { value: 500, label: 'до 500 м' },
  { value: 1000, label: 'до 1 км' },
  { value: 1500, label: 'до 1,5 км' },
];

// Снимки рынка по зданию (Д3) — медиана ставки и число объявлений по слагу.
// Передаются в фильтр и сортировку явным аргументом, а не берутся из
// замыкания: так те же функции работают и в тесте, и до прихода данных
// (пустые Map — просто нет ни одного здания «с объявлениями»).
export interface CatalogOfferIndex {
  rentBySlug: Map<string, MarketSnapshot>;
  saleBySlug: Map<string, MarketSnapshot>;
}

export const EMPTY_OFFER_INDEX: CatalogOfferIndex = {
  rentBySlug: new Map(),
  saleBySlug: new Map(),
};

export function buildOfferIndex(snapshots: MarketSnapshot[] | null): CatalogOfferIndex {
  const rentBySlug = new Map<string, MarketSnapshot>();
  const saleBySlug = new Map<string, MarketSnapshot>();
  for (const s of snapshots ?? []) {
    if (s.sliceType !== 'building') continue;
    (s.deal === 'rent' ? rentBySlug : saleBySlug).set(s.sliceKey, s);
  }
  return { rentBySlug, saleBySlug };
}

// Расстояние до БЛИЖАЙШЕЙ станции метро, м (2GIS, по прямой). null — у
// здания нет структурных данных по метро вовсе (38 из 143): это «неизвестно»,
// а не «далеко», поэтому фильтр по расстоянию такие здания просто не
// показывает, а не считает их бесконечно далёкими.
export function nearestMetroMeters(center: Pick<BusinessCenter, 'nearestMetroStations'>): number | null {
  if (center.nearestMetroStations.length === 0) return null;
  return Math.min(...center.nearestMetroStations.map((s) => s.distanceMeters));
}

// --- Тумблеры-факты (К3) ----------------------------------------------
//
// Принцип «не выдумываем» здесь работает так: тумблер отбирает только те
// здания, где параметр ИЗВЕСТЕН и подходит. Здание с null в колонке не
// попадает в выборку, но это не утверждение «у него этого нет» — данных
// просто нет (подпись об этом стоит в самой панели). Поэтому все пороги
// заданы явными числами, а не «лучше среднего»: порог можно объяснить
// пользователю, скользящее сравнение с медианой — нет.
export interface CatalogFactDef {
  id: string;
  label: string;
  test: (center: BusinessCenter, offers: CatalogOfferIndex) => boolean;
}

export const CATALOG_FACTS: CatalogFactDef[] = [
  { id: 'rent', label: 'Есть аренда', test: (c, o) => o.rentBySlug.has(c.slug) },
  { id: 'sale', label: 'Есть продажа', test: (c, o) => o.saleBySlug.has(c.slug) },
  { id: 'uk', label: 'Единая УК', test: (c) => c.managementType === 'single_uk' },
  { id: 'hoa', label: 'Товарищество собственников', test: (c) => c.managementType === 'hoa' },
  { id: 'open-space', label: 'Open-space', test: (c) => c.layoutTypes.includes('open_space') },
  { id: 'cabinet', label: 'Кабинетная планировка', test: (c) => c.layoutTypes.includes('cabinet') },
  { id: 'parking', label: 'Парковка от 1,5 маш./100 м²', test: (c) => c.parkingRatio != null && c.parkingRatio >= 1.5 },
  {
    id: 'ac',
    label: 'Кондиционирование',
    test: (c) => c.airConditioning === 'partial' || c.airConditioning === 'full',
  },
  { id: 'ceiling3', label: 'Потолки от 3 м', test: (c) => c.ceilingHeight != null && c.ceilingHeight >= 3 },
  { id: 'conference', label: 'Конференц-зал в здании', test: (c) => c.infraInternal.includes('конференц-зал') },
  { id: 'cafe', label: 'Кафе в здании', test: (c) => c.infraInternal.includes('кафе') },
  { id: 'gym', label: 'Фитнес в здании', test: (c) => c.infraInternal.includes('фитнес-центр') },
  {
    id: 'free-space',
    label: 'Известны свободные площади',
    test: (c) => c.freeSpaceMin != null,
  },
  { id: 'under-construction', label: 'Строится', test: (c) => c.status === 'under_construction' },
];

const FACT_BY_ID = new Map(CATALOG_FACTS.map((f) => [f.id, f]));

// --- URL ---------------------------------------------------------------

function splitList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseCatalogFilter(params: URLSearchParams): CatalogFilterState {
  const metroRaw = Number(params.get('metro'));
  const sortRaw = params.get('sort');
  return {
    classes: splitList(params.get('class')).filter((v) => ['A', 'B+', 'B', 'C'].includes(v)),
    districts: splitList(params.get('district')),
    metroWithin: METRO_WITHIN_OPTIONS.some((o) => o.value === metroRaw) ? metroRaw : null,
    facts: splitList(params.get('facts')).filter((id) => FACT_BY_ID.has(id)),
    query: params.get('q')?.trim() ?? '',
    sort: CATALOG_SORTS.some((s) => s.key === sortRaw) ? (sortRaw as CatalogSortKey) : 'default',
  };
}

// Порядок ключей фиксирован, а значения внутри списков сортируются — один
// и тот же набор фильтров всегда даёт ОДНУ строку запроса. Иначе «класс A,
// потом B» и «класс B, потом A» были бы двумя разными URL с одинаковым
// содержимым.
export function catalogFilterToQuery(state: CatalogFilterState): string {
  const params = new URLSearchParams();
  if (state.classes.length > 0) params.set('class', [...state.classes].sort().join(','));
  if (state.districts.length > 0) params.set('district', [...state.districts].sort().join(','));
  if (state.metroWithin != null) params.set('metro', String(state.metroWithin));
  if (state.facts.length > 0) params.set('facts', [...state.facts].sort().join(','));
  if (state.query) params.set('q', state.query);
  if (state.sort !== 'default') params.set('sort', state.sort);
  const s = params.toString();
  return s ? `?${s}` : '';
}

// Сортировка и поиск — это не сужение выборки по осям, поэтому «фильтр
// пуст» считается без них: строка «Подходит N из 143» и кнопка «Сбросить»
// должны реагировать на выбор класса или тумблера, а не на смену порядка.
export function hasActiveCatalogFilter(state: CatalogFilterState): boolean {
  return (
    state.classes.length > 0 ||
    state.districts.length > 0 ||
    state.metroWithin != null ||
    state.facts.length > 0 ||
    state.query.length > 0
  );
}

// --- Применение --------------------------------------------------------

function matchesQuery(center: BusinessCenter, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    center.name,
    shortName(center),
    center.address,
    streetOfAddress(center.address),
    center.district ?? '',
    center.microdistrict ?? '',
    ...center.nearestMetroStations.map((s) => s.name),
  ]
    .join(' ')
    .toLowerCase();
  // Все слова запроса должны найтись — «уручье а» сужает, а не расширяет.
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

export function matchesCatalogFilter(
  center: BusinessCenter,
  state: CatalogFilterState,
  offers: CatalogOfferIndex,
): boolean {
  if (state.classes.length > 0 && (center.businessClass === null || !state.classes.includes(center.businessClass))) {
    return false;
  }
  if (state.districts.length > 0 && (center.district === null || !state.districts.includes(center.district))) {
    return false;
  }
  if (state.metroWithin != null) {
    const meters = nearestMetroMeters(center);
    if (meters === null || meters > state.metroWithin) return false;
  }
  for (const id of state.facts) {
    const def = FACT_BY_ID.get(id);
    if (def && !def.test(center, offers)) return false;
  }
  return matchesQuery(center, state.query);
}

// --- Сортировка --------------------------------------------------------

// Здания без значения всегда уходят в конец — независимо от направления
// сортировки. Иначе «сортировать по ставке» выносило бы наверх 89 зданий
// без объявлений, и главный ответ страницы оказывался бы внизу.
function byNumber(get: (c: BusinessCenter) => number | null, direction: 'asc' | 'desc') {
  return (a: BusinessCenter, b: BusinessCenter) => {
    const va = get(a);
    const vb = get(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return direction === 'asc' ? va - vb : vb - va;
  };
}

export function sortCatalogCenters(
  centers: BusinessCenter[],
  sort: CatalogSortKey,
  offers: CatalogOfferIndex,
): BusinessCenter[] {
  const list = [...centers];
  switch (sort) {
    case 'rent':
      return list.sort(byNumber((c) => offers.rentBySlug.get(c.slug)?.median ?? null, 'asc'));
    case 'area':
      return list.sort(byNumber((c) => c.totalArea, 'desc'));
    case 'metro':
      return list.sort(byNumber(nearestMetroMeters, 'asc'));
    case 'offers':
      return list.sort(
        byNumber((c) => {
          const n = (offers.rentBySlug.get(c.slug)?.n ?? 0) + (offers.saleBySlug.get(c.slug)?.n ?? 0);
          return n > 0 ? n : null;
        }, 'desc'),
      );
    case 'floor-plate':
      return list.sort(byNumber((c) => c.floorPlateArea, 'desc'));
    case 'name':
      return list.sort((a, b) => shortName(a).localeCompare(shortName(b), 'ru'));
    default:
      return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
}

// --- Сводка над сеткой (К1) -------------------------------------------

export interface CatalogSummary {
  total: number;
  totalArea: number;
  withAreaCount: number;
  // Медиана МЕДИАН зданий, а не медиана всех объявлений: по отфильтрованной
  // выборке второго у нас нет (снимки хранят уже свёрнутые агрегаты). Число
  // зданий, по которым она посчитана, показывается рядом — без него цифра
  // выглядела бы как городская медиана, которой она не является.
  rentMedian: number | null;
  rentBuildings: number;
}

export function catalogSummary(centers: BusinessCenter[], offers: CatalogOfferIndex): CatalogSummary {
  const withArea = centers.filter((c) => c.totalArea != null);
  const medians = centers
    .map((c) => offers.rentBySlug.get(c.slug)?.median ?? null)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const mid = medians.length === 0 ? null : medians.length % 2 === 1
    ? medians[(medians.length - 1) / 2]
    : (medians[medians.length / 2 - 1] + medians[medians.length / 2]) / 2;
  return {
    total: centers.length,
    totalArea: withArea.reduce((sum, c) => sum + (c.totalArea ?? 0), 0),
    withAreaCount: withArea.length,
    rentMedian: mid === null ? null : Math.round(mid * 10) / 10,
    rentBuildings: medians.length,
  };
}
