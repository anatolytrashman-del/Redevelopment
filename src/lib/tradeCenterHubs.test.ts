import { describe, expect, it } from 'vitest';
// @ts-expect-error — скрипт сборки без типов
import { TC_CENTER_METRO_MAX_M, TC_CENTER_METRO_STATIONS, TC_METRO_NEAR_MAX_M, TC_NON_SHOPPING_FORMATS as SCRIPT_NON_SHOPPING, TC_RAILWAY_MAX_M, TC_RAILWAY_STATION, TC_TOPIC_BRAND_KEYS, TC_TOPIC_HUB_MATCHERS, TC_TOPIC_HUB_MIN_CENTERS, TC_TOPIC_HUB_SLUGS, tcFilterFeatures } from '../../scripts/_tcPaths.mjs';
import type { BusinessCenter } from '../data/businessCenters';
import { MIN_INDEXABLE_HUB_CENTERS } from './businessCenterHubs';
import { buildTcFilterEntry, type TcFilterSource } from './tradeCenterCatalogFeatures';
import {
  matchesTcTopicHub,
  TC_CENTER_METRO_MAX_M as FRONT_CENTER_MAX,
  TC_CENTER_METRO_STATIONS as FRONT_CENTER_STATIONS,
  TC_METRO_NEAR_MAX_M as FRONT_METRO_MAX,
  TC_NON_SHOPPING_FORMATS,
  TC_RAILWAY_MAX_M as FRONT_RAIL_MAX,
  TC_RAILWAY_STATION as FRONT_RAIL_STATION,
  TC_TOPIC_HUB_MIN_CENTERS as FRONT_TOPIC_MIN,
  TC_TOPIC_HUBS,
  tcTopicHubBySlug,
  tcTopicHubUrl,
  topicHubNeedsFilters,
} from './tradeCenterHubs';

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

function toRow(center: BusinessCenter) {
  return {
    slug: center.slug,
    status: center.status,
    retail_format: center.retailFormat,
    address: center.address,
    district: center.district,
    name: center.name,
    alt_names: center.altNames,
    description: center.description,
    highlights: center.highlights,
    lat: center.lat,
    lng: center.lng,
    nearest_metro_stations: center.nearestMetroStations,
  };
}

const emptyFilter: TcFilterSource = {
  funKinds: [],
  foodZones: 0,
  foodcourtPlaces: 0,
  anchorCategories: [],
  parking: null,
  hours: [],
  brands: [],
};

describe('подборки /minsk/tc/with', () => {
  it('близнец в scripts/_tcPaths.mjs совпадает', () => {
    expect(TC_TOPIC_HUBS.map((h) => h.slug)).toEqual(TC_TOPIC_HUB_SLUGS);
    expect(TC_TOPIC_HUB_MIN_CENTERS).toBe(FRONT_TOPIC_MIN);
    expect(FRONT_TOPIC_MIN).toBe(1);
    expect(FRONT_TOPIC_MIN).toBeLessThan(MIN_INDEXABLE_HUB_CENTERS);
    expect(TC_NON_SHOPPING_FORMATS).toEqual(SCRIPT_NON_SHOPPING);
    expect(FRONT_RAIL_STATION).toEqual(TC_RAILWAY_STATION);
    expect(FRONT_RAIL_MAX).toBe(TC_RAILWAY_MAX_M);
    expect(FRONT_METRO_MAX).toBe(TC_METRO_NEAR_MAX_M);
    expect([...FRONT_CENTER_STATIONS]).toEqual([...TC_CENTER_METRO_STATIONS]);
    expect(FRONT_CENTER_MAX).toBe(TC_CENTER_METRO_MAX_M);
    for (const hub of TC_TOPIC_HUBS) {
      expect(typeof TC_TOPIC_HUB_MATCHERS[hub.slug]).toBe('function');
      if (hub.match === 'brand') {
        expect(TC_TOPIC_BRAND_KEYS[hub.slug]).toBe(hub.brandKey);
      }
    }
  });

  it('shopping: обычный ТЦ подходит, мебель/рынок/стройка — нет', () => {
    const hub = tcTopicHubBySlug('shopping')!;
    expect(matchesTcTopicHub(tc({ slug: 'galleria', retailFormat: 'ТРЦ' }), hub)).toBe(true);
    for (const format of TC_NON_SHOPPING_FORMATS) {
      expect(matchesTcTopicHub(tc({ slug: format, retailFormat: format }), hub)).toBe(false);
    }
  });

  it('волна 3: кино / дети / фудкорт / парковка / развлечения из tc-filters', () => {
    const center = tc({ slug: 'mall' });
    const cinema = buildTcFilterEntry({ ...emptyFilter, funKinds: ['cinema'] });
    const kids = buildTcFilterEntry({ ...emptyFilter, funKinds: ['kids'] });
    const food = buildTcFilterEntry({ ...emptyFilter, foodcourtPlaces: 2 });
    const park = buildTcFilterEntry({
      ...emptyFilter,
      parking: { summary: 'парковка', items: [] },
    });
    const games = buildTcFilterEntry({ ...emptyFilter, funKinds: ['games'] });
    expect(matchesTcTopicHub(center, tcTopicHubBySlug('cinema')!, cinema)).toBe(true);
    expect(matchesTcTopicHub(center, tcTopicHubBySlug('cinema')!, kids)).toBe(false);
    expect(matchesTcTopicHub(center, tcTopicHubBySlug('kids')!, kids)).toBe(true);
    expect(matchesTcTopicHub(center, tcTopicHubBySlug('foodcourt')!, food)).toBe(true);
    expect(matchesTcTopicHub(center, tcTopicHubBySlug('parking')!, park)).toBe(true);
    expect(matchesTcTopicHub(center, tcTopicHubBySlug('entertainment')!, games)).toBe(true);
    expect(matchesTcTopicHub(center, tcTopicHubBySlug('cinema')!)).toBe(false);
    expect(topicHubNeedsFilters(tcTopicHubBySlug('cinema')!)).toBe(true);
    expect(topicHubNeedsFilters(tcTopicHubBySlug('shopping')!)).toBe(false);
  });

  it('волна 4: бренд по нормализованному имени арендатора/якоря', () => {
    const hub = tcTopicHubBySlug('zara')!;
    const withZara = buildTcFilterEntry({ ...emptyFilter, brands: ['Zara', 'Mango'] });
    const without = buildTcFilterEntry({ ...emptyFilter, brands: ['Mango'] });
    expect(matchesTcTopicHub(tc({ slug: 'a' }), hub, withZara)).toBe(true);
    expect(matchesTcTopicHub(tc({ slug: 'b' }), hub, without)).toBe(false);
    expect(tcTopicHubUrl(hub)).toBe('/minsk/tc/with/zara');
  });

  it('URL волны 2–3', () => {
    expect(tcTopicHubUrl(tcTopicHubBySlug('railway-station')!)).toBe('/minsk/tc/with/railway-station');
    expect(tcTopicHubBySlug('underground')!.label).toBe('Подземные');
    expect(tcTopicHubBySlug('cinema')!.label).toBe('С кинотеатром');
    expect(tcTopicHubBySlug('gold-apple')!.label).toBe('Золотое яблоко');
  });

  it('правила в близнеце совпадают с фронтом', () => {
    const filters: Record<string, TcFilterSource> = {
      cinema: { ...emptyFilter, funKinds: ['cinema', 'games'] },
      kids: { ...emptyFilter, funKinds: ['kids'] },
      food: { ...emptyFilter, foodZones: 1 },
      park: { ...emptyFilter, parking: { summary: 'есть', items: [] } },
      brand: { ...emptyFilter, brands: ['Zara', 'Спортмастер'] },
      empty: emptyFilter,
    };
    const cases: BusinessCenter[] = [
      tc({ slug: 'shop', retailFormat: 'ТРЦ' }),
      tc({ slug: 'rail', lat: TC_RAILWAY_STATION.lat, lng: TC_RAILWAY_STATION.lng }),
      tc({ slug: 'under', altNames: ['Подземный торговый центр'] }),
      tc({ slug: 'center-addr', address: 'г. Минск, ул. Немига, 3' }),
      tc({
        slug: 'metro-near',
        nearestMetroStations: [{ name: 'Уручье', distanceMeters: 400, line: null, color: null }],
      }),
      tc({
        slug: 'by',
        highlights: [{ icon: 'fact', label: 'x', text: 'Витрина белорусских брендов' }],
      }),
      tc({ slug: 'cinema' }),
      tc({ slug: 'kids' }),
      tc({ slug: 'food' }),
      tc({ slug: 'park' }),
      tc({ slug: 'brand' }),
      tc({ slug: 'empty' }),
    ];
    for (const hub of TC_TOPIC_HUBS) {
      for (const center of cases) {
        const entry = topicHubNeedsFilters(hub) ? buildTcFilterEntry(filters[center.slug] ?? emptyFilter) : null;
        const front = matchesTcTopicHub(center, hub, entry);
        const script = TC_TOPIC_HUB_MATCHERS[hub.slug](toRow(center), filters);
        expect(script).toBe(front);
      }
    }
  });

  it('tcFilterFeatures близнеца согласован с buildTcFilterEntry по ключевым признакам', () => {
    const src: TcFilterSource = {
      ...emptyFilter,
      funKinds: ['cinema', 'games'],
      foodcourtPlaces: 1,
      parking: { summary: 'парковка', items: [] },
      brands: ['Zara'],
    };
    const entry = buildTcFilterEntry(src);
    const twin = tcFilterFeatures(src);
    for (const id of ['cinema', 'entertainment', 'foodcourt', 'parking'] as const) {
      expect(twin.features.has(id)).toBe(entry.features.has(id));
    }
    expect(twin.brands).toContain('zara');
  });
});
