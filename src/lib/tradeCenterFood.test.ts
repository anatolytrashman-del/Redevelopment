import { describe, expect, it } from 'vitest';
import type { RetailFoodInfo, RetailFoodPlace } from '../data/businessCenters';
import { foodMenuStats, foodMenuVisibleCounts, latestClosing, placeHoursShort } from './tradeCenterFood';
import { groupFoodPlaces } from './tradeCenterRetail';

const place = (over: Partial<RetailFoodPlace>): RetailFoodPlace => ({ name: 'X', type: 'cafe', cuisine: null, floor: null, inFoodcourt: null, yandexUrl: null, note: null, ...over });
const food = (places: RetailFoodPlace[], zones: RetailFoodInfo['zones'] = []): RetailFoodInfo => ({ summary: null, zones, places });

describe('placeHoursShort', () => {
  it('shortens hours and drops the source', () => {
    expect(placeHoursShort('Ежедневно 9:00–22:00 (Яндекс Карты, сентябрь 2026)')).toBe('9–22');
    expect(placeHoursShort('по будням до 23:00, в остальные дни до 22:00')).toBe('до 23');
    expect(placeHoursShort('10:30-21:00')).toBe('10:30–21');
    expect(placeHoursShort('пиво собственной пивоварни, бизнес-ланч в будни 12:00–16:00, 10:00–23:00')).toBe('10–23');
    expect(placeHoursShort('10:00–20:00 ежедневно; горячие обеды 12:00–16:00')).toBe('10–20');
    expect(placeHoursShort('РБО «Пит Stop» — сеть заведений')).toBeNull();
  });
});

describe('foodMenuStats', () => {
  it('counts places, floors and the latest closing', () => {
    const korona = food([
      place({ floor: '1', note: 'Ежедневно 9:00–22:00' }),
      place({ floor: '1', note: 'по будням до 23:00' }),
      place({ floor: '2' }),
      place({ floor: '2', note: 'Ежедневно 10:00–21:00' }),
    ]);
    expect(latestClosing(korona)).toBe('23:00');
    expect(foodMenuStats(korona)).toEqual([
      { value: '4', label: 'заведения' },
      { value: '1–2', label: 'этажи' },
      { value: 'до 23:00', label: 'открыто дольше всех' },
    ]);
  });
  it('lists gaps between floors', () => {
    expect(foodMenuStats(food([place({ floor: '-1' }), place({ floor: '1' }), place({ floor: '6', inFoodcourt: true })])).map((s) => s.value)).toEqual(['3', '1', '−1, 1, 6']);
    expect(foodMenuStats(food([place({ floor: '1' }), place({ floor: '6' })])).map((s) => s.value)).toEqual(['2', '1, 6']);
    expect(foodMenuStats(food(['-1', '1', '2', '6', '21'].map((floor) => place({ floor })))).at(-1)).toEqual({ value: '5', label: 'этажей с едой' });
  });
});

describe('foodMenuVisibleCounts', () => {
  it('shows small lists in full and trims big groups to six', () => {
    const small = groupFoodPlaces(Array.from({ length: 10 }, (_, i) => place({ name: `a${i}`, type: 'fastfood' })));
    expect(foodMenuVisibleCounts(small)).toEqual([10]);
    const big = groupFoodPlaces([...Array.from({ length: 16 }, (_, i) => place({ name: `f${i}`, type: 'fastfood' })), ...Array.from({ length: 7 }, (_, i) => place({ name: `c${i}`, type: 'coffee' }))]);
    expect(foodMenuVisibleCounts(big)).toEqual([6, 7]);
  });
});
