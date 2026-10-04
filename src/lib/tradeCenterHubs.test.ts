import { describe, expect, it } from 'vitest';
// @ts-expect-error — скрипт сборки без типов
import { TC_TOPIC_HUB_MATCHERS, TC_TOPIC_HUB_MIN_CENTERS, TC_TOPIC_HUB_SLUGS } from '../../scripts/_tcPaths.mjs';
import type { BusinessCenter } from '../data/businessCenters';
import { MIN_INDEXABLE_HUB_CENTERS } from './businessCenterHubs';
import { matchesTcTopicHub, TC_NON_SHOPPING_FORMATS, TC_TOPIC_HUBS, tcTopicHubBySlug, tcTopicHubUrl } from './tradeCenterHubs';

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

describe('подборки /minsk/tc/with', () => {
  it('близнец в scripts/_tcPaths.mjs совпадает', () => {
    expect(TC_TOPIC_HUBS.map((h) => h.slug)).toEqual(TC_TOPIC_HUB_SLUGS);
    expect(TC_TOPIC_HUB_MIN_CENTERS).toBe(MIN_INDEXABLE_HUB_CENTERS);
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

  it('URL и склонения', () => {
    const hub = tcTopicHubBySlug('shopping')!;
    expect(tcTopicHubUrl(hub)).toBe('/minsk/tc/with/shopping');
    expect(`5 ${hub.plural(5)}`).toBe('5 торговых центров');
    expect(hub.subjectGen(5)).toContain('с одеждой');
    expect(hub.intro(`94 ${hub.plural(94)}`)).toBe(
      '94 торговых центра Минска, где можно купить одежду. Адреса, площадь, парковка, часы работы и бренды внутри.',
    );
  });

  it('правило shopping в близнеце совпадает с фронтом', () => {
    const hub = tcTopicHubBySlug('shopping')!;
    const rows = [
      { slug: 'a', status: 'built', retail_format: 'ТРЦ', address: 'г. Минск', district: null },
      { slug: 'b', status: 'built', retail_format: 'мебельный центр', address: 'г. Минск', district: null },
      { slug: 'c', status: 'under_construction', retail_format: 'ТРЦ', address: 'г. Минск', district: null },
      { slug: 'd', status: 'built', retail_format: 'ТРЦ', address: 'Минская область', district: null },
    ];
    for (const row of rows) {
      const center = tc({
        slug: row.slug,
        status: row.status as BusinessCenter['status'],
        retailFormat: row.retail_format,
        address: row.address,
      });
      expect(TC_TOPIC_HUB_MATCHERS.shopping(row)).toBe(matchesTcTopicHub(center, hub));
    }
  });
});
