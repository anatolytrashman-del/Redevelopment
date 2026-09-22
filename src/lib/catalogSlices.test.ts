import { describe, expect, it } from 'vitest';
import type { BusinessCenter } from '../data/businessCenters';
import { classSlices, districtSlices, metroSlices, statusSlices } from './catalogSlices';

// Меню каталога (CatalogTopNav) и блок «Срезы каталога» строятся по этим
// функциям. Главное, что здесь проверяется, — оси считаются ПО ДАННЫМ, а не
// по картам слагов в businessCenterHubs.ts: те шире (в них есть станции и
// районы, где сегодня ни одного здания нет), и пункт меню на пустой хаб —
// ссылка на пустую страницу.

function center(patch: Partial<BusinessCenter>): BusinessCenter {
  return {
    district: null,
    businessClass: null,
    status: 'built',
    nearestMetroStations: [],
    address: '',
    microdistrict: null,
    ...patch,
  } as unknown as BusinessCenter;
}

describe('districtSlices', () => {
  it('считает здания по районам и не выдумывает пустые', () => {
    const slices = districtSlices([
      center({ district: 'Московский' }),
      center({ district: 'Московский' }),
      center({ district: 'Советский' }),
    ]);
    expect(slices.map((s) => [s.label, s.count, s.url])).toEqual([
      ['Московский', 2, '/minsk/bcminsk/raion/moskovsky'],
      ['Советский', 1, '/minsk/bcminsk/raion/sovetsky'],
    ]);
  });

  it('«Великий камень» идёт последним — это не район Минска', () => {
    const slices = districtSlices([
      center({ district: 'Великий камень' }),
      center({ district: 'Центральный' }),
      center({ district: 'Заводской' }),
    ]);
    expect(slices.map((s) => s.label)).toEqual(['Заводской', 'Центральный', 'Великий камень']);
  });

  it('район без slug в выдачу не попадает', () => {
    expect(districtSlices([center({ district: 'Выдуманный' })])).toEqual([]);
  });
});

describe('classSlices', () => {
  it('держит порядок A → B+ → B → C независимо от порядка данных', () => {
    const slices = classSlices([
      center({ businessClass: 'C' }),
      center({ businessClass: 'A' }),
      center({ businessClass: 'B+' }),
    ]);
    expect(slices.map((s) => s.label)).toEqual(['Класс A', 'Класс B+', 'Класс C']);
    expect(slices[0].url).toBe('/minsk/bcminsk/class/a');
  });

  it('класс без зданий в меню не показывается', () => {
    expect(classSlices([center({ businessClass: 'A' })]).map((s) => s.key)).toEqual(['A']);
  });
});

describe('metroSlices', () => {
  const station = (name: string, distanceMeters: number) => ({
    name,
    distanceMeters,
    line: 'Московская линия',
    color: '#0064AF',
  });

  const nearAndFar = [
    center({ nearestMetroStations: [station('Немига', 400), station('Купаловская', 900)] }),
    center({ nearestMetroStations: [station('Немига', 1200)] }),
    // Дальше радиуса хаба (1500 м) — на страницу станции не попадает.
    center({ nearestMetroStations: [station('Московская', 1800)] }),
  ];

  it('одно здание попадает сразу на несколько станций, дальние не считаются', () => {
    const slices = metroSlices(nearAndFar, 'alpha');
    expect(slices.map((s) => [s.label, s.count])).toEqual([
      ['Купаловская', 1],
      ['Немига', 2],
    ]);
  });

  it('по умолчанию сортирует по числу зданий, по alpha — по алфавиту', () => {
    expect(metroSlices(nearAndFar).map((s) => s.label)).toEqual(['Немига', 'Купаловская']);
    expect(metroSlices(nearAndFar, 'alpha').map((s) => s.label)).toEqual(['Купаловская', 'Немига']);
  });
});

describe('statusSlices', () => {
  it('весь каталог плюс стройки, когда они есть', () => {
    const slices = statusSlices([center({}), center({ status: 'under_construction' })]);
    expect(slices.map((s) => [s.key, s.count])).toEqual([
      ['all', 2],
      ['under_construction', 1],
    ]);
    expect(slices[1].url).toBe('/minsk/bcminsk/stroyashchiesya');
  });

  it('без строек пункт «Строящиеся» не показывается — хаб был бы пустым', () => {
    expect(statusSlices([center({})]).map((s) => s.key)).toEqual(['all']);
  });
});
