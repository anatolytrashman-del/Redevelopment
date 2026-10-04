import { describe, expect, it } from 'vitest';
// @ts-expect-error — скрипт сборки без типов
import { TC_CENTER_METRO_MAX_M, TC_CENTER_METRO_STATIONS, TC_METRO_NEAR_MAX_M, TC_NON_SHOPPING_FORMATS as SCRIPT_NON_SHOPPING, TC_RAILWAY_MAX_M, TC_RAILWAY_STATION, TC_TOPIC_HUB_MATCHERS, TC_TOPIC_HUB_MIN_CENTERS, TC_TOPIC_HUB_SLUGS } from '../../scripts/_tcPaths.mjs';
import type { BusinessCenter } from '../data/businessCenters';
import { MIN_INDEXABLE_HUB_CENTERS } from './businessCenterHubs';
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
    }
  });

  it('shopping: обычный ТЦ подходит, мебель/рынок/стройка — нет', () => {
    const hub = tcTopicHubBySlug('shopping')!;
    expect(matchesTcTopicHub(tc({ slug: 'galleria', retailFormat: 'ТРЦ' }), hub)).toBe(true);
    expect(matchesTcTopicHub(tc({ slug: 'null-format', retailFormat: null }), hub)).toBe(true);
    for (const format of TC_NON_SHOPPING_FORMATS) {
      expect(matchesTcTopicHub(tc({ slug: format, retailFormat: format }), hub)).toBe(false);
    }
    expect(matchesTcTopicHub(tc({ slug: 'building', status: 'under_construction' }), hub)).toBe(false);
    expect(matchesTcTopicHub(tc({ slug: 'out', address: 'Минская область, д. 1' }), hub)).toBe(false);
  });

  it('railway-station: в радиусе вокзала — да, дальше — нет', () => {
    const hub = tcTopicHubBySlug('railway-station')!;
    expect(
      matchesTcTopicHub(
        tc({ slug: 'galileo', lat: TC_RAILWAY_STATION.lat, lng: TC_RAILWAY_STATION.lng + 0.005 }),
        hub,
      ),
    ).toBe(true);
    expect(matchesTcTopicHub(tc({ slug: 'far', lat: 53.95, lng: 27.6 }), hub)).toBe(false);
    expect(matchesTcTopicHub(tc({ slug: 'no-coords' }), hub)).toBe(false);
  });

  it('underground: по имени/описанию подземного ТЦ, не по подземному паркингу', () => {
    const hub = tcTopicHubBySlug('underground')!;
    expect(
      matchesTcTopicHub(tc({ slug: 'stolitsa', altNames: ['Подземный торговый центр «Столица»'] }), hub),
    ).toBe(true);
    expect(
      matchesTcTopicHub(
        tc({ slug: 'podzem', description: 'Открыт в 2001 году под землёй, в подземном переходе у метро.' }),
        hub,
      ),
    ).toBe(true);
    expect(
      matchesTcTopicHub(
        tc({ slug: 'park-only', description: 'У ТРЦ есть подземный паркинг на 500 мест.' }),
        hub,
      ),
    ).toBe(false);
  });

  it('center: Немига в адресе или станция центра в радиусе', () => {
    const hub = tcTopicHubBySlug('center')!;
    expect(matchesTcTopicHub(tc({ slug: 'nemiga', address: 'г. Минск, ул. Немига, 5' }), hub)).toBe(true);
    expect(
      matchesTcTopicHub(
        tc({
          slug: 'near-lenina',
          nearestMetroStations: [{ name: 'Площадь Ленина', distanceMeters: 400, line: null, color: null }],
        }),
        hub,
      ),
    ).toBe(true);
    expect(
      matchesTcTopicHub(
        tc({
          slug: 'far-metro',
          nearestMetroStations: [{ name: 'Немига', distanceMeters: TC_CENTER_METRO_MAX_M + 1, line: null, color: null }],
        }),
        hub,
      ),
    ).toBe(false);
  });

  it('metro: ближайшая станция не дальше порога', () => {
    const hub = tcTopicHubBySlug('metro')!;
    expect(
      matchesTcTopicHub(
        tc({
          slug: 'near',
          nearestMetroStations: [{ name: 'Немига', distanceMeters: TC_METRO_NEAR_MAX_M, line: null, color: null }],
        }),
        hub,
      ),
    ).toBe(true);
    expect(
      matchesTcTopicHub(
        tc({
          slug: 'far',
          nearestMetroStations: [
            { name: 'Немига', distanceMeters: TC_METRO_NEAR_MAX_M + 1, line: null, color: null },
          ],
        }),
        hub,
      ),
    ).toBe(false);
  });

  it('belarusian: товары/бренды производителей, не просто «в Беларуси»', () => {
    const hub = tcTopicHubBySlug('belarusian')!;
    expect(
      matchesTcTopicHub(
        tc({
          slug: 'stolitsa',
          highlights: [{ icon: 'fact', label: 'Витрина', text: 'Фирменные магазины белорусских производителей.' }],
        }),
        hub,
      ),
    ).toBe(true);
    expect(
      matchesTcTopicHub(
        tc({ slug: 'national', name: 'Першы нацыянальны гандлёвы дом', description: 'Только товары белорусских брендов.' }),
        hub,
      ),
    ).toBe(true);
    expect(
      matchesTcTopicHub(
        tc({ slug: 'geo-only', description: 'Один из крупнейших ТРЦ Беларуси по площади.' }),
        hub,
      ),
    ).toBe(false);
    expect(
      matchesTcTopicHub(
        tc({
          slug: 'market',
          retailFormat: 'рынок',
          description: 'Товары белорусских производителей на рядах.',
        }),
        hub,
      ),
    ).toBe(false);
  });

  it('URL и склонения', () => {
    const hub = tcTopicHubBySlug('shopping')!;
    expect(tcTopicHubUrl(hub)).toBe('/minsk/tc/with/shopping');
    expect(`5 ${hub.plural(5)}`).toBe('5 торговых центров');
    expect(hub.subjectGen(5)).toContain('с одеждой');
    expect(hub.intro(`94 ${hub.plural(94)}`)).toBe(
      '94 торговых центра Минска, где можно купить одежду. Адреса, площадь, парковка, часы работы и бренды внутри.',
    );
    expect(tcTopicHubUrl(tcTopicHubBySlug('railway-station')!)).toBe('/minsk/tc/with/railway-station');
    expect(tcTopicHubBySlug('underground')!.label).toBe('Подземные');
    expect(tcTopicHubBySlug('center')!.label).toBe('В центре');
    expect(tcTopicHubBySlug('metro')!.label).toBe('У метро');
    expect(tcTopicHubBySlug('belarusian')!.label).toBe('Белорусские товары');
  });

  it('правила волны 2 в близнеце совпадают с фронтом', () => {
    const cases: BusinessCenter[] = [
      tc({ slug: 'shop', retailFormat: 'ТРЦ' }),
      tc({ slug: 'furniture', retailFormat: 'мебельный центр' }),
      tc({ slug: 'rail', lat: TC_RAILWAY_STATION.lat, lng: TC_RAILWAY_STATION.lng }),
      tc({ slug: 'far-rail', lat: 53.95, lng: 27.6 }),
      tc({ slug: 'under', altNames: ['Подземный торговый центр'] }),
      tc({ slug: 'park', description: 'Есть подземный паркинг' }),
      tc({ slug: 'center-addr', address: 'г. Минск, ул. Немига, 3' }),
      tc({
        slug: 'center-metro',
        nearestMetroStations: [{ name: 'Вокзальная', distanceMeters: 100, line: null, color: null }],
      }),
      tc({
        slug: 'metro-near',
        nearestMetroStations: [{ name: 'Уручье', distanceMeters: 400, line: null, color: null }],
      }),
      tc({
        slug: 'by',
        highlights: [{ icon: 'fact', label: 'x', text: 'Витрина белорусских брендов' }],
      }),
      tc({ slug: 'geo', description: 'Крупнейший в Беларуси' }),
      tc({ slug: 'out', address: 'Минская область', lat: TC_RAILWAY_STATION.lat, lng: TC_RAILWAY_STATION.lng }),
    ];
    for (const hub of TC_TOPIC_HUBS) {
      for (const center of cases) {
        expect(TC_TOPIC_HUB_MATCHERS[hub.slug](toRow(center))).toBe(matchesTcTopicHub(center, hub));
      }
    }
  });
});
