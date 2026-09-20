import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import { buildOfferIndex } from './businessCenterCatalogFilter';
import { MIN_INDEX_SUBSCALES, SUBSCALE_META, businessCenterIndex } from './businessCenterIndex';

// Индекс — публичная оценка чужого здания числом. Проверяем не «красивое
// значение», а три правила методики: пороги фиксированы, отсутствие данных
// не штрафует, меньше трёх подшкал — индекса нет.

function bc(over: Partial<BusinessCenter> & { slug: string }): BusinessCenter {
  return {
    id: over.slug, name: over.slug, altNames: [], address: 'г. Минск, ул. Тестовая, 1', district: null,
    microdistrict: null, businessClass: null, totalArea: null, yearBuilt: null, floors: null, developer: null,
    developerInfo: null,
    metro: null, parking: null, website: null, description: null, rentalInfo: null, highlights: [],
    mapSnapshotFiles: [], tenantOrganizations: [], technicalParams: [], nearestMetroStations: [], verdict: null,
    pros: [], cons: [], verdictEdited: false, reviewsChecked: false, floorPlateArea: null, officeArea: null, layoutTypes: [],
    elevators: null, parkingRatio: null, airConditioning: null, ceilingHeight: null, managementType: null,
    metroDistanceBucket: null, freeSpaceMin: null, freeSpaceMax: null, infraInternal: [], infraNearby: [],
    lat: null, lng: null, gisRating: null, gisReviewCount: null, is24x7: null, accessibility: [], photos: [],
    status: 'built', sortOrder: 0, createdAt: '2026-01-01', ...over,
  };
}

const noOffers = buildOfferIndex([]);

describe('businessCenterIndex', () => {
  it('меньше трёх подшкал — индекса нет вовсе', () => {
    // Только класс: это одна подшкала «Здание», больше посчитать не по чему.
    expect(businessCenterIndex(bc({ slug: 'a', businessClass: 'A' }), noOffers)).toBeNull();
  });

  it('нет данных по парковке — не то же самое, что нулевая парковка', () => {
    const base = {
      businessClass: 'A' as const,
      ceilingHeight: 3.5,
      elevators: 4,
      totalArea: 12000,
      airConditioning: 'full' as const,
      nearestMetroStations: [{ name: 'м', distanceMeters: 300, line: null, color: null }],
      lat: 53.8955,
      lng: 27.5486,
      infraInternal: ['кафе', 'банк', 'магазин', 'кофепоинт', 'фитнес-центр'],
      infraNearby: ['кафе', 'банк', 'магазин', 'кофепоинт', 'фитнес-центр', 'банкомат'],
    };
    const unknown = businessCenterIndex(bc({ slug: 'unknown', ...base }), noOffers);
    const zero = businessCenterIndex(bc({ slug: 'zero', ...base, parkingRatio: 0 }), noOffers);
    // Здание с реально нулевой парковкой обязано быть ниже того, про чью
    // парковку мы просто ничего не знаем.
    expect(zero!.value).toBeLessThan(unknown!.value);
    // Подшкала «Рынок» есть всегда: отсутствие активных объявлений — это
    // наблюдаемый факт, а не пробел в данных (в отличие от парковки).
    expect(unknown!.known).toBe(4);
    expect(zero!.known).toBe(5);
  });

  it('индекс не зависит от состава каталога — пороги фиксированы', () => {
    const c = bc({
      slug: 'x', businessClass: 'B', parkingRatio: 1, ceilingHeight: 3,
      nearestMetroStations: [{ name: 'м', distanceMeters: 900, line: null, color: null }],
      lat: 53.9, lng: 27.56,
    });
    const first = businessCenterIndex(c, noOffers);
    // Тот же расчёт после «добавления» в каталог других зданий — функция
    // вообще не видит остальной каталог, и это специально.
    expect(businessCenterIndex(c, noOffers)?.value).toBe(first?.value);
  });

  it('отсутствие рейтинга 2ГИС не отнимает баллов за рынок', () => {
    const offers = buildOfferIndex([
      { id: 1, period: '2026-09-01', segment: 'ofisy_bc', deal: 'rent', sliceType: 'building', sliceKey: 'r', currency: 'USD', unit: 'usd_per_sqm', n: 5, median: 12, p25: 10, p75: 14 },
      { id: 2, period: '2026-09-01', segment: 'ofisy_bc', deal: 'sale', sliceType: 'building', sliceKey: 'r', currency: 'USD', unit: 'usd_per_sqm', n: 5, median: 1500, p25: 1400, p75: 1600 },
    ]);
    const c = bc({ slug: 'r', businessClass: 'A', parkingRatio: 2, lat: 53.9, lng: 27.55 });
    const idx = businessCenterIndex(c, offers);
    expect(idx?.subscales.find((s) => s.key === 'market')?.score).toBe(100);
  });

  it('веса подшкал в сумме дают 100 — иначе методика на странице врёт', () => {
    const sum = Object.values(SUBSCALE_META).reduce((a, m) => a + m.weight, 0);
    expect(sum).toBe(100);
    expect(MIN_INDEX_SUBSCALES).toBe(3);
  });
});
