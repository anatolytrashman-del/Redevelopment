// Подборки «ТЦ с магазином X» — /minsk/tc/store/<slug>.
// Список строится из арендаторов/якорей в /data/tc-filters.json (не хардкод).
// ФАЙЛ-БЛИЗНЕЦ путей — collectTcStoreHubs / tradeCenterPaths в scripts/_tcPaths.mjs.
import type { BusinessCenter } from '../data/businessCenters';
import { isOutsideMinsk } from './businessCenterRanking';
import { pluralRu } from './pluralRu';
import {
  buildTcFilterEntry,
  slugifyTcBrand,
  type TcFilterEntry,
  type TcFilterIndex,
  type TcFilterSource,
} from './tradeCenterCatalogFeatures';

export interface TcStoreHub {
  slug: string;
  /** Нормализованный канонический ключ бренда. */
  brandKey: string;
  title: string;
  label: string;
  subjectGen: (n: number) => string;
  plural: (n: number) => string;
  intro: (countLabel: string) => string;
}

/**
 * Минимум ТЦ, чтобы подборка /store/<slug> существовала как страница.
 * В индекс store с 2026-10-07 не пускаем вовсе (sitemap + noindex): тысячи
 * брендов забили crawl budget карточек ТЦ. Константа остаётся для сборки
 * списка хабов и близнеца в scripts/_tcPaths.mjs.
 */
export const TC_STORE_HUB_MIN_CENTERS = 1;

function centersWord(n: number): string {
  return pluralRu(n, 'торговый центр', 'торговых центра', 'торговых центров');
}

function centersGen(n: number, tail: string): string {
  const head = n % 10 === 1 && n % 100 !== 11 ? 'торгового центра' : 'торговых центров';
  return `${head} ${tail}`;
}

function isEligibleTc(center: BusinessCenter): boolean {
  return center.status !== 'under_construction' && !isOutsideMinsk(center);
}

export function makeTcStoreHub(brandKey: string, label: string): TcStoreHub {
  const slug = slugifyTcBrand(brandKey);
  return {
    slug,
    brandKey,
    title: `Торговые центры Минска с ${label}`,
    label,
    subjectGen: (n) => centersGen(n, `Минска с ${label}`),
    plural: centersWord,
    intro: (count) =>
      `${count} Минска, где есть магазин ${label}. Адреса, площадь, парковка, часы работы и другие арендаторы.`,
  };
}

export function tcStoreHubUrl(hub: TcStoreHub, basePath = '/minsk/tc'): string {
  return `${basePath}/store/${hub.slug}`;
}

export function matchesTcStoreHub(
  center: BusinessCenter,
  hub: TcStoreHub,
  filterEntry?: TcFilterEntry | null,
): boolean {
  if (!isEligibleTc(center)) return false;
  if (!filterEntry) return false;
  return filterEntry.brands.includes(hub.brandKey);
}

/**
 * Реестр подборок магазинов из индекса фильтров: один slug — один бренд.
 * При коллизии slug'ов оставляем бренд с большим числом ТЦ (и более короткое имя).
 */
export function collectTcStoreHubs(index: TcFilterIndex | null | undefined): TcStoreHub[] {
  if (!index) return [];
  type BrandAcc = { brandKey: string; label: string; count: number };
  const byKey = new Map<string, BrandAcc>();
  for (const entry of index.values()) {
    entry.brands.forEach((key, i) => {
      if (!key || key.length < 2) return;
      const label = entry.brandNames[i] || key;
      const prev = byKey.get(key);
      if (prev) prev.count += 1;
      else byKey.set(key, { brandKey: key, label, count: 1 });
    });
  }
  const bySlug = new Map<string, BrandAcc>();
  for (const acc of byKey.values()) {
    const slug = slugifyTcBrand(acc.brandKey);
    if (!slug || slug === 'brand') continue;
    const prev = bySlug.get(slug);
    if (
      !prev ||
      acc.count > prev.count ||
      (acc.count === prev.count &&
        (acc.brandKey.length < prev.brandKey.length || acc.label.length < prev.label.length))
    ) {
      bySlug.set(slug, acc);
    }
  }
  return [...bySlug.values()]
    .filter((acc) => acc.count >= TC_STORE_HUB_MIN_CENTERS)
    .map((acc) => makeTcStoreHub(acc.brandKey, acc.label))
    .sort((a, b) => a.label.localeCompare(b.label, 'ru') || a.slug.localeCompare(b.slug));
}

export function tcStoreHubBySlug(
  slug: string | undefined,
  index: TcFilterIndex | null | undefined,
): TcStoreHub | null {
  if (!slug) return null;
  return collectTcStoreHubs(index).find((h) => h.slug === slug) ?? null;
}

/** Старые URL /with/<бренд> из волн 4–5 — редирект на /store/<slug>. */
export const TC_LEGACY_WITH_BRAND_SLUGS = [
  'zara',
  'gold-apple',
  'bershka',
  'nike',
  'adidas',
  'massimo-dutti',
  'stradivarius',
  'gloria-jeans',
  'sinsay',
  'new-yorker',
  'lc-waikiki',
  'pull-and-bear',
  'sportmaster',
  'mango',
  'reserved',
  'cropp',
  'house',
  'defacto',
  'mohito',
  'oysho',
  'familia',
  'milavitsa',
  'mark-formelle',
  'kari',
  'detmir',
  '5-element',
  'miniso',
] as const;

export function isLegacyWithBrandSlug(slug: string | undefined): boolean {
  return Boolean(slug && (TC_LEGACY_WITH_BRAND_SLUGS as readonly string[]).includes(slug));
}

/** Собрать индекс из сырой выжимки — удобно тестам и скриптам без Map. */
export function storeHubsFromFilterRows(rows: Record<string, TcFilterSource> | null | undefined): TcStoreHub[] {
  if (!rows) return [];
  const index = new Map(Object.entries(rows).map(([slug, src]) => [slug, buildTcFilterEntry(src)]));
  return collectTcStoreHubs(index);
}
