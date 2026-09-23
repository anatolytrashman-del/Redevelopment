import { describe, expect, it } from 'vitest';
import type { RetailRankingEntry } from '../data/businessCenters';
import {
  anchorsFaqAnswer,
  collectRetailSources,
  floorsFaqAnswer,
  floorSortKey,
  formatFloorBadge,
  formatFloorLabel,
  formatRankingLine,
  formatRetailDate,
  leisureFaqQuestion,
  normalizeRetailInfo,
  retailSectionIds,
  sortFloorsTopDown,
} from './tradeCenterRetail';

const ranking = (over: Partial<RetailRankingEntry> = {}): RetailRankingEntry => ({
  place: 4,
  criterion: 'по арендопригодной площади',
  scope: 'среди ТЦ Минска',
  total: null,
  year: 2025,
  source: 'Onliner',
  sourceUrl: 'https://realt.onliner.by/2025/01/01/tc',
  ...over,
});

describe('floorSortKey', () => {
  it('берёт первое число строки, минус — только перед числом', () => {
    expect(floorSortKey('-1')).toBe(-1);
    expect(floorSortKey('−2')).toBe(-2);
    expect(floorSortKey('2–3')).toBe(2);
    expect(floorSortKey('2-3')).toBe(2);
    expect(floorSortKey('6')).toBe(6);
    expect(floorSortKey('цоколь')).toBeNull();
  });
});

describe('sortFloorsTopDown', () => {
  it('сверху вниз: верхний первым, подземные и безномерные в конце', () => {
    const floors = ['1', '-1', '2–3', 'цоколь', '6', '−2', '4'].map((floor) => ({ floor }));
    expect(sortFloorsTopDown(floors).map((f) => f.floor)).toEqual(['6', '4', '2–3', '1', '-1', '−2', 'цоколь']);
  });

  it('не меняет исходный массив', () => {
    const floors = [{ floor: '1' }, { floor: '2' }];
    sortFloorsTopDown(floors);
    expect(floors.map((f) => f.floor)).toEqual(['1', '2']);
  });
});

describe('formatFloorBadge / formatFloorLabel', () => {
  it('типографский минус и тире в диапазоне', () => {
    expect(formatFloorBadge('-1')).toBe('−1');
    expect(formatFloorBadge('2-3')).toBe('2–3');
    expect(formatFloorBadge('6')).toBe('6');
  });

  it('подпись этажа для FAQ', () => {
    expect(formatFloorLabel('1')).toBe('1 этаж');
    expect(formatFloorLabel('-1')).toBe('−1 этаж');
    expect(formatFloorLabel('2–3')).toBe('2–3 этажи');
    expect(formatFloorLabel('цоколь')).toBe('цоколь');
  });
});

describe('formatRetailDate', () => {
  it('месяц и год, либо только год', () => {
    expect(formatRetailDate('2019-03-15')).toBe('март 2019');
    expect(formatRetailDate('2019-03')).toBe('март 2019');
    expect(formatRetailDate('2019-12-01T00:00:00Z')).toBe('декабрь 2019');
    expect(formatRetailDate('2019')).toBe('2019');
  });

  it('пусто — null, непонятное — как есть', () => {
    expect(formatRetailDate(null)).toBeNull();
    expect(formatRetailDate('  ')).toBeNull();
    expect(formatRetailDate('весна 2019')).toBe('весна 2019');
  });
});

describe('formatRankingLine', () => {
  it('место, критерий, охват, источник и год', () => {
    expect(formatRankingLine(ranking())).toBe('4-й по арендопригодной площади среди ТЦ Минска (Onliner, 2025)');
  });

  it('с total и без года/источника', () => {
    expect(formatRankingLine(ranking({ total: 30, year: null }))).toBe(
      '4-й из 30 по арендопригодной площади среди ТЦ Минска (Onliner)',
    );
    expect(formatRankingLine(ranking({ source: null, year: null }))).toBe(
      '4-й по арендопригодной площади среди ТЦ Минска',
    );
  });

  it('форма для FAQ — «4-е место»', () => {
    expect(formatRankingLine(ranking({ total: 30 }), 'place')).toBe(
      '4-е место из 30 по арендопригодной площади среди ТЦ Минска (Onliner, 2025)',
    );
  });
});

describe('normalizeRetailInfo', () => {
  it('пусто или не объект — null (так у всех БЦ)', () => {
    expect(normalizeRetailInfo(null)).toBeNull();
    expect(normalizeRetailInfo(undefined)).toBeNull();
    expect(normalizeRetailInfo([])).toBeNull();
    expect(normalizeRetailInfo({})).toBeNull();
    expect(normalizeRetailInfo({ floorsGuide: [], firsts: null })).toBeNull();
  });

  it('отсутствующие массивы — пустые, неполные записи отброшены', () => {
    const info = normalizeRetailInfo({
      floorsGuide: [{ floor: '1', text: 'Продукты' }, { floor: '2' }],
      firsts: [{ kind: 'first', name: 'Zara Home', text: '', date: '2019-03' }, { kind: 'bogus', name: 'X' }],
      ranking: [{ place: 4, criterion: 'по площади', scope: 'среди ТЦ Минска', year: 2025 }],
    });
    expect(info).not.toBeNull();
    expect(info!.floorsGuide).toEqual([{ floor: '1', text: 'Продукты', date: null, source: null, sourceUrl: null }]);
    expect(info!.firsts.map((f) => f.name)).toEqual(['Zara Home']);
    expect(info!.leisure).toEqual([]);
    expect(info!.ranking[0]).toMatchObject({ place: 4, total: null, year: 2025 });
    expect(retailSectionIds(info)).toEqual(['floors', 'firsts']);
  });
});

describe('collectRetailSources', () => {
  it('без дублей по адресу, подпись — источник или домен', () => {
    const sources = collectRetailSources([
      { source: 'Onliner', sourceUrl: 'https://realt.onliner.by/a' },
      { source: 'Onliner', sourceUrl: 'https://realt.onliner.by/a/' },
      { source: null, sourceUrl: 'https://www.galleria-minsk.by/floors' },
      { source: 'Onliner', sourceUrl: 'https://realt.onliner.by/b' },
      { source: 'Сайт ТЦ', sourceUrl: null },
      { source: null, sourceUrl: null },
    ]);
    expect(sources).toEqual([
      { label: 'Onliner', url: 'https://realt.onliner.by/a' },
      { label: 'galleria-minsk.by', url: 'https://www.galleria-minsk.by/floors' },
      { label: 'Onliner\u00a0(2)', url: 'https://realt.onliner.by/b' },
      { label: 'Сайт ТЦ', url: null },
    ]);
  });
});

describe('leisureFaqQuestion', () => {
  const entry = (kind: 'cinema' | 'food' | 'kids') => ({ kind, name: 'N', text: '', date: null, source: null, sourceUrl: null });
  it('спрашивает только про то, что есть в данных', () => {
    expect(leisureFaqQuestion([entry('cinema'), entry('food')], 'в ТЦ')).toBe('Есть ли в ТЦ кинотеатр и фудкорт?');
    expect(leisureFaqQuestion([entry('cinema')], 'в ТЦ')).toBe('Есть ли в ТЦ кинотеатр?');
    expect(leisureFaqQuestion([entry('kids')], 'в ТЦ')).toBe('Какие развлечения есть в ТЦ?');
    expect(leisureFaqQuestion([], 'в ТЦ')).toBeNull();
  });
});

describe('ответы FAQ', () => {
  const src = { source: null, sourceUrl: null, date: null };
  it('этажи сверху вниз, каждая строка — предложение', () => {
    expect(
      floorsFaqAnswer([
        { floor: '-1', text: 'Гипермаркет «Корона»', ...src },
        { floor: '2-3', text: 'Одежда.', ...src },
      ]),
    ).toBe('2–3 этажи: Одежда.\n−1 этаж: Гипермаркет «Корона».');
    expect(floorsFaqAnswer([])).toBeNull();
  });

  it('якоря и бывшие якоря', () => {
    expect(
      anchorsFaqAnswer([
        { kind: 'anchor', name: 'Корона', text: 'гипермаркет', ...src },
        { kind: 'former_anchor', name: 'Zara', text: '', ...src },
        { kind: 'first', name: 'Massimo Dutti', text: '', ...src },
      ]),
    ).toBe('Корона — гипермаркет.\nРаньше здесь были: Zara.');
  });
});
