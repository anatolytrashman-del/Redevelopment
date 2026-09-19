import { describe, it, expect } from 'vitest';
import { fallbackBusinessCenterMeta } from './pageMeta';

// Замер Wordstat 18.08–18.09.2026 («бизнес центр минск», 547 запросов в
// месяц) показал, что спрос сформулирован именем здания, адресом и «что там
// есть», а отраслевыми словами — ноль раз. Отсюда два требования к
// сниппету, которые и проверяются ниже: адрес ровно один раз и состав
// здания раньше класса с площадью.
// Внимание: toLocaleString('ru-RU') разделяет разряды НЕРАЗРЫВНЫМ пробелом
// (U+00A0), поэтому в ожидаемых строках ниже стоит \u00a0, а не обычный пробел.
const PORT = {
  name: 'Бизнес-центр «Порт»',
  address: 'г. Минск, пр-т Независимости, 177',
  businessClass: 'B+',
  totalArea: 35000,
  yearBuilt: 2011,
  status: 'built',
};

describe('fallbackBusinessCenterMeta', () => {
  it('ставит адрес в title целиком', () => {
    const meta = fallbackBusinessCenterMeta(PORT);
    expect(meta.title).toBe('Бизнес-центр «Порт» — г. Минск, пр-т Независимости, 177');
  });

  it('в описании не дублирует город: «в Минске» плюс адрес без «г. Минск»', () => {
    const meta = fallbackBusinessCenterMeta(PORT);
    expect(meta.description).toBe(
      'Бизнес-центр в Минске: класс B+, 35\u00a0000 м², сдан в 2011 г., пр-т Независимости, 177.',
    );
  });

  it('выносит состав здания вперёд и не повторяет адрес дважды', () => {
    const meta = fallbackBusinessCenterMeta(PORT, {
      organizationCount: 63,
      infrastructure: ['банк', 'банкомат', 'кофепоинт', 'магазин'],
    });
    expect(meta.description).toBe(
      'Бизнес-центр в Минске, пр-т Независимости, 177. В здании 63 организации: банк, банкомат, кофепоинт, магазин. Класс B+, 35\u00a0000 м², сдан в 2011 г.',
    );
    // Адрес ровно один раз: бюджет сниппета ~160 знаков.
    expect(meta.description.split('пр-т Независимости').length - 1).toBe(1);
  });

  it('склоняет «организация» по числу', () => {
    const forCount = (organizationCount: number) =>
      fallbackBusinessCenterMeta(PORT, { organizationCount, infrastructure: [] }).description;
    expect(forCount(1)).toContain('В здании 1 организация.');
    expect(forCount(3)).toContain('В здании 3 организации.');
    expect(forCount(11)).toContain('В здании 11 организаций.');
    expect(forCount(21)).toContain('В здании 21 организация.');
  });

  it('обрезает инфраструктуру до четырёх пунктов', () => {
    const meta = fallbackBusinessCenterMeta(PORT, {
      organizationCount: 63,
      infrastructure: ['банк', 'банкомат', 'кофепоинт', 'магазин', 'фитнес-центр'],
    });
    expect(meta.description).not.toContain('фитнес-центр');
  });

  it('обходится одним числом организаций, когда инфраструктура не заполнена', () => {
    const meta = fallbackBusinessCenterMeta(
      { ...PORT, name: 'Бизнес-центр «Аякс» (Ajax)', businessClass: 'A', totalArea: 22454, yearBuilt: 2020 },
      { organizationCount: 16, infrastructure: [] },
    );
    expect(meta.description).toContain('В здании 16 организаций.');
    expect(meta.description).toContain('Класс A');
  });

  it('у строящегося здания пишет про ожидаемую сдачу', () => {
    const meta = fallbackBusinessCenterMeta(
      { ...PORT, status: 'under_construction', yearBuilt: 2027 },
      { organizationCount: 0, infrastructure: [] },
    );
    expect(meta.description).toContain('сдача в 2027 г.');
  });
});
