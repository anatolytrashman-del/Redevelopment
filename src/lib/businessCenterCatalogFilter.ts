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
  | 'rating'
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
  { key: 'rating', label: 'Рейтинг 2ГИС' },
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
  // Станции метро, выбранные явно (можно несколько сразу) — владелец,
  // 2026-09-17. Это не то же, что metroWithin: «рядом с метро, всё равно
  // с каким» и «рядом с Уручьем или Борисовским трактом» — разные вопросы,
  // и оба нужны. Здание подходит, если хотя бы одна из его ближайших
  // станций выбрана.
  metroStations: string[];
  // К13: «нужно N м²» — показать здания, где ЕСТЬ активный лот такого
  // размера. Не «общая площадь здания от N» (это другой вопрос) и не
  // «свободные площади» из prometr.by (те известны у 30 из 143).
  lotSize: number | null;
  facts: string[];
  query: string;
  sort: CatalogSortKey;
  // Вид результатов (К6): плитки / таблица / карта. Формально это не
  // фильтр, но живёт в том же состоянии и в той же строке запроса —
  // ссылкой «вот эти 12 зданий таблицей» делятся так же, как фильтром.
  view: CatalogView;
  // К14: слаги зданий, отмеченных для сравнения (до MAX_COMPARE). Живут в
  // URL вместе с фильтром — сравнение можно отправить ссылкой, ради чего
  // его обычно и делают.
  compare: string[];
}

export const MAX_COMPARE = 4;

// Табличный вид снят с сайта 2026-09-17 (решение владельца: «табличный вид
// вообще убираем»). Значение 'table' в старых ссылках больше не существует —
// parseCatalogFilter отдаёт на него 'cards', см. тест.
export type CatalogView = 'cards' | 'map';

export const CATALOG_VIEWS: { key: CatalogView; label: string }[] = [
  { key: 'cards', label: 'Плитки' },
  { key: 'map', label: 'Карта' },
];

export const EMPTY_CATALOG_FILTER: CatalogFilterState = {
  classes: [],
  districts: [],
  metroWithin: null,
  metroStations: [],
  lotSize: null,
  facts: [],
  query: '',
  sort: 'default',
  view: 'cards',
  compare: [],
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
  // Размеры активных лотов по зданию — для фильтра «нужно N м²» (К13).
  // Берутся из business_center_offers, а не из снимков рынка: снимок хранит
  // уже свёрнутые агрегаты, отдельных площадей в нём нет.
  lotSizesBySlug: Map<string, number[]>;
}

export const EMPTY_OFFER_INDEX: CatalogOfferIndex = {
  rentBySlug: new Map(),
  saleBySlug: new Map(),
  lotSizesBySlug: new Map(),
};

export function buildOfferIndex(
  snapshots: MarketSnapshot[] | null,
  lots: { businessCenterSlug: string; size: number }[] | null = null,
): CatalogOfferIndex {
  const rentBySlug = new Map<string, MarketSnapshot>();
  const saleBySlug = new Map<string, MarketSnapshot>();
  for (const s of snapshots ?? []) {
    if (s.sliceType !== 'building') continue;
    (s.deal === 'rent' ? rentBySlug : saleBySlug).set(s.sliceKey, s);
  }
  const lotSizesBySlug = new Map<string, number[]>();
  for (const l of lots ?? []) {
    if (!(l.size > 0)) continue;
    const arr = lotSizesBySlug.get(l.businessCenterSlug) ?? [];
    arr.push(l.size);
    lotSizesBySlug.set(l.businessCenterSlug, arr);
  }
  return { rentBySlug, saleBySlug, lotSizesBySlug };
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
  // Три параметра ниже пришли из 2ГИС (миграция
  // 20260916-bc-2gis-and-verdict-columns.sql). Порог 4,5 — не «выше
  // среднего»: средний рейтинг по 47 зданиям с оценками 4,77, скользящее
  // сравнение пришлось бы объяснять, а прямой порог понятен.
  // Порог 60 м² — минимальный «отдельный офис на команду до пяти человек»;
  // ниже начинаются кладовки и доли в коворкингах, выше — уже не «маленький».
  { id: 'small-lot', label: 'Есть лот до 60 м²', test: (c, o) => (o.lotSizesBySlug.get(c.slug) ?? []).some((v) => v <= 60) },
  {
    id: 'cheap10',
    label: 'Аренда дешевле $10/м²',
    test: (c, o) => {
      const m = o.rentBySlug.get(c.slug)?.median;
      return m != null && m < 10;
    },
  },
  { id: 'open24', label: 'Круглосуточно', test: (c) => c.is24x7 === true },
  { id: 'accessible', label: 'Доступная среда', test: (c) => c.accessibility.length > 0 },
  { id: 'rating45', label: 'Рейтинг 2ГИС от 4,5', test: (c) => c.gisRating != null && c.gisRating >= 4.5 },
  { id: 'under-construction', label: 'Строится', test: (c) => c.status === 'under_construction' },
];

const FACT_BY_ID = new Map(CATALOG_FACTS.map((f) => [f.id, f]));

// --- К15. Пресеты-подборки ---------------------------------------------
//
// Готовые ответы на вопросы, которые люди задают словами, а не осями
// фильтра: «что-нибудь класса A рядом с метро», «на команду из четырёх
// человек», «подешевле». Каждый пресет — обычное состояние фильтра,
// поэтому он и в URL попадает как обычный фильтр, и снимается одним
// повторным кликом.
export interface CatalogPreset {
  id: string;
  label: string;
  patch: Partial<CatalogFilterState>;
}

export const CATALOG_PRESETS: CatalogPreset[] = [
  { id: 'a-metro', label: 'Класс A у метро', patch: { classes: ['A'], metroWithin: 1000 } },
  { id: 'small', label: 'Для маленького офиса', patch: { facts: ['small-lot'] } },
  { id: 'uk-parking', label: 'Единая УК с парковкой', patch: { facts: ['uk', 'parking'] } },
  { id: 'cheap', label: 'Дешевле $10/м²', patch: { facts: ['cheap10'] } },
  { id: 'open-space', label: 'Open-space в аренду', patch: { facts: ['open-space', 'rent'] } },
  { id: 'building', label: 'Строятся', patch: { facts: ['under-construction'] } },
];

// Пресет считается включённым, когда состояние фильтра совпадает с ним в
// точности: иначе «Класс A у метро» подсвечивался бы и тогда, когда
// пользователь вручную добавил сверху ещё три условия.
export function isPresetActive(preset: CatalogPreset, state: CatalogFilterState): boolean {
  const target = { ...EMPTY_CATALOG_FILTER, ...preset.patch };
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return (
    same(target.classes, state.classes) &&
    same(target.districts, state.districts) &&
    same(target.facts, state.facts) &&
    target.metroWithin === state.metroWithin &&
    same(target.metroStations, state.metroStations) &&
    target.lotSize === state.lotSize &&
    (target.query || '') === (state.query || '')
  );
}

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
  const viewRaw = params.get('view');
  const lotRaw = Number(params.get('lot'));
  return {
    classes: splitList(params.get('class')).filter((v) => ['A', 'B+', 'B', 'C'].includes(v)),
    districts: splitList(params.get('district')),
    metroWithin: METRO_WITHIN_OPTIONS.some((o) => o.value === metroRaw) ? metroRaw : null,
    metroStations: splitList(params.get('station')),
    lotSize: Number.isFinite(lotRaw) && lotRaw > 0 ? Math.round(lotRaw) : null,
    facts: splitList(params.get('facts')).filter((id) => FACT_BY_ID.has(id)),
    query: params.get('q')?.trim() ?? '',
    sort: CATALOG_SORTS.some((s) => s.key === sortRaw) ? (sortRaw as CatalogSortKey) : 'default',
    view: CATALOG_VIEWS.some((v) => v.key === viewRaw) ? (viewRaw as CatalogView) : 'cards',
    compare: splitList(params.get('compare')).slice(0, MAX_COMPARE),
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
  if (state.metroStations.length > 0) params.set('station', [...state.metroStations].sort().join(','));
  if (state.lotSize != null) params.set('lot', String(state.lotSize));
  if (state.facts.length > 0) params.set('facts', [...state.facts].sort().join(','));
  if (state.query) params.set('q', state.query);
  if (state.sort !== 'default') params.set('sort', state.sort);
  if (state.view !== 'cards') params.set('view', state.view);
  // Порядок сравнения — тот, в котором отмечал пользователь: колонки не
  // должны переставляться сами при перезагрузке страницы.
  if (state.compare.length > 0) params.set('compare', state.compare.join(','));
  const s = params.toString();
  return s ? `?${s}` : '';
}

// Сортировка, вид и поиск — это не сужение выборки по осям, поэтому
// «фильтр пуст» считается без них: строка «Подходит N из 143» и кнопка «Сбросить»
// должны реагировать на выбор класса или тумблера, а не на смену порядка.
export function hasActiveCatalogFilter(state: CatalogFilterState): boolean {
  return (
    state.classes.length > 0 ||
    state.districts.length > 0 ||
    state.metroWithin != null ||
    state.metroStations.length > 0 ||
    state.lotSize != null ||
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
  if (state.metroStations.length > 0) {
    // Неизвестное не считается несовпадением «по вине здания»: у БЦ без
    // разобранных станций признак просто не проверить, и такие здания
    // считаются отдельно (см. unverifiableByMetroStation).
    if (!center.nearestMetroStations.some((st) => state.metroStations.includes(st.name))) return false;
  }
  if (state.metroWithin != null) {
    const meters = nearestMetroMeters(center);
    if (meters === null || meters > state.metroWithin) return false;
  }
  if (state.lotSize != null) {
    // Подходит лот НЕ МЕНЬШЕ запрошенного: снять 80 м², когда нужно 50, —
    // рабочий вариант, а снять 30 вместо 50 — нет. Верхней границы нет
    // намеренно, иначе «нужно 50» отсекало бы здания, где есть и 50, и 400.
    const sizes = offers.lotSizesBySlug.get(center.slug);
    if (!sizes || !sizes.some((s) => s >= (state.lotSize as number))) return false;
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
    case 'rating':
      return list.sort(byNumber((c) => c.gisRating, 'desc'));
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


// Все станции, встречающиеся у зданий каталога, по алфавиту — источник
// списка для фильтра. Берём из данных, а не из захардкоженного перечня:
// станций в Минске больше, чем тех, рядом с которыми есть бизнес-центры.
export function catalogMetroStations(centers: BusinessCenter[]): string[] {
  const set = new Set<string>();
  for (const c of centers) for (const st of c.nearestMetroStations) set.add(st.name);
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

// Сколько зданий выборки НЕЛЬЗЯ проверить по признаку «метро»: у них не
// разобрана ни одна ближайшая станция. Это не «не подходят» — это «не
// знаем», и говорить об этом надо отдельно (требование мастер-плана:
// неизвестное значение не должно превращаться в недостаток).
export function unverifiableByMetroStation(centers: BusinessCenter[]): number {
  return centers.filter((c) => c.nearestMetroStations.length === 0).length;
}
