import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import type { MarketSnapshot } from '../data/marketSnapshots';
import {
  CATALOG_PRESETS,
  EMPTY_CATALOG_FILTER,
  buildOfferIndex,
  catalogFilterToQuery,
  catalogMetroStations,
  catalogSummary,
  hasActiveCatalogFilter,
  isPresetActive,
  matchesCatalogFilter,
  parseCatalogFilter,
  sortCatalogCenters,
  unverifiableByMetroStation,
} from './businessCenterCatalogFilter';

// Фильтр каталога БЦ считает то, что видит пользователь на первом экране
// («Подходит 12 из 143», счётчики на чипах, порядок карточек), поэтому
// проверяется тестом, а не только глазами на скриншоте: ошибка здесь не
// падает, а молча показывает не тот список.

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
    highlights: [], mediaMentions: [],
    mapSnapshotFiles: [],
    tenantOrganizations: [],
    tenantCount: 0,
    technicalParams: [], buildingFacts: [],
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

function snapshot(over: Partial<MarketSnapshot> & { sliceKey: string }): MarketSnapshot {
  return {
    id: 1,
    period: '2026-09-01',
    segment: 'ofisy_bc',
    deal: 'rent',
    sliceType: 'building',
    currency: 'USD',
    unit: 'usd_per_sqm',
    n: 5,
    median: 12,
    p25: 10,
    p75: 14,
    ...over,
  };
}

describe('buildOfferIndex', () => {
  it('берёт только срез по зданию и раскладывает по сделке', () => {
    const idx = buildOfferIndex([
      snapshot({ sliceKey: 'alpha', deal: 'rent', median: 15 }),
      snapshot({ sliceKey: 'alpha', deal: 'sale', median: 1600 }),
      // городской и классовый срезы в индекс зданий попадать не должны —
      // иначе тумблер «есть аренда» сработал бы у здания со слагом «all».
      snapshot({ sliceKey: 'all', sliceType: 'city' }),
      snapshot({ sliceKey: 'A', sliceType: 'class' }),
    ]);
    expect(idx.rentBySlug.get('alpha')?.median).toBe(15);
    expect(idx.saleBySlug.get('alpha')?.median).toBe(1600);
    expect(idx.rentBySlug.has('all')).toBe(false);
    expect(idx.rentBySlug.has('A')).toBe(false);
  });

  it('пустой список снимков — пустой индекс, а не падение', () => {
    expect(buildOfferIndex(null).rentBySlug.size).toBe(0);
  });
});

describe('matchesCatalogFilter', () => {
  const offers = buildOfferIndex([snapshot({ sliceKey: 'withRent' })]);

  it('класс и район — ИЛИ внутри оси, И между осями', () => {
    const a = bc({ slug: 'a', businessClass: 'A', district: 'Центральный' });
    const b = bc({ slug: 'b', businessClass: 'B', district: 'Советский' });
    const state = { ...EMPTY_CATALOG_FILTER, classes: ['A', 'B'], districts: ['Центральный'] };
    expect(matchesCatalogFilter(a, state, offers)).toBe(true);
    expect(matchesCatalogFilter(b, state, offers)).toBe(false);
  });

  it('район и микрорайон различают «все» и «ничего»', () => {
    const c = bc({ slug: 'a', district: 'Центральный', microdistrict: 'Комаровка' });
    expect(matchesCatalogFilter(c, EMPTY_CATALOG_FILTER, offers)).toBe(true);
    expect(matchesCatalogFilter(c, { ...EMPTY_CATALOG_FILTER, districts: [] }, offers)).toBe(false);
    expect(matchesCatalogFilter(c, { ...EMPTY_CATALOG_FILTER, microdistricts: [] }, offers)).toBe(false);
    expect(
      matchesCatalogFilter(c, { ...EMPTY_CATALOG_FILTER, microdistricts: ['Комаровка'] }, offers),
    ).toBe(true);
  });

  it('здание без класса не попадает в выборку по классу', () => {
    const noClass = bc({ slug: 'x' });
    expect(matchesCatalogFilter(noClass, { ...EMPTY_CATALOG_FILTER, classes: ['A'] }, offers)).toBe(false);
  });

  it('расстояние до метро считается по БЛИЖАЙШЕЙ станции', () => {
    const near = bc({
      slug: 'near',
      nearestMetroStations: [
        { name: 'Далёкая', distanceMeters: 1400, line: null, color: null },
        { name: 'Близкая', distanceMeters: 300, line: null, color: null },
      ],
    });
    expect(matchesCatalogFilter(near, { ...EMPTY_CATALOG_FILTER, metroWithin: 500 }, offers)).toBe(true);
  });

  it('здание без данных по метро — «неизвестно», а не «далеко»: в выборку не попадает', () => {
    const unknown = bc({ slug: 'u' });
    expect(matchesCatalogFilter(unknown, { ...EMPTY_CATALOG_FILTER, metroWithin: 1500 }, offers)).toBe(false);
  });

  it('несколько тумблеров — И, а не ИЛИ', () => {
    const both = bc({ slug: 'withRent', managementType: 'single_uk' });
    const onlyUk = bc({ slug: 'onlyUk', managementType: 'single_uk' });
    const state = { ...EMPTY_CATALOG_FILTER, facts: ['rent', 'uk'] };
    expect(matchesCatalogFilter(both, state, offers)).toBe(true);
    expect(matchesCatalogFilter(onlyUk, state, offers)).toBe(false);
  });

  it('поиск сужается каждым словом и ищет по адресу, району и станциям', () => {
    const c = bc({
      slug: 'c',
      name: 'Бизнес-центр «Титан»',
      address: 'г. Минск, просп. Независимости, 58',
      microdistrict: 'Уручье',
      nearestMetroStations: [{ name: 'Академия наук', distanceMeters: 400, line: null, color: null }],
    });
    expect(matchesCatalogFilter(c, { ...EMPTY_CATALOG_FILTER, query: 'титан' }, offers)).toBe(true);
    expect(matchesCatalogFilter(c, { ...EMPTY_CATALOG_FILTER, query: 'независимости' }, offers)).toBe(true);
    expect(matchesCatalogFilter(c, { ...EMPTY_CATALOG_FILTER, query: 'академия' }, offers)).toBe(true);
    expect(matchesCatalogFilter(c, { ...EMPTY_CATALOG_FILTER, query: 'уручье титан' }, offers)).toBe(true);
    expect(matchesCatalogFilter(c, { ...EMPTY_CATALOG_FILTER, query: 'уручье прайм' }, offers)).toBe(false);
  });
});

describe('sortCatalogCenters', () => {
  const offers = buildOfferIndex([
    snapshot({ sliceKey: 'cheap', median: 8 }),
    snapshot({ sliceKey: 'pricey', median: 20 }),
  ]);

  it('по ставке — от дешёвых, здания без объявлений в конце', () => {
    const list = [bc({ slug: 'none' }), bc({ slug: 'pricey' }), bc({ slug: 'cheap' })];
    expect(sortCatalogCenters(list, 'rent', offers).map((c) => c.slug)).toEqual(['cheap', 'pricey', 'none']);
  });

  it('по площади — от больших, без площади в конце', () => {
    const list = [bc({ slug: 'none' }), bc({ slug: 'small', totalArea: 1000 }), bc({ slug: 'big', totalArea: 9000 })];
    expect(sortCatalogCenters(list, 'area', offers).map((c) => c.slug)).toEqual(['big', 'small', 'none']);
  });

  it('по умолчанию — sort_order каталога, если класс и рейтинг не различают', () => {
    const list = [bc({ slug: 'second', sortOrder: 2 }), bc({ slug: 'first', sortOrder: 1 })];
    expect(sortCatalogCenters(list, 'default', offers).map((c) => c.slug)).toEqual(['first', 'second']);
  });

  function withYandexRating(value: string): BusinessCenter['highlights'] {
    return [{ icon: 'rating', label: 'Рейтинг на картах', text: `Яндекс.Карты: **${value}** из 5 (100 оценок)` }];
  }

  it('по умолчанию — класс важнее рейтинга: A с низким рейтингом выше C с высоким (кейс БЦ «Капитал», владелец 2026-09-22)', () => {
    const list = [
      bc({ slug: 'c-high-rating', businessClass: 'C', highlights: withYandexRating('4,9'), sortOrder: 1 }),
      bc({ slug: 'a-low-rating', businessClass: 'A', highlights: withYandexRating('3,8'), sortOrder: 2 }),
    ];
    expect(sortCatalogCenters(list, 'default', offers).map((c) => c.slug)).toEqual(['a-low-rating', 'c-high-rating']);
  });

  it('по умолчанию — внутри одного класса решает рейтинг Яндекс.Карт, здания без рейтинга в конце класса', () => {
    const list = [
      bc({ slug: 'a-no-rating', businessClass: 'A', sortOrder: 1 }),
      bc({ slug: 'a-4.2', businessClass: 'A', highlights: withYandexRating('4,2'), sortOrder: 2 }),
      bc({ slug: 'a-4.8', businessClass: 'A', highlights: withYandexRating('4,8'), sortOrder: 3 }),
    ];
    expect(sortCatalogCenters(list, 'default', offers).map((c) => c.slug)).toEqual(['a-4.8', 'a-4.2', 'a-no-rating']);
  });

  it('по умолчанию — «Аден» всегда последний в классе A, даже с максимальным рейтингом (владелец, 2026-09-22)', () => {
    const list = [
      bc({ slug: 'a-4.2', businessClass: 'A', highlights: withYandexRating('4,2'), sortOrder: 1 }),
      bc({ slug: 'aden', businessClass: 'A', highlights: withYandexRating('5,0'), sortOrder: 2 }),
      bc({ slug: 'a-no-rating', businessClass: 'A', sortOrder: 3 }),
    ];
    expect(sortCatalogCenters(list, 'default', offers).map((c) => c.slug)).toEqual([
      'a-4.2',
      'a-no-rating',
      'aden',
    ]);
  });
});

describe('фильтр по размеру лота (К13)', () => {
  const offers = buildOfferIndex(
    [],
    [
      { businessCenterSlug: 'small', size: 40 },
      { businessCenterSlug: 'big', size: 40 },
      { businessCenterSlug: 'big', size: 400 },
    ],
  );

  it('подходит здание, где есть лот НЕ МЕНЬШЕ запрошенного', () => {
    expect(matchesCatalogFilter(bc({ slug: 'big' }), { ...EMPTY_CATALOG_FILTER, lotSize: 100 }, offers)).toBe(true);
    expect(matchesCatalogFilter(bc({ slug: 'small' }), { ...EMPTY_CATALOG_FILTER, lotSize: 100 }, offers)).toBe(false);
  });

  it('здание вообще без объявлений в выборку не попадает', () => {
    expect(matchesCatalogFilter(bc({ slug: 'none' }), { ...EMPTY_CATALOG_FILTER, lotSize: 10 }, offers)).toBe(false);
  });
});

describe('подборки (К15)', () => {
  it('подборка активна только при точном совпадении состояния', () => {
    const preset = CATALOG_PRESETS.find((p) => p.id === 'a-metro')!;
    const exact = { ...EMPTY_CATALOG_FILTER, ...preset.patch };
    expect(isPresetActive(preset, exact)).toBe(true);
    // Сортировка и вид — не часть подборки, они её не ломают.
    expect(isPresetActive(preset, { ...exact, sort: 'rent', view: 'map' })).toBe(true);
    // А вот лишнее условие сверху — уже не эта подборка.
    expect(isPresetActive(preset, { ...exact, facts: ['uk'] })).toBe(false);
  });
});

describe('URL фильтра', () => {
  it('старые поиск, карта и сортировка открывают стандартную выдачу', () => {
    const state = parseCatalogFilter(new URLSearchParams('view=map&q=титан&sort=metro&class=A'));
    expect(state.view).toBe('cards');
    expect(state.query).toBe('');
    expect(state.sort).toBe('default');
    expect(state.classes).toEqual(['A']);
    expect(catalogFilterToQuery(state)).not.toContain('view=');
    expect(catalogFilterToQuery(state)).not.toContain('q=');
    expect(catalogFilterToQuery(state)).not.toContain('sort=');
  });

  it('старый sort=index сохраняет фильтры и выдаёт здания в обычном порядке', () => {
    const state = parseCatalogFilter(new URLSearchParams('sort=index&class=A'));
    const offers = buildOfferIndex([]);
    const centers = [
      bc({ slug: 'second', businessClass: 'A', sortOrder: 2 }),
      bc({ slug: 'excluded', businessClass: 'B', sortOrder: 0 }),
      bc({ slug: 'first', businessClass: 'A', sortOrder: 1 }),
    ];
    expect(state.sort).toBe('default');
    expect(state.classes).toEqual(['A']);
    const visible = centers.filter((c) => matchesCatalogFilter(c, state, offers));
    expect(sortCatalogCenters(visible, state.sort, offers).map((c) => c.slug)).toEqual(['first', 'second']);
    expect(catalogFilterToQuery(state)).not.toContain('sort=');
  });

  it('один и тот же набор фильтров даёт одну строку запроса', () => {
    const a = { ...EMPTY_CATALOG_FILTER, classes: ['B+', 'A'], facts: ['uk', 'rent'] };
    const b = { ...EMPTY_CATALOG_FILTER, classes: ['A', 'B+'], facts: ['rent', 'uk'] };
    expect(catalogFilterToQuery(a)).toBe(catalogFilterToQuery(b));
  });

  it('разбор возвращает то же состояние и отбрасывает мусор', () => {
    const state = {
      ...EMPTY_CATALOG_FILTER,
      classes: ['A'],
      districts: ['Центральный'],
      microdistricts: ['Комаровка'],
      metroWithin: 1000,
      facts: ['uk'],
    };
    const parsed = parseCatalogFilter(new URLSearchParams(catalogFilterToQuery(state).slice(1)));
    expect(parsed).toEqual(state);
    const junk = parseCatalogFilter(new URLSearchParams('class=Z&metro=777&facts=nope&sort=nope'));
    expect(junk).toEqual(EMPTY_CATALOG_FILTER);
  });

  it('сортировка и пустой фильтр не считаются активным фильтром', () => {
    expect(hasActiveCatalogFilter({ ...EMPTY_CATALOG_FILTER, sort: 'area' })).toBe(false);
    expect(hasActiveCatalogFilter({ ...EMPTY_CATALOG_FILTER, facts: ['uk'] })).toBe(true);
  });

  it('явно снятые районы сохраняются в URL как пустое значение', () => {
    const query = catalogFilterToQuery({ ...EMPTY_CATALOG_FILTER, districts: [], microdistricts: [] });
    const parsed = parseCatalogFilter(new URLSearchParams(query.slice(1)));
    expect(parsed.districts).toEqual([]);
    expect(parsed.microdistricts).toEqual([]);
    expect(hasActiveCatalogFilter(parsed)).toBe(true);
  });
});

describe('catalogSummary', () => {
  it('медиана считается по зданиям с объявлениями и сообщает, по скольким', () => {
    const offers = buildOfferIndex([
      snapshot({ sliceKey: 'a', median: 10 }),
      snapshot({ sliceKey: 'b', median: 20 }),
      snapshot({ sliceKey: 'c', median: 30 }),
    ]);
    const s = catalogSummary([bc({ slug: 'a', totalArea: 100 }), bc({ slug: 'b' }), bc({ slug: 'c' }), bc({ slug: 'd' })], offers);
    expect(s.total).toBe(4);
    expect(s.withAreaCount).toBe(1);
    expect(s.totalArea).toBe(100);
    expect(s.rentMedian).toBe(20);
    expect(s.rentBuildings).toBe(3);
  });

  it('без объявлений медианы нет — вместо неё null, а не ноль', () => {
    const s = catalogSummary([bc({ slug: 'a' })], buildOfferIndex([]));
    expect(s.rentMedian).toBeNull();
    expect(s.rentBuildings).toBe(0);
  });
});

describe('фильтр по станциям метро (задача 8)', () => {
  const near = (name: string, meters: number) => ({ name, distanceMeters: meters, line: null, color: null });

  it('здание подходит, если выбрана хотя бы одна из его станций', () => {
    const c = bc({ slug: 'a', nearestMetroStations: [near('Уручье', 310), near('Борисовский тракт', 900)] });
    const state = { ...EMPTY_CATALOG_FILTER, metroStations: ['Борисовский тракт', 'Малиновка'] };
    expect(matchesCatalogFilter(c, state, buildOfferIndex([]))).toBe(true);
  });

  it('здание без разобранных станций не выдаётся за совпадение', () => {
    const c = bc({ slug: 'b', nearestMetroStations: [] });
    const state = { ...EMPTY_CATALOG_FILTER, metroStations: ['Уручье'] };
    expect(matchesCatalogFilter(c, state, buildOfferIndex([]))).toBe(false);
    expect(unverifiableByMetroStation([c])).toBe(1);
  });

  it('станции переживают ссылку: разбор и сборка строки запроса', () => {
    const state = parseCatalogFilter(new URLSearchParams('station=Уручье,Малиновка'));
    expect(state.metroStations.sort()).toEqual(['Малиновка', 'Уручье']);
    expect(catalogFilterToQuery(state)).toContain('station=');
  });

  it('список станций собирается без повторов и идёт по порядку линий', () => {
    const list = catalogMetroStations([
      bc({ slug: 'a', nearestMetroStations: [near('Уручье', 300)] }),
      bc({ slug: 'b', nearestMetroStations: [near('Малиновка', 400), near('Уручье', 900)] }),
    ]);
    expect(list).toEqual(['Малиновка', 'Уручье']);
  });
});
