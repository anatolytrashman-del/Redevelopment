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

  it('ставит «Все ТЦ» и сортирует сценарии по числу', () => {
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
      tc({ slug: 'momo', retailFormat: 'ТРЦ', district: 'Фрунзенский' }),
    ];
    const shelf = buildTonightShelf(centers, null);
    expect(shelf).not.toBeNull();
    expect(shelf!.cards[0].id).toBe('all');
    expect(shelf!.cards[0].count).toBe(3);
    // После «Все» — по убыванию count
    const rest = shelf!.cards.slice(1);
    for (let i = 1; i < rest.length; i++) {
      expect(rest[i - 1].count).toBeGreaterThanOrEqual(rest[i].count);
    }
    expect(shelf!.cards.some((c) => c.href.includes('/with/shopping'))).toBe(true);
  });

  it('сортирует бренды по числу ТЦ (больше → раньше)', () => {
    const index: TcFilterIndex = new Map([
      [
        'galleria',
        buildTcFilterEntry({
          ...emptyFilter,
          brands: ['Золотое Яблоко', 'Zara', 'Mark Formelle'],
        }),
      ],
      [
        'dana',
        buildTcFilterEntry({
          ...emptyFilter,
          brands: ['Золотое Яблоко', 'Mark Formelle'],
        }),
      ],
      [
        'palace',
        buildTcFilterEntry({
          ...emptyFilter,
          brands: ['Mark Formelle'],
        }),
      ],
    ]);
    const centers = [tc({ slug: 'galleria' }), tc({ slug: 'dana' }), tc({ slug: 'palace' })];
    const shelf = buildBrandsShelf(centers, index);
    expect(shelf).not.toBeNull();
    const slugs = shelf!.cards.map((c) => c.id.replace('brand-', ''));
    expect(slugs[0]).toBe('mark-formelle');
    expect(shelf!.cards[0].count).toBeGreaterThanOrEqual(shelf!.cards[1].count);
    expect(slugs.every((s) => (TC_FEATURED_BRAND_SLUGS as readonly string[]).includes(s))).toBe(true);
    expect(shelf!.cards.every((c) => c.countLabel.endsWith(' ТЦ'))).toBe(true);
  });

  it('берёт только топовые районы по количеству', () => {
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
      tc({ slug: 'd1', district: 'Партизанский', totalArea: 5000, gisRating: 4.9 }),
    ];
    const shelf = buildDistrictsShelf(centers);
    expect(shelf).not.toBeNull();
    expect(shelf!.cards.length).toBeLessThanOrEqual(TC_TOP_DISTRICTS);
    expect(shelf!.cards[0].title).toBe('Фрунзенский');
    expect(shelf!.cards.map((c) => c.title)).not.toContain('Партизанский');
  });

  it('берёт только топовые станции метро по числу', () => {
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
