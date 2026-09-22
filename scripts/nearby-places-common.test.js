import { describe, expect, it } from 'vitest';
import {
  categoryFromRubric,
  dedupePlaces,
  haversineMeters,
  placeKey,
  radiusFor,
} from './nearby-places-common.mjs';

describe('радиусы по категориям', () => {
  it('остановки шире, метро — на общих основаниях с остальным', () => {
    expect(radiusFor('transport_stop')).toBe(800);
    expect(radiusFor('metro')).toBe(850);
    expect(radiusFor('pharmacy')).toBe(850);
    expect(radiusFor('неизвестно')).toBe(850);
  });
});

describe('расстояние', () => {
  it('считает километр по прямой с точностью до метров', () => {
    expect(haversineMeters({ lat: 53.9, lng: 27.6 }, { lat: 53.909, lng: 27.6 })).toBe(1001);
    expect(haversineMeters({ lat: 53.9, lng: 27.6 }, { lat: 53.9, lng: 27.6 })).toBe(0);
  });
});

describe('категория по рубрике', () => {
  it('различает то, что путается по одному слову', () => {
    expect(categoryFromRubric('Банкомат', 'bank')).toBe('atm');
    expect(categoryFromRubric('Банк', 'shop')).toBe('bank');
    expect(categoryFromRubric('Продуктовый магазин', 'shop')).toBe('grocery');
    expect(categoryFromRubric('Магазин одежды', 'grocery')).toBe('shop');
    expect(categoryFromRubric('Станция метро', 'transport_stop')).toBe('metro');
    expect(categoryFromRubric('Остановка общественного транспорта', 'shop')).toBe('transport_stop');
  });

  it('пустая или незнакомая рубрика оставляет категорию запроса', () => {
    expect(categoryFromRubric('', 'cafe')).toBe('cafe');
    expect(categoryFromRubric(null, 'cafe')).toBe('cafe');
    expect(categoryFromRubric('Тату-салон', 'shop')).toBe('shop');
  });

  it('кафе и рестораны — одна категория, кофейни выделены отдельно', () => {
    expect(categoryFromRubric('Ресторан · бар · charli · business', 'cafe')).toBe('cafe');
    expect(categoryFromRubric('Кафе · ресторан · пиццерия · family_club · business', 'cafe')).toBe('cafe');
    expect(categoryFromRubric('Кофейня · met_tea · business', 'cafe')).toBe('coffee');
    // «Кафе · кофейня · пекарня» (реальная рубрика «Paul» на живой выдаче) —
    // кофейня должна выигрывать у общего «кафе», а не потеряться в нём.
    expect(categoryFromRubric('Кафе · кофейня · пекарня · paul · business', 'cafe')).toBe('coffee');
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

  it('прямое попадание с настоящей рубрикой побеждает «похожего рядом» с тем же расстоянием', () => {
    // Живой случай 2026-09-21: «Кухмистр» (ресторан) всплыл «похожим» под
    // запросом «кофейня» (без рубрики, только слаг) РАНЬШЕ, чем нашёлся
    // прямым попаданием под «кафе»/«ресторан» — расстояние в обоих случаях
    // одинаковое, порядок запросов чуть не отдал победу первой, неверной
    // записи.
    const rows = dedupePlaces([
      {
        source_place_id: '1295125111', lat: 53.90153, lng: 27.56555, distance_meters: 433,
        category: 'coffee', subcategory: 'kukhmistr · similar', _reliableCategory: false,
      },
      {
        source_place_id: '1295125111', lat: 53.90153, lng: 27.56555, distance_meters: 433,
        category: 'cafe', subcategory: 'Ресторан · кафе · бар · kukhmistr · business', _reliableCategory: true,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('cafe');
    expect(rows[0]._reliableCategory).toBeUndefined();
  });
});
