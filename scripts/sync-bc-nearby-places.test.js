import { describe, expect, it } from 'vitest';
import {
  categoryForItem,
  dedupePlaces,
  haversineMeters,
  placeKey,
  radiusFor,
  spanForRadius,
} from './sync-bc-nearby-places.mjs';

describe('радиусы по категориям', () => {
  it('метро и остановки шире, чем магазины', () => {
    expect(radiusFor('metro')).toBe(2000);
    expect(radiusFor('transport_stop')).toBe(800);
    expect(radiusFor('pharmacy')).toBe(500);
    expect(radiusFor('неизвестно')).toBe(500);
  });
});

describe('окно поиска', () => {
  it('по долготе окно шире, чем по широте (косинус широты Минска)', () => {
    const { latSpan, lngSpan } = spanForRadius(53.9, 500);
    expect(latSpan).toBeCloseTo(0.00898, 4);
    expect(lngSpan).toBeGreaterThan(latSpan * 1.5);
  });
});

describe('расстояние', () => {
  it('считает километр по прямой с точностью до метров', () => {
    expect(haversineMeters({ lat: 53.9, lng: 27.6 }, { lat: 53.909, lng: 27.6 })).toBe(1001);
    expect(haversineMeters({ lat: 53.9, lng: 27.6 }, { lat: 53.9, lng: 27.6 })).toBe(0);
  });
});

describe('категория точки', () => {
  it('рубрика Яндекса важнее запроса: по запросу «магазин» приезжают аптеки', () => {
    expect(categoryForItem(['pharmacy'], 'shop')).toBe('pharmacy');
  });

  it('незнакомая рубрика оставляет категорию запроса', () => {
    expect(categoryForItem(['tattoo'], 'shop')).toBe('shop');
    expect(categoryForItem(undefined, 'cafe')).toBe('cafe');
  });
});

describe('дедупликация', () => {
  it('одна точка из двух запросов остаётся одна, с меньшим расстоянием', () => {
    const rows = dedupePlaces([
      { source_place_id: '1', lat: 53.9, lng: 27.6, distance_meters: 300 },
      { source_place_id: '1', lat: 53.9, lng: 27.6, distance_meters: 280 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].distance_meters).toBe(280);
  });

  it('точка без id (остановки у Яндекса часто без него) ключуется координатами', () => {
    expect(placeKey({ source_place_id: '', lat: 53.912345, lng: 27.612345 })).toBe('53.91235,27.61235');
    const rows = dedupePlaces([
      { source_place_id: '', lat: 53.912345, lng: 27.612345, distance_meters: 120 },
      { source_place_id: '', lat: 53.912345, lng: 27.612345, distance_meters: 120 },
      { source_place_id: '', lat: 53.95, lng: 27.62, distance_meters: 400 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.distance_meters)).toEqual([120, 400]);
  });
});
