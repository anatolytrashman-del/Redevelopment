import { describe, expect, it } from 'vitest';
import { haversineMeters, median, nearestNeighbours, rankOf } from './businessCenterMarketPosition';
import type { BusinessCenter } from '../data/businessCenters';

// Эти функции считают то, что страница ПУБЛИКУЕТ как факт про чужое здание
// («23-й из 138 по площади», «в 273 м отсюда»), поэтому проверяются
// отдельно от вёрстки.

function bc(slug: string, lat: number | null, lng: number | null): BusinessCenter {
  return {
    id: slug, slug, name: slug, address: 'г. Минск, ул. Тестовая, 1', district: null, microdistrict: null,
    businessClass: null, totalArea: null, yearBuilt: null, floors: null, developer: null, metro: null,
    parking: null, website: null, description: null, rentalInfo: null, highlights: [], mapSnapshotFiles: [],
    tenantOrganizations: [], technicalParams: [], nearestMetroStations: [], verdict: null, pros: [], cons: [],
    verdictEdited: false, floorPlateArea: null, officeArea: null, layoutTypes: [], elevators: null,
    parkingRatio: null, airConditioning: null, ceilingHeight: null, managementType: null,
    metroDistanceBucket: null, freeSpaceMin: null, freeSpaceMax: null, infraInternal: [], infraNearby: [],
    lat, lng, gisRating: null, gisReviewCount: null, is24x7: null, accessibility: [], photos: [],
    status: 'built', sortOrder: 0, createdAt: '2026-01-01',
  };
}

describe('haversineMeters', () => {
  it('считает расстояние между двумя точками Минска', () => {
    // Площадь Победы — площадь Якуба Коласа, около 1,3 км по прямой.
    const m = haversineMeters(53.9227, 27.5764, 53.9284, 27.5866);
    expect(m).toBeGreaterThan(900);
    expect(m).toBeLessThan(1300);
  });

  it('расстояние до самой себя — ноль', () => {
    expect(haversineMeters(53.9, 27.5, 53.9, 27.5)).toBe(0);
  });
});

describe('rankOf', () => {
  it('1-е место — у наибольшего, когда больше значит выше', () => {
    expect(rankOf(9000, [100, 9000, 5000], 'desc')).toEqual({ rank: 1, total: 3 });
    expect(rankOf(100, [100, 9000, 5000], 'desc')).toEqual({ rank: 3, total: 3 });
  });
});

describe('median', () => {
  it('на чётной длине берёт середину между двумя центральными', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('пустой список — null, а не ноль', () => {
    expect(median([])).toBeNull();
  });
});

describe('nearestNeighbours', () => {
  it('сортирует по расстоянию и не включает само здание', () => {
    const self = bc('self', 53.9, 27.55);
    const list = [self, bc('far', 53.95, 27.6), bc('near', 53.901, 27.551)];
    const n = nearestNeighbours(self, list, 5);
    expect(n.map((x) => x.center.slug)).toEqual(['near', 'far']);
  });

  it('здание без координат соседей не считает — иначе расстояние пришлось бы выдумать', () => {
    const self = bc('self', null, null);
    expect(nearestNeighbours(self, [self, bc('other', 53.9, 27.5)], 5)).toEqual([]);
  });

  it('сосед без координат в список не попадает', () => {
    const self = bc('self', 53.9, 27.55);
    const n = nearestNeighbours(self, [self, bc('noCoords', null, null), bc('ok', 53.91, 27.56)], 5);
    expect(n.map((x) => x.center.slug)).toEqual(['ok']);
  });
});
