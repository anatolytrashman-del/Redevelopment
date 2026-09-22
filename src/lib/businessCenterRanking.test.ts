import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import { buildRankingForClasses, buildExcludedForClasses } from './businessCenterRanking';

function bc(over: Partial<BusinessCenter> & { slug: string }): BusinessCenter {
  return {
    id: over.slug,
    name: `БЦ ${over.slug}`,
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
    sortOrder: 0,
    createdAt: '2026-01-01',
    ...over,
  };
}

function rating(value: string, count?: number): BusinessCenter['highlights'] {
  return [{ icon: 'rating', label: 'Рейтинг', text: `Яндекс.Карты: **${value}** из 5${count == null ? '' : ` (${count} оценок)`}` }];
}

const centers: BusinessCenter[] = [
  bc({ slug: 'a', businessClass: 'A', highlights: rating('4,9', 50) }),
  bc({ slug: 'b-plus', businessClass: 'B+', highlights: rating('4,8', 100) }),
  bc({ slug: 'b', businessClass: 'B', highlights: rating('4,8', 200) }),
  bc({ slug: 'c', businessClass: 'C', highlights: rating('4,5', 50) }),
  bc({ slug: 'construction', businessClass: 'B', status: 'under_construction', highlights: rating('5,0', 1000) }),
  bc({ slug: 'outside', businessClass: 'C', address: 'Минская область, Минский район', highlights: rating('5,0', 2000) }),
];

describe('buildRankingForClasses', () => {
  it('selects several classes, excludes construction and out-of-city buildings, breaks ties by count', () => {
    expect(buildRankingForClasses(centers, ['B+', 'B', 'C']).map((r) => r.center.slug)).toEqual(['b', 'b-plus', 'c']);
    expect(buildRankingForClasses(centers, ['A', 'B+', 'B', 'C']).map((r) => r.center.slug)).toEqual(['a', 'b', 'b-plus', 'c']);
    expect(buildRankingForClasses(centers, [])).toEqual([]);
  });

  it('includes the exact thresholds and returns the parsed rating and count', () => {
    expect(buildRankingForClasses(centers, ['C'])).toEqual([{ center: centers[3], rating: 4.5, ratingLabel: '4,5', ratingCount: 50 }]);
  });

  it('applies custom thresholds without changing the input', () => {
    const original = [...centers];
    expect(buildRankingForClasses(centers, ['A', 'B+', 'B', 'C'], 4.8, 150).map((r) => r.center.slug)).toEqual(['b']);
    expect(centers).toEqual(original);
  });

  it('excludes missing class, unrecognized ratings, missing counts and ratings below the thresholds', () => {
    const incomplete = [
      bc({ slug: 'no-class', highlights: rating('5,0', 100) }),
      bc({ slug: 'no-rating', businessClass: 'A' }),
      bc({ slug: 'no-count', businessClass: 'A', highlights: rating('5,0') }),
      bc({ slug: 'low-rating', businessClass: 'A', highlights: rating('4,4', 100) }),
      bc({ slug: 'low-count', businessClass: 'A', highlights: rating('5,0', 49) }),
    ];
    expect(buildRankingForClasses(incomplete, ['A'])).toEqual([]);
  });
});

describe('buildExcludedForClasses', () => {
  it('uses the requested classes and omits construction and qualifying buildings', () => {
    expect(buildExcludedForClasses(centers, ['B+', 'B', 'C'])).toEqual([{ center: centers[5], reason: 'не в черте Минска' }]);
    expect(buildExcludedForClasses(centers, ['A'])).toEqual([]);
  });

  it('keeps the reason priority: location, rating recognition, rating threshold, count presence, count threshold', () => {
    const failures = [
      bc({ slug: 'outside', businessClass: 'B', district: 'Смолевичский район' }),
      bc({ slug: 'unknown', businessClass: 'C' }),
      bc({ slug: 'low', businessClass: 'B', highlights: rating('4,4') }),
      bc({ slug: 'count-missing', businessClass: 'C', highlights: rating('4,8') }),
      bc({ slug: 'count-low', businessClass: 'B', highlights: rating('4,8', 49) }),
    ];
    expect(buildExcludedForClasses(failures, ['B', 'C']).map((e) => e.reason)).toEqual([
      'не в черте Минска',
      'рейтинг на Яндекс.Картах не распознан',
      'рейтинг 4,4 из 5, ниже порога 4,5',
      'в карточке карт не указано число оценок',
      '49 оценок, меньше порога 50',
    ]);
  });

  it('uses custom thresholds in both filtering and explanations', () => {
    expect(buildExcludedForClasses(centers, ['A', 'B+'], 4.9, 150).map((e) => e.reason)).toEqual([
      '50 оценок, меньше порога 150',
      'рейтинг 4,8 из 5, ниже порога 4,9',
    ]);
  });
});
