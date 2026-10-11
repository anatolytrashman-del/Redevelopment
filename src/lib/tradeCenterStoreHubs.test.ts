import { describe, expect, it } from 'vitest';
// @ts-expect-error — скрипт сборки без типов
import { collectTcStoreHubs as collectTcStoreHubsScript, collectTcStoreSlugs, slugifyTcBrand as scriptSlugify, TC_STORE_HUB_MIN_CENTERS as SCRIPT_STORE_MIN, tradeCenterPaths } from '../../scripts/_tcPaths.mjs';
import { buildTcFilterEntry, slugifyTcBrand, type TcFilterSource } from './tradeCenterCatalogFeatures';
import {
  collectTcStoreHubs,
  isLegacyWithBrandSlug,
  makeTcStoreHub,
  matchesTcStoreHub,
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

  it('близнец collectTcStoreSlugs видит те же slug', () => {
    const filters = {
      a: { ...empty, brands: ['Zara', 'Спортмастер'] },
      b: { ...empty, brands: ['Zara'] },
    };
    const rows = [
      { slug: 'a', status: 'built', address: 'г. Минск' },
      { slug: 'b', status: 'built', address: 'г. Минск' },
    ];
    const script = collectTcStoreSlugs(rows, filters);
    const front = collectTcStoreHubs(
      new Map(Object.entries(filters).map(([k, v]) => [k, buildTcFilterEntry(v)])),
    ).map((h) => h.slug);
    expect(script.sort()).toEqual(front.sort());
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

  it('tradeCenterPaths по умолчанию без /store/* (sitemap не раздуваем)', () => {
    const filters = {
      a: { ...empty, brands: ['Zara'] },
      b: { ...empty, brands: ['Zara'] },
    };
    const rows = [
      { slug: 'a', status: 'built', address: 'г. Минск', district: 'Центральный', nearest_metro_stations: [] },
      { slug: 'b', status: 'built', address: 'г. Минск', district: 'Центральный', nearest_metro_stations: [] },
    ];
    const without = tradeCenterPaths(rows, {
      districtSlugs: { Центральный: 'centralny' },
      metroSlugs: {},
      metroMaxDistance: 800,
      tcFilters: filters,
    });
    expect(without.some((p: string) => p.startsWith('minsk/tc/store/'))).toBe(false);
    expect(without).toContain('minsk/tc/a');
    const withStores = tradeCenterPaths(rows, {
      districtSlugs: { Центральный: 'centralny' },
      metroSlugs: {},
      metroMaxDistance: 800,
      tcFilters: filters,
      includeStores: true,
    });
    expect(withStores).toContain('minsk/tc/store/zara');
  });
});
