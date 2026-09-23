import { describe, expect, it } from 'vitest';
import type { RetailFigureEntry, RetailInfo, RetailParking, RetailRankingEntry } from '../data/businessCenters';
import {
  anchorsFaqAnswer,
  audienceFaqQuestion,
  eventsFaqAnswer,
  figureMeta,
  figuresFaqAnswer,
  hoursFaqAnswer,
  loyaltyFaqAnswer,
  parkingFaqAnswer,
  parkingFaqQuestion,
  pitchFaqAnswer,
  quotesFaqAnswer,
  retailSectionGroup,
  retailSectionSize,
  rulesFaqAnswer,
  servicesFaqAnswer,
  sortTransport,
  transportFaqAnswer,
  transportFaqQuestion,
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

// --- Дополнительные блоки (extras-schema, 2026-09-23) ----------------------

const noSrc = { source: null, sourceUrl: null };

describe('normalizeRetailInfo — дополнительные ключи', () => {
  it('старые записи без новых ключей получают пустые массивы и null', () => {
    const info = normalizeRetailInfo({ floorsGuide: [{ floor: '1', text: 'Продукты' }] });
    expect(info).toMatchObject({
      hours: [],
      hoursNote: null,
      parking: null,
      transport: [],
      services: [],
      rules: [],
      loyalty: [],
      events: [],
      audience: [],
      leasing: null,
      advertising: null,
      numbers: [],
      quotes: [],
    });
  });

  it('одни только новые ключи — уже не null', () => {
    expect(normalizeRetailInfo({ hoursNote: 'В праздники до 20:00' })?.hoursNote).toBe('В праздники до 20:00');
    expect(retailSectionIds(normalizeRetailInfo({ quotes: [{ who: 'Директор', text: 'Мы открылись' }] }))).toEqual([
      'quotes',
    ]);
  });

  it('пустые и кривые новые ключи — по-прежнему null', () => {
    expect(
      normalizeRetailInfo({
        hours: [{ zone: 'Галерея' }, 'x', null],
        hoursNote: '  ',
        parking: { summary: '', items: [{ label: 'Мест' }] },
        transport: [{ mode: 'rocket', text: 'Ракета' }, { mode: 'bus' }],
        services: [{ text: 'без имени' }],
        rules: [{}],
        loyalty: [{ text: 'без имени' }],
        events: [{ text: 'без имени' }],
        audience: [{ label: 'Посещаемость' }, { value: '40 000' }],
        leasing: { text: '', points: [] },
        advertising: [],
        numbers: [{ label: 'Магазинов', value: '' }],
        quotes: [{ who: 'Аноним' }, { text: 'Без автора' }],
      }),
    ).toBeNull();
  });

  it('разбирает полные записи, числа приводит к строкам, неполные отбрасывает', () => {
    const info = normalizeRetailInfo({
      hours: [
        { zone: 'Торговая галерея', value: 'ежедневно 10:00–22:00', note: null, source: 'Сайт ТЦ', sourceUrl: 'https://tc.by' },
        { zone: 'Кинотеатр' },
      ],
      parking: {
        summary: 'Подземный паркинг на 685 мест.',
        items: [{ label: 'Мест', value: 685 }, { label: 'Первые 3 часа' }],
        date: '2026-03',
      },
      transport: [
        { mode: 'bus', text: 'Автобусы 1, 38' },
        { mode: 'metro', text: 'Метро «Немига», 10 минут пешком' },
      ],
      services: [{ name: 'Wi-Fi', text: null, floor: 2 }],
      rules: [{ text: 'Можно с собаками на руках' }, 'Нельзя кататься на самокатах'],
      leasing: { text: 'Сдают торговые площади.', points: ['Индексация раз в год', '', 42], contacts: 'lease@tc.by' },
      audience: [{ label: 'Посещаемость', value: '40 000 в день', note: 'по данным ТЦ' }],
    });
    expect(info).not.toBeNull();
    expect(info!.hours).toHaveLength(1);
    expect(info!.parking).toEqual({
      summary: 'Подземный паркинг на 685 мест.',
      items: [{ label: 'Мест', value: '685' }],
      date: '2026-03',
      source: null,
      sourceUrl: null,
    });
    expect(info!.transport.map((t) => t.mode)).toEqual(['bus', 'metro']);
    expect(info!.services[0].floor).toBe('2');
    // Правило — объект с text; голую строку схема не предусматривает.
    expect(info!.rules.map((r) => r.text)).toEqual(['Можно с собаками на руках']);
    expect(info!.leasing!.points).toEqual(['Индексация раз в год']);
    expect(info!.audience[0]).toMatchObject({ value: '40 000 в день', date: null, note: 'по данным ТЦ' });
    expect(retailSectionIds(info)).toEqual(['visit', 'business']);
  });
});

describe('разделы и размеры', () => {
  const base = normalizeRetailInfo({ hoursNote: 'x' }) as RetailInfo;
  it('группы: посетитель и бизнес', () => {
    expect(retailSectionGroup('floors')).toBe('visitor');
    expect(retailSectionGroup('visit')).toBe('visitor');
    expect(retailSectionGroup('business')).toBe('business');
    expect(retailSectionGroup('quotes')).toBe('business');
  });

  it('размер карточки посетителя — строки пополам на две колонки', () => {
    const info: RetailInfo = {
      ...base,
      hoursNote: null,
      hours: [1, 2, 3].map((n) => ({ zone: `З${n}`, value: '10–22', note: null, ...noSrc })),
      transport: [{ mode: 'bus', text: 'Автобус', ...noSrc }],
    };
    // (3 + 1) + (1 + 1) = 6 → 3
    expect(retailSectionSize(info, 'visit')).toBe(3);
    expect(retailSectionSize(null, 'visit')).toBe(0);
  });
});

describe('ответы FAQ — посетителю', () => {
  it('режим работы: зоны строками, пометка в конце', () => {
    expect(
      hoursFaqAnswer(
        [
          { zone: 'Галерея', value: 'ежедневно 10:00–22:00', note: null, ...noSrc },
          { zone: 'Кинотеатр', value: 'до 01:30', note: 'по выходным', ...noSrc },
        ],
        'В праздники режим может меняться',
      ),
    ).toBe('Галерея: ежедневно 10:00–22:00.\nКинотеатр: до 01:30 (по выходным).\nВ праздники режим может меняться.');
    expect(hoursFaqAnswer([], null)).toBeNull();
  });

  const parking = (over: Partial<RetailParking> = {}): RetailParking => ({
    summary: 'Паркинг на 685 мест.',
    items: [],
    date: null,
    ...noSrc,
    ...over,
  });

  it('вопрос о парковке — только о том, на что есть ответ', () => {
    expect(
      parkingFaqQuestion(
        parking({ items: [{ label: 'Первые 3 часа', value: '5 руб.' }, { label: 'Бесплатно', value: '3 часа по чеку' }] }),
        'ТЦ',
      ),
    ).toBe('Сколько стоит парковка у ТЦ и можно ли встать бесплатно?');
    expect(parkingFaqQuestion(parking({ items: [{ label: 'Час', value: '2 BYN' }] }), 'ТЦ')).toBe(
      'Сколько стоит парковка у ТЦ?',
    );
    expect(parkingFaqQuestion(parking({ summary: 'Парковка бесплатная.' }), 'ТЦ')).toBe(
      'Есть ли бесплатная парковка у ТЦ?',
    );
    expect(parkingFaqQuestion(parking(), 'ТЦ')).toBe('Что известно о парковке у ТЦ?');
    expect(parkingFaqQuestion(null, 'ТЦ')).toBeNull();
  });

  it('ответ о парковке: сводка, пары и дата', () => {
    expect(parkingFaqAnswer(parking({ items: [{ label: 'Мест', value: '685' }], date: '2026-03-01' }))).toBe(
      'Паркинг на 685 мест.\nМест: 685.\nТарифы — по данным на март 2026.',
    );
  });

  it('транспорт: метро первым, вопрос по видам', () => {
    const t = [
      { mode: 'car' as const, text: 'С МКАД', ...noSrc },
      { mode: 'metro' as const, text: 'Станция «Немига»', ...noSrc },
    ];
    expect(sortTransport(t).map((x) => x.mode)).toEqual(['metro', 'car']);
    expect(transportFaqAnswer(t)).toBe('Метро: Станция «Немига».\nНа машине: С МКАД.');
    expect(transportFaqQuestion(t, 'ТЦ')).toBe('Каким транспортом доехать до ТЦ?');
    expect(transportFaqQuestion([t[0]], 'ТЦ')).toBe('Как добраться до ТЦ?');
    expect(transportFaqQuestion([], 'ТЦ')).toBeNull();
  });

  it('удобства с этажом, правила, лояльность и события', () => {
    expect(
      servicesFaqAnswer([
        { name: 'Комната матери и ребёнка', text: 'пеленальный столик', floor: '2', ...noSrc },
        { name: 'Wi-Fi', text: null, floor: null, ...noSrc },
      ]),
    ).toBe('Комната матери и ребёнка (2 этаж) — пеленальный столик.\nWi-Fi.');
    expect(rulesFaqAnswer([{ text: 'Коляски — бесплатно', ...noSrc }])).toBe('Коляски — бесплатно.');
    expect(loyaltyFaqAnswer([{ name: 'Карта «Замок»', text: 'кешбэк 3%', ...noSrc }])).toBe('Карта «Замок» — кешбэк 3%.');
    expect(eventsFaqAnswer([{ name: 'Фитнес на крыше', text: 'по субботам летом', date: '2024', ...noSrc }])).toBe(
      'Фитнес на крыше (2024) — по субботам летом.',
    );
    expect(servicesFaqAnswer([])).toBeNull();
  });
});

describe('ответы FAQ — для бизнеса', () => {
  const fig = (over: Partial<RetailFigureEntry> = {}): RetailFigureEntry => ({
    label: 'Посещаемость',
    value: '40 000 человек в день',
    date: '2025',
    note: 'по данным ТЦ',
    ...noSrc,
    ...over,
  });

  it('цифра с датой и пометкой', () => {
    expect(figureMeta(fig())).toBe('2025 · по данным ТЦ');
    expect(figureMeta(fig({ date: null, note: null }))).toBeNull();
    expect(figuresFaqAnswer([fig()])).toBe('Посещаемость — 40 000 человек в день (2025, по данным ТЦ).');
  });

  it('«сколько посетителей» — только если есть посещаемость', () => {
    expect(audienceFaqQuestion([fig()], 'ТЦ')).toBe('Сколько посетителей бывает в ТЦ?');
    expect(audienceFaqQuestion([fig({ label: 'Доля женщин', value: '64%' })], 'ТЦ')).toBe('Кто ходит в ТЦ?');
    expect(audienceFaqQuestion([], 'ТЦ')).toBeNull();
  });

  it('аренда/реклама: текст, пункты, контакты строками', () => {
    expect(
      pitchFaqAnswer({ text: 'Сдают торговые площади', points: ['Индексация раз в год'], contacts: 'lease@tc.by', ...noSrc }),
    ).toBe('Сдают торговые площади.\nИндексация раз в год.\nКонтакты: lease@tc.by.');
    expect(pitchFaqAnswer(null)).toBeNull();
  });

  it('цитаты — без двойных кавычек', () => {
    expect(quotesFaqAnswer([{ who: 'Директор ТЦ', text: '«Мы открылись»', date: '2019-03', ...noSrc }])).toBe(
      '«Мы открылись» — Директор ТЦ, март 2019.',
    );
  });
});
