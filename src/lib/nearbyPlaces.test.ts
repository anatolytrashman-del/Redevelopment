import { describe, expect, it } from 'vitest';
import type { BusinessCenterNearbyPlace } from '../data/businessCenterNearbyPlaces';
import {
  formatMeters,
  groupNearbyPlaces,
  latestCollectedAt,
  mergeMetroStations,
  nearbyFaqLines,
  nearbySourceLabels,
} from './nearbyPlaces';

function place(overrides: Partial<BusinessCenterNearbyPlace> & { name: string }): BusinessCenterNearbyPlace {
  return {
    id: overrides.name,
    businessCenterSlug: 'port',
    sourcePlaceId: overrides.name,
    category: 'shop',
    subcategory: null,
    address: null,
    lat: 53.9,
    lng: 27.6,
    distanceMeters: 100,
    source: 'yandex_maps',
    sourceUrl: null,
    collectedAt: '2026-09-20T10:00:00Z',
    ...overrides,
  };
}

describe('группировка инфраструктуры', () => {
  it('сортирует категории по смыслу, а не по алфавиту, и точки — по расстоянию', () => {
    const groups = groupNearbyPlaces([
      place({ name: 'Фитнес', category: 'fitness' }),
      place({ name: 'Дальняя аптека', category: 'pharmacy', distanceMeters: 400 }),
      place({ name: 'Метро', category: 'metro', distanceMeters: 1200 }),
      place({ name: 'Ближняя аптека', category: 'pharmacy', distanceMeters: 120 }),
    ]);
    expect(groups.map((group) => group.category)).toEqual(['metro', 'pharmacy', 'fitness']);
    expect(groups[1].places.map((p) => p.name)).toEqual(['Ближняя аптека', 'Дальняя аптека']);
  });

  it('пустой список не даёт пустых групп', () => {
    expect(groupNearbyPlaces([])).toEqual([]);
  });
});

describe('метры', () => {
  it('до километра — метры, дальше — километры с одним знаком', () => {
    expect(formatMeters(450)).toBe('450 м');
    expect(formatMeters(1000)).toBe('1 км');
    expect(formatMeters(1240)).toBe('1,2 км');
  });
});

describe('слияние станций метро', () => {
  it('одна станция из двух источников не задваивается, расстояние берётся меньшее', () => {
    const merged = mergeMetroStations(
      [{ name: 'Тракторный завод', distanceMeters: 900, line: 'Автозаводская линия', color: '#f00' }],
      [place({ name: 'метро Тракторный завод', category: 'metro', distanceMeters: 840 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ name: 'Тракторный завод', distanceMeters: 840, line: 'Автозаводская линия' });
  });

  it('станция только из снимка тоже попадает в список и сортируется по расстоянию', () => {
    const merged = mergeMetroStations(
      [{ name: 'Партизанская', distanceMeters: 1500, line: null, color: null }],
      [place({ name: 'Автозаводская', category: 'metro', distanceMeters: 700 })],
    );
    expect(merged.map((station) => station.name)).toEqual(['Автозаводская', 'Партизанская']);
  });
});

describe('источники и дата снимка', () => {
  it('переводит коды источников в человеческие названия без повторов', () => {
    expect(
      nearbySourceLabels([place({ name: 'а', source: 'yandex_maps' }), place({ name: 'б', source: 'yandex_maps' }), place({ name: 'в', source: '2gis' })]),
    ).toEqual(['2ГИС', 'Яндекс.Карты']);
  });

  it('берёт самую свежую дату и переживает мусор в поле', () => {
    const latest = latestCollectedAt([
      place({ name: 'а', collectedAt: '2026-09-01T00:00:00Z' }),
      place({ name: 'б', collectedAt: 'не дата' }),
      place({ name: 'в', collectedAt: '2026-09-18T00:00:00Z' }),
    ]);
    expect(latest?.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    expect(latestCollectedAt([])).toBeNull();
  });
});

describe('строки для FAQ', () => {
  it('на каждую категорию — количество и ближайший объект', () => {
    expect(
      nearbyFaqLines([
        place({ name: 'Евроопт', category: 'grocery', distanceMeters: 300 }),
        place({ name: 'Соседи', category: 'grocery', distanceMeters: 150 }),
      ]),
    ).toEqual(['Продукты: 2, ближайший — «Соседи», 150 м']);
  });
});
