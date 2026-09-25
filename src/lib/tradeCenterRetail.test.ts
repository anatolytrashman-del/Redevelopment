import { describe, expect, it } from 'vitest';
import type {
  RetailAnchorEntry,
  RetailAwardEntry,
  RetailFigureEntry,
  RetailInfo,
  RetailParking,
  RetailRankingEntry,
  RetailTimelineEntry,
} from '../data/businessCenters';
import {
  anchorsFaqAnswer,
  anchorsForPage,
  foodFaqAnswer,
  foodPlacesCollapsible,
  foodPlacesVisibleCounts,
  foodSectionSize,
  foodZoneMetrics,
  formatFoodFloor,
  funFaqAnswer,
  funMetaParts,
  funSectionSize,
  groupFoodPlaces,
  hasFoodFun,
  leisureForPage,
  sortFun,
  anchorMetaParts,
  formatAnchorArea,
  retailHistoryFaqAnswer,
  sortTimeline,
  timelineMonth,
  audienceFaqQuestion,
  eventsFaqAnswer,
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
  serviceGroupFromName,
  sortTransport,
  transportFaqAnswer,
  transportFaqQuestion,
  collectRetailSources,
  floorsFaqAnswer,
  floorSortKey,
  formatFloorBadge,
  formatFloorLabel,
  awardDetails,
  awardMeta,
  awardResultLabel,
  awardsFaqAnswer,
  awardsRankingSize,
  awardsRankingTitle,
  rankingFaqAnswer,
  rankingMeta,
  rankingView,
  sortAwards,
  sortRanking,
  formatRetailDate,
  leisureFaqQuestion,
  normalizeRetailInfo,
  vacanciesFaqAnswer,
  retailSectionIds,
  sortFloorsTopDown,
} from './tradeCenterRetail';

const anchor = (over: Partial<RetailAnchorEntry> = {}): RetailAnchorEntry => ({
  name: 'Якорь',
  category: null,
  floor: null,
  area: null,
  since: null,
  text: '',
  yandexUrl: null,
  source: null,
  sourceUrl: null,
  ...over,
});

const step = (over: Partial<RetailTimelineEntry> = {}): RetailTimelineEntry => ({
  date: '2019',
  kind: 'first',
  name: 'Бренд',
  text: '',
  note: null,
  source: null,
  sourceUrl: null,
  ...over,
});

const ranking = (over: Partial<RetailRankingEntry> = {}): RetailRankingEntry => ({
  place: 4,
  criterion: 'арендопригодная площадь (52 000 м²)',
  scope: 'крупнейшие ТЦ Минска',
  total: 10,
  year: 2025,
  headline: null,
  value: null,
  note: null,
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

const award = (over: Partial<RetailAwardEntry> = {}): RetailAwardEntry => ({
  title: 'Realt Golden Key 2014',
  org: 'Realt.by',
  year: '2014',
  category: 'Лучший торговый центр',
  result: 'winner',
  resultText: null,
  subject: null,
  recipient: null,
  text: null,
  confirmed: true,
  source: null,
  sourceUrl: null,
  ...over,
});

describe('рейтинги', () => {
  it('старая запись: значение из скобки критерия, охват отдельно', () => {
    const view = rankingView(ranking());
    expect(view).toMatchObject({
      place: 4,
      total: 10,
      headline: 'Арендопригодная площадь',
      scope: 'крупнейшие ТЦ Минска',
      value: '52 000 м²',
      note: null,
    });
    expect(rankingMeta(view)).toBe('52 000 м² · 2025 · Onliner');
  });

  it('оговорка после точки с запятой в скобке уходит в note', () => {
    const view = rankingView(ranking({ criterion: 'площадь (23 600 м²; какая именно — не уточнено)', year: 2015 }));
    expect(view.value).toBe('23 600 м²');
    expect(view.note).toBe('Какая именно — не уточнено');
  });

  it('новая запись: headline вместо критерия, охват не повторяется', () => {
    const view = rankingView(
      ranking({
        headline: 'Крупнейший ТЦ Минска по арендопригодной площади',
        criterion: 'арендопригодная площадь',
        place: 1,
        value: '68 600 м²',
        note: 'Данные на 2025 год',
      }),
    );
    expect(view).toMatchObject({ headline: 'Крупнейший ТЦ Минска по арендопригодной площади', scope: null, value: '68 600 м²' });
    expect(view.note).toBe('Данные на 2025 год');
  });

  it('без total — «место», свежие выше, внутри года — высокие места', () => {
    expect(rankingView(ranking({ total: null })).total).toBeNull();
    const sorted = sortRanking([ranking({ year: 2015, place: 1 }), ranking({ place: 8 }), ranking({ place: 2 })]);
    expect(sorted.map((r) => `${r.year}:${r.place}`)).toEqual(['2025:2', '2025:8', '2015:1']);
  });

  it('FAQ — тем же порядком и словами, что блок', () => {
    expect(rankingFaqAnswer([ranking({ year: 2015, place: 6 }), ranking({ headline: 'Крупнейший ТЦ Минска', place: 1, value: '68 600 м²', criterion: 'площадь' })])).toBe(
      'Крупнейший ТЦ Минска: 1-е место из 10, 68 600 м² (Onliner, 2025).\n' +
        'Арендопригодная площадь — крупнейшие ТЦ Минска: 6-е место из 10, 52 000 м² (Onliner, 2015).',
    );
    expect(rankingFaqAnswer([])).toBeNull();
  });
});

describe('награды', () => {
  it('победы выше номинаций, внутри яруса — свежие выше', () => {
    const sorted = sortAwards([
      award({ title: 'Н', result: 'nominee', year: '2022' }),
      award({ title: 'П2014', year: '2014' }),
      award({ title: 'Ф', result: 'finalist', year: '2019' }),
      award({ title: 'Д2017', result: 'diploma', year: '2016–2017' }),
      award({ title: 'Без года', result: 'laureate', year: null }),
    ]);
    expect(sorted.map((a) => a.title)).toEqual(['Д2017', 'П2014', 'Без года', 'Ф', 'Н']);
  });

  it('подписи: результат, мета, за что и кому', () => {
    expect(awardResultLabel(award())).toBe('победитель');
    expect(awardResultLabel(award({ result: 'diploma', resultText: 'диплом I степени' }))).toBe('диплом I степени');
    expect(awardResultLabel(award({ result: 'other' }))).toBeNull();
    expect(awardMeta(award())).toBe('Лучший торговый центр · Realt.by · 2014');
    expect(awardDetails(award({ subject: 'здание' }))).toBeNull();
    expect(awardDetails(award({ subject: 'проект до открытия', recipient: 'бюро SZK/Z' }))).toBe(
      'За что: проект до открытия · получатель: бюро SZK/Z',
    );
  });

  it('FAQ: год не дублируется, неподтверждённое помечено, запасной вариант из highlights', () => {
    expect(
      awardsFaqAnswer([
        award({ result: 'nominee', title: 'MAPIC Awards', year: '2018', org: 'MAPIC', category: null, confirmed: false }),
        award(),
      ]),
    ).toBe(
      'Realt Golden Key 2014 — победитель, номинация «Лучший торговый центр» (Realt.by).\n' +
        'MAPIC Awards — номинант (MAPIC, 2018). По данным застройщика.',
    );
    expect(awardsFaqAnswer([], ['**Realt Golden Key** 2014'])).toBe('Realt Golden Key 2014.');
    expect(awardsFaqAnswer([])).toBeNull();
  });

  it('заголовок и размер блока', () => {
    expect(awardsRankingTitle(true, true)).toBe('Награды и рейтинги');
    expect(awardsRankingTitle(true, false)).toBe('Награды');
    expect(awardsRankingTitle(false, true)).toBe('Место в рейтингах');
    const info = normalizeRetailInfo({
      awards: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
      ranking: [{ place: 1, criterion: 'x' }],
    });
    // ряды по две плитки: 2 ряда наград × 3 + 1 ряд рейтингов × 2
    expect(awardsRankingSize(info)).toBe(8);
    expect(awardsRankingSize(null, 3)).toBe(3);
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
    expect(info!.timeline.map((f) => f.name)).toEqual(['Zara Home']);
    expect(info!.leisure).toEqual([]);
    expect(info!.ranking[0]).toMatchObject({ place: 4, total: null, year: 2025 });
    expect(retailSectionIds(info)).toEqual(['floors', 'retail-history']);
  });

  it('награды и новые поля рейтинга: кривые записи отброшены', () => {
    const info = normalizeRetailInfo({
      ranking: [
        { place: 1, total: 10, criterion: 'площадь', headline: 'Крупнейший ТЦ', value: 68600, note: 'на 2025', year: '2025' },
        { place: 12, total: 10, criterion: 'площадь' },
        { place: 0, criterion: 'площадь' },
      ],
      awards: [
        { title: 'Realt Golden Key 2014', result: 'winner', year: 2014, confirmed: true },
        { title: 'Непонятно что', result: 'gold' },
        { title: 'Со слов ТЦ', result: 'nominee', confirmed: false },
        { result: 'winner', org: 'без названия' },
      ],
    });
    expect(info!.ranking).toHaveLength(1);
    expect(info!.ranking[0]).toMatchObject({ headline: 'Крупнейший ТЦ', value: '68600', note: 'на 2025', year: 2025 });
    expect(info!.awards.map((a) => [a.title, a.result, a.confirmed, a.year])).toEqual([
      ['Realt Golden Key 2014', 'winner', true, '2014'],
      ['Непонятно что', 'other', true, null],
      ['Со слов ТЦ', 'nominee', false, null],
    ]);
    // Один только рейтинг или награды — не торговые карточки, а свой блок.
    expect(retailSectionIds(info)).toEqual([]);
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

  it('якоря: категория, этаж, площадь, год, текст', () => {
    expect(
      anchorsFaqAnswer([
        anchor({ name: 'Гиппо', category: 'гипермаркет', floor: '-1', area: '6300', since: '2016', text: 'крупнейший продуктовый' }),
        anchor({ name: 'Корона', text: '' }),
      ]),
    ).toBe('Гиппо — гипермаркет (−1 этаж, 6\u00a0300\u00a0м², с 2016 года). Крупнейший продуктовый.\nКорона.');
    expect(anchorsFaqAnswer([])).toBeNull();
  });

  it('история ритейла: по возрастанию даты, пометка отдельным предложением', () => {
    expect(
      retailHistoryFaqAnswer([
        step({ date: '2019-09', name: 'H&M', text: 'первый магазин в Беларуси' }),
        step({ date: '2017', kind: 'record', name: 'Атриум', text: 'самый высокий в Минске', note: 'по данным ТЦ' }),
      ]),
    ).toBe('2017 — Атриум: самый высокий в Минске. По данным ТЦ.\nСентябрь 2019 — H&M: первый магазин в Беларуси.');
    expect(retailHistoryFaqAnswer([])).toBeNull();
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
      vacancies: [],
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
    // Группы в записи нет — выводится по названию.
    expect(info!.services[0].group).toBe('info');
    // Правило — объект с text; голую строку схема не предусматривает.
    expect(info!.rules.map((r) => r.text)).toEqual(['Можно с собаками на руках']);
    expect(info!.leasing!.points).toEqual(['Индексация раз в год']);
    expect(info!.audience[0]).toMatchObject({ value: '40 000 в день', date: null, note: 'по данным ТЦ' });
    expect(retailSectionIds(info)).toEqual(['getting-here', 'business']);
  });
});

describe('удобства ТЦ: группы', () => {
  it('берёт группу из записи, незнакомую или пустую выводит по названию', () => {
    const info = normalizeRetailInfo({
      services: [
        { name: 'Гардероб', group: 'money' },
        { name: 'Обмен валют', group: 'кошелёк' },
        { name: 'Места отдыха', group: '' },
      ],
    });
    expect(info!.services.map((s) => s.group)).toEqual(['money', 'money', 'comfort']);
  });

  it('раскладывает названия ресёрча по группам', () => {
    const cases: [string, string][] = [
      ['Информационный центр', 'info'],
      ['Инфоцентры', 'info'],
      ['Wi-Fi', 'info'],
      ['Виртуальный тур', 'info'],
      ['Гардероб', 'comfort'],
      ['Зарядка гаджетов', 'comfort'],
      ['Туалеты', 'comfort'],
      ['Комната матери и ребёнка', 'family'],
      ['Стульчики для кормления', 'family'],
      ['Комната именинника', 'family'],
      ['Туалеты для маломобильных', 'access'],
      ['Лифты и траволатор', 'access'],
      ['Помощь людям с инвалидностью', 'access'],
      ['Банки и обмен валют', 'money'],
      ['Велопарковка', 'car'],
      ['Автомойка', 'car'],
      ['Химчистка и ремонт обуви', 'everyday'],
      ['Аптека и ремонт ключей', 'everyday'],
      ['Турагентство', 'everyday'],
      ['Упаковка подарков', 'everyday'],
      ['Сбор ненужной одежды', 'eco'],
      ['Приём батареек и техники', 'eco'],
    ];
    for (const [name, group] of cases) expect([name, serviceGroupFromName(name)]).toEqual([name, group]);
  });

  it('удобства без остального «Посетителю» не рисуют: они в «Инфраструктуре»', () => {
    const info = normalizeRetailInfo({ services: [{ name: 'Wi-Fi' }] });
    expect(retailSectionIds(info)).toEqual([]);
  });
});

describe('разделы и размеры', () => {
  const base = normalizeRetailInfo({ hoursNote: 'x' }) as RetailInfo;
  it('группы: посетитель, бизнес, якоря у каталога', () => {
    expect(retailSectionGroup('floors')).toBe('visitor');
    expect(retailSectionGroup('retail-history')).toBe('visitor');
    expect(retailSectionGroup('anchors')).toBe('tenants');
    expect(retailSectionGroup('getting-here')).toBe('visitor');
    expect(retailSectionGroup('business')).toBe('business');
    expect(retailSectionGroup('quotes')).toBe('business');
  });

  it('скрытые часы и транспорт без маршрутов не добавляют высоту', () => {
    const info: RetailInfo = {
      ...base,
      hoursNote: null,
      hours: [1, 2, 3].map((n) => ({ zone: `З${n}`, value: '10–22', note: null, ...noSrc })),
      transport: [{ mode: 'bus', text: 'Автобус', ...noSrc }],
    };
    expect(retailSectionSize(info, 'getting-here')).toBe(0);
    expect(retailSectionSize(null, 'getting-here')).toBe(0);
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

  it('правила, лояльность и события', () => {
    expect(rulesFaqAnswer([{ text: 'Коляски — бесплатно', ...noSrc }])).toBe('Коляски — бесплатно.');
    expect(loyaltyFaqAnswer([{ name: 'Карта «Замок»', text: 'кешбэк 3%', ...noSrc }])).toBe('Карта «Замок» — кешбэк 3%.');
    expect(eventsFaqAnswer([{ name: 'Фитнес на крыше', text: 'по субботам летом', date: '2024', ...noSrc }])).toBe(
      'Фитнес на крыше (2024) — по субботам летом.',
    );
  });
});

describe('ответы FAQ — для бизнеса', () => {
  const fig = (over: Partial<RetailFigureEntry> = {}): RetailFigureEntry => ({
    label: 'Посещаемость',
    value: '40 000 человек в день',
    date: '2025',
    note: 'по данным ТЦ',
    text: null,
    ...noSrc,
    ...over,
  });

  it('цифра с датой и пометкой', () => {
    expect(figuresFaqAnswer([fig()])).toBe('Посещаемость — 40 000 человек в день (2025, по данным ТЦ).');
    expect(figuresFaqAnswer([fig({ text: 'как население Бреста за неделю' })])).toBe(
      'Посещаемость — 40 000 человек в день (2025, по данным ТЦ). Как население Бреста за неделю.',
    );
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

// --- Якоря и история ритейла (2026-09-24) ---------------------------------

describe('normalizeRetailInfo — якоря и лента', () => {
  it('новая схема: кривые записи отброшены, лента по возрастанию даты', () => {
    const info = normalizeRetailInfo({
      anchors: [
        { name: 'Гиппо', category: 'Гипермаркет', floor: -1, area: '6 300 м²', since: 2016, yandexUrl: 'https://yandex.by/maps/org/1' },
        { name: 'Кто-то', category: 'аптека', yandexUrl: 'javascript:alert(1)' },
        { category: 'fashion' },
      ],
      timeline: [
        { date: '2021-07', kind: 'record', name: 'Ёлка' },
        { date: '2017-04-29', kind: 'first', name: 'New Balance', text: 'первый концепт-магазин' },
        { date: '2018', kind: 'closure', name: 'Ушёл' },
        { kind: 'first', name: 'Без даты' },
        { date: 'весной', kind: 'milestone', name: 'Непонятно когда' },
        { date: '2019', kind: 'first_format', text: 'без имени' },
      ],
      firsts: [{ kind: 'first', name: 'Старое', date: '2015' }],
    });
    expect(info!.anchors).toEqual([
      anchor({ name: 'Гиппо', category: 'гипермаркет', floor: '-1', area: '6 300 м²', since: '2016', yandexUrl: 'https://yandex.by/maps/org/1' }),
      anchor({ name: 'Кто-то', category: 'другое' }),
    ]);
    // Новая схема заменяет firsts целиком — «Старое» не подмешивается.
    expect(info!.timeline.map((t) => t.name)).toEqual(['New Balance', 'Ёлка']);
    expect(retailSectionIds(info)).toEqual(['retail-history', 'anchors']);
  });

  it('пустой timeline при новой схеме не тянет старые firsts', () => {
    const info = normalizeRetailInfo({ timeline: [], anchors: [{ name: 'Гиппо' }], firsts: [{ kind: 'first', name: 'X', date: '2015' }] });
    expect(info!.timeline).toEqual([]);
  });

  it('старые firsts: anchor → якорь, first → лента, former_anchor и его «первые» — нигде', () => {
    const info = normalizeRetailInfo({
      firsts: [
        { kind: 'first', name: 'Reserved', date: '2017-04-09', text: 'первый в Беларуси Reserved', source: 'Onliner' },
        { kind: 'first', name: 'Finn Flare', date: '2017-05-31', text: 'первый в Беларуси' },
        { kind: 'first', name: 'Без даты', text: 'x' },
        { kind: 'anchor', name: '«Гиппо», Familia', date: '2025-06-26', text: 'якоря на 2025 год' },
        { kind: 'former_anchor', name: 'Reserved', date: '2019-05', text: 'закрылся' },
        { kind: 'former_anchor', name: '«Евроопт» (формат Euroopt Super)', date: '2021' },
      ],
    });
    expect(info!.anchors).toEqual([anchor({ name: '«Гиппо», Familia', text: 'якоря на 2025 год' })]);
    expect(info!.timeline).toEqual([
      step({ date: '2017-05-31', name: 'Finn Flare', text: 'первый в Беларуси' }),
    ]);
    expect(JSON.stringify(info)).not.toContain('закрылся');
    expect(JSON.stringify(info)).not.toContain('Евроопт');
  });

  it('одни только бывшие якоря — карточек нет', () => {
    expect(normalizeRetailInfo({ firsts: [{ kind: 'former_anchor', name: 'Zara', date: '2020' }] })).toBeNull();
  });
});

describe('якоря и лента — вёрстка', () => {
  it('строка «этаж · площадь · с года» — только известные части', () => {
    expect(anchorMetaParts(anchor({ floor: '2-3', area: '1 200 м²', since: '2019' }))).toEqual([
      '2–3 этажи',
      '1 200 м²',
      'с 2019 года',
    ]);
    expect(anchorMetaParts(anchor({ since: 'открытия' }))).toEqual(['с открытия']);
    expect(anchorMetaParts(anchor())).toEqual([]);
    expect(formatAnchorArea('около 2 000 м²')).toBe('около 2 000 м²');
  });

  it('сортировка ленты и месяц под годом', () => {
    const sorted = sortTimeline([step({ date: '2019-03', name: 'B' }), step({ date: '2019', name: 'A' }), step({ date: '2016-12-01', name: 'C' })]);
    expect(sorted.map((t) => t.name)).toEqual(['C', 'A', 'B']);
    expect(timelineMonth(step({ date: '2019-03' }))).toBe('март');
    expect(timelineMonth(step({ date: '2019' }))).toBeNull();
  });

  it('размеры: лента свёрнута до 12 строк, якоря по три в ряд', () => {
    const info = normalizeRetailInfo({
      anchors: Array.from({ length: 7 }, (_, i) => ({ name: `A${i}` })),
      timeline: Array.from({ length: 15 }, (_, i) => ({ date: String(2000 + i), kind: 'milestone', name: `T${i}` })),
    });
    expect(retailSectionSize(info, 'retail-history')).toBe(12);
    expect(retailSectionSize(info, 'anchors')).toBe(3);
  });
});

// --- Где поесть и развлечения (2026-09-24) ----------------------------------

const foodPlace = (name: string, type: string, extra: Record<string, unknown> = {}) => ({ name, type, ...extra });

describe('normalizeRetailInfo — food и fun', () => {
  it('кривые записи отброшены, незнакомые типы — cafe/other, числа — строки, пустые строки — null', () => {
    const info = normalizeRetailInfo({
      food: {
        summary: '  ',
        zones: [
          { name: 'Фудкорт', floor: 6, area: 5000, seats: '600', points: 18, hours: '10:00–22:00', text: '' },
          { floor: '2', text: 'без имени' },
        ],
        places: [
          foodPlace('Васильки', 'restaurant', { cuisine: 'белорусская', floor: 6, inFoodcourt: false, yandexUrl: 'https://yandex.by/maps/org/1' }),
          foodPlace('Нечто', 'mystery', { yandexUrl: 'javascript:alert(1)', cuisine: '' }),
          foodPlace('', 'cafe'),
          { type: 'bar' },
        ],
      },
      fun: [
        { name: 'Silver Screen', kind: 'cinema', floor: '6', capacity: 1480, formats: ['IMAX', 'IMAX', '', '4DX'], since: 2016 },
        { name: 'Батуты', kind: 'trampoline' },
        { kind: 'ice' },
      ],
    });
    expect(info!.food).toEqual({
      summary: null,
      zones: [
        { name: 'Фудкорт', floor: '6', area: '5000', seats: '600', points: '18', hours: '10:00–22:00', text: null, source: null, sourceUrl: null },
      ],
      places: [
        { name: 'Васильки', type: 'restaurant', cuisine: 'белорусская', floor: '6', inFoodcourt: false, yandexUrl: 'https://yandex.by/maps/org/1', note: null },
        { name: 'Нечто', type: 'cafe', cuisine: null, floor: null, inFoodcourt: null, yandexUrl: null, note: null },
      ],
    });
    expect(info!.fun.map((f) => [f.name, f.kind])).toEqual([
      ['Silver Screen', 'cinema'],
      ['Батуты', 'other'],
    ]);
    expect(info!.fun[0]).toMatchObject({ capacity: '1480', formats: ['IMAX', '4DX'], since: '2016', text: null, yandexUrl: null });
    expect(retailSectionIds(info)).toEqual(['food', 'fun']);
  });

  it('дубликаты заведений по имени склеиваются: пропуски заполняются, этажи перечисляются', () => {
    const info = normalizeRetailInfo({
      food: {
        places: [
          foodPlace('Кофе Хауз', 'coffee', { floor: '1' }),
          foodPlace('«кофе хауз»', 'cafe', { floor: '4', cuisine: 'кофе', inFoodcourt: true }),
          foodPlace('Кофе  Хауз', 'coffee', { floor: 1 }),
        ],
      },
    });
    expect(info!.food!.places).toEqual([
      { name: 'Кофе Хауз', type: 'coffee', cuisine: 'кофе', floor: '1, 4', inFoodcourt: true, yandexUrl: null, note: null },
    ]);
  });

  it('пустой food — null; без food и fun — старый досуг как раньше', () => {
    const info = normalizeRetailInfo({ food: { summary: '', zones: [], places: [] }, fun: [], leisure: [{ kind: 'kids', name: 'Йети' }] });
    expect(info!.food).toBeNull();
    expect(hasFoodFun(info)).toBe(false);
    expect(leisureForPage(info).map((l) => l.name)).toEqual(['Йети']);
    expect(retailSectionIds(info)).toEqual(['leisure']);
  });

  it('есть food или fun — досуг не показывается, из якорей уходят кино, фудкорт, развлечения, фитнес', () => {
    const anchors = [
      { name: 'Гиппо', category: 'гипермаркет' },
      { name: 'Silver Screen', category: 'кинотеатр' },
      { name: 'Фудкорт', category: 'фудкорт' },
      { name: 'Батуты', category: 'развлечения' },
      { name: 'World Class', category: 'фитнес' },
      { name: 'Старый якорь' },
    ];
    const withFun = normalizeRetailInfo({ fun: [{ name: 'Каток', kind: 'ice' }], leisure: [{ kind: 'kids', name: 'Йети' }], anchors });
    expect(leisureForPage(withFun)).toEqual([]);
    expect(anchorsForPage(withFun).map((a) => a.name)).toEqual(['Гиппо', 'Старый якорь']);
    expect(retailSectionIds(withFun)).toEqual(['fun', 'anchors']);
    const withoutFun = normalizeRetailInfo({ anchors });
    expect(anchorsForPage(withoutFun)).toHaveLength(6);
    // Одни только кинотеатр и фудкорт в якорях при новых блоках — карточки якорей нет.
    const onlyDupes = normalizeRetailInfo({ food: { summary: 'Фудкорт на 6 этаже' }, anchors: [{ name: 'Фудкорт', category: 'фудкорт' }] });
    expect(retailSectionIds(onlyDupes)).toEqual(['food']);
    expect(retailSectionSize(onlyDupes, 'anchors')).toBe(0);
  });

  it('порядок разделов: этажи > история > еда > развлечения > посетителю', () => {
    const info = normalizeRetailInfo({
      floorsGuide: [{ floor: '1', text: 'x' }],
      timeline: [{ date: '2019', kind: 'first', name: 'X' }],
      food: { summary: 'x' },
      fun: [{ name: 'Кино', kind: 'cinema' }],
      hoursNote: 'x',
      anchors: [{ name: 'Гиппо', category: 'гипермаркет' }],
    });
    expect(retailSectionIds(info)).toEqual(['floors', 'retail-history', 'food', 'fun', 'anchors']);
    expect(retailSectionGroup('food')).toBe('visitor');
    expect(retailSectionGroup('fun')).toBe('visitor');
  });
});

describe('где поесть — вёрстка', () => {
  const places = (type: string, n: number) =>
    Array.from({ length: n }, (_, i) => foodPlace(`${type}-${String.fromCharCode(1103 - i)}`, type));

  it('группы по типам в порядке блока, внутри — по алфавиту', () => {
    const info = normalizeRetailInfo({
      food: { places: [foodPlace('Бар', 'bar'), foodPlace('Юность', 'restaurant'), foodPlace('Акварель', 'restaurant'), foodPlace('Зерно', 'coffee')] },
    });
    const groups = groupFoodPlaces(info!.food!.places);
    expect(groups.map((g) => [g.label, g.places.map((p) => p.name)])).toEqual([
      ['Рестораны', ['Акварель', 'Юность']],
      ['Кофейни', ['Зерно']],
      ['Бары', ['Бар']],
    ]);
  });

  it('свёртка: целыми рядами по три по кругу групп, пока не наберётся 15', () => {
    const info = normalizeRetailInfo({
      food: {
        places: [
          ...places('restaurant', 9),
          ...places('cafe', 11),
          ...places('fastfood', 7),
          ...places('coffee', 8),
          ...places('dessert', 6),
          ...places('bar', 1),
        ],
      },
    });
    const groups = groupFoodPlaces(info!.food!.places);
    expect(foodPlacesVisibleCounts(groups)).toEqual([3, 3, 3, 3, 3, 1]);
    expect(foodPlacesCollapsible(groups)).toBe(true);
    // Одна большая группа — пять рядов по три.
    const one = groupFoodPlaces(normalizeRetailInfo({ food: { places: places('cafe', 40) } })!.food!.places);
    expect(foodPlacesVisibleCounts(one)).toEqual([15]);
  });

  it('прятать три заведения и меньше не нужно — список целиком', () => {
    const groups = groupFoodPlaces(normalizeRetailInfo({ food: { places: places('cafe', 18) } })!.food!.places);
    expect(foodPlacesVisibleCounts(groups)).toEqual([18]);
    expect(foodPlacesCollapsible(groups)).toBe(false);
    const small = groupFoodPlaces(normalizeRetailInfo({ food: { places: places('bar', 4) } })!.food!.places);
    expect(foodPlacesVisibleCounts(small)).toEqual([4]);
  });

  it('метрики зоны, этаж заведения, строка метрик развлечения', () => {
    const info = normalizeRetailInfo({
      food: { zones: [{ name: 'Фудкорт', area: '5000', seats: 601, points: 'около 20' }] },
      fun: [
        { name: 'Кино', kind: 'cinema', floor: '6', area: '4500', capacity: '1 480', since: '2016' },
        { name: 'Йети', kind: 'kids', capacity: 121, since: 'с открытия' },
        { name: 'Квест', kind: 'quest', capacity: 'до 6 игроков' },
      ],
    });
    expect(foodZoneMetrics(info!.food!.zones[0])).toEqual([
      { value: '5\u00a0000\u00a0м²', label: 'площадь' },
      { value: '601', label: 'место' },
      { value: 'около 20', label: 'точек питания' },
    ]);
    expect(formatFoodFloor('-1')).toBe('эт.\u00a0−1');
    expect(formatFoodFloor('1, 4')).toBe('эт.\u00a01, 4');
    expect(funMetaParts(info!.fun[0])).toEqual(['6 этаж', '4\u00a0500\u00a0м²', '1\u00a0480\u00a0мест', 'с\u00a02016']);
    expect(funMetaParts(info!.fun[1])).toEqual(['до\u00a0121\u00a0человека', 'с открытия']);
    expect(funMetaParts(info!.fun[2])).toEqual(['до 6 игроков']);
    expect(
      funMetaParts({ ...info!.fun[0], floor: '4-й уровень паркинга', area: null, capacity: null, since: '2017-08-11' }),
    ).toEqual(['4-й уровень паркинга', 'с\u00a02017']);
  });

  it('развлечения: кинотеатр первым, дальше порядок схемы', () => {
    const info = normalizeRetailInfo({
      fun: [
        { name: 'Клуб', kind: 'fitness' },
        { name: 'Что-то', kind: 'other' },
        { name: 'Детский', kind: 'kids' },
        { name: 'Каток', kind: 'ice' },
        { name: 'Кино', kind: 'cinema' },
      ],
    });
    expect(sortFun(info!.fun).map((f) => f.name)).toEqual(['Кино', 'Каток', 'Детский', 'Клуб', 'Что-то']);
  });

  it('размеры для модели высот', () => {
    const info = normalizeRetailInfo({
      food: {
        summary: 'x',
        zones: [{ name: 'A' }, { name: 'B' }],
        places: [...places('restaurant', 9), ...places('cafe', 15), ...places('coffee', 2)],
      },
      fun: [{ name: 'Кино', kind: 'cinema' }, { name: 'A', kind: 'kids' }, { name: 'B', kind: 'ice' }, { name: 'C', kind: 'fitness' }],
    });
    // Видно 9 + 9 + 2 из 26: итог 1 + ряд зон 4 + (1+3) + (1+3) + (1+1) + кнопка 1.
    expect(foodSectionSize(info!.food)).toBe(1 + 4 + 4 + 4 + 2 + 1);
    expect(retailSectionSize(info, 'food')).toBe(16);
    // Кинотеатр — свой ряд, три остальных — два ряда.
    expect(funSectionSize(info!.fun)).toBe(3);
    expect(retailSectionSize(info, 'fun')).toBe(3);
    expect(foodSectionSize(null)).toBe(0);
  });
});

describe('ответы FAQ — еда и развлечения', () => {
  it('где поесть: итог, зоны, число по типам и до восьми ресторанов и кафе', () => {
    const info = normalizeRetailInfo({
      food: {
        summary: 'Весь шестой этаж отдан под еду',
        zones: [{ name: 'Фудкорт', floor: '6', seats: 600, points: 18, hours: 'ежедневно 10:00–22:00', text: 'летом открыта терраса' }],
        places: [
          ...['Акварель', 'Бульбяная', 'Васильки', 'Гриль', 'Дуэт'].map((n) => foodPlace(n, 'restaurant')),
          ...['Ёлка', 'Жасмин', 'Зефир', 'Изба'].map((n) => foodPlace(n, 'cafe')),
          foodPlace('KFC', 'fastfood'),
          foodPlace('Кофеин', 'coffee'),
          foodPlace('Зерно', 'coffee'),
        ],
      },
    });
    expect(foodFaqAnswer(info!.food)).toBe(
      [
        'Весь шестой этаж отдан под еду.',
        'Фудкорт — 6 этаж, 600 мест, 18 точек питания, работает ежедневно 10:00–22:00. Летом открыта терраса.',
        'Всего 12 заведений: 5 ресторанов, 4 кафе, 1 точка фастфуда, 2 кофейни.',
        'Рестораны и кафе: Акварель, Бульбяная, Васильки, Гриль, Дуэт, Ёлка, Жасмин, Зефир и другие.',
      ].join('\n'),
    );
    expect(foodFaqAnswer(null)).toBeNull();
  });

  it('где поесть без ресторанов и кафе — названия из того, что есть', () => {
    const info = normalizeRetailInfo({ food: { places: [foodPlace('Зерно', 'coffee'), foodPlace('Пончик', 'dessert')] } });
    expect(foodFaqAnswer(info!.food)).toBe('Всего 2 заведения: 1 кофейня, 1 кондитерская.\nЗаведения: Зерно, Пончик.');
  });

  it('развлечения: вид, цифры, форматы, режим и текст; вид не повторяет имя', () => {
    const info = normalizeRetailInfo({
      fun: [
        { name: 'Йети и дети', kind: 'kids', floor: '5', formats: ['дни рождения'], text: 'аниматоры присмотрят за детьми' },
        { name: 'Silver Screen', kind: 'cinema', floor: '6', capacity: 1480, since: 2016, formats: ['IMAX', '4DX'], hours: '09:00–02:00' },
        { name: 'Каток «Арена»', kind: 'ice' },
        { name: 'Лазертаг', kind: 'other' },
      ],
    });
    expect(funFaqAnswer(info!.fun)).toBe(
      [
        'Silver Screen — кинотеатр (6 этаж, 1\u00a0480\u00a0мест, с\u00a02016). Форматы: IMAX, 4DX. Режим работы: 09:00–02:00.',
        'Каток «Арена».',
        'Йети и дети — детский центр (5 этаж). Что есть: дни рождения. Аниматоры присмотрят за детьми.',
        'Лазертаг.',
      ].join('\n'),
    );
    expect(funFaqAnswer([])).toBeNull();
  });
});

describe('свободные помещения по данным ТЦ', () => {
  it('берёт помещения с площадью и сделкой, цену — только положительную', () => {
    const info = normalizeRetailInfo({
      vacancies: [
        { deal: 'rent', type: 'островок', size: 12.5, floor: 'средний подземный уровень', pricePerSqm: null },
        { deal: 'rent', type: 'торговое помещение', size: 209.9, floor: -3, pricePerSqm: 5.3 },
        { deal: 'rent', size: 0 },
        { deal: 'swap', size: 40 },
      ],
    });
    expect(info?.vacancies.map((v) => [v.size, v.floor, v.pricePerSqm])).toEqual([
      [12.5, 'средний подземный уровень', null],
      [209.9, '-3', 5.3],
    ]);
  });

  it('FAQ перечисляет помещения от меньшего к большему', () => {
    const info = normalizeRetailInfo({
      vacancies: [
        { deal: 'rent', type: 'торговое помещение', size: 209.9, floor: -3, pricePerSqm: 5.3 },
        { deal: 'rent', type: 'островок', size: 12.5, floor: 'средний подземный уровень' },
      ],
    })!;
    expect(vacanciesFaqAnswer(info.vacancies)).toBe(
      'По списку самого ТЦ сдаются 2 помещения: 12,5 м² (средний подземный уровень, островок) — цена по запросу; ' +
        '209,9 м² (−3 этаж, торговое помещение) — $5,3 за м² в месяц.',
    );
    expect(vacanciesFaqAnswer([])).toBeNull();
  });
});

 it('показывает поиск ТЦ без retailInfo при наличии организаций', () => {
  expect(retailSectionIds(null, true)).toEqual(['floors']);
  expect(retailSectionIds(null, false)).toEqual([]);
});
