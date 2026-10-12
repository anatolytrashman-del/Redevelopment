// Авторские полки подборок на корне каталога ТЦ (/minsk/tc).
// Данные — из хабов /with/*, /store/*, /district/*, /metro/* плюс карточка «Все ТЦ».
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
  | 'all'
  | 'metro-near'
  | 'brand-gold-apple'
  | 'brand-fashion'
  | 'brand-sport'
  | 'brand-beauty'
  | 'district'
  | 'district-blocks'
  | 'district-grid'
  | 'district-arc'
  | 'district-steps'
  | 'district-skyline'
  | 'metro-blue'
  | 'metro-red'
  | 'metro-green'
  | 'metro-rail'
  | 'metro-node'
  | 'metro-fork'
  | 'metro-ring';

export interface TcEditorialCard {
  id: string;
  href: string;
  title: string;
  countLabel: string;
  count: number;
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

/** Иконка плитки сводки — как у casinolist At a glance. */
export type TcBrowseFigureIcon =
  | 'malls'
  | 'area'
  | 'metro'
  | 'cinema'
  | 'parking'
  | 'food'
  | 'kids'
  | 'fun'
  | 'shopping'
  | 'brands'
  | 'late'
  | 'grocery'
  | 'center'
  | 'budget';

/** Тон плитки сводки — как на casinolist At a glance (gold → felt/primary/ink). */
export type TcBrowseFigureTone = 'gold' | 'felt' | 'primary' | 'ink';

/** Ключевая цифра блока «сводка» на корне каталога ТЦ (ритм casinolist At a glance). */
export interface TcBrowseFigure {
  id: string;
  value: string;
  label: string;
  icon: TcBrowseFigureIcon;
  tone: TcBrowseFigureTone;
  /** Первая плитка — золотая рамка. */
  accent?: boolean;
  href?: string;
}

/** Ритм цветов как у casinolist: первая gold, дальше felt → primary → ink. */
export function glanceToneAt(index: number): TcBrowseFigureTone {
  if (index === 0) return 'gold';
  const cycle: TcBrowseFigureTone[] = ['felt', 'primary', 'ink'];
  return cycle[(index - 1) % cycle.length]!;
}

/** Ровно столько плиток, чтобы на lg+ было две полные строки по 6. */
export const TC_BROWSE_FIGURE_SLOTS = 12;

/** Сценарии «куда сегодня». */
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
 * Бренды-кандидаты в полку. Порядок в массиве не важен —
 * на полке сортируем по числу ТЦ (больше → раньше).
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

/** Список всех ТЦ — отдельная «подборка», не сетка на корне. */
export const TC_ALL_LIST_HREF = '/minsk/tc?view=list';

const TONIGHT_ART: Record<string, { art: TcLookbookArt; from: string; to: string; shelfTitle: string }> = {
  shopping: { art: 'shopping', from: '#c45c2a', to: '#7a2e12', shelfTitle: 'Шопинг' },
  cinema: { art: 'cinema', from: '#1e2a4a', to: '#0b1224', shelfTitle: 'Кино' },
  'free-parking': { art: 'free-parking', from: '#1a5c6e', to: '#0b2f38', shelfTitle: 'Парковка' },
  foodcourt: { art: 'foodcourt', from: '#b4532a', to: '#6b2a12', shelfTitle: 'Фудкорт' },
  kids: { art: 'kids', from: '#c26b8a', to: '#7a3048', shelfTitle: 'С детьми' },
  entertainment: { art: 'entertainment', from: '#6b3fa0', to: '#2e1848', shelfTitle: 'Развлечения' },
  budget: { art: 'budget', from: '#2f6b4f', to: '#143528', shelfTitle: 'Недорогие' },
  center: { art: 'center', from: '#e4152b', to: '#8a0c1a', shelfTitle: 'Центр' },
};

const DISTRICT_LOOKS = [
  { art: 'district-skyline' as const, from: '#2a4a6b', to: '#122438' },
  { art: 'district-blocks' as const, from: '#6b3a2a', to: '#301810' },
  { art: 'district-grid' as const, from: '#2a6b5a', to: '#103028' },
  { art: 'district-arc' as const, from: '#5a3a6b', to: '#241028' },
  { art: 'district-steps' as const, from: '#6b5a2a', to: '#302810' },
] as const;

const METRO_LINE_COLORS: Record<string, { from: string; to: string }> = {
  blue: { from: '#1976c9', to: '#0b3a66' },
  red: { from: '#e31d35', to: '#6b0c18' },
  green: { from: '#169447', to: '#0a3d1f' },
};

const METRO_PATTERNS = ['metro-rail', 'metro-node', 'metro-fork', 'metro-ring'] as const;

function isEligible(c: BusinessCenter): boolean {
  return c.status !== 'under_construction' && !isOutsideMinsk(c);
}

function countLabel(n: number): string {
  return `${n} ТЦ`;
}

function formatTotalArea(m2: number): string {
  // Короткие значения — длинное «2,2 млн м²» ломает ряд icon+number в плитке.
  if (m2 >= 1_000_000) {
    const mln = m2 / 1_000_000;
    const rounded = Math.round(mln * 10) / 10;
    return `${rounded.toLocaleString('ru-RU')} млн`;
  }
  if (m2 >= 1_000) {
    return `${Math.round(m2 / 1_000).toLocaleString('ru-RU')} тыс.`;
  }
  return Math.round(m2).toLocaleString('ru-RU');
}

function topicCount(
  eligible: BusinessCenter[],
  slug: string,
  tcIndex: TcFilterIndex | null,
): number {
  const hub = tcTopicHubBySlug(slug);
  if (!hub) return 0;
  if (topicHubNeedsFilters(hub) && !tcIndex) return 0;
  return eligible.filter((c) => matchesTcTopicHub(c, hub, tcIndex?.get(c.slug))).length;
}

function byCountDesc(a: TcEditorialCard, b: TcEditorialCard): number {
  return b.count - a.count || a.title.localeCompare(b.title, 'ru');
}

function qualityScore(centers: BusinessCenter[]): number {
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
  // Разные геометрии для fashion-брендов — чтобы обложки не были клонами.
  const fashionPalettes = [
    { art: 'brand-fashion' as const, from: '#e4152b', to: '#5c0812' },
    { art: 'brand-fashion' as const, from: '#8a1c2e', to: '#3a0810' },
    { art: 'brand-fashion' as const, from: '#b01028', to: '#4a0a14' },
  ];
  let h = 0;
  for (const ch of slug) h = (h + ch.charCodeAt(0) * 17) % fashionPalettes.length;
  return fashionPalettes[h];
}

function stationLineId(station: string): string {
  for (const line of MINSK_METRO_LINES) {
    if (line.stations.some((s) => s.toLowerCase() === station.toLowerCase())) {
      return line.id;
    }
  }
  return 'blue';
}

function hashSlug(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 17)) % 997;
  return h;
}

function metroLook(station: string): { art: TcLookbookArt; from: string; to: string } {
  const line = stationLineId(station);
  const colors = METRO_LINE_COLORS[line] ?? METRO_LINE_COLORS.blue;
  const pattern = METRO_PATTERNS[hashSlug(station) % METRO_PATTERNS.length];
  return { art: pattern, ...colors };
}

export function buildTonightShelf(
  centers: BusinessCenter[],
  tcIndex: TcFilterIndex | null,
  basePath = '/minsk/tc',
): TcEditorialShelf | null {
  const eligible = centers.filter(isEligible);
  const cards: TcEditorialCard[] = [
    {
      id: 'all',
      href: basePath === '/minsk/tc' ? TC_ALL_LIST_HREF : `${basePath}?view=list`,
      title: 'Все ТЦ',
      countLabel: countLabel(eligible.length),
      count: eligible.length,
      art: 'all',
      from: '#14151a',
      to: '#2a2c34',
    },
  ];
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
      title: palette.shelfTitle,
      countLabel: countLabel(n),
      count: n,
      art: palette.art,
      from: palette.from,
      to: palette.to,
    });
  }
  cards.sort(byCountDesc);
  if (!cards.length) return null;
  return {
    id: 'tonight',
    title: 'Выбирайте по интересам',
    lead: 'Готовые подборки ТЦ — кликните и откройте список.',
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
      count: n,
      ...brandArt(slug),
    });
  }
  // «Золотое яблоко» — редакционный якорь полки, всегда первым; остальные
  // по числу ТЦ (владелец, 2026-10-11).
  cards.sort((a, b) => {
    if (a.id === 'brand-gold-apple') return -1;
    if (b.id === 'brand-gold-apple') return 1;
    return byCountDesc(a, b);
  });
  if (!cards.length) return null;
  return {
    id: 'brands',
    title: 'Ищите знакомый бренд',
    lead: 'Подборки ТЦ, где есть этот магазин.',
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
    .map(([name, list]) => ({ name, list, score: qualityScore(list), count: list.length }))
    .sort((a, b) => b.count - a.count || b.score - a.score || a.name.localeCompare(b.name, 'ru'))
    .slice(0, TC_TOP_DISTRICTS);

  const cards: TcEditorialCard[] = [];
  ranked.forEach((row, i) => {
    const href = districtHubUrl(row.name, basePath);
    if (!href) return;
    const look = DISTRICT_LOOKS[i % DISTRICT_LOOKS.length];
    const short = row.name.replace(/\s+район$/u, '');
    cards.push({
      id: `district-${DISTRICT_SLUGS[row.name]}`,
      href,
      title: short,
      countLabel: countLabel(row.count),
      count: row.count,
      art: look.art,
      from: look.from,
      to: look.to,
    });
  });
  if (!cards.length) return null;
  return {
    id: 'districts',
    title: 'Выбирайте район',
    lead: 'Подборки самых плотных районов по числу ТЦ.',
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
  const ranked: { name: string; list: BusinessCenter[]; score: number; count: number }[] = [];
  for (const name of stationNames) {
    const list = eligible.filter((c) => metroHubDistance(c, name) !== null);
    if (list.length < MIN_INDEXABLE_HUB_CENTERS) continue;
    ranked.push({ name, list, score: qualityScore(list), count: list.length });
  }
  ranked.sort((a, b) => b.count - a.count || b.score - a.score || a.name.localeCompare(b.name, 'ru'));
  const top = ranked.slice(0, TC_TOP_METRO);

  const cards: TcEditorialCard[] = [];
  for (const row of top) {
    const href = metroHubUrl(row.name, basePath);
    if (!href) continue;
    cards.push({
      id: `metro-${href.split('/').pop()}`,
      href,
      title: row.name,
      countLabel: countLabel(row.count),
      count: row.count,
      ...metroLook(row.name),
    });
  }
  if (!cards.length) return null;
  return {
    id: 'metro',
    title: 'Сойдите у метро',
    lead: 'Подборки ТЦ у станций — сошли и уже на месте.',
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

function featureCount(
  eligible: BusinessCenter[],
  tcIndex: TcFilterIndex,
  feature: string,
): number {
  return eligible.filter((c) => tcIndex.get(c.slug)?.features.has(feature)).length;
}

function pushFigure(
  out: TcBrowseFigure[],
  fig: TcBrowseFigure | null,
): void {
  if (!fig || out.some((f) => f.id === fig.id)) return;
  out.push(fig);
}

/**
 * Сводка ключевых цифр для корня /minsk/tc — как «At a glance» у casinolist.
 * Без tcIndex не считаем (иначе мигание урезанной → полной сводки).
 * Ровно TC_BROWSE_FIGURE_SLOTS плиток — две полные строки по 6 на xl+.
 * Тона — ритм casinolist (gold / felt / primary / ink).
 */
export function buildTcBrowseFigures(
  centers: BusinessCenter[] | null,
  tcIndex: TcFilterIndex | null,
  basePath = '/minsk/tc',
): TcBrowseFigure[] {
  if (!centers?.length || !tcIndex) return [];
  const eligible = centers.filter(isEligible);
  if (!eligible.length) return [];

  const listHref = basePath === '/minsk/tc' ? TC_ALL_LIST_HREF : `${basePath}?view=list`;
  const topicHref = (slug: string) => {
    const hub = tcTopicHubBySlug(slug);
    return hub ? tcTopicHubUrl(hub, basePath) : undefined;
  };

  const withArea = eligible.filter((c) => typeof c.totalArea === 'number' && c.totalArea > 0);
  const areaSum = withArea.reduce((s, c) => s + (c.totalArea ?? 0), 0);
  const nearMetro = eligible.filter((c) => {
    const d = c.nearestMetroStations
      ?.map((s) => s.distanceMeters)
      .filter((m): m is number => typeof m === 'number');
    if (!d?.length) return false;
    return Math.min(...d) <= 800;
  }).length;

  // Редакционный набор: короткие ярлыки, без «1518 брендов» и прочих шумов.
  // tone/accent проставляем ниже по индексу (ритм casinolist).
  const candidates: Array<TcBrowseFigure | null> = [
    {
      id: 'total',
      value: eligible.length.toLocaleString('ru-RU'),
      label: 'ТЦ',
      icon: 'malls',
      tone: 'gold',
      href: listHref,
    },
    withArea.length
      ? {
          id: 'area',
          value: formatTotalArea(areaSum),
          label: 'площадь',
          icon: 'area',
          tone: 'ink',
        }
      : null,
    nearMetro > 0
      ? {
          id: 'metro',
          value: nearMetro.toLocaleString('ru-RU'),
          label: 'у метро',
          icon: 'metro',
          tone: 'ink',
        }
      : null,
    ...(['shopping', 'cinema', 'free-parking', 'foodcourt', 'kids', 'entertainment', 'center', 'budget'] as const).map(
      (slug) => {
        const labels: Record<string, { label: string; icon: TcBrowseFigureIcon }> = {
          shopping: { label: 'шопинг', icon: 'shopping' },
          cinema: { label: 'кино', icon: 'cinema' },
          'free-parking': { label: 'парковка', icon: 'parking' },
          foodcourt: { label: 'фудкорт', icon: 'food' },
          kids: { label: 'с детьми', icon: 'kids' },
          entertainment: { label: 'развлечения', icon: 'fun' },
          center: { label: 'в центре', icon: 'center' },
          budget: { label: 'недорогие', icon: 'budget' },
        };
        const n = topicCount(eligible, slug, tcIndex);
        if (n < 1) return null;
        const meta = labels[slug];
        return {
          id: `topic-${slug}`,
          value: n.toLocaleString('ru-RU'),
          label: meta.label,
          icon: meta.icon,
          tone: 'ink' as const,
          href: topicHref(slug),
        };
      },
    ),
    (() => {
      const late = featureCount(eligible, tcIndex, 'late');
      return late > 0
        ? {
            id: 'late',
            value: late.toLocaleString('ru-RU'),
            label: 'допоздна',
            icon: 'late' as const,
            tone: 'ink' as const,
          }
        : null;
    })(),
    (() => {
      const grocery = featureCount(eligible, tcIndex, 'grocery');
      return grocery > 0
        ? {
            id: 'grocery',
            value: grocery.toLocaleString('ru-RU'),
            label: 'продукты',
            icon: 'grocery' as const,
            tone: 'ink' as const,
          }
        : null;
    })(),
  ];

  const figures: TcBrowseFigure[] = [];
  for (const fig of candidates) pushFigure(figures, fig);
  return figures.slice(0, TC_BROWSE_FIGURE_SLOTS).map((fig, i) => ({
    ...fig,
    tone: glanceToneAt(i),
    accent: i === 0,
  }));
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
