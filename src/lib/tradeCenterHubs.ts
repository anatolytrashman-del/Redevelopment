// Тематические подборки каталога ТЦ (/minsk/tc/with/<slug>): «с одеждой»,
// у вокзала, подземные, в центре, у метро, белорусские товары и далее.
// Тот же шаблон каталога, что у /format/*, но отбор не по retail_format,
// а по правилу match.
//
// ФАЙЛ-БЛИЗНЕЦ правил отбора — scripts/_tcPaths.mjs (TC_TOPIC_HUB_MATCHERS),
// сверяет тест. Новые подборки добавлять сюда и в близнец одной правкой.
//
// В верхнее меню (/CatalogTopNav) эти URL не выносим (владелец, 2026-10-04).
import type { BusinessCenter, HighlightSection } from '../data/businessCenters';
import { haversineMeters } from './businessCenterMarketPosition';
import { pluralRu } from './pluralRu';
import { isOutsideMinsk } from './businessCenterRanking';

export type TcTopicMatchId =
  | 'shopping'
  | 'railway-station'
  | 'underground'
  | 'center'
  | 'metro'
  | 'belarusian';

export interface TcTopicHub {
  slug: string;
  match: TcTopicMatchId;
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

/** ЖД вокзал Минск-Пассажирский — якорь подборки «у вокзала». */
export const TC_RAILWAY_STATION = { lat: 53.8907, lng: 27.551 } as const;
/** Пешком от вокзала до ТЦ (м): Galileo / Minsk City Mall / «Столица». */
export const TC_RAILWAY_MAX_M = 800;
/** «Рядом с метро» — ближайшая станция не дальше этого (м). */
export const TC_METRO_NEAR_MAX_M = 500;
/** Станции, по которым считаем «в центре» (Немига / вокзал / Независимости). */
export const TC_CENTER_METRO_STATIONS = ['Немига', 'Площадь Ленина', 'Вокзальная', 'Купаловская'] as const;
export const TC_CENTER_METRO_MAX_M = 700;

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
  return sections
    .map((h) => `${h.label ?? ''} ${h.text ?? ''}`)
    .join('\n');
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

export const TC_TOPIC_HUBS: TcTopicHub[] = [
  {
    slug: 'shopping',
    match: 'shopping',
    title: 'Торговые центры Минска с одеждой',
    label: 'С одеждой',
    subjectGen: (n) =>
      `${n % 10 === 1 && n % 100 !== 11 ? 'торгового центра' : 'торговых центров'} Минска с одеждой`,
    plural: (n) => pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров'),
    intro: (count) =>
      `${count} Минска, где можно купить одежду. Адреса, площадь, парковка, часы работы и бренды внутри.`,
  },
  {
    slug: 'railway-station',
    match: 'railway-station',
    title: 'Торговые центры у вокзала в Минске',
    label: 'У вокзала',
    subjectGen: (n) =>
      `${n % 10 === 1 && n % 100 !== 11 ? 'торгового центра' : 'торговых центров'} у вокзала в Минске`,
    plural: (n) => pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров'),
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
    subjectGen: (n) =>
      `${n % 10 === 1 && n % 100 !== 11 ? 'торгового центра' : 'торговых центров'} в центре Минска`,
    plural: (n) => pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров'),
    intro: (count) =>
      `${count} у Немиги, площади Независимости и вокзала. Адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'metro',
    match: 'metro',
    title: 'Торговые центры рядом с метро в Минске',
    label: 'У метро',
    subjectGen: (n) =>
      `${n % 10 === 1 && n % 100 !== 11 ? 'торгового центра' : 'торговых центров'} рядом с метро в Минске`,
    plural: (n) => pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров'),
    intro: (count) =>
      `${count} в ${TC_METRO_NEAR_MAX_M} м от ближайшей станции метро. Адреса, площадь, парковка и часы работы.`,
  },
  {
    slug: 'belarusian',
    match: 'belarusian',
    title: 'Торговые центры Минска с белорусскими товарами',
    label: 'Белорусские товары',
    subjectGen: (n) =>
      `${n % 10 === 1 && n % 100 !== 11 ? 'торгового центра' : 'торговых центров'} Минска с белорусскими товарами`,
    plural: (n) => pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров'),
    intro: (count) =>
      `${count} Минска, где продают товары белорусских производителей и брендов. Адреса, площадь, парковка и часы работы.`,
  },
];

export function tcTopicHubBySlug(slug: string | undefined): TcTopicHub | null {
  return TC_TOPIC_HUBS.find((h) => h.slug === slug) ?? null;
}

export function tcTopicHubUrl(hub: TcTopicHub, basePath = '/minsk/tc'): string {
  return `${basePath}/with/${hub.slug}`;
}

export function matchesTcTopicHub(center: BusinessCenter, hub: TcTopicHub): boolean {
  if (!isEligibleTc(center)) return false;
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
