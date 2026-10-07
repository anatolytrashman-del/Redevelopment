import { describe, expect, it } from 'vitest';
// @ts-expect-error — скрипт сборки без типов
import * as tcPaths from '../../scripts/_tcPaths.mjs';
const collectTcStoreHubsScript = tcPaths.collectTcStoreHubs as (
  rows: unknown,
  filters: unknown,
) => Array<{ slug: string; label: string; count: number }>;
const collectTcStoreSlugs = tcPaths.collectTcStoreSlugs as (rows: unknown, filters: unknown) => string[];
const scriptSlugify = tcPaths.slugifyTcBrand as (name: string) => string;
const SCRIPT_STORE_MIN = tcPaths.TC_STORE_HUB_MIN_CENTERS as number;
const SCRIPT_STORE_INDEX_MIN = tcPaths.TC_STORE_HUB_INDEX_MIN_CENTERS as number;
const tradeCenterPaths = tcPaths.tradeCenterPaths as (rows: unknown, opts: unknown) => string[];
import { buildTcFilterEntry, slugifyTcBrand, type TcFilterSource } from './tradeCenterCatalogFeatures';
import {
  collectTcStoreHubs,
  isLegacyWithBrandSlug,
  makeTcStoreHub,
  matchesTcStoreHub,
  TC_STORE_HUB_INDEX_MIN_CENTERS,
  TC_STORE_HUB_MIN_CENTERS,
  tcStoreHubUrl,
} from './tradeCenterStoreHubs';
import type { BusinessCenter } from '../data/businessCenters';

function tc(over: Partial<BusinessCenter> & { slug: string }): BusinessCenter {
  return {
    id: over.slug,
    name: `ТЦ ${over.slug}`,
    altNames: [],
    address: 'г. Минск, ул. Тестовая, 1',
    district: null,
    microdistrict: null,
    businessClass: null,
    totalArea: 10_000,
    yearBuilt: null,
    floors: null,
    developer: null,
    developerInfo: null,
    metro: null,
    parking: null,
    website: null,
    description: null,
    rentalInfo: null,
    highlights: [],
    mediaMentions: [],
    mapSnapshotFiles: [],
    tenantOrganizations: [],
    tenantCount: 0,
    technicalParams: [],
    buildingFacts: [],
    nearestMetroStations: [],
    floorPlateArea: null,
    officeArea: null,
    layoutTypes: [],
    elevators: null,
    parkingRatio: null,
    airConditioning: null,
    ceilingHeight: null,
    managementType: null,
    metroDistanceBucket: null,
    freeSpaceMin: null,
    freeSpaceMax: null,
    infraInternal: [],
    infraNearby: [],
    lat: null,
    lng: null,
    gisRating: null,
    gisReviewCount: null,
    is24x7: null,
    accessibility: [],
    verdict: null,
    pros: [],
    cons: [],
    verdictEdited: false,
    reviewsChecked: false,
    photos: [],
    status: 'built',
    kind: 'tc',
    retailFormat: 'ТРЦ',
    retailInfo: null,
    sortOrder: 0,
    createdAt: '2026-01-01',
    ...over,
  };
}

const empty: TcFilterSource = {
  funKinds: [],
  foodZones: 0,
  foodcourtPlaces: 0,
  anchorCategories: [],
  parking: null,
  hours: [],
  brands: [],
};

describe('/minsk/tc/store', () => {
  it('slugify совпадает с близнецом и overrides', () => {
    expect(slugifyTcBrand('золотое яблоко')).toBe('gold-apple');
    expect(slugifyTcBrand('pull&bear')).toBe('pull-and-bear');
    expect(slugifyTcBrand('соседи')).toBe('sosedi');
    expect(scriptSlugify('золотое яблоко')).toBe(slugifyTcBrand('золотое яблоко'));
    expect(TC_STORE_HUB_MIN_CENTERS).toBe(SCRIPT_STORE_MIN);
    expect(TC_STORE_HUB_INDEX_MIN_CENTERS).toBe(SCRIPT_STORE_INDEX_MIN);
    expect(TC_STORE_HUB_INDEX_MIN_CENTERS).toBe(4);
  });

  it('собирает хабы из индекса; comma-dump режется в buildTcFilterEntry', () => {
    const index = new Map([
      [
        'a',
        buildTcFilterEntry({
          ...empty,
          brands: ['Zara', 'Bershka, Pull&Bear, Stradivarius'],
        }),
      ],
      ['b', buildTcFilterEntry({ ...empty, brands: ['Zara'] })],
    ]);
    const hubs = collectTcStoreHubs(index);
    const slugs = hubs.map((h) => h.slug);
    expect(slugs).toContain('zara');
    expect(slugs).toContain('bershka');
    expect(slugs).toContain('pull-and-bear');
    expect(slugs).toContain('stradivarius');
    expect(slugs.some((s) => s.includes('bershka-pull'))).toBe(false);
    const zara = hubs.find((h) => h.slug === 'zara')!;
    expect(matchesTcStoreHub(tc({ slug: 'a' }), zara, index.get('a'))).toBe(true);
    expect(matchesTcStoreHub(tc({ slug: 'b' }), zara, index.get('b'))).toBe(true);
    expect(tcStoreHubUrl(zara)).toBe('/minsk/tc/store/zara');
  });

  it('близнец collectTcStoreHubs видит те же slug; collectTcStoreSlugs — только INDEX_MIN', () => {
    const filters = {
      a: { ...empty, brands: ['Zara', 'Спортмастер'] },
      b: { ...empty, brands: ['Zara'] },
    };
    const rows = [
      { slug: 'a', status: 'built', address: 'г. Минск' },
      { slug: 'b', status: 'built', address: 'г. Минск' },
    ];
    const scriptAll = collectTcStoreHubsScript(rows, filters).map((h) => h.slug);
    const front = collectTcStoreHubs(
      new Map(Object.entries(filters).map(([k, v]) => [k, buildTcFilterEntry(v)])),
    ).map((h) => h.slug);
    expect(scriptAll.sort()).toEqual(front.sort());
    // Zara в 2 ТЦ, Спортмастер в 1 — оба ниже INDEX_MIN=4 → sitemap пуст.
    expect(collectTcStoreSlugs(rows, filters)).toEqual([]);
  });

  it('близнец collectTcStoreHubs отдаёт label и count', () => {
    const filters = {
      a: { ...empty, brands: ['Zara'] },
      b: { ...empty, brands: ['Zara', 'Bershka'] },
    };
    const rows = [
      { slug: 'a', status: 'built', address: 'г. Минск' },
      { slug: 'b', status: 'built', address: 'г. Минск' },
    ];
    const hubs = collectTcStoreHubsScript(rows, filters) as Array<{
      slug: string;
      label: string;
      count: number;
    }>;
    const zara = hubs.find((h) => h.slug === 'zara');
    expect(zara).toMatchObject({ label: 'Zara', count: 2 });
    expect(hubs.find((h) => h.slug === 'bershka')).toMatchObject({ label: 'Bershka', count: 1 });
  });

  it('legacy /with brand slugs', () => {
    expect(isLegacyWithBrandSlug('zara')).toBe(true);
    expect(isLegacyWithBrandSlug('shopping')).toBe(false);
    expect(makeTcStoreHub('zara', 'Zara').title).toContain('Zara');
  });

  // Владелец 2026-10-07: в sitemap только бренды в >3 ТЦ (INDEX_MIN=4).
  it('tradeCenterPaths: store в sitemap только при count ≥ INDEX_MIN', () => {
    const filters: Record<string, TcFilterSource> = {};
    const rows = [];
    for (let i = 0; i < 4; i++) {
      const slug = `tc${i}`;
      filters[slug] = { ...empty, brands: ['Zara', ...(i === 0 ? ['Bershka'] : [])] };
      rows.push({ slug, status: 'built', address: 'г. Минск', district: 'Центральный' });
    }
    const opts = {
      districtSlugs: { Центральный: 'tsentralny' },
      metroSlugs: {},
      metroMaxDistance: 1500,
      tcFilters: filters,
    };
    expect(tradeCenterPaths(rows, opts).some((p) => p.startsWith('minsk/tc/store/'))).toBe(false);
    const withStores = tradeCenterPaths(rows, { ...opts, includeStores: true });
    expect(withStores).toContain('minsk/tc/store/zara');
    expect(withStores.some((p) => p === 'minsk/tc/store/bershka')).toBe(false);
    expect(collectTcStoreSlugs(rows, filters)).toEqual(['zara']);
  });
});
