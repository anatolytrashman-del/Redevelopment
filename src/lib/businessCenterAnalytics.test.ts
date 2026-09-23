import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import type { BusinessCenterOfferSlice } from '../data/businessCenterOffers';
import {
  MIN_DRIVER_DELTA_PCT,
  MIN_GROUP_N,
  buildCityOffers,
  buildLotBuckets,
  buildPriceDrivers,
  buildVintageCohorts,
  buildBuildingSupply,
  fmtYears,
  paybackYears,
} from './businessCenterAnalytics';

// Все цифры этой страницы выглядят одинаково правдоподобно — и верные, и
// посчитанные по вдвое меньшей выборке. Поэтому проверяются не значения, а
// правила, по которым они получаются: что попадает в срез, что из него
// выбрасывается и когда сравнение вообще не показывается.

function center(over: Partial<BusinessCenter> & { slug: string }): BusinessCenter {
  return {
    id: `id-${over.slug}`,
    name: over.slug,
    altNames: [],
    address: 'Минск',
    district: 'Центральный',
    microdistrict: null,
    businessClass: 'B',
    totalArea: 10000,
    yearBuilt: 2010,
    floors: 5,
    developer: null,
    developerInfo: null,
    metro: null,
    parking: null,
    website: null,
    description: null,
    rentalInfo: null,
    highlights: [],
    mapSnapshotFiles: [],
    mediaMentions: [],
    tenantOrganizations: [],
    tenantCount: 0,
    technicalParams: [],
    buildingFacts: [],
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
    kind: 'bc',
    retailFormat: null,
    retailInfo: null,
    sortOrder: 0,
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function offer(over: Partial<BusinessCenterOfferSlice> & { adId: string }): BusinessCenterOfferSlice {
  return {
    businessCenterSlug: 'a',
    source: 'Kufar',
    dealType: 'rent',
    propertyType: 'Офисы',
    size: 100,
    pricePerSqm: 12,
    ...over,
  };
}

describe('buildCityOffers', () => {
  it('оставляет только офисы: магазин на первом этаже БЦ стоит дороже и сдвигал бы медиану', () => {
    const offers = buildCityOffers(
      [center({ slug: 'a' })],
      [
        offer({ adId: '1', propertyType: 'Офисы', pricePerSqm: 12 }),
        offer({ adId: '2', propertyType: 'Торговые помещения', pricePerSqm: 30 }),
        offer({ adId: '3', propertyType: 'Кладовые', pricePerSqm: 8 }),
      ],
      'rent',
    );
    expect(offers.map((o) => o.adId)).toEqual(['1']);
  });

  it('схлопывает один лот с разных площадок', () => {
    const offers = buildCityOffers(
      [center({ slug: 'a' })],
      [
        offer({ adId: '1', source: 'Kufar', size: 259.4, pricePerSqm: 13.21 }),
        offer({ adId: '2', source: 'Realt', size: 259.4, pricePerSqm: 13 }),
        offer({ adId: '3', source: 'Domovita', size: 259.4, pricePerSqm: 13 }),
      ],
      'rent',
    );
    expect(offers).toHaveLength(1);
  });

  it('НЕ схлопывает одинаковые лоты в разных зданиях', () => {
    // dedupeOffers слаг не проверяет — её зовут с карточки одного здания.
    // На городском списке два одинаковых кабинета в разных БЦ слиплись бы
    // в один, и предложение города оказалось бы вдвое меньше.
    const offers = buildCityOffers(
      [center({ slug: 'a' }), center({ slug: 'b' })],
      [
        offer({ adId: '1', businessCenterSlug: 'a', source: 'Kufar', size: 100, pricePerSqm: 12 }),
        offer({ adId: '2', businessCenterSlug: 'b', source: 'Realt', size: 100, pricePerSqm: 12 }),
      ],
      'rent',
    );
    expect(offers).toHaveLength(2);
  });

  it('выбрасывает объявления без здания в каталоге и с нулевой ценой', () => {
    const offers = buildCityOffers(
      [center({ slug: 'a' })],
      [
        offer({ adId: '1', businessCenterSlug: 'unknown' }),
        offer({ adId: '2', pricePerSqm: 0 }),
        offer({ adId: '3', dealType: 'sale' }),
      ],
      'rent',
    );
    expect(offers).toHaveLength(0);
  });
});

describe('buildPriceDrivers', () => {
  function fleet(highRent: number, lowRent: number, n = MIN_GROUP_N) {
    const centers: BusinessCenter[] = [];
    const offers: BusinessCenterOfferSlice[] = [];
    for (let i = 0; i < n; i += 1) {
      centers.push(center({ slug: `near-${i}`, metroDistanceBucket: 'walking' }));
      centers.push(center({ slug: `far-${i}`, metroDistanceBucket: 'over_3_stops' }));
      offers.push(offer({ adId: `n${i}`, businessCenterSlug: `near-${i}`, pricePerSqm: highRent, size: 100 + i }));
      offers.push(offer({ adId: `f${i}`, businessCenterSlug: `far-${i}`, pricePerSqm: lowRent, size: 100 + i }));
    }
    return buildPriceDrivers(buildCityOffers(centers, offers, 'rent'));
  }

  it('считает надбавку и ставит дорогую сторону справа', () => {
    const metro = fleet(15, 10).find((d) => d.id === 'metro');
    expect(metro).toBeDefined();
    expect(metro!.high.label).toBe('шаговая доступность');
    expect(metro!.low.median).toBe(10);
    expect(metro!.deltaPct).toBe(50);
    expect(metro!.asExpected).toBe(true);
  });

  it('молчит, когда разница в пределах шума', () => {
    expect(fleet(10.2, 10).find((d) => d.id === 'metro')).toBeUndefined();
    expect(MIN_DRIVER_DELTA_PCT).toBeGreaterThan(0);
  });

  it('молчит, когда в группе меньше MIN_GROUP_N объявлений', () => {
    expect(fleet(15, 10, MIN_GROUP_N - 1)).toHaveLength(0);
  });

  it('перевернувшийся срез не выбрасывает, но помечает и меняет подпись', () => {
    // Так реально вышло с кондиционированием: здания, где источник его
    // указал, оказались ДЕШЕВЛЕ — поле заполнено не у всех и не случайно.
    // Подпись «за это доплачивают» в таком случае спорила бы с цифрами.
    const inverted = fleet(10, 15).find((d) => d.id === 'metro');
    expect(inverted).toBeDefined();
    expect(inverted!.asExpected).toBe(false);
    expect(inverted!.high.label).toBe('больше 3 остановок');
    expect(inverted!.hint).toMatch(/наоборот/);
  });
});

describe('paybackYears', () => {
  it('делит цену покупки на годовую аренду', () => {
    expect(paybackYears(10, 1200)).toBe(10);
  });

  it('не делит на ноль и не считает без второй стороны', () => {
    expect(paybackYears(0, 1200)).toBeNull();
    expect(paybackYears(10, null)).toBeNull();
    expect(paybackYears(null, 1200)).toBeNull();
  });
});

describe('buildVintageCohorts', () => {
  it('раскладывает по когортам и классам, пустые когорты не показывает', () => {
    const cohorts = buildVintageCohorts([
      center({ slug: '1', yearBuilt: 1998, businessClass: 'C', totalArea: 1000 }),
      center({ slug: '2', yearBuilt: 2018, businessClass: 'A', totalArea: 2000 }),
      center({ slug: '3', yearBuilt: 2020, businessClass: 'B+', totalArea: 3000 }),
      center({ slug: '4', yearBuilt: null, businessClass: 'B' }),
    ]);
    expect(cohorts.map((c) => c.label)).toEqual(['до 2001', '2016–2020']);
    expect(cohorts[1].total).toBe(2);
    expect(cohorts[1].area).toBe(5000);
    expect(cohorts[1].byClass.A).toBe(1);
    expect(cohorts[1].byClass['B+']).toBe(1);
  });

  it('границы когорт не пересекаются: 2016 — это уже следующая корзина', () => {
    const cohorts = buildVintageCohorts([
      center({ slug: '1', yearBuilt: 2015 }),
      center({ slug: '2', yearBuilt: 2016 }),
    ]);
    expect(cohorts.map((c) => [c.label, c.total])).toEqual([
      ['2011–2015', 1],
      ['2016–2020', 1],
    ]);
  });
});

describe('buildLotBuckets и buildBuildingSupply', () => {
  const centers = [center({ slug: 'a' }), center({ slug: 'b' })];
  const offers = [
    offer({ adId: '1', businessCenterSlug: 'a', size: 40, pricePerSqm: 10 }),
    offer({ adId: '2', businessCenterSlug: 'a', size: 120, pricePerSqm: 14 }),
    offer({ adId: '3', businessCenterSlug: 'a', size: 600, pricePerSqm: 16 }),
    offer({ adId: '4', businessCenterSlug: 'b', size: 80, pricePerSqm: 12 }),
  ];
  const city = buildCityOffers(centers, offers, 'rent');

  it('кладёт лот ровно в одну корзину и считает её медиану и площадь', () => {
    const buckets = buildLotBuckets(city);
    expect(buckets.reduce((sum, b) => sum + b.n, 0)).toBe(4);
    expect(buckets.find((b) => b.label === 'до 50 м²')).toMatchObject({ n: 1, median: 10, area: 40 });
    expect(buckets.find((b) => b.label === 'от 500 м²')).toMatchObject({ n: 1, median: 16, area: 600 });
  });

  it('здание с одним лотом не попадает в «края рынка»', () => {
    expect(buildBuildingSupply(city).map((b) => b.center.slug).sort()).toEqual(['a', 'b']);
    expect(buildBuildingSupply(city, 3).map((b) => b.center.slug)).toEqual(['a']);
    expect(buildBuildingSupply(city, 3)[0]).toMatchObject({ lots: 3, area: 760, median: 14 });
  });
});

describe('fmtYears', () => {
  it('дробное число всегда в родительном падеже', () => {
    expect(fmtYears(8.9)).toBe('8,9 года');
    expect(fmtYears(11.54)).toBe('11,5 года');
  });

  it('целые склоняются как обычно', () => {
    expect(fmtYears(8)).toBe('8 лет');
    expect(fmtYears(21)).toBe('21 года');
    expect(fmtYears(11)).toBe('11 лет');
  });
});
