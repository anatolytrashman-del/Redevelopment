// Тематические подборки каталога ТЦ (/minsk/tc/with/<slug>): «с одеждой»,
// локации, «что внутри», бренды. Тот же шаблон каталога, что у /format/*,
// но отбор по правилу match (часть — из /data/tc-filters.json).
//
// ФАЙЛ-БЛИЗНЕЦ правил отбора — scripts/_tcPaths.mjs (TC_TOPIC_HUB_MATCHERS),
// сверяет тест. Новые подборки добавлять сюда и в близнец одной правкой.
//
// В верхнее меню (/CatalogTopNav) эти URL не выносим (владелец, 2026-10-04).
import type { BusinessCenter, HighlightSection } from '../data/businessCenters';
import { haversineMeters } from './businessCenterMarketPosition';
import { isOutsideMinsk } from './businessCenterRanking';
import { pluralRu } from './pluralRu';
import type { TcFilterEntry } from './tradeCenterCatalogFeatures';

export type TcTopicMatchId =
  | 'shopping'
  | 'railway-station'
  | 'underground'
  | 'center'
  | 'metro'
  | 'belarusian'
  | 'cinema'
  | 'kids'
  | 'entertainment'
  | 'foodcourt'
  | 'parking'
  | 'ice-rink'
  | 'brand'

export interface TcTopicHub {
  slug: string;
  match: TcTopicMatchId;
  /** Нормализованный ключ бренда для match: 'brand' (см. normalizeBrand). */
  brandKey?: string;
  /** «Торговые центры Минска с одеждой» — заголовок подборки. */
  title: string;
  /** «С одеждой» — крошки и ссылка. */
  label: string;
  subjectGen: (n: number) => string;
  plural: (n: number) => string;
  intro: (countLabel: string) => string;
}

/** Форматы, которые не отвечают на запрос «ТЦ с одеждой / для шопинга». */
export const TC_NON_SHOPPING_FORMATS = ['мебельный центр', 'рынок', 'строительный центр', 'автоцентр'] as const;

/** В индекс и перелинковку — любая непустая тематическая подборка, даже из 1–2 ТЦ (владелец, 2026-10-04). Пустая страница по-прежнему soft-404. Близнец — TC_TOPIC_HUB_MIN_CENTERS в scripts/_tcPaths.mjs. */
export const TC_TOPIC_HUB_MIN_CENTERS = 1;

/** ЖД вокзал Минск-Пассажирский — якорь подборки «у вокзала». */
export const TC_RAILWAY_STATION = { lat: 53.8907, lng: 27.551 } as const;
/** Пешком от вокзала до ТЦ (м): Galileo / Minsk City Mall / «Столица». */
export const TC_RAILWAY_MAX_M = 800;
/** «Рядом с метро» — ближайшая станция не дальше этого (м). */
export const TC_METRO_NEAR_MAX_M = 500;
/** Станции, по которым считаем «в центре» (Немига / вокзал / Независимости). */
export const TC_CENTER_METRO_STATIONS = ['Немига', 'Площадь Ленина', 'Вокзальная', 'Купаловская'] as const;
export const TC_CENTER_METRO_MAX_M = 700;

/** Матчи, которым нужна выжимка /data/tc-filters.json. */
export const TC_TOPIC_FILTER_MATCHES: readonly TcTopicMatchId[] = [
  'cinema',
  'kids',
  'entertainment',
  'foodcourt',
  'parking',
  'ice-rink',
  'brand',
];

// Кириллица: \w и \b не работают — буквы через \p{L}, конец слова lookahead'ом.
const UNDERGROUND_NAME_RE = /подземн/iu;
const UNDERGROUND_DESC_RE =
  /подземн\p{L}*\s+торгов|торгов\p{L}[^\.]{0,80}под земл|открыт[^\.]{0,60}под земл/iu;
const CENTER_ADDRESS_RE = /Немига|площад\p{L}*\s+Независимости|пл\.\s*Независимости/iu;
const BELARUSIAN_GOODS_RE =
  /(?:магазин\p{L}*|товар\p{L}*|бренд\p{L}*|производител\p{L}*)\s+белорусск|белорусск\p{L}*\s+(?:магазин\p{L}*|товар\p{L}*|бренд\p{L}*|производител\p{L}*)|только\s+товар\p{L}*\s+белорусск|витрин\p{L}*\s+белорусск/iu;
const BELARUSIAN_NATIONAL_RE = /нацыянальн|национальн\p{L}*\s+(?:гандл|торгов)/iu;

function highlightText(sections: HighlightSection[] | null | undefined): string {
  if (!Array.isArray(sections)) return '';
  return sections.map((h) => `${h.label ?? ''} ${h.text ?? ''}`).join('\n');
}

/** Имя, описание и факты ресёрча — единый текст для текстовых матчеров. */
export function tcTopicTextBlob(center: {
  name?: string | null;
  altNames?: string[] | null;
  description?: string | null;
  highlights?: HighlightSection[] | null;
}): string {
  return [
    center.name ?? '',
    ...(Array.isArray(center.altNames) ? center.altNames : []),
    center.description ?? '',
    highlightText(center.highlights),
  ].join('\n');
}

function isEligibleTc(center: BusinessCenter): boolean {
  return center.status !== 'under_construction' && !isOutsideMinsk(center);
}

function nearestMetroWithin(center: BusinessCenter, maxMeters: number, names?: readonly string[]): boolean {
  const stations = center.nearestMetroStations ?? [];
  return stations.some((s) => {
    if (typeof s.distanceMeters !== 'number') return false;
    if (s.distanceMeters > maxMeters) return false;
    if (names && !names.includes(s.name)) return false;
    return true;
  });
}

function centersWord(n: number): string {
  return pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров');
}

function centersGen(n: number, tail: string): string {
  const head = n % 10 === 1 && n % 100 !== 11 ? 'торгового центра' : 'торговых центров';
  return `${head} ${tail}`;
}

function brandHub(slug: string, brandKey: string, label: string): TcTopicHub {
  return {
    slug,
    match: 'brand',
    brandKey,
    title: `Торговые центры Минска с ${label}`,
    label,
    subjectGen: (n) => centersGen(n, `Минска с ${label}`),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска, где есть магазин ${label}. Адреса, площадь, парковка, часы работы и другие арендаторы.`,
  };
}

export const TC_TOPIC_HUBS: TcTopicHub[] = [
  // --- волна 1 ---
  {
    slug: 'shopping',
    match: 'shopping',
    title: 'Торговые центры Минска с одеждой',
    label: 'С одеждой',
    subjectGen: (n) => centersGen(n, 'Минска с одеждой'),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска, где можно купить одежду. Адреса, площадь, парковка, часы работы и бренды внутри.`,
  },
  // --- волна 2: локации и типы ---
  {
    slug: 'railway-station',
    match: 'railway-station',
    title: 'Торговые центры у вокзала в Минске',
    label: 'У вокзала',
    subjectGen: (n) => centersGen(n, 'у вокзала в Минске'),
    plural: centersWord,
    intro: (count) =>
      `${count} в пешей доступности от железнодорожного вокзала Минск-Пассажирский. Адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'underground',
    match: 'underground',
    title: 'Подземные торговые центры Минска',
    label: 'Подземные',
    subjectGen: (n) =>
      `${n % 10 === 1 && n % 100 !== 11 ? 'подземного торгового центра' : 'подземных торговых центров'} Минска`,
    plural: (n) => pluralRu(n, 'подземный торговый центр', 'подземных торговых центра', 'подземных торговых центров'),
    intro: (count) =>
      `${count} Минска — торговые галереи под землёй. Адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'center',
    match: 'center',
    title: 'Торговые центры в центре Минска',
    label: 'В центре',
    subjectGen: (n) => centersGen(n, 'в центре Минска'),
    plural: centersWord,
    intro: (count) =>
      `${count} у Немиги, площади Независимости и вокзала. Адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'metro',
    match: 'metro',
    title: 'Торговые центры рядом с метро в Минске',
    label: 'У метро',
    subjectGen: (n) => centersGen(n, 'рядом с метро в Минске'),
    plural: centersWord,
    intro: (count) =>
      `${count} в ${TC_METRO_NEAR_MAX_M} м от ближайшей станции метро. Адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'belarusian',
    match: 'belarusian',
    title: 'Торговые центры Минска с белорусскими товарами',
    label: 'Белорусские товары',
    subjectGen: (n) => centersGen(n, 'Минска с белорусскими товарами'),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска, где продают товары белорусских производителей и брендов. Адреса, площадь, парковка и часы работы.`,
  },
  // --- волна 3: что внутри ---
  {
    slug: 'cinema',
    match: 'cinema',
    title: 'Торговые центры Минска с кинотеатром',
    label: 'С кинотеатром',
    subjectGen: (n) => centersGen(n, 'Минска с кинотеатром'),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска, где есть кинотеатр. Адреса, площадь, парковка, часы работы и другие развлечения.`,
  },
  {
    slug: 'kids',
    match: 'kids',
    title: 'Торговые центры Минска для детей',
    label: 'Для детей',
    subjectGen: (n) => centersGen(n, 'Минска для детей'),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска с детскими зонами и развлечениями. Адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'entertainment',
    match: 'entertainment',
    title: 'Торговые центры Минска с развлечениями',
    label: 'С развлечениями',
    subjectGen: (n) => centersGen(n, 'Минска с развлечениями'),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска с кино, играми, катком или другими развлечениями. Адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'foodcourt',
    match: 'foodcourt',
    title: 'Торговые центры Минска с фудкортом',
    label: 'С фудкортом',
    subjectGen: (n) => centersGen(n, 'Минска с фудкортом'),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска с фудкортом или ресторанной зоной. Адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'parking',
    match: 'parking',
    title: 'Торговые центры Минска с парковкой',
    label: 'С парковкой',
    subjectGen: (n) => centersGen(n, 'Минска с парковкой'),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска с описанной парковкой. Адреса, площадь, режим парковки и часы работы.`,
  },
  // --- волна 5: хвост (каток, ещё бренды) ---
  {
    slug: 'ice-rink',
    match: 'ice-rink',
    title: 'Торговые центры Минска с катком',
    label: 'С катком',
    subjectGen: (n) => centersGen(n, 'Минска с катком'),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска, где есть каток. Адреса, площадь, парковка и часы работы.`,
  },
  // --- волны 4–5: бренды (Wordstat; якоря + арендаторы в tc-filters) ---
  brandHub('zara', 'zara', 'Zara'),
  brandHub('gold-apple', 'золотое яблоко', 'Золотое яблоко'),
  brandHub('bershka', 'bershka', 'Bershka'),
  brandHub('nike', 'nike', 'Nike'),
  brandHub('adidas', 'adidas', 'Adidas'),
  brandHub('massimo-dutti', 'massimo dutti', 'Massimo Dutti'),
  brandHub('stradivarius', 'stradivarius', 'Stradivarius'),
  brandHub('gloria-jeans', 'gloria jeans', 'Gloria Jeans'),
  brandHub('sinsay', 'sinsay', 'Sinsay'),
  brandHub('new-yorker', 'new yorker', 'New Yorker'),
  brandHub('lc-waikiki', 'lc waikiki', 'LC Waikiki'),
  brandHub('pull-and-bear', 'pull&bear', 'Pull&Bear'),
  brandHub('sportmaster', 'спортмастер', 'Спортмастер'),
  brandHub('mango', 'mango', 'Mango'),
  brandHub('reserved', 'reserved', 'Reserved'),
  brandHub('cropp', 'cropp', 'Cropp'),
  brandHub('house', 'house', 'House'),
  brandHub('defacto', 'defacto', 'DeFacto'),
  brandHub('mohito', 'mohito', 'Mohito'),
  brandHub('oysho', 'oysho', 'Oysho'),
  brandHub('familia', 'familia', 'Familia'),
  brandHub('milavitsa', 'milavitsa', 'Milavitsa'),
  brandHub('mark-formelle', 'mark formelle', 'Mark Formelle'),
  brandHub('kari', 'kari', 'Kari'),
  brandHub('detmir', 'детмир', 'Детмир'),
  brandHub('5-element', '5 элемент', '5 элемент'),
  brandHub('miniso', 'miniso', 'MINISO'),
];

export function tcTopicHubBySlug(slug: string | undefined): TcTopicHub | null {
  return TC_TOPIC_HUBS.find((h) => h.slug === slug) ?? null;
}

export function tcTopicHubUrl(hub: TcTopicHub, basePath = '/minsk/tc'): string {
  return `${basePath}/with/${hub.slug}`;
}

export function topicHubNeedsFilters(hub: TcTopicHub): boolean {
  return (TC_TOPIC_FILTER_MATCHES as readonly string[]).includes(hub.match);
}

function matchesFilterTopic(hub: TcTopicHub, entry: TcFilterEntry | undefined): boolean {
  if (!entry) return false;
  switch (hub.match) {
    case 'cinema':
      return entry.features.has('cinema');
    case 'kids':
      return entry.features.has('kids');
    case 'foodcourt':
      return entry.features.has('foodcourt');
    case 'parking':
      return entry.features.has('parking');
    case 'entertainment':
      return entry.features.has('entertainment');
    case 'ice-rink':
      return entry.features.has('ice');
    case 'brand':
      return Boolean(hub.brandKey) && entry.brands.some((b) => b.includes(hub.brandKey!));
    default:
      return false;
  }
}

export function matchesTcTopicHub(
  center: BusinessCenter,
  hub: TcTopicHub,
  filterEntry?: TcFilterEntry | null,
): boolean {
  if (!isEligibleTc(center)) return false;
  if (topicHubNeedsFilters(hub)) return matchesFilterTopic(hub, filterEntry ?? undefined);
  switch (hub.match) {
    case 'shopping':
      return center.retailFormat == null || !(TC_NON_SHOPPING_FORMATS as readonly string[]).includes(center.retailFormat);
    case 'railway-station': {
      if (center.lat == null || center.lng == null) return false;
      return haversineMeters(center.lat, center.lng, TC_RAILWAY_STATION.lat, TC_RAILWAY_STATION.lng) <= TC_RAILWAY_MAX_M;
    }
    case 'underground': {
      const nameBlob = [center.name, ...(center.altNames ?? [])].join(' ');
      return UNDERGROUND_NAME_RE.test(nameBlob) || UNDERGROUND_DESC_RE.test(center.description ?? '');
    }
    case 'center': {
      if (CENTER_ADDRESS_RE.test(center.address ?? '')) return true;
      return nearestMetroWithin(center, TC_CENTER_METRO_MAX_M, TC_CENTER_METRO_STATIONS);
    }
    case 'metro':
      return nearestMetroWithin(center, TC_METRO_NEAR_MAX_M);
    case 'belarusian': {
      if (center.retailFormat != null && (TC_NON_SHOPPING_FORMATS as readonly string[]).includes(center.retailFormat)) {
        return false;
      }
      const blob = tcTopicTextBlob(center);
      return BELARUSIAN_GOODS_RE.test(blob) || BELARUSIAN_NATIONAL_RE.test(blob);
    }
    default:
      return false;
  }
}
