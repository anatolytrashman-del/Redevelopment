import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import { buildTcExcluded, buildTcLargest, buildTcRanking } from './tradeCenterRanking';

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

function rating(value: string, count?: number): BusinessCenter['highlights'] {
  return [{ icon: 'rating', label: 'Рейтинг', text: `Яндекс.Карты: **${value}** из 5${count == null ? '' : ` (${count} оценок)`}` }];
}

describe('buildTcRanking', () => {
  it('берёт ТЦ с рейтингом и числом оценок, сортирует по рейтингу и числу оценок', () => {
    const list = [
      tc({ slug: 'low', highlights: rating('4,6', 80) }),
      tc({ slug: 'top', highlights: rating('4,9', 200) }),
      tc({ slug: 'tie-more', highlights: rating('4,8', 500) }),
      tc({ slug: 'tie-less', highlights: rating('4,8', 60) }),
      tc({ slug: 'few', highlights: rating('5,0', 10) }),
      tc({ slug: 'building', status: 'under_construction', highlights: rating('5,0', 1000) }),
      tc({ slug: 'out', address: 'Минская область', highlights: rating('5,0', 1000) }),
    ];
    expect(buildTcRanking(list).map((r) => r.center.slug)).toEqual(['top', 'tie-more', 'tie-less', 'low']);
  });

  it('excluded объясняет, почему не попали', () => {
    const list = [
      tc({ slug: 'ok', highlights: rating('4,7', 100) }),
      tc({ slug: 'low', highlights: rating('4,0', 100) }),
      tc({ slug: 'out', address: 'Минская область', highlights: rating('5,0', 100) }),
    ];
    const reasons = Object.fromEntries(buildTcExcluded(list).map((e) => [e.center.slug, e.reason]));
    expect(reasons.low).toMatch(/ниже порога/);
    expect(reasons.out).toBe('не в черте Минска');
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
