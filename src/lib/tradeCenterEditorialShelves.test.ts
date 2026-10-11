import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import { buildTcFilterEntry, type TcFilterIndex, type TcFilterSource } from './tradeCenterCatalogFeatures';
import {
  TC_FEATURED_BRAND_MIN,
  TC_FEATURED_BRAND_SLUGS,
  TC_TONIGHT_TOPIC_SLUGS,
  TC_TOP_DISTRICTS,
  TC_TOP_METRO,
  buildBrandsShelf,
  buildDistrictsShelf,
  buildMetroShelf,
  buildTcEditorialShelves,
  buildTonightShelf,
} from './tradeCenterEditorialShelves';

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
    lat: 53.9,
    lng: 27.55,
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

const emptyFilter: TcFilterSource = {
  funKinds: [],
  foodZones: 0,
  foodcourtPlaces: 0,
  anchorCategories: [],
  parking: null,
  hours: [],
  brands: [],
};

describe('авторские полки каталога ТЦ', () => {
  it('держит редакционные константы в разумных пределах', () => {
    expect(TC_TONIGHT_TOPIC_SLUGS.length).toBeGreaterThanOrEqual(6);
    expect(TC_FEATURED_BRAND_SLUGS).toContain('gold-apple');
    expect(TC_FEATURED_BRAND_MIN).toBeGreaterThanOrEqual(2);
    expect(TC_TOP_DISTRICTS).toBeLessThanOrEqual(6);
    expect(TC_TOP_METRO).toBeLessThanOrEqual(8);
  });

  it('собирает сценарии «куда сегодня» из тематических хабов', () => {
    const centers = [
      tc({
        slug: 'galleria',
        retailFormat: 'ТРЦ',
        district: 'Центральный',
        address: 'г. Минск, ул. Немига, 3',
        nearestMetroStations: [
          { name: 'Немига', distanceMeters: 200, line: 'Автозаводская линия', color: null },
        ],
      }),
      tc({ slug: 'dana', retailFormat: 'ТРЦ', district: 'Первомайский' }),
    ];
    const shelf = buildTonightShelf(centers, null);
    expect(shelf).not.toBeNull();
    expect(shelf!.cards.some((c) => c.href.includes('/with/shopping'))).toBe(true);
    expect(shelf!.cards.some((c) => c.href.includes('/with/center'))).toBe(true);
  });

  it('в бренды пускает только отмеченные редакцией с достаточным числом ТЦ', () => {
    const index: TcFilterIndex = new Map([
      [
        'galleria',
        buildTcFilterEntry({
          ...emptyFilter,
          brands: ['Золотое Яблоко', 'Zara', 'Obscure Brand'],
        }),
      ],
      [
        'dana',
        buildTcFilterEntry({
          ...emptyFilter,
          brands: ['Золотое Яблоко'],
        }),
      ],
      [
        'palace',
        buildTcFilterEntry({
          ...emptyFilter,
          brands: ['Zara'],
        }),
      ],
    ]);
    const centers = [tc({ slug: 'galleria' }), tc({ slug: 'dana' }), tc({ slug: 'palace' })];
    const shelf = buildBrandsShelf(centers, index);
    expect(shelf).not.toBeNull();
    const slugs = shelf!.cards.map((c) => c.id.replace('brand-', ''));
    expect(slugs).toContain('gold-apple');
    expect(slugs).toContain('zara');
    expect(slugs.every((s) => (TC_FEATURED_BRAND_SLUGS as readonly string[]).includes(s))).toBe(true);
  });

  it('берёт только топовые районы по количеству и качеству', () => {
    const centers = [
      tc({ slug: 'a1', district: 'Фрунзенский', totalArea: 80000, gisRating: 4.8 }),
      tc({ slug: 'a2', district: 'Фрунзенский', totalArea: 60000, gisRating: 4.6 }),
      tc({ slug: 'a3', district: 'Фрунзенский', totalArea: 40000, gisRating: 4.5 }),
      tc({ slug: 'b1', district: 'Центральный', totalArea: 30000, gisRating: 4.7 }),
      tc({ slug: 'b2', district: 'Центральный', totalArea: 25000, gisRating: 4.4 }),
      tc({ slug: 'b3', district: 'Центральный', totalArea: 20000, gisRating: 4.3 }),
      tc({ slug: 'c1', district: 'Заводской', totalArea: 10000, gisRating: 4.0 }),
      tc({ slug: 'c2', district: 'Заводской', totalArea: 9000, gisRating: 3.9 }),
      tc({ slug: 'c3', district: 'Заводской', totalArea: 8000, gisRating: 3.8 }),
      // меньше порога индексации — не попадает
      tc({ slug: 'd1', district: 'Партизанский', totalArea: 5000, gisRating: 4.9 }),
    ];
    const shelf = buildDistrictsShelf(centers);
    expect(shelf).not.toBeNull();
    expect(shelf!.cards.length).toBeLessThanOrEqual(TC_TOP_DISTRICTS);
    expect(shelf!.cards.map((c) => c.title)).toContain('Фрунзенский');
    expect(shelf!.cards.map((c) => c.title)).not.toContain('Партизанский');
    const titles = shelf!.cards.map((c) => c.title);
    expect(titles.indexOf('Фрунзенский')).toBeLessThan(titles.indexOf('Заводской'));
  });

  it('берёт только топовые станции метро', () => {
    const centers = [
      tc({
        slug: 'n1',
        nearestMetroStations: [
          { name: 'Немига', distanceMeters: 200, line: 'Автозаводская линия', color: null },
        ],
        totalArea: 90000,
        gisRating: 4.8,
      }),
      tc({
        slug: 'n2',
        nearestMetroStations: [
          { name: 'Немига', distanceMeters: 400, line: 'Автозаводская линия', color: null },
        ],
        totalArea: 50000,
        gisRating: 4.6,
      }),
      tc({
        slug: 'n3',
        nearestMetroStations: [
          { name: 'Немига', distanceMeters: 600, line: 'Автозаводская линия', color: null },
        ],
        totalArea: 40000,
        gisRating: 4.5,
      }),
      tc({
        slug: 'p1',
        nearestMetroStations: [
          { name: 'Пушкинская', distanceMeters: 300, line: 'Автозаводская линия', color: null },
        ],
        totalArea: 20000,
        gisRating: 4.2,
      }),
      tc({
        slug: 'p2',
        nearestMetroStations: [
          { name: 'Пушкинская', distanceMeters: 500, line: 'Автозаводская линия', color: null },
        ],
        totalArea: 18000,
        gisRating: 4.1,
      }),
      tc({
        slug: 'p3',
        nearestMetroStations: [
          { name: 'Пушкинская', distanceMeters: 700, line: 'Автозаводская линия', color: null },
        ],
        totalArea: 15000,
        gisRating: 4.0,
      }),
    ];
    const shelf = buildMetroShelf(centers);
    expect(shelf).not.toBeNull();
    expect(shelf!.cards.length).toBeLessThanOrEqual(TC_TOP_METRO);
    expect(shelf!.cards[0].title).toBe('Немига');
    expect(shelf!.cards.every((c) => c.href.includes('/metro/'))).toBe(true);
  });

  it('buildTcEditorialShelves склеивает непустые полки', () => {
    const centers = [
      tc({
        slug: 'galleria',
        district: 'Центральный',
        nearestMetroStations: [
          { name: 'Немига', distanceMeters: 250, line: 'Автозаводская линия', color: null },
        ],
      }),
      tc({
        slug: 'dana',
        district: 'Центральный',
        nearestMetroStations: [
          { name: 'Немига', distanceMeters: 400, line: 'Автозаводская линия', color: null },
        ],
      }),
      tc({
        slug: 'palace',
        district: 'Центральный',
        nearestMetroStations: [
          { name: 'Немига', distanceMeters: 500, line: 'Автозаводская линия', color: null },
        ],
      }),
    ];
    const shelves = buildTcEditorialShelves(centers, null);
    expect(shelves.some((s) => s.id === 'tonight')).toBe(true);
    expect(shelves.some((s) => s.id === 'districts')).toBe(true);
    expect(shelves.some((s) => s.id === 'metro')).toBe(true);
    expect(shelves.some((s) => s.id === 'brands')).toBe(false);
  });
});
