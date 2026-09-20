import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import { buildOfferIndex } from './businessCenterCatalogFilter';
import { buildBadgeContext, businessCenterBadge } from './businessCenterBadges';

// Авто-бейдж — публичное утверждение про чужое здание
// («дешевле медианы на 25%»). Ошибка здесь не падает, а выходит в прод
// неправдой, поэтому пороги и «когда бейджа нет» проверяются тестом.

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
    mapSnapshotFiles: [],
    tenantOrganizations: [],
    technicalParams: [],
    nearestMetroStations: [],
    verdict: null,
    pros: [],
    cons: [],
    verdictEdited: false,
    reviewsChecked: false,
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
    photos: [],
    status: 'built',
    sortOrder: 0,
    createdAt: '2026-01-01',
    ...over,
  };
}

function snap(over: Partial<MarketSnapshot> & { sliceKey: string }): MarketSnapshot {
  return {
    id: 1,
    period: '2026-09-01',
    segment: 'ofisy_bc',
    deal: 'rent',
    sliceType: 'building',

    currency: 'USD',
    unit: 'usd_per_sqm',
    n: 10,
    median: 12,
    p25: 10,
    p75: 14,
    ...over,
  };
}

function ctxOf(centers: BusinessCenter[], snapshots: MarketSnapshot[]) {
  return buildBadgeContext(centers, snapshots, buildOfferIndex(snapshots));
}

const D = 'Партизанский';

describe('businessCenterBadge', () => {
  it('«дешевле медианы класса» — только начиная с порога в 10%', () => {
    const cheap = bc({ slug: 'cheap', businessClass: 'B', district: D });
    const almost = bc({ slug: 'almost', businessClass: 'B', district: D });
    const snapshots = [
      snap({ sliceKey: 'B', sliceType: 'class', median: 20 }),
      snap({ sliceKey: 'cheap', median: 15 }),
      snap({ sliceKey: 'almost', median: 19 }),
    ];
    const ctx = ctxOf([cheap, almost], snapshots);
    expect(businessCenterBadge(cheap, ctx)?.text).toBe('Дешевле медианы класса B на 25%');
    // 5% дешевле — не повод для бейджа, а район из двух зданий не даёт и
    // районных: бейджа нет вовсе, и это правильный исход.
    expect(businessCenterBadge(almost, ctx)).toBeNull();
  });

  it('«единственный класс» — только для A и B+; единственный класс C отличием не считается', () => {
    const list = [
      bc({ slug: 'onlyA', district: D, businessClass: 'A' }),
      bc({ slug: 'onlyC', district: D, businessClass: 'C' }),
      bc({ slug: 'b1', district: D, businessClass: 'B' }),
      bc({ slug: 'b2', district: D, businessClass: 'B' }),
    ];
    const ctx = ctxOf(list, []);
    expect(businessCenterBadge(list[0], ctx)?.text).toBe('Единственный класс A в районе');
    expect(businessCenterBadge(list[1], ctx)).toBeNull();
  });

  it('зданию без района и без данных бейдж не выдумывается', () => {
    const lonely = bc({ slug: 'lonely' });
    expect(businessCenterBadge(lonely, ctxOf([lonely], []))).toBeNull();
  });


});
