// Авторские полки подборок на корне каталога ТЦ (/minsk/tc) — по образцу
// casinolist shortlists: горизонтальный скролл, яркие lookbook-карточки,
// сценарии для минчан (шопинг / кино / парковка / бренды / топ районы и метро).
// Данные — из уже существующих хабов /with/*, /store/*, /district/*, /metro/*.
import type { BusinessCenter } from '../data/businessCenters';
import { isOutsideMinsk } from './businessCenterRanking';
import {
  DISTRICT_SLUGS,
  MIN_INDEXABLE_HUB_CENTERS,
  metroHubDistance,
  metroHubUrl,
  districtHubUrl,
} from './businessCenterHubs';
import { MINSK_METRO_LINES } from './businessCenterCatalogFilter';
import { pluralRu } from './pluralRu';
import {
  matchesTcTopicHub,
  tcTopicHubBySlug,
  tcTopicHubUrl,
  topicHubNeedsFilters,
  type TcTopicHub,
} from './tradeCenterHubs';
import {
  collectTcStoreHubs,
  matchesTcStoreHub,
  tcStoreHubUrl,
  type TcStoreHub,
} from './tradeCenterStoreHubs';
import type { TcFilterIndex } from './tradeCenterCatalogFeatures';

export type TcLookbookArt =
  | 'shopping'
  | 'cinema'
  | 'free-parking'
  | 'foodcourt'
  | 'kids'
  | 'entertainment'
  | 'budget'
  | 'center'
  | 'metro-near'
  | 'brand-gold-apple'
  | 'brand-fashion'
  | 'brand-sport'
  | 'brand-beauty'
  | 'district'
  | 'metro-blue'
  | 'metro-red'
  | 'metro-green';

export interface TcEditorialCard {
  id: string;
  href: string;
  title: string;
  countLabel: string;
  art: TcLookbookArt;
  from: string;
  to: string;
}

export interface TcEditorialShelf {
  id: string;
  title: string;
  lead: string;
  cards: TcEditorialCard[];
}

/** Сценарии «куда сегодня» — порядок как у казино Start tonight. */
export const TC_TONIGHT_TOPIC_SLUGS = [
  'shopping',
  'cinema',
  'free-parking',
  'foodcourt',
  'kids',
  'entertainment',
  'budget',
  'center',
] as const;

/**
 * Бренды, которые минчане реально ищут. Порядок — редакционный;
 * в полку попадают только те, у кого в каталоге ≥ TC_FEATURED_BRAND_MIN ТЦ.
 */
export const TC_FEATURED_BRAND_SLUGS = [
  'gold-apple',
  'zara',
  'adidas',
  'nike',
  'sportmaster',
  'sinsay',
  'milavitsa',
  'reserved',
  'mango',
  'bershka',
  'detmir',
  '5-element',
  'mark-formelle',
  'familia',
  'lc-waikiki',
] as const;

export const TC_FEATURED_BRAND_MIN = 2;
export const TC_TOP_DISTRICTS = 5;
export const TC_TOP_METRO = 6;

const TONIGHT_ART: Record<string, { art: TcLookbookArt; from: string; to: string }> = {
  shopping: { art: 'shopping', from: '#c45c2a', to: '#7a2e12' },
  cinema: { art: 'cinema', from: '#1e2a4a', to: '#0b1224' },
  'free-parking': { art: 'free-parking', from: '#1a5c6e', to: '#0b2f38' },
  foodcourt: { art: 'foodcourt', from: '#b4532a', to: '#6b2a12' },
  kids: { art: 'kids', from: '#c26b8a', to: '#7a3048' },
  entertainment: { art: 'entertainment', from: '#6b3fa0', to: '#2e1848' },
  budget: { art: 'budget', from: '#2f6b4f', to: '#143528' },
  center: { art: 'center', from: '#e4152b', to: '#8a0c1a' },
};

const DISTRICT_PALETTES = [
  { from: '#2a4a6b', to: '#122438' },
  { from: '#6b3a2a', to: '#301810' },
  { from: '#2a6b5a', to: '#103028' },
  { from: '#5a3a6b', to: '#241028' },
  { from: '#6b5a2a', to: '#302810' },
] as const;

const METRO_ART: Record<string, { art: TcLookbookArt; from: string; to: string }> = {
  blue: { art: 'metro-blue', from: '#1976c9', to: '#0b3a66' },
  red: { art: 'metro-red', from: '#e31d35', to: '#6b0c18' },
  green: { art: 'metro-green', from: '#169447', to: '#0a3d1f' },
};

function isEligible(c: BusinessCenter): boolean {
  return c.status !== 'under_construction' && !isOutsideMinsk(c);
}

function centersWord(n: number): string {
  return pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров');
}

function countLabel(n: number): string {
  return `${n} ${centersWord(n)}`;
}

function qualityScore(centers: BusinessCenter[]): number {
  // Количество важнее, но крупные и хорошо оценённые ТЦ поднимают срез.
  let area = 0;
  let ratingSum = 0;
  let ratingN = 0;
  for (const c of centers) {
    if (typeof c.totalArea === 'number') area += c.totalArea;
    if (typeof c.gisRating === 'number' && c.gisRating > 0) {
      ratingSum += c.gisRating;
      ratingN += 1;
    }
  }
  const avgRating = ratingN ? ratingSum / ratingN : 0;
  return centers.length * 10_000 + Math.round(area / 100) + Math.round(avgRating * 100);
}

function brandArt(slug: string): { art: TcLookbookArt; from: string; to: string } {
  if (slug === 'gold-apple') {
    return { art: 'brand-gold-apple', from: '#c9a227', to: '#6b4e0a' };
  }
  if (slug === 'adidas' || slug === 'nike' || slug === 'sportmaster' || slug === '5-element') {
    return { art: 'brand-sport', from: '#1a1a1a', to: '#3a3a3a' };
  }
  if (slug === 'detmir' || slug === 'milavitsa') {
    return { art: 'brand-beauty', from: '#a84d6d', to: '#5a2038' };
  }
  return { art: 'brand-fashion', from: '#e4152b', to: '#5c0812' };
}

function stationLineId(station: string): string {
  for (const line of MINSK_METRO_LINES) {
    if (line.stations.some((s) => s.toLowerCase() === station.toLowerCase())) {
      return line.id;
    }
  }
  return 'blue';
}

export function buildTonightShelf(
  centers: BusinessCenter[],
  tcIndex: TcFilterIndex | null,
  basePath = '/minsk/tc',
): TcEditorialShelf | null {
  const eligible = centers.filter(isEligible);
  const cards: TcEditorialCard[] = [];
  for (const slug of TC_TONIGHT_TOPIC_SLUGS) {
    const hub = tcTopicHubBySlug(slug);
    if (!hub) continue;
    if (topicHubNeedsFilters(hub) && !tcIndex) continue;
    const n = eligible.filter((c) => matchesTcTopicHub(c, hub, tcIndex?.get(c.slug))).length;
    if (n < 1) continue;
    const palette = TONIGHT_ART[slug] ?? TONIGHT_ART.shopping;
    cards.push({
      id: `topic-${slug}`,
      href: tcTopicHubUrl(hub, basePath),
      title: hub.label,
      countLabel: countLabel(n),
      ...palette,
    });
  }
  if (!cards.length) return null;
  return {
    id: 'tonight',
    title: 'Куда сегодня',
    lead: 'Сценарии для минчан: шопинг, кино, бесплатная парковка и другие срезы каталога.',
    cards,
  };
}

export function buildBrandsShelf(
  centers: BusinessCenter[],
  tcIndex: TcFilterIndex | null,
  basePath = '/minsk/tc',
): TcEditorialShelf | null {
  if (!tcIndex) return null;
  const hubs = collectTcStoreHubs(tcIndex);
  const bySlug = new Map(hubs.map((h) => [h.slug, h]));
  const eligible = centers.filter(isEligible);
  const cards: TcEditorialCard[] = [];
  for (const slug of TC_FEATURED_BRAND_SLUGS) {
    const hub = bySlug.get(slug);
    if (!hub) continue;
    const n = eligible.filter((c) => matchesTcStoreHub(c, hub, tcIndex.get(c.slug))).length;
    if (n < TC_FEATURED_BRAND_MIN) continue;
    cards.push({
      id: `brand-${slug}`,
      href: tcStoreHubUrl(hub, basePath),
      title: hub.label,
      countLabel: countLabel(n),
      ...brandArt(slug),
    });
  }
  if (!cards.length) return null;
  return {
    id: 'brands',
    title: 'За чем едут',
    lead: 'Популярные бренды в торговых центрах Минска — от «Золотого яблока» до масс-маркета.',
    cards,
  };
}

export function buildDistrictsShelf(
  centers: BusinessCenter[],
  basePath = '/minsk/tc',
): TcEditorialShelf | null {
  const eligible = centers.filter(isEligible);
  const byDistrict = new Map<string, BusinessCenter[]>();
  for (const c of eligible) {
    if (!c.district || !DISTRICT_SLUGS[c.district]) continue;
    const list = byDistrict.get(c.district) ?? [];
    list.push(c);
    byDistrict.set(c.district, list);
  }
  const ranked = [...byDistrict.entries()]
    .filter(([, list]) => list.length >= MIN_INDEXABLE_HUB_CENTERS)
    .map(([name, list]) => ({ name, list, score: qualityScore(list) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'))
    .slice(0, TC_TOP_DISTRICTS);

  const cards: TcEditorialCard[] = [];
  ranked.forEach((row, i) => {
    const href = districtHubUrl(row.name, basePath);
    if (!href) return;
    const palette = DISTRICT_PALETTES[i % DISTRICT_PALETTES.length];
    const short = row.name.replace(/\s+район$/u, '');
    cards.push({
      id: `district-${DISTRICT_SLUGS[row.name]}`,
      href,
      title: short,
      countLabel: countLabel(row.list.length),
      art: 'district',
      from: palette.from,
      to: palette.to,
    });
  });
  if (!cards.length) return null;
  return {
    id: 'districts',
    title: 'Районы',
    lead: 'Не все районы подряд — только топовые по числу и качеству торговых центров.',
    cards,
  };
}

export function buildMetroShelf(
  centers: BusinessCenter[],
  basePath = '/minsk/tc',
): TcEditorialShelf | null {
  const eligible = centers.filter(isEligible);
  const stationNames = new Set<string>();
  for (const line of MINSK_METRO_LINES) {
    for (const s of line.stations) stationNames.add(s);
  }
  const ranked: { name: string; list: BusinessCenter[]; score: number }[] = [];
  for (const name of stationNames) {
    const list = eligible.filter((c) => metroHubDistance(c, name) !== null);
    if (list.length < MIN_INDEXABLE_HUB_CENTERS) continue;
    ranked.push({ name, list, score: qualityScore(list) });
  }
  ranked.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'));
  const top = ranked.slice(0, TC_TOP_METRO);

  const cards: TcEditorialCard[] = [];
  for (const row of top) {
    const href = metroHubUrl(row.name, basePath);
    if (!href) continue;
    const line = stationLineId(row.name);
    const palette = METRO_ART[line] ?? METRO_ART.blue;
    cards.push({
      id: `metro-${href.split('/').pop()}`,
      href,
      title: row.name,
      countLabel: countLabel(row.list.length),
      ...palette,
    });
  }
  if (!cards.length) return null;
  return {
    id: 'metro',
    title: 'У метро',
    lead: 'Станции, у которых реально есть выбор ТЦ — не полный список метро, а рабочие маршруты минчан.',
    cards,
  };
}

export function buildTcEditorialShelves(
  centers: BusinessCenter[] | null,
  tcIndex: TcFilterIndex | null,
  basePath = '/minsk/tc',
): TcEditorialShelf[] {
  if (!centers?.length) return [];
  return [
    buildTonightShelf(centers, tcIndex, basePath),
    buildBrandsShelf(centers, tcIndex, basePath),
    buildDistrictsShelf(centers, basePath),
    buildMetroShelf(centers, basePath),
  ].filter((s): s is TcEditorialShelf => Boolean(s && s.cards.length));
}

/** Для тестов и отладки — сколько ТЦ матчит хаб. */
export function countTopicMatches(
  centers: BusinessCenter[],
  hub: TcTopicHub,
  tcIndex: TcFilterIndex | null,
): number {
  return centers.filter(isEligible).filter((c) => matchesTcTopicHub(c, hub, tcIndex?.get(c.slug))).length;
}

export function countStoreMatches(
  centers: BusinessCenter[],
  hub: TcStoreHub,
  tcIndex: TcFilterIndex,
): number {
  return centers.filter(isEligible).filter((c) => matchesTcStoreHub(c, hub, tcIndex.get(c.slug))).length;
}
