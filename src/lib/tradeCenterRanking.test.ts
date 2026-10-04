import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import { buildTcExcluded, buildTcLargest, buildTcRanking } from './tradeCenterRanking';
import type { YandexCardRatingIndex } from './yandexCardsApi';

function tc(over: Partial<BusinessCenter> & { slug: string }): BusinessCenter {
  return {
    id: over.slug,
    name: `ТЦ ${over.slug}`,
    altNames: [],
    address: 'г. Минск, ул. Тестовая, 1',
    district: null,
    microdistrict: null,
    businessClass: null,
    totalArea: null,
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

function ratings(entries: [string, number, number][]): YandexCardRatingIndex {
  return new Map(entries.map(([slug, rating, ratingCount]) => [slug, { slug, rating, ratingCount }]));
}

describe('buildTcRanking', () => {
  it('берёт рейтинг из yandex cards, сортирует по рейтингу и числу оценок', () => {
    const list = [
      tc({ slug: 'low' }),
      tc({ slug: 'top' }),
      tc({ slug: 'tie-more' }),
      tc({ slug: 'tie-less' }),
      tc({ slug: 'few' }),
      tc({ slug: 'building', status: 'under_construction' }),
      tc({ slug: 'out', address: 'Минская область' }),
      tc({ slug: 'missing' }),
    ];
    const cards = ratings([
      ['low', 4.6, 80],
      ['top', 4.9, 200],
      ['tie-more', 4.8, 500],
      ['tie-less', 4.8, 60],
      ['few', 5.0, 10],
      ['building', 5.0, 1000],
      ['out', 5.0, 1000],
    ]);
    expect(buildTcRanking(list, cards).map((r) => r.center.slug)).toEqual(['top', 'tie-more', 'tie-less', 'low']);
  });

  it('обрезает топ до 10 карточек', () => {
    const list = Array.from({ length: 15 }, (_, i) => tc({ slug: `tc-${i}` }));
    const cards = ratings(list.map((c, i) => [c.slug, 5, 1000 - i] as [string, number, number]));
    expect(buildTcRanking(list, cards)).toHaveLength(10);
    expect(buildTcRanking(list, cards)[0].center.slug).toBe('tc-0');
  });

  it('excluded объясняет, почему не попали', () => {
    const list = [
      tc({ slug: 'ok' }),
      tc({ slug: 'low' }),
      tc({ slug: 'out', address: 'Минская область' }),
      tc({ slug: 'none' }),
    ];
    const cards = ratings([
      ['ok', 4.7, 100],
      ['low', 4.0, 100],
      ['out', 5.0, 100],
    ]);
    const reasons = Object.fromEntries(buildTcExcluded(list, cards).map((e) => [e.center.slug, e.reason]));
    expect(reasons.low).toMatch(/ниже порога/);
    expect(reasons.out).toBe('не в черте Минска');
    expect(reasons.none).toBe('рейтинг на Яндекс.Картах не найден');
    expect(reasons.ok).toBeUndefined();
  });
});

describe('buildTcLargest', () => {
  it('топ по общей площади, без строящихся и без площади', () => {
    const list = [
      tc({ slug: 'big', totalArea: 100_000 }),
      tc({ slug: 'mid', totalArea: 50_000 }),
      tc({ slug: 'small', totalArea: 10_000 }),
      tc({ slug: 'none', totalArea: null }),
      tc({ slug: 'building', totalArea: 200_000, status: 'under_construction' }),
    ];
    expect(buildTcLargest(list, 2).map((c) => c.slug)).toEqual(['big', 'mid']);
  });
});
