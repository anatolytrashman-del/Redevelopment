import { describe, expect, it } from 'vitest';
import { buildPriceComparison, MIN_COMPARE_BUILDINGS, percentileCont, verdictText } from './businessCenterPriceCompare';
import type { CatalogOfferIndex } from './businessCenterCatalogFilter';
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';

// Блок публикует про здание утверждение «дороже большинства» / «обычная
// цена» — то есть оценку, а не просто перепечатку числа. Поэтому и порог
// выборки, и выбор слов проверяются отдельно от вёрстки.

function bc(slug: string, businessClass: BusinessCenter['businessClass'], district: string | null): BusinessCenter {
  return {
    id: slug, slug, name: slug, altNames: [], address: 'г. Минск, ул. Тестовая, 1', district, microdistrict: null,
    businessClass, totalArea: null, yearBuilt: null, floors: null, developer: null, developerInfo: null,
    metro: null,
    parking: null, website: null, description: null, rentalInfo: null, highlights: [], mediaMentions: [], mapSnapshotFiles: [],
    tenantOrganizations: [],
    tenantCount: 0, technicalParams: [], buildingFacts: [], nearestMetroStations: [], verdict: null, pros: [], cons: [],
    verdictEdited: false, reviewsChecked: false, floorPlateArea: null, officeArea: null, layoutTypes: [], elevators: null,
    parkingRatio: null, airConditioning: null, ceilingHeight: null, managementType: null,
    metroDistanceBucket: null, freeSpaceMin: null, freeSpaceMax: null, infraInternal: [], infraNearby: [],
    lat: null, lng: null, gisRating: null, gisReviewCount: null, is24x7: null, accessibility: [], photos: [],
    status: 'built', kind: 'bc', retailFormat: null, sortOrder: 0, createdAt: '2026-01-01',
  };
}

function snap(slug: string, median: number, p25 = median, p75 = median, n = 4): MarketSnapshot {
  return {
    id: 1, period: '2026-09-01', segment: 'ofisy_bc', deal: 'rent', sliceType: 'building', sliceKey: slug,
    currency: 'USD', unit: 'usd_per_sqm', n, median, p25, p75,
  };
}

function index(entries: [string, MarketSnapshot][]): CatalogOfferIndex {
  return { rentBySlug: new Map(entries), saleBySlug: new Map(), lotSizesBySlug: new Map() };
}

describe('percentileCont', () => {
  it('интерполирует так же, как percentile_cont в Postgres', () => {
    // В Postgres percentile_cont(0.25) по [1,2,3,4,5] даёт ровно 2.
    expect(percentileCont([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(percentileCont([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it('на одном значении возвращает его само, на пустом — null', () => {
    expect(percentileCont([7], 0.75)).toBe(7);
    expect(percentileCont([], 0.5)).toBeNull();
  });
});

describe('verdictText', () => {
  const classCorridor = { low: 10, high: 15 };
  const districtCorridor = { low: 11, high: 14 };

  it('выше обоих коридоров — дороже большинства', () => {
    expect(verdictText(20, [classCorridor, districtCorridor])).toBe('дороже большинства');
  });

  it('выше одного, внутри второго — у верхней границы', () => {
    expect(verdictText(14.5, [classCorridor, districtCorridor])).toBe('у верхней границы');
  });

  it('внутри обоих — обычная цена', () => {
    expect(verdictText(12, [classCorridor, districtCorridor])).toBe('обычная цена');
  });

  it('ниже обоих — дешевле большинства', () => {
    expect(verdictText(5, [classCorridor, districtCorridor])).toBe('дешевле большинства');
  });

  it('с одной базой «выше» — это сразу дороже большинства, а не граница', () => {
    expect(verdictText(20, [classCorridor])).toBe('дороже большинства');
  });
});

describe('buildPriceComparison', () => {
  const peers = Array.from({ length: 8 }, (_, i) => bc(`peer-${i}`, 'B', 'Московский'));
  const subject = bc('subject', 'B', 'Московский');
  const all = [subject, ...peers];
  const peerSnapshots = peers.map((p, i) => [p.slug, snap(p.slug, 10 + i)] as [string, MarketSnapshot]);

  it('считает базу по ЗДАНИЯМ, а не по объявлениям', () => {
    // У одного соседа 40 объявлений, у остальных по 4 — на коридор это
    // влиять не должно: одно здание = один голос.
    const loud = [peers[0].slug, snap(peers[0].slug, 10, 10, 10, 40)] as [string, MarketSnapshot];
    const quiet = [peers[0].slug, snap(peers[0].slug, 10)] as [string, MarketSnapshot];
    const withLoud = buildPriceComparison(subject, all, index([[subject.slug, snap(subject.slug, 20)], loud, ...peerSnapshots.slice(1)]));
    const withQuiet = buildPriceComparison(subject, all, index([[subject.slug, snap(subject.slug, 20)], quiet, ...peerSnapshots.slice(1)]));
    expect(withLoud.blocks[0].bases[0].value).toBe(withQuiet.blocks[0].bases[0].value);
  });

  it('не показывает базу, за которой меньше пяти зданий', () => {
    const few = peerSnapshots.slice(0, MIN_COMPARE_BUILDINGS - 2);
    const result = buildPriceComparison(subject, all, index([[subject.slug, snap(subject.slug, 20)], ...few]));
    expect(result.blocks).toHaveLength(0);
  });

  it('подменяет район городом, когда в районе зданий не набралось', () => {
    const subjectAlone = bc('subject', 'B', 'Заводской');
    const result = buildPriceComparison(subjectAlone, [subjectAlone, ...peers], index([['subject', snap('subject', 20)], ...peerSnapshots]));
    expect(result.blocks[0].bases.map((b) => b.label)).toContain('Все БЦ Минска');
    expect(result.blocks[0].bases.map((b) => b.label)).not.toContain('БЦ в этом районе');
  });

  it('схлопывает коридор здания в одно число, когда границы почти совпали', () => {
    const result = buildPriceComparison(subject, all, index([[subject.slug, snap(subject.slug, 15, 14.98, 15)], ...peerSnapshots]));
    expect(result.blocks[0].self.value).toBe('$15');
  });

  it('показывает диапазон, когда цены внутри здания правда разные', () => {
    const result = buildPriceComparison(subject, all, index([[subject.slug, snap(subject.slug, 15, 12, 18)], ...peerSnapshots]));
    expect(result.blocks[0].self.value).toBe('$12 – 18');
  });

  it('без объявлений по сделке блока нет', () => {
    const result = buildPriceComparison(subject, all, index(peerSnapshots));
    expect(result.blocks).toHaveLength(0);
  });
});
